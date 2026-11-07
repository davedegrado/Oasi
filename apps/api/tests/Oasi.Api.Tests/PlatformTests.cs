using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Oasi.Api.Tests;

/// <summary>Super Admin: onboarding, moduli, stato dei tenant, accesso di assistenza tracciato.</summary>
[Collection("api")]
public sealed class PlatformTests(ApiFixture api)
{
    private static readonly Guid Owner = Guid.Parse("eeeeeeee-0000-0000-0000-000000000001");

    private async Task EnsureOwner() =>
        await api.Sql("insert into platform.staff (user_id, role) values (@id, 'owner') on conflict do nothing", new { id = Owner });

    [Fact]
    public async Task Area_super_admin_chiusa_agli_utenti_delle_palestre()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.OasiAdmin).GetAsync("/v1/platform/tenants")).StatusCode);
    }

    [Fact]
    public async Task Onboarding_crea_un_tenant_funzionante_senza_modifiche_al_codice()
    {
        await EnsureOwner();
        var staff = api.For("console.localhost", Owner);
        var res = await staff.PostAsJsonAsync("/v1/platform/tenants", new
        {
            slug = "accademia-test", displayName = "Accademia Test", legalName = "Accademia Test ASD", planCode = "studio", billingCycle = "monthly",
            hostname = "accademia.localhost", appName = "Accademia Test", shortName = "Accademia",
            colors = new Dictionary<string, string> { ["primary"] = "#3355AA", ["themeColor"] = "#3355AA" },
            disciplines = new[] { "Danza classica", "Hip hop" },
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        var cfg = await api.For("accademia.localhost").GetFromJsonAsync<JsonElement>("/v1/public/tenant-config");
        Assert.Equal("Accademia Test", cfg.GetProperty("branding").GetProperty("appName").GetString());
        Assert.Equal(["danza-classica", "hip-hop"], cfg.GetProperty("disciplines").EnumerateArray().Select(d => d.GetProperty("slug").GetString()));
        Assert.Contains("makeups", cfg.GetProperty("modules").EnumerateArray().Select(m => m.GetString()));
        Assert.True(await api.Scalar<bool>("select exists(select 1 from platform.audit_log where action = 'tenant.create' and target = 'accademia-test')"));

        // Lo stesso dominio non può essere assegnato a un secondo tenant
        var dup = await staff.PostAsJsonAsync("/v1/platform/tenants", new
        {
            slug = "accademia-bis", displayName = "Bis", legalName = "Bis", planCode = "studio", billingCycle = "monthly",
            hostname = "accademia.localhost", appName = "Bis", shortName = "Bis",
        });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
    }

    [Fact]
    public async Task Tenant_sospeso_non_utilizzabile_e_riattivabile()
    {
        await EnsureOwner();
        var staff = api.For("console.localhost", Owner);
        var prova = await api.Scalar<Guid>("select id from platform.tenants where slug = 'studio-prova'");
        Assert.Equal(HttpStatusCode.NoContent, (await staff.PatchAsJsonAsync($"/v1/platform/tenants/{prova}/status", new { status = "suspended", reason = "Test sospensione" })).StatusCode);
        await Task.Delay(50);
        // la cache di risoluzione dura 30 s: si verifica con un dominio non ancora richiesto
        await api.Sql("insert into platform.domains (tenant_id, hostname, kind) values (@t, 'prova-sospesa.localhost', 'custom') on conflict do nothing", new { t = prova });
        var res = await api.For("prova-sospesa.localhost", Seed.Laura).GetAsync("/v1/lessons");
        Assert.Equal((HttpStatusCode)423, res.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await staff.PatchAsJsonAsync($"/v1/platform/tenants/{prova}/status", new { status = "trial", reason = "Fine test" })).StatusCode);
    }

    [Fact]
    public async Task Accesso_di_assistenza_solo_dopo_approvazione_della_palestra_in_sola_lettura_e_tracciato()
    {
        await EnsureOwner();
        var staff = api.For(Seed.OasiHost, Owner);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/v1/classes")).StatusCode);

        var oasi = await api.Scalar<Guid>("select id from platform.tenants where slug = 'oasi-metropolitana'");
        var req = await api.For("console.localhost", Owner).PostAsJsonAsync("/v1/platform/support-grants", new { tenantId = oasi, reason = "Verifica calendario segnalata dalla palestra", hours = 2 });
        var grantId = (await req.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/v1/classes")).StatusCode); // non ancora approvato

        Assert.Equal(HttpStatusCode.NoContent, (await api.For(Seed.OasiHost, Seed.OasiAdmin).PostAsync($"/v1/support-grants/{grantId}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/v1/classes")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/v1/events", new { type = "show", title = "x", date = "2030-01-01", startTime = "10:00", endTime = "11:00", capacity = 5 })).StatusCode);
        Assert.True(await api.Scalar<bool>("select exists(select 1 from platform.audit_log where action = 'support.access' and actor_user = @u)", new { u = Owner }));
    }

    [Fact]
    public async Task Invito_collega_un_account_esistente_senza_duplicarlo()
    {
        // Beatrice (account di Oasi) viene invitata anche allo Studio Prova
        var invite = await api.For(Seed.ProvaHost, Seed.ProvaTeacher).PostAsJsonAsync("/v1/invitations", new
        {
            email = "beatrice.marchetti@email-demo.it", firstName = "Beatrice", lastName = "Marchetti", roles = new[] { "student" },
        });
        Assert.Equal(HttpStatusCode.Created, invite.StatusCode);
        var link = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("devLink").GetString()!;
        var token = link[(link.IndexOf("token=") + 6)..];

        var beatrice = ApiFixture.Id("user:stu-beatrice");
        var accept = await api.For(Seed.ProvaHost, beatrice).PostAsJsonAsync("/v1/invitations/accept", new { token });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);

        var me = await api.For(Seed.OasiHost, beatrice).GetFromJsonAsync<JsonElement>("/v1/me");
        var slugs = me.GetProperty("memberships").EnumerateArray().Select(m => m.GetProperty("slug").GetString()).Order().ToList();
        Assert.Equal(["oasi-metropolitana", "studio-prova"], slugs);
        Assert.Equal(1, await api.Scalar<long>("select count(*) from auth.users where email = 'beatrice.marchetti@email-demo.it'"));
        // Dati separati: su Studio Prova Beatrice non vede le classi di Oasi
        var classes = await api.For(Seed.ProvaHost, beatrice).GetFromJsonAsync<JsonElement[]>("/v1/classes");
        Assert.All(classes!, c => Assert.Equal("Pole Principianti", c.GetProperty("name").GetString()));
        // Il token non è riutilizzabile
        Assert.Equal(HttpStatusCode.NotFound, (await api.For(Seed.ProvaHost, Seed.Sofia).PostAsJsonAsync("/v1/invitations/accept", new { token })).StatusCode);
    }
}

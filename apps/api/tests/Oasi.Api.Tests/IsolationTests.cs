using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Oasi.Api.Tests;

/// <summary>Isolamento multi-tenant e white-label (punto 21 della richiesta).</summary>
[Collection("api")]
public sealed class IsolationTests(ApiFixture api)
{
    [Fact]
    public async Task Ogni_dominio_carica_il_proprio_branding()
    {
        var oasi = await api.For(Seed.OasiHost).GetFromJsonAsync<JsonElement>("/v1/public/tenant-config");
        var prova = await api.For(Seed.ProvaHost).GetFromJsonAsync<JsonElement>("/v1/public/tenant-config");
        Assert.Equal("Oasi Metropolitana", oasi.GetProperty("branding").GetProperty("appName").GetString());
        Assert.Equal("Studio Prova", prova.GetProperty("branding").GetProperty("appName").GetString());
        Assert.NotEqual(oasi.GetProperty("branding").GetProperty("colors").GetProperty("primary").GetString(),
                        prova.GetProperty("branding").GetProperty("colors").GetProperty("primary").GetString());
        // Le discipline sono quelle della palestra: cerchio e tessuti per Oasi, pole dance per Prova
        Assert.Equal(["cerchio", "tessuti"], oasi.GetProperty("disciplines").EnumerateArray().Select(d => d.GetProperty("slug").GetString()));
        Assert.Equal(["pole"], prova.GetProperty("disciplines").EnumerateArray().Select(d => d.GetProperty("slug").GetString()));
    }

    [Fact]
    public async Task Manifest_PWA_distinto_per_dominio()
    {
        var a = await api.For(Seed.OasiHost).GetFromJsonAsync<JsonElement>("/v1/public/manifest.webmanifest");
        var b = await api.For(Seed.ProvaHost).GetFromJsonAsync<JsonElement>("/v1/public/manifest.webmanifest");
        Assert.Equal("Oasi", a.GetProperty("short_name").GetString());
        Assert.Equal("Prova", b.GetProperty("short_name").GetString());
        Assert.NotEqual(a.GetProperty("id").GetString(), b.GetProperty("id").GetString());
        Assert.NotEqual(a.GetProperty("theme_color").GetString(), b.GetProperty("theme_color").GetString());
    }

    [Fact]
    public async Task Dominio_sconosciuto_non_risolve_nessun_tenant()
    {
        var res = await api.For("sconosciuto.example").GetAsync("/v1/public/tenant-config");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Senza_token_le_api_sono_chiuse()
    {
        var res = await api.For(Seed.OasiHost).GetAsync("/v1/classes");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Utente_di_un_tenant_non_accede_a_un_altro_tenant()
    {
        // Giulia è di Oasi: sul dominio di Studio Prova viene respinta
        var res = await api.For(Seed.ProvaHost, Seed.Giulia).GetAsync("/v1/classes");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        // Laura è di Studio Prova: su Oasi viene respinta
        var res2 = await api.For(Seed.OasiHost, Seed.Laura).GetAsync("/v1/lessons");
        Assert.Equal(HttpStatusCode.Forbidden, res2.StatusCode);
    }

    [Fact]
    public async Task Admin_non_vede_ne_modifica_dati_di_altri_tenant_anche_conoscendo_gli_id()
    {
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);
        var classes = await admin.GetFromJsonAsync<JsonElement[]>("/v1/classes");
        Assert.DoesNotContain(classes!, c => c.GetProperty("id").GetGuid() == Seed.ProvaClass);

        // Tentativo di modificare la classe di Studio Prova usando il suo id: la riga non esiste per Oasi
        var put = await admin.PutAsJsonAsync($"/v1/classes/{Seed.ProvaClass}", new
        {
            name = "Hack", disciplineId = ApiFixture.Id("oasi:discipline:cerchio"), capacity = 5, weekday = 1, startTime = "10:00", endTime = "11:00",
        });
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        var name = await api.Scalar<string>("select name from app.classes where id = @id", new { id = Seed.ProvaClass });
        Assert.Equal("Pole Principianti", name);
    }

    [Fact]
    public async Task Riferimenti_a_file_di_altri_tenant_rifiutati()
    {
        var prova = await api.Scalar<Guid>("select id from platform.tenants where slug = 'studio-prova'");
        var res = await api.For(Seed.OasiHost, Seed.Chiara).PostAsJsonAsync("/v1/figures", new
        {
            disciplineId = ApiFixture.Id("oasi:discipline:cerchio"), name = "Figura con file altrui", difficulty = 2,
            steps = new[] { new { imagePath = $"tenants/{prova}/figures/foto.jpg", caption = "x" } },
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Modulo_disattivato_bloccato_lato_server()
    {
        // Studio Prova ha il piano Essential: niente recuperi e niente archivio figure
        var laura = api.For(Seed.ProvaHost, Seed.Laura);
        var makeups = await laura.GetAsync("/v1/makeups");
        Assert.Equal(HttpStatusCode.Forbidden, makeups.StatusCode);
        Assert.Contains("module_disabled", await makeups.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await laura.GetAsync("/v1/figures")).StatusCode);
        // Lo stesso endpoint funziona per Oasi (piano Premium)
        Assert.Equal(HttpStatusCode.OK, (await api.For(Seed.OasiHost, Seed.Giulia).GetAsync("/v1/figures")).StatusCode);
    }

    [Fact]
    public async Task Me_elenca_solo_le_proprie_palestre()
    {
        var me = await api.For(Seed.OasiHost, Seed.Giulia).GetFromJsonAsync<JsonElement>("/v1/me");
        var slugs = me.GetProperty("memberships").EnumerateArray().Select(m => m.GetProperty("slug").GetString()).ToList();
        Assert.Equal(["oasi-metropolitana"], slugs);
        Assert.Equal("Giulia", me.GetProperty("profile").GetProperty("firstName").GetString());
    }
}

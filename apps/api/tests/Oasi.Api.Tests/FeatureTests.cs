using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Oasi.Api.Tests;

/// <summary>Iscrizioni, presenze, recuperi, progressi, genitori e permessi.</summary>
[Collection("api")]
public sealed class FeatureTests(ApiFixture api)
{
    private static string Today => DateTime.Now.ToString("yyyy-MM-dd");
    private static string InDays(int d) => DateTime.Now.AddDays(d).ToString("yyyy-MM-dd");

    private async Task<JsonElement> NextLesson(HttpClient client, Guid classId, string scope = "")
    {
        var lessons = await client.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(30)}{scope}");
        return lessons!.First(l => l.GetProperty("classId").GetGuid() == classId && l.GetProperty("status").GetString() != "cancelled");
    }

    [Fact]
    public async Task Calendario_allieva_mostra_solo_le_sue_classi()
    {
        // Martina è iscritta solo a Tessuti Intermedio (nessun altro test la modifica)
        var lessons = await api.For(Seed.OasiHost, ApiFixture.Id("user:stu-martina")).GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(-14)}&to={InDays(14)}");
        var classes = lessons!.Select(l => l.GetProperty("classId").GetGuid()).Distinct().ToHashSet();
        Assert.Equal(new HashSet<Guid> { Seed.ClassTessutiInt }, classes);
    }

    [Fact]
    public async Task Vista_mensile_ammessa_intervalli_troppo_lunghi_rifiutati()
    {
        var giulia = api.For(Seed.OasiHost, Seed.Giulia);
        Assert.Equal(HttpStatusCode.OK, (await giulia.GetAsync($"/v1/lessons?from={InDays(-10)}&to={InDays(31)}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await giulia.GetAsync($"/v1/lessons?from={Today}&to={InDays(120)}")).StatusCode);
    }

    [Fact]
    public async Task Insegnante_gestisce_solo_le_classi_assegnate()
    {
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        var own = await NextLesson(chiara, Seed.ClassCerchioInt, "&scope=teaching");
        Assert.Equal(HttpStatusCode.OK, (await chiara.GetAsync($"/v1/lessons/{own.GetProperty("id")}/roster")).StatusCode);

        var elena = api.For(Seed.OasiHost, Seed.Elena);
        var other = await NextLesson(elena, Seed.ClassTessutiInt, "&scope=teaching");
        Assert.Equal(HttpStatusCode.Forbidden, (await chiara.GetAsync($"/v1/lessons/{other.GetProperty("id")}/roster")).StatusCode);
        var put = await chiara.PutAsJsonAsync($"/v1/lessons/{other.GetProperty("id")}", new { status = "cancelled", note = "no" });
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
    }

    [Fact]
    public async Task Presenza_dichiarata_e_presenza_effettiva_restano_distinte()
    {
        var giulia = api.For(Seed.OasiHost, Seed.Giulia);
        var lesson = await NextLesson(giulia, Seed.ClassCerchioInt);
        var id = lesson.GetProperty("id").GetGuid();

        // L'allieva dichiara in anticipo l'assenza
        Assert.Equal(HttpStatusCode.NoContent, (await giulia.PutAsJsonAsync($"/v1/lessons/{id}/declaration", new { declared = "absent" })).StatusCode);
        // L'insegnante registra invece la presenza effettiva
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.PutAsJsonAsync($"/v1/lessons/{id}/attendance/{Seed.GiuliaMember}", new { actual = "present" })).StatusCode);

        var roster = await chiara.GetFromJsonAsync<JsonElement[]>($"/v1/lessons/{id}/roster");
        var row = roster!.Single(r => r.GetProperty("memberId").GetGuid() == Seed.GiuliaMember);
        Assert.Equal("absent", row.GetProperty("declared").GetString());
        Assert.Equal("present", row.GetProperty("actual").GetString());

        // Un'allieva non può registrare la presenza effettiva
        var sofia = api.For(Seed.OasiHost, Seed.Sofia);
        Assert.Equal(HttpStatusCode.Forbidden, (await sofia.PutAsJsonAsync($"/v1/lessons/{id}/attendance/{Seed.GiuliaMember}", new { actual = "absent" })).StatusCode);
    }

    [Fact]
    public async Task Iscrizione_richiesta_approvata_dall_insegnante_con_controllo_capienza()
    {
        var giulia = api.For(Seed.OasiHost, Seed.Giulia);
        var req = await giulia.PostAsJsonAsync("/v1/enrollments", new { classId = Seed.ClassCerchioBase, note = "Vorrei ripassare le basi" });
        Assert.Equal(HttpStatusCode.Created, req.StatusCode);
        var id = (await req.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Una seconda richiesta uguale è un duplicato
        Assert.Equal(HttpStatusCode.Conflict, (await giulia.PostAsJsonAsync("/v1/enrollments", new { classId = Seed.ClassCerchioBase })).StatusCode);
        // Elena non insegna Cerchio Base: non può decidere
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Elena).PostAsJsonAsync($"/v1/enrollments/{id}/decision", new { approve = true })).StatusCode);

        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        var pending = await chiara.GetFromJsonAsync<JsonElement[]>("/v1/enrollments?status=requested");
        Assert.Contains(pending!, e => e.GetProperty("id").GetGuid() == id);

        // Capienza piena: la classe (8 posti) viene riempita prima dell'approvazione
        await api.Sql("update app.classes set capacity = (select count(*) from app.enrollments where class_id = @c and status = 'approved') where id = @c", new { c = Seed.ClassCerchioBase });
        var full = await chiara.PostAsJsonAsync($"/v1/enrollments/{id}/decision", new { approve = true });
        Assert.Equal(HttpStatusCode.Conflict, full.StatusCode);
        Assert.Contains("class_full", await full.Content.ReadAsStringAsync());

        await api.Sql("update app.classes set capacity = 8 where id = @c", new { c = Seed.ClassCerchioBase });
        var ok = await chiara.PostAsJsonAsync($"/v1/enrollments/{id}/decision", new { approve = true });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var lessons = await giulia.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(14)}");
        Assert.Contains(lessons!, l => l.GetProperty("classId").GetGuid() == Seed.ClassCerchioBase);
    }

    [Fact]
    public async Task Recupero_approvato_compare_nel_calendario_e_nell_elenco_della_lezione()
    {
        var sofia = api.For(Seed.OasiHost, Seed.Sofia); // iscritta solo a Cerchio Base
        var elena = api.For(Seed.OasiHost, Seed.Elena);
        var target = await NextLesson(elena, Seed.ClassTessutiInt, "&scope=teaching");
        var targetId = target.GetProperty("id").GetGuid();

        var req = await sofia.PostAsJsonAsync("/v1/makeups", new { targetLessonId = targetId, note = "Recupero della lezione persa" });
        Assert.Equal(HttpStatusCode.Created, req.StatusCode);
        var id = (await req.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.OK, (await elena.PostAsJsonAsync($"/v1/makeups/{id}/decision", new { approve = true })).StatusCode);

        var lessons = await sofia.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(30)}");
        var mine = lessons!.Single(l => l.GetProperty("id").GetGuid() == targetId);
        Assert.True(mine.GetProperty("isMakeup").GetBoolean());

        var roster = await elena.GetFromJsonAsync<JsonElement[]>($"/v1/lessons/{targetId}/roster");
        Assert.Contains(roster!, r => r.GetProperty("memberId").GetGuid() == ApiFixture.Id("oasi:member:stu-sofia") && r.GetProperty("isMakeup").GetBoolean());
    }

    [Fact]
    public async Task Progressi_a_tre_stati_e_note_visibili_all_insegnante()
    {
        var giulia = api.For(Seed.OasiHost, Seed.Giulia);
        var figure = ApiFixture.Id("oasi:figure:fig-back-balance");
        // "In apprendimento" non esiste più
        Assert.Equal(HttpStatusCode.BadRequest, (await giulia.PutAsJsonAsync($"/v1/progress/{figure}", new { status = "in_apprendimento" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await giulia.PutAsJsonAsync($"/v1/progress/{figure}", new { status = "planned", note = "Obiettivo estate" })).StatusCode);

        var seen = await api.For(Seed.OasiHost, Seed.Chiara).GetFromJsonAsync<JsonElement[]>($"/v1/progress?memberId={Seed.GiuliaMember}");
        var p = seen!.Single(x => x.GetProperty("figureId").GetGuid() == figure);
        Assert.Equal("planned", p.GetProperty("status").GetString());
        Assert.Equal("Obiettivo estate", p.GetProperty("studentNote").GetString());

        // Un'altra allieva non vede i progressi di Giulia
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Sofia).GetAsync($"/v1/progress?memberId={Seed.GiuliaMember}")).StatusCode);
    }

    [Fact]
    public async Task Feedback_solo_per_allieve_delle_proprie_classi_e_note_interne_nascoste()
    {
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        var ok = await chiara.PostAsJsonAsync("/v1/feedback", new { memberId = Seed.GiuliaMember, body = "Ottima apertura delle spalle", visibleToStudent = true });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        await chiara.PostAsJsonAsync("/v1/feedback", new { memberId = Seed.GiuliaMember, body = "Nota interna per le insegnanti", visibleToStudent = false });

        var annaMember = ApiFixture.Id("oasi:member:stu-anna"); // Tessuti Base, non è allieva di Chiara
        Assert.Equal(HttpStatusCode.Forbidden, (await chiara.PostAsJsonAsync("/v1/feedback", new { memberId = annaMember, body = "x" })).StatusCode);

        var forGiulia = await api.For(Seed.OasiHost, Seed.Giulia).GetFromJsonAsync<JsonElement[]>("/v1/feedback");
        Assert.Contains(forGiulia!, f => f.GetProperty("body").GetString() == "Ottima apertura delle spalle");
        Assert.DoesNotContain(forGiulia!, f => f.GetProperty("body").GetString() == "Nota interna per le insegnanti");
    }

    [Fact]
    public async Task Genitore_agisce_solo_per_i_propri_figli()
    {
        var laura = api.For(Seed.ProvaHost, Seed.Laura);
        var lessons = await laura.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(21)}&memberId={Seed.ChildMember}");
        var lessonId = lessons!.First().GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await laura.PutAsJsonAsync($"/v1/lessons/{lessonId}/declaration", new { memberId = Seed.ChildMember, declared = "absent" })).StatusCode);

        // La stessa operazione per una persona non collegata viene rifiutata
        var teacherMember = ApiFixture.Id("prova:member:teacher");
        Assert.Equal(HttpStatusCode.Forbidden, (await laura.PutAsJsonAsync($"/v1/lessons/{lessonId}/declaration", new { memberId = teacherMember, declared = "absent" })).StatusCode);
    }

    [Fact]
    public async Task Eventi_con_capienza_e_scadenza()
    {
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);
        var created = await admin.PostAsJsonAsync("/v1/events", new
        {
            type = "workshop", title = "Workshop di prova", date = InDays(20), startTime = "15:00", endTime = "17:00", capacity = 1,
            signupDeadline = DateTime.UtcNow.AddDays(10),
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await api.For(Seed.OasiHost, Seed.Giulia).PostAsync($"/v1/events/{id}/signup", null)).StatusCode);
        var full = await api.For(Seed.OasiHost, Seed.Sofia).PostAsync($"/v1/events/{id}/signup", null);
        Assert.Equal(HttpStatusCode.Conflict, full.StatusCode);
        Assert.Contains("event_full", await full.Content.ReadAsStringAsync());
        // Le allieve non creano eventi
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Giulia).PostAsJsonAsync("/v1/events", new { type = "show", title = "x", date = InDays(5), startTime = "10:00", endTime = "11:00", capacity = 5 })).StatusCode);
    }
}

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Oasi.Api.Tests;

/// <summary>Revisione: archivio documentale, discipline dinamiche, chiusure e calendario (punto 3 del documento).</summary>
[Collection("api")]
public sealed class RevisionTests(ApiFixture api)
{
    private static string InDays(int d) => DateTime.Now.AddDays(d).ToString("yyyy-MM-dd");
    private static readonly Guid Martina = ApiFixture.Id("user:stu-martina");
    private static readonly Guid MartinaMember = ApiFixture.Id("oasi:member:stu-martina");

    private static MultipartFormDataContent Upload(Guid typeId, string fileName, string content, Guid? memberId = null)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", fileName);
        form.Add(new StringContent(typeId.ToString()), "typeId");
        if (memberId is { } m) form.Add(new StringContent(m.ToString()), "memberId");
        return form;
    }

    private async Task<Guid> CreateType(string name, string category, bool required = true, string signature = "none", short? validity = null)
    {
        var res = await api.For(Seed.OasiHost, Seed.OasiAdmin).PostAsJsonAsync("/v1/document-types", new
        {
            name = $"Test · {name}", category, isRequired = required, signatureMode = signature, validityMonths = validity,
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Documento_caricato_dall_allieva_visibile_nel_profilo_e_nell_archivio_e_approvato()
    {
        var type = await CreateType("Modulo di iscrizione 2026/27", "enrollment");
        var martina = api.For(Seed.OasiHost, Martina);
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);

        // Prima del caricamento il documento risulta mancante
        var before = await martina.GetFromJsonAsync<JsonElement>($"/v1/members/{MartinaMember}/documents");
        Assert.Contains(before.GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == type);

        // 1. L'allieva carica il documento
        var up = await martina.PostAsync("/v1/documents", Upload(type, "iscrizione.pdf", "%PDF-1.4 modulo firmato"));
        Assert.Equal(HttpStatusCode.Created, up.StatusCode);
        var docId = (await up.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // 2. L'amministratore lo vede nel profilo dell'utente
        var profile = await admin.GetFromJsonAsync<JsonElement>($"/v1/members/{MartinaMember}/documents");
        Assert.Contains(profile.GetProperty("documents").EnumerateArray(), d => d.GetProperty("id").GetGuid() == docId && d.GetProperty("status").GetString() == "pending_review");

        // 3. Lo stesso documento (stesso id, nessuna copia) compare nell'Archivio generale, filtrabile
        var archive = await admin.GetFromJsonAsync<JsonElement[]>($"/v1/documents?q=Martina&typeId={type}&status=pending_review");
        Assert.Single(archive!, d => d.GetProperty("id").GetGuid() == docId);
        Assert.Equal(1, await api.Scalar<long>("select count(*) from app.documents where type_id = @t", new { t = type }));

        // 4. L'amministratore approva e l'allieva vede il nuovo stato
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/v1/documents/{docId}/review", new { action = "approve" })).StatusCode);
        var after = await martina.GetFromJsonAsync<JsonElement>($"/v1/members/{MartinaMember}/documents");
        Assert.Equal("approved", after.GetProperty("documents").EnumerateArray().Single(d => d.GetProperty("id").GetGuid() == docId).GetProperty("status").GetString());
        Assert.DoesNotContain(after.GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == type);

        // Il file si scarica solo tramite l'API, con il contenuto originale
        var file = await martina.GetAsync($"/v1/documents/{docId}/file");
        Assert.Equal(HttpStatusCode.OK, file.StatusCode);
        Assert.Equal("%PDF-1.4 modulo firmato", await file.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Sostituzione_richiesta_crea_nuova_versione_collegata_allo_stesso_profilo()
    {
        var type = await CreateType("Certificato medico sportivo", "medical", validity: 12);
        var martina = api.For(Seed.OasiHost, Martina);
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);
        var first = (await (await martina.PostAsync("/v1/documents", Upload(type, "certificato.pdf", "vecchio"))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Richiesta di sostituzione senza spiegazione: rifiutata
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/v1/documents/{first}/review", new { action = "request_replacement" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/v1/documents/{first}/review", new { action = "request_replacement", note = "Il certificato è illeggibile" })).StatusCode);

        var second = (await (await martina.PostAsync("/v1/documents", Upload(type, "certificato-nuovo.pdf", "nuovo"))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var profile = await martina.GetFromJsonAsync<JsonElement>($"/v1/members/{MartinaMember}/documents");
        var current = profile.GetProperty("documents").EnumerateArray().Single(d => d.GetProperty("typeId").GetGuid() == type);
        Assert.Equal(second, current.GetProperty("id").GetGuid());
        Assert.Equal(2, current.GetProperty("version").GetInt32());
        Assert.Equal(first, current.GetProperty("replacesDocumentId").GetGuid());
        Assert.False(string.IsNullOrEmpty(current.GetProperty("expiresOn").GetString())); // scadenza calcolata dalla validità (12 mesi)
        Assert.Contains(profile.GetProperty("history").EnumerateArray(), d => d.GetProperty("id").GetGuid() == first);
        Assert.Equal(MartinaMember, await api.Scalar<Guid>("select member_id from app.documents where id = @id", new { id = second }));

        // Storico delle verifiche e modifiche
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/v1/documents/{second}");
        var actions = detail.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("action").GetString()).ToList();
        Assert.Contains("replacement_requested", actions);
        Assert.Contains("replaced", actions);
        Assert.Contains("uploaded", actions);
        // La versione precedente non è più verificabile
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/v1/documents/{first}/review", new { action = "approve" })).StatusCode);
    }

    [Fact]
    public async Task Moduli_firmati_a_mano_si_caricano_come_file_e_non_si_firmano_nell_app()
    {
        var type = await CreateType("Liberatoria attività aeree", "waiver", signature: "upload_signed");
        var martina = api.For(Seed.OasiHost, Martina);
        // Il modulo firmato a mano si carica come file: risulta "caricato firmato" e va in verifica
        var res = await martina.PostAsync("/v1/documents", Upload(type, "liberatoria-firmata.pdf", "%PDF-1.4 liberatoria firmata"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal("upload_signed", await api.Scalar<string>("select signature_method from app.documents where id = @id", new { id }));
        Assert.Equal("pending_review", await api.Scalar<string>("select status from app.documents where id = @id", new { id }));
        // Nessuna firma nella piattaforma: niente endpoint di firma, né tipologie "elettroniche", né documenti senza file
        var sign = await martina.PostAsJsonAsync("/v1/documents/sign", new { typeId = type, signerName = "Martina Conti", accept = true });
        Assert.Contains(sign.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Equal(HttpStatusCode.BadRequest, (await api.For(Seed.OasiHost, Seed.OasiAdmin).PostAsJsonAsync("/v1/document-types", new { name = "Test · Firma digitale", category = "waiver", signatureMode = "electronic" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await martina.PostAsync("/v1/documents", new MultipartFormDataContent { { new StringContent(type.ToString()), "typeId" } })).StatusCode);
    }

    [Fact]
    public async Task Documenti_protetti_tra_allieve_insegnanti_e_palestre()
    {
        var type = await CreateType("Consenso immagini", "consent", required: false);
        var doc = (await (await api.For(Seed.OasiHost, Martina).PostAsync("/v1/documents", Upload(type, "consenso.pdf", "x"))).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Un'altra allieva e un'insegnante non vedono i documenti di Martina
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Giulia).GetAsync($"/v1/members/{MartinaMember}/documents")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Giulia).GetAsync($"/v1/documents/{doc}/file")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Elena).GetAsync($"/v1/documents/{doc}/file")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Elena).GetAsync("/v1/documents")).StatusCode);
        // Un utente di un'altra palestra: né sul suo dominio (riga invisibile) né su quello di Oasi (non è membro)
        // (Studio Prova non ha il modulo documenti: bloccato prima ancora di cercare il file)
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.ProvaHost, Seed.ProvaTeacher).GetAsync($"/v1/documents/{doc}/file")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.ProvaTeacher).GetAsync($"/v1/documents/{doc}/file")).StatusCode);
        // Studio Prova (piano Essential) non ha il modulo documenti
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.ProvaHost, Seed.ProvaTeacher).GetAsync("/v1/documents")).StatusCode);
    }

    [Fact]
    public async Task Nuova_disciplina_classe_collegata_e_disattivazione_senza_perdita_di_dati()
    {
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);
        var created = await admin.PostAsJsonAsync("/v1/disciplines", new { name = "Pole dance", color = "#7A4FB5", apparatus = new[] { "Palo statico" } });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var discipline = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/v1/disciplines", new { name = "Pole Dance" })).StatusCode);

        // Classe associata alla nuova disciplina
        var cls = await admin.PostAsJsonAsync("/v1/classes", new
        {
            name = "Pole principianti", disciplineId = discipline, levelId = ApiFixture.Id("oasi:level:base"), ageMin = 18, capacity = 10, weekday = 2, startTime = "20:00", endTime = "21:00",
        });
        Assert.Equal(HttpStatusCode.Created, cls.StatusCode);
        var classId = (await cls.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(discipline, await api.Scalar<Guid>("select discipline_id from app.classes where id = @id", new { id = classId }));
        var config = await api.For(Seed.OasiHost).GetFromJsonAsync<JsonElement>("/v1/public/tenant-config");
        Assert.Contains(config.GetProperty("disciplines").EnumerateArray(), d => d.GetProperty("slug").GetString() == "pole-dance");

        // Disattivazione: niente nuove classi, ma classi, lezioni e storico restano
        var lessonsBefore = await api.Scalar<long>("select count(*) from app.lessons where class_id = @id", new { id = classId });
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PatchAsJsonAsync($"/v1/disciplines/{discipline}/active", new { isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/v1/classes", new { name = "Pole 2", disciplineId = discipline, capacity = 8, weekday = 3, startTime = "20:00", endTime = "21:00" })).StatusCode);
        Assert.Equal("Pole principianti", await api.Scalar<string>("select name from app.classes where id = @id", new { id = classId }));
        Assert.Equal(lessonsBefore, await api.Scalar<long>("select count(*) from app.lessons where class_id = @id", new { id = classId }));
        var all = await admin.GetFromJsonAsync<JsonElement[]>("/v1/disciplines?includeInactive=true");
        var pole = all!.Single(d => d.GetProperty("id").GetGuid() == discipline);
        Assert.False(pole.GetProperty("isActive").GetBoolean());
        Assert.Equal(1, pole.GetProperty("classes").GetInt32());
        var forStudents = await api.For(Seed.OasiHost, Seed.Giulia).GetFromJsonAsync<JsonElement[]>("/v1/disciplines");
        Assert.DoesNotContain(forStudents!, d => d.GetProperty("id").GetGuid() == discipline);
        // Le allieve non gestiscono le discipline
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Giulia).PostAsJsonAsync("/v1/disciplines", new { name = "Yoga" })).StatusCode);
        // Le discipline di Oasi non esistono per Studio Prova
        Assert.Equal(HttpStatusCode.NotFound, (await api.For(Seed.ProvaHost, Seed.ProvaTeacher).PatchAsJsonAsync($"/v1/disciplines/{discipline}/active", new { isActive = true })).StatusCode);
    }

    [Fact]
    public async Task Chiusura_annulla_le_lezioni_compare_nei_calendari_e_si_puo_annullare()
    {
        var admin = api.For(Seed.OasiHost, Seed.OasiAdmin);
        // Primo giovedì futuro: lezione di Tessuti Intermedio (Martina)
        var martina = api.For(Seed.OasiHost, Martina);
        var lesson = (await martina.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(21)}"))!.First(l => l.GetProperty("status").GetString() == "scheduled");
        var date = lesson.GetProperty("date").GetString()!;
        // Sofia ha chiesto di recuperare proprio in quella lezione
        var makeup = await api.For(Seed.OasiHost, Seed.Sofia).PostAsJsonAsync("/v1/makeups", new { targetLessonId = lesson.GetProperty("id").GetGuid() });
        Assert.Equal(HttpStatusCode.Created, makeup.StatusCode);
        var makeupId = (await makeup.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var res = await admin.PostAsJsonAsync("/v1/closures", new { kind = "strike", title = "Sciopero generale", startDate = date, endDate = date, note = "Recupero sabato", notifyNow = true });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var closure = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Calendario dell'allieva: lezione annullata con il motivo
        var after = (await martina.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={date}&to={date}"))!.Single(l => l.GetProperty("id").GetGuid() == lesson.GetProperty("id").GetGuid());
        Assert.Equal("cancelled", after.GetProperty("status").GetString());
        Assert.StartsWith("Sciopero generale", after.GetProperty("note").GetString());
        // Calendario generale dell'amministrazione e calendario dell'insegnante
        var general = await admin.GetFromJsonAsync<JsonElement>($"/v1/calendar?from={date}&to={date}");
        Assert.Contains(general.GetProperty("closures").EnumerateArray(), c => c.GetProperty("id").GetGuid() == closure);
        Assert.All(general.GetProperty("lessons").EnumerateArray(), l => Assert.Equal("cancelled", l.GetProperty("status").GetString()));
        var teacher = (await api.For(Seed.OasiHost, Seed.Elena).GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={date}&to={date}&scope=teaching"))!;
        Assert.All(teacher, l => Assert.Equal("cancelled", l.GetProperty("status").GetString()));

        // Niente appuntamenti incompatibili: niente disdette, recuperi o ripristini manuali in quel giorno
        var id = lesson.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await martina.PutAsJsonAsync($"/v1/lessons/{id}/declaration", new { declared = "absent" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await api.For(Seed.OasiHost, Seed.Sofia).PostAsJsonAsync("/v1/makeups", new { targetLessonId = id })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await api.For(Seed.OasiHost, Seed.Elena).PutAsJsonAsync($"/v1/lessons/{id}", new { status = "scheduled" })).StatusCode);

        // Il recupero fissato in quel giorno è annullato e Sofia viene avvisata
        Assert.Equal("cancelled", await api.Scalar<string>("select status from app.makeup_requests where id = @makeupId", new { makeupId }));
        var sofiaNotes = await api.For(Seed.OasiHost, Seed.Sofia).GetFromJsonAsync<JsonElement[]>("/v1/notifications");
        Assert.Contains(sofiaNotes!, n => n.GetProperty("title").GetString() == "Recupero annullato");

        // Le persone interessate ricevono la comunicazione
        var notes = await martina.GetFromJsonAsync<JsonElement[]>("/v1/notifications");
        Assert.Contains(notes!, n => n.GetProperty("title").GetString()!.Contains("Sciopero generale"));
        // Le allieve non creano chiusure
        Assert.Equal(HttpStatusCode.Forbidden, (await martina.PostAsJsonAsync("/v1/closures", new { kind = "closure", title = "x", startDate = date, endDate = date })).StatusCode);

        // Eliminando la chiusura la lezione torna regolare
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/v1/closures/{closure}")).StatusCode);
        Assert.Equal("scheduled", await api.Scalar<string>("select status from app.lessons where id = @id", new { id }));
        // Le chiusure di Oasi non sono visibili da Studio Prova
        var prova = await api.For(Seed.ProvaHost, Seed.Laura).GetFromJsonAsync<JsonElement[]>("/v1/closures");
        Assert.DoesNotContain(prova!, c => c.GetProperty("title").GetString() == "Sciopero generale");
    }
}

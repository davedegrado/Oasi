using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Oasi.Api.Infrastructure;
using Oasi.Api.Jobs;

namespace Oasi.Api.Tests;

/// <summary>
/// Regole del prompt DY DYNAMITE: ingressi scalati alla partecipazione effettiva, documenti mensili
/// degli insegnanti, classi in due aree con al massimo due discipline, sostituzioni degli insegnanti.
/// </summary>
[Collection("api")]
public sealed class DynamiteTests(ApiFixture api)
{
    private static readonly Guid OasiTenant = Guid.Parse("14920634-3760-5688-8c51-ae5013b84734");
    private static string InDays(int d) => DateTime.Now.AddDays(d).ToString("yyyy-MM-dd");
    private static Guid Member(string key) => ApiFixture.Id($"oasi:member:{key}");
    private HttpClient Admin => api.For(Seed.OasiHost, Seed.OasiAdmin);
    private HttpClient As(string key) => api.For(Seed.OasiHost, ApiFixture.Id($"user:{key}"));

    private static async Task<JsonElement> Json(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();
    private static async Task<string?> ErrorType(HttpResponseMessage res) => (await Json(res)).GetProperty("type").GetString();
    private static async Task<Guid> CreatedId(HttpResponseMessage res)
    {
        if (res.StatusCode != HttpStatusCode.Created) Assert.Fail($"Atteso 201, ricevuto {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (await Json(res)).GetProperty("id").GetGuid();
    }

    private async Task<List<Guid>> Lessons(Guid classId, int fromDays = 1, int toDays = 38)
    {
        var all = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(fromDays)}&to={InDays(toDays)}&scope=all");
        return all!.Where(l => l.GetProperty("classId").GetGuid() == classId && l.GetProperty("status").GetString() == "scheduled")
            .Select(l => l.GetProperty("id").GetGuid()).ToList();
    }

    private async Task Settings(object patch) => Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync("/v1/settings", patch)).StatusCode);
    private Task RunJobs() => MaintenanceWorker.RunForTenant(api.Services.GetRequiredService<Db>(), api.Services.GetRequiredService<IFileStorage>(), OasiTenant);

    private async Task<JsonElement> Plan(HttpClient client, Guid packId) =>
        (await client.GetFromJsonAsync<JsonElement[]>("/v1/member-plans"))!.Single(p => p.GetProperty("id").GetGuid() == packId);

    // ── Piani a lezioni: una lezione per ogni partecipazione effettiva ──

    [Fact]
    public async Task Pacchetto_scala_l_ingresso_alla_partecipazione_effettiva_e_rispetta_il_saldo()
    {
        var francesca = As("stu-francesca");   // Tessuti Base
        var francescaId = Member("stu-francesca");
        // Piano da 2 lezioni con "ci sarò", scelto dall'atleta per la sua classe; finestra del piano ampia
        var planId = await CreatedId(await Admin.PostAsJsonAsync("/v1/plans", new
        {
            name = "Test · 2 lezioni (presenza)", kind = "package", amountCents = 3000, entries = 2, validityMode = "period", validFrom = InDays(-1), validUntil = InDays(60), autoAttendance = false, bookingOpensHoursBefore = 2000,
        }));
        var packId = await CreatedId(await francesca.PostAsJsonAsync("/v1/member-plans", new { classId = Seed.ClassTessutiBase, planId }));
        var lessons = await Lessons(Seed.ClassTessutiBase, fromDays: 1, toDays: 55);

        // "Ci sarò": impegna la lezione del piano, non la consuma
        var first = await CreatedId(await francesca.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[0], memberPlanId = packId }));
        var p = await Plan(francesca, packId);
        Assert.Equal(0, p.GetProperty("entriesUsed").GetInt32());
        Assert.Equal(1, p.GetProperty("entriesReserved").GetInt32());
        Assert.Equal(1, p.GetProperty("entriesLeft").GetInt32());

        // L'ultimo ingresso disponibile
        var second = await CreatedId(await francesca.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[1], memberPlanId = packId }));
        Assert.Equal(0, (await Plan(francesca, packId)).GetProperty("entriesLeft").GetInt32());
        // Saldo esaurito (ingressi impegnati da prenotazioni in corso)
        Assert.Equal("package_exhausted", await ErrorType(await francesca.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[2], memberPlanId = packId })));

        // L'insegnante registra la presenza: l'ingresso si consuma
        var elena = api.For(Seed.OasiHost, Seed.Elena);   // insegnante di Tessuti Base
        Assert.Equal(HttpStatusCode.NoContent, (await elena.PutAsJsonAsync($"/v1/lessons/{lessons[0]}/attendance/{francescaId}", new { actual = "present" })).StatusCode);
        p = await Plan(francesca, packId);
        Assert.Equal(1, p.GetProperty("entriesUsed").GetInt32());
        Assert.Equal(1, p.GetProperty("entriesReserved").GetInt32());
        // Presenza tolta per errore: l'ingresso torna disponibile; registrata di nuovo: si consuma una volta sola
        await elena.PutAsJsonAsync($"/v1/lessons/{lessons[0]}/attendance/{francescaId}", new { actual = (string?)null });
        Assert.Equal(0, (await Plan(francesca, packId)).GetProperty("entriesUsed").GetInt32());
        await elena.PutAsJsonAsync($"/v1/lessons/{lessons[0]}/attendance/{francescaId}", new { actual = "present" });
        await elena.PutAsJsonAsync($"/v1/lessons/{lessons[0]}/attendance/{francescaId}", new { actual = "present" });
        Assert.Equal(1, (await Plan(francesca, packId)).GetProperty("entriesUsed").GetInt32());

        // Prenotata ma assente: con la regola di Oasi l'ingresso si consuma comunque
        await elena.PutAsJsonAsync($"/v1/lessons/{lessons[1]}/attendance/{francescaId}", new { actual = "absent" });
        Assert.Equal(2, (await Plan(francesca, packId)).GetProperty("entriesUsed").GetInt32());
        Assert.Equal("no_show", await api.Scalar<string>("select consumed_by from app.lesson_bookings where id = @second", new { second }));
        Assert.Equal("attendance", await api.Scalar<string>("select consumed_by from app.lesson_bookings where id = @first", new { first }));

        // La segreteria restituisce a mano l'ingresso dell'assenza senza disdetta
        Assert.Equal(HttpStatusCode.Forbidden, (await francesca.PostAsJsonAsync($"/v1/bookings/{second}/refund", new { note = "x" })).StatusCode);
        var refund = await Json(await Admin.PostAsJsonAsync($"/v1/bookings/{second}/refund", new { note = "Assenza per malattia" }));
        Assert.Equal(1, refund.GetProperty("entriesLeft").GetInt32());
        Assert.Equal(1, (await Plan(francesca, packId)).GetProperty("entriesUsed").GetInt32());
        Assert.Equal("refunded", await api.Scalar<string>("select consumed_by from app.lesson_bookings where id = @second", new { second }));
        // Non si restituisce due volte, e una presenza registrata dopo non lo riscala
        Assert.Equal("not_consumed", await ErrorType(await Admin.PostAsJsonAsync($"/v1/bookings/{second}/refund", new { })));
        await elena.PutAsJsonAsync($"/v1/lessons/{lessons[1]}/attendance/{francescaId}", new { actual = "present" });
        Assert.Equal(1, (await Plan(francesca, packId)).GetProperty("entriesUsed").GetInt32());
        Assert.Contains((await francesca.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Ingresso restituito");
        Assert.Equal(1L, await api.Scalar<long>("select count(*) from platform.audit_log where action = 'booking.refund_entry' and target = @t", new { t = second.ToString() }));

        // Piano scaduto: la lezione non è disponibile
        await api.Sql("update app.member_plans set entries_total = 3, valid_until = current_date + 1 where id = @packId", new { packId });
        Assert.Equal("no_valid_plan", await ErrorType(await francesca.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[^1], memberPlanId = packId })));
    }

    [Fact]
    public async Task Disdetta_di_un_ingresso_entro_la_soglia_lo_restituisce_dopo_la_soglia_lo_consuma()
    {
        var anna = As("stu-anna");              // Tessuti Base
        var planId = await CreatedId(await Admin.PostAsJsonAsync("/v1/plans", new
        {
            name = "Test · Pacchetto disdette", kind = "package", amountCents = 3000, entries = 3, validityMode = "period", validFrom = InDays(-1), validUntil = InDays(60), autoAttendance = false, bookingOpensHoursBefore = 2000,
        }));
        var packId = await CreatedId(await anna.PostAsJsonAsync("/v1/member-plans", new { classId = Seed.ClassTessutiBase, planId }));
        var lessons = await Lessons(Seed.ClassTessutiBase, fromDays: 2);

        var onTime = await CreatedId(await anna.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[0], memberPlanId = packId }));
        Assert.True((await Json(await anna.DeleteAsync($"/v1/bookings/{onTime}"))).GetProperty("entryRefunded").GetBoolean());
        Assert.Equal(3, (await Plan(anna, packId)).GetProperty("entriesLeft").GetInt32());

        var late = await CreatedId(await anna.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[0], memberPlanId = packId }));
        try
        {
            await Settings(new { booking = new { cancelHoursBefore = 700 } });
            var res = await Json(await anna.DeleteAsync($"/v1/bookings/{late}"));
            Assert.Equal("late_cancelled", res.GetProperty("status").GetString());
            Assert.False(res.GetProperty("entryRefunded").GetBoolean());
        }
        finally { await Settings(new { booking = new { cancelHoursBefore = 6 } }); }
        var p = await Plan(anna, packId);
        Assert.Equal(1, p.GetProperty("entriesUsed").GetInt32());
        Assert.Equal(2, p.GetProperty("entriesLeft").GetInt32());
        Assert.Equal("late_cancel", await api.Scalar<string>("select consumed_by from app.lesson_bookings where id = @late", new { late }));
    }

    // ── Documenti mensili degli insegnanti ─────────────────────────────

    private static MultipartFormDataContent Upload(Guid? typeId, string? title, string fileName, string? expiresOn = null)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes("contenuto " + fileName));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", fileName);
        if (typeId is { } t) form.Add(new StringContent(t.ToString()), "typeId");
        if (title is not null) form.Add(new StringContent(title), "title");
        form.Add(new StringContent(expiresOn ?? "2030-12-31"), "expiresOn");   // Oasi chiede sempre la scadenza; "" = non indicata
        return form;
    }

    [Fact]
    public async Task Insegnanti_due_documenti_ogni_mese_con_titolo_libero_entro_fine_mese()
    {
        var elena = api.For(Seed.OasiHost, Seed.Elena);
        var elenaId = Member("tch-elena");
        // Una tipologia che chiede due documenti al mese: quali siano lo decide chi li carica (titolo libero)
        var type = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/document-types"))!.Single(t => t.GetProperty("recurrence").GetString() == "monthly");
        var typeId = type.GetProperty("id").GetGuid();
        Assert.Equal(2, type.GetProperty("requiredCount").GetInt32());
        Assert.Equal("teachers", type.GetProperty("audience").GetString());
        var today = DateOnly.FromDateTime(DateTime.Now);
        var endOfMonth = new DateOnly(today.Year, today.Month, DateTime.DaysInMonth(today.Year, today.Month)).ToString("yyyy-MM-dd");
        Assert.Equal(endOfMonth, type.GetProperty("currentDue").GetString());
        Assert.DoesNotContain((await As("stu-anna").GetFromJsonAsync<JsonElement[]>("/v1/document-types"))!, t => t.GetProperty("id").GetGuid() == typeId);

        // Il lavoro pianificato crea la richiesta del mese e avvisa una sola volta
        await RunJobs();
        await RunJobs();
        var request = (await elena.GetFromJsonAsync<JsonElement[]>("/v1/document-requests?status=open"))!.Single(r => r.GetProperty("typeId").GetGuid() == typeId);
        Assert.Equal(endOfMonth, request.GetProperty("dueOn").GetString());
        Assert.Single((await elena.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Documento da caricare: Documenti mensili insegnanti");

        // Senza titolo non si distingue quale dei due documenti sia
        Assert.Equal(HttpStatusCode.BadRequest, (await elena.PostAsync("/v1/documents", Upload(typeId, null, "x.pdf"))).StatusCode);
        // Primo documento: la richiesta resta aperta finché non ci sono entrambi
        var first = await CreatedId(await elena.PostAsync("/v1/documents", Upload(typeId, "Ricevuta compensi novembre", "ricevuta.pdf")));
        Assert.Equal("open", await api.Scalar<string>("select status from app.document_requests where id = @id", new { id = request.GetProperty("id").GetGuid() }));
        Assert.Contains((await elena.GetFromJsonAsync<JsonElement>($"/v1/members/{elenaId}/documents")).GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == typeId);
        // Secondo documento, con una sua scadenza: richiesta evasa, nulla manca
        var second = await CreatedId(await elena.PostAsync("/v1/documents", Upload(typeId, "Attestato formazione", "attestato.pdf", expiresOn: InDays(200))));
        Assert.Equal("fulfilled", await api.Scalar<string>("select status from app.document_requests where id = @id", new { id = request.GetProperty("id").GetGuid() }));
        var area = await elena.GetFromJsonAsync<JsonElement>($"/v1/members/{elenaId}/documents");
        Assert.DoesNotContain(area.GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == typeId);
        var docs = area.GetProperty("documents").EnumerateArray().Where(d => d.GetProperty("typeId").ValueKind != JsonValueKind.Null && d.GetProperty("typeId").GetGuid() == typeId).ToList();
        Assert.Equal(2, docs.Count);
        Assert.Contains(docs, d => d.GetProperty("title").GetString() == "Attestato formazione" && d.GetProperty("expiresOn").GetString() == InDays(200));
        Assert.All(docs, d => Assert.Equal(today.ToString("yyyy-MM"), d.GetProperty("periodKey").GetString()));
        // Ricaricare lo stesso titolo crea una nuova versione, non un terzo documento
        var again = await CreatedId(await elena.PostAsync("/v1/documents", Upload(typeId, "Ricevuta compensi novembre", "ricevuta-corretta.pdf")));
        Assert.Equal(first, await api.Scalar<Guid>("select replaces_document_id from app.documents where id = @again", new { again }));

        // Stati: l'amministrazione chiede una correzione → "da correggere", con notifica
        Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/documents/{second}/review", new { action = "request_replacement", note = "Manca la firma" })).StatusCode);
        area = await elena.GetFromJsonAsync<JsonElement>($"/v1/members/{elenaId}/documents");
        Assert.Equal("to_fix", area.GetProperty("documents").EnumerateArray().Single(d => d.GetProperty("id").GetGuid() == second).GetProperty("state").GetString());
        Assert.Contains((await elena.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Sostituisci il documento: Attestato formazione");

        // Chiara non ha caricato nulla: termine passato → avviso a lei e all'amministrazione, una volta sola
        var chiaraId = Member("tch-chiara");
        await api.Sql("update app.document_requests set due_on = current_date - 1 where member_id = @chiaraId and status = 'open' and period_key is not null", new { chiaraId });
        await RunJobs();
        await RunJobs();
        Assert.Single((await api.For(Seed.OasiHost, Seed.Chiara).GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Documento mancante: Documenti mensili insegnanti");
        Assert.Contains((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Documento mancante: Documenti mensili insegnanti");

        Assert.Equal("2026-12", await api.Scalar<string>("select app.period_key('monthly', null, date '2026-12-03')"));
        Assert.Equal(new DateOnly(2027, 2, 28), await api.Scalar<DateOnly>("select app.period_due('monthly', null, null, date '2027-02-10')"));
    }

    [Fact]
    public async Task Documento_libero_senza_tipologia_con_scadenza()
    {
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        var chiaraId = Member("tch-chiara");
        // Né tipologia né titolo: rifiutato
        Assert.Equal(HttpStatusCode.BadRequest, (await chiara.PostAsync("/v1/documents", Upload(null, null, "x.pdf"))).StatusCode);
        // Per Oasi la scadenza è obbligatoria in ogni documento, anche senza tipologia
        Assert.Equal(HttpStatusCode.BadRequest, (await chiara.PostAsync("/v1/documents", Upload(null, "Brevetto istruttore", "brevetto.pdf", expiresOn: ""))).StatusCode);
        var id = await CreatedId(await chiara.PostAsync("/v1/documents", Upload(null, "Brevetto istruttore", "brevetto.pdf", expiresOn: InDays(400))));
        var doc = (await chiara.GetFromJsonAsync<JsonElement>($"/v1/documents/{id}")).GetProperty("document");
        Assert.Equal(JsonValueKind.Null, doc.GetProperty("typeId").ValueKind);
        Assert.Equal("Brevetto istruttore", doc.GetProperty("title").GetString());
        Assert.Equal(InDays(400), doc.GetProperty("expiresOn").GetString());
        Assert.Equal("pending", doc.GetProperty("state").GetString());
        // Compare nell'archivio dell'amministrazione, che lo può approvare e scaricare
        Assert.Contains((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/documents"))!, d => d.GetProperty("id").GetGuid() == id);
        Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/documents/{id}/review", new { action = "approve" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Admin.GetAsync($"/v1/documents/{id}/file")).StatusCode);
        // La scadenza si corregge come per gli altri documenti
        Assert.Equal(HttpStatusCode.OK, (await chiara.PutAsJsonAsync($"/v1/documents/{id}/expiry", new { expiresOn = InDays(300) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await chiara.PutAsJsonAsync($"/v1/documents/{id}/expiry", new { expiresOn = (string?)null })).StatusCode);
        // Un'altra insegnante non lo vede
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Elena).GetAsync($"/v1/documents/{id}")).StatusCode);
        // Selezione multipla: due documenti scelti, un unico ZIP (file non ricompressi)
        var other = await CreatedId(await chiara.PostAsync("/v1/documents", Upload(null, "Attestato primo soccorso", "bls.pdf")));
        var zip = await Admin.GetAsync($"/v1/documents/export?ids={id}&ids={other}");
        Assert.Equal(HttpStatusCode.OK, zip.StatusCode);
        using (var archive = new System.IO.Compression.ZipArchive(await zip.Content.ReadAsStreamAsync()))
        {
            Assert.Equal(2, archive.Entries.Count);
            Assert.All(archive.Entries, e => Assert.Equal(e.Length, e.CompressedLength));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await chiara.GetAsync($"/v1/documents/export?ids={id}")).StatusCode);
        // Senza alcun filtro né selezione non si scarica l'intero archivio
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync("/v1/documents/export")).StatusCode);
        _ = chiaraId;
    }

    [Fact]
    public async Task Insegnanti_e_amministrazione_si_segnano_agli_eventi_come_le_atlete()
    {
        var events = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/events");
        var open = events!.First(e => e.GetProperty("signupDeadline").ValueKind == JsonValueKind.Null || e.GetProperty("signupDeadline").GetDateTime() > DateTime.UtcNow);
        var id = open.GetProperty("id").GetGuid();
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.PostAsync($"/v1/events/{id}/signup", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PostAsync($"/v1/events/{id}/signup", null)).StatusCode);
        Assert.True((await chiara.GetFromJsonAsync<JsonElement[]>("/v1/events"))!.Single(e => e.GetProperty("id").GetGuid() == id).GetProperty("joined").GetBoolean());
        Assert.True((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/events"))!.Single(e => e.GetProperty("id").GetGuid() == id).GetProperty("joined").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.DeleteAsync($"/v1/events/{id}/signup")).StatusCode);
        Assert.False((await chiara.GetFromJsonAsync<JsonElement[]>("/v1/events"))!.Single(e => e.GetProperty("id").GetGuid() == id).GetProperty("joined").GetBoolean());
        await Admin.DeleteAsync($"/v1/events/{id}/signup");
    }

    [Fact]
    public async Task Recupero_richiedibile_solo_nella_finestra_impostata_dall_amministrazione()
    {
        var sara = As("stu-sara");               // Cerchio Intermedio
        await Seed.DeclareAbsence(api, sara, Seed.ClassCerchioInt);
        var target = (await Lessons(Seed.ClassCerchioBase, fromDays: 4))[0];
        var hours = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/bookings/lessons"))!.Single(l => l.GetProperty("id").GetGuid() == target).GetProperty("hoursToStart").GetDouble();
        var days = hours / 24;
        try
        {
            // Massimo: si chiede a partire da N giorni prima
            await Settings(new { makeups = new { requestOpensDaysBefore = (int)Math.Floor(days) - 1, requestClosesDaysBefore = 0 } });
            var early = await Json(await sara.PostAsJsonAsync("/v1/makeups", new { targetLessonId = target }));
            Assert.Equal("makeup_not_open", early.GetProperty("type").GetString());
            Assert.Contains("giorni prima", early.GetProperty("title").GetString());
            // Minimo: entro N giorni prima
            await Settings(new { makeups = new { requestOpensDaysBefore = (int)Math.Ceiling(days) + 10, requestClosesDaysBefore = (int)Math.Ceiling(days) + 1 } });
            Assert.Equal("makeup_too_late", await ErrorType(await sara.PostAsJsonAsync("/v1/makeups", new { targetLessonId = target })));
            // Intervallo incoerente: non si salva; valori in ore non più accettati come giorni fuori scala
            Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { makeups = new { requestOpensDaysBefore = 2, requestClosesDaysBefore = 5 } })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { makeups = new { requestOpensDaysBefore = 1000 } })).StatusCode);
            // Dentro la finestra: accettato
            await Settings(new { makeups = new { requestOpensDaysBefore = (int)Math.Ceiling(days) + 1, requestClosesDaysBefore = 0 } });
            Assert.Equal(HttpStatusCode.Created, (await sara.PostAsJsonAsync("/v1/makeups", new { targetLessonId = target })).StatusCode);
        }
        finally { await Settings(new { makeups = new { requestOpensDaysBefore = (int?)null, requestClosesDaysBefore = 0 } }); }
    }

    // ── Classi: due aree, al massimo due discipline ────────────────────

    [Fact]
    public async Task Classi_in_due_aree_con_al_massimo_due_discipline_dall_archivio()
    {
        var disciplines = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/disciplines"))!.Select(d => d.GetProperty("id").GetGuid()).ToList();
        // Una terza disciplina nell'archivio esistente
        var third = await CreatedId(await Admin.PostAsJsonAsync("/v1/disciplines", new { name = "Test · Acrobatica", color = "#B8963E" }));
        object Body(Guid[] ids, string? category) => new
        {
            name = "Test · Baby Teen Aerea", disciplineId = ids[0], disciplineIds = ids, capacity = 10, weekday = 6, startTime = "15:00", endTime = "16:00",
            category, ageMin = 6, ageMax = 14,
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync("/v1/classes", Body([disciplines[0], disciplines[1], third], "Bambini/Ragazzi"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync("/v1/classes", Body([disciplines[0], disciplines[1]], "Senior"))).StatusCode);
        var id = await CreatedId(await Admin.PostAsJsonAsync("/v1/classes", Body([disciplines[0], third], "Bambini/Ragazzi")));
        var cls = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/classes"))!.Single(c => c.GetProperty("id").GetGuid() == id);
        Assert.Equal("Bambini/Ragazzi", cls.GetProperty("category").GetString());
        Assert.Equal(2, cls.GetProperty("disciplineIds").GetArrayLength());
        // Le classi esistenti di Oasi sono nell'area Adulti/Ragazzi
        Assert.Equal("Adulti/Ragazzi", (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/classes"))!.Single(c => c.GetProperty("id").GetGuid() == Seed.ClassCerchioBase).GetProperty("category").GetString());

        // Il piano Baby/Teen si sceglie per questa classe, non per quelle Adulti/Ragazzi (coerenza piano ↔ area)
        var forKids = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/plans?classId={id}");
        Assert.Contains(forKids!, p => p.GetProperty("name").GetString() == "Baby/Teen · 1 volta a settimana");
        var forAdults = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/plans?classId={Seed.ClassCerchioBase}");
        Assert.DoesNotContain(forAdults!, p => p.GetProperty("name").GetString()!.StartsWith("Baby/Teen"));
        var babyTeen = forKids!.Single(p => p.GetProperty("name").GetString() == "Baby/Teen · 1 volta a settimana").GetProperty("id").GetGuid();
        // La classe è per 6–14 anni: per la prova Noemi ha 10 anni
        await api.Sql("update app.members set birth_date = current_date - interval '10 years' where id = @m", new { m = Member("stu-noemi") });
        try { await CreatedId(await As("stu-noemi").PostAsJsonAsync("/v1/enrollments", new { classId = id, planId = babyTeen })); }
        finally { await api.Sql("update app.members set birth_date = '1993-02-27' where id = @m", new { m = Member("stu-noemi") }); }

        // Le categorie sono configurabili: Studio Prova non ne ha e non ha limite di discipline
        var prova = api.For(Seed.ProvaHost, Seed.ProvaTeacher);
        var provaDisc = (await prova.GetFromJsonAsync<JsonElement[]>("/v1/disciplines"))!.Single().GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Created, (await prova.PostAsJsonAsync("/v1/classes", new
        {
            name = "Test · Pole libero", disciplineId = provaDisc, capacity = 8, weekday = 3, startTime = "19:00", endTime = "20:00",
        })).StatusCode);
    }

    [Fact]
    public async Task Sale_create_rinominate_ed_eliminate_solo_se_libere()
    {
        var rooms = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/rooms");
        var luna = rooms!.Single(r => r.GetProperty("name").GetString() == "Sala Luna");
        Assert.True(luna.GetProperty("classes").GetInt32() > 0);
        // Le atlete non gestiscono le sale; nomi duplicati rifiutati
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").PostAsJsonAsync("/v1/rooms", new { name = "Sala X" })).StatusCode);
        Assert.Equal("room_exists", await ErrorType(await Admin.PostAsJsonAsync("/v1/rooms", new { name = "sala luna" })));
        var id = await CreatedId(await Admin.PostAsJsonAsync("/v1/rooms", new { name = "Test · Sala Sole" }));
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/rooms/{id}", new { name = "Test · Sala Sole grande" })).StatusCode);
        Assert.Contains((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/rooms"))!, r => r.GetProperty("name").GetString() == "Test · Sala Sole grande");
        // Una sala usata da una classe non si elimina; una libera sì
        Assert.Equal("room_in_use", await ErrorType(await Admin.DeleteAsync($"/v1/rooms/{luna.GetProperty("id").GetGuid()}")));
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.DeleteAsync($"/v1/rooms/{id}")).StatusCode);
        // Le sale di Oasi non esistono per Studio Prova
        Assert.DoesNotContain((await api.For(Seed.ProvaHost, Seed.ProvaTeacher).GetFromJsonAsync<JsonElement[]>("/v1/rooms"))!, r => r.GetProperty("name").GetString() == "Sala Luna");
    }

    [Fact]
    public async Task Numero_di_tessera_assegnato_dall_amministrazione_unico_nella_struttura()
    {
        // Atleta registrata senza tessera: l'amministrazione lo vede
        await api.Sql("insert into app.member_admin (tenant_id, member_id) values (@t, @m) on conflict (tenant_id, member_id) do update set card_number = null",
            new { t = OasiTenant, m = Member("stu-noemi") });
        Assert.True((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/members"))!.Single(x => x.GetProperty("id").GetGuid() == Member("stu-noemi")).GetProperty("cardMissing").GetBoolean());
        // L'atleta non si assegna la tessera da sola
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-noemi").PutAsJsonAsync($"/v1/members/{Member("stu-noemi")}/card", new { cardNumber = "X-1", expiresOn = "2027-08-31" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/members/{Member("stu-noemi")}/card", new { cardNumber = "TEST-0001", expiresOn = "2027-08-31" })).StatusCode);
        var adminData = (await As("stu-noemi").GetFromJsonAsync<JsonElement>($"/v1/members/{Member("stu-noemi")}")).GetProperty("administrative");
        Assert.Equal("TEST-0001", adminData.GetProperty("cardNumber").GetString());
        Assert.False((await Admin.GetFromJsonAsync<JsonElement[]>("/v1/members"))!.Single(x => x.GetProperty("id").GetGuid() == Member("stu-noemi")).GetProperty("cardMissing").GetBoolean());
        Assert.Contains((await As("stu-noemi").GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Tessera associativa assegnata");
        // Lo stesso numero non si assegna a un'altra persona (anche cambiando maiuscole)
        Assert.Equal("card_taken", await ErrorType(await Admin.PutAsJsonAsync($"/v1/members/{Member("stu-greta")}/card", new { cardNumber = "test-0001", expiresOn = "2027-08-31" })));
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync($"/v1/members/{Member("stu-greta")}/card", new { cardNumber = "TEST-0002", expiresOn = "non è una data" })).StatusCode);
        // Numero sbagliato: l'amministrazione lo corregge e l'atleta riceve l'avviso di aggiornamento
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/members/{Member("stu-noemi")}/card", new { cardNumber = "TEST-0010", expiresOn = "2027-08-31" })).StatusCode);
        Assert.Equal("TEST-0010", (await As("stu-noemi").GetFromJsonAsync<JsonElement>($"/v1/members/{Member("stu-noemi")}")).GetProperty("administrative").GetProperty("cardNumber").GetString());
        Assert.Contains((await As("stu-noemi").GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Tessera associativa aggiornata");
        // Il vecchio numero torna libero
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/members/{Member("stu-greta")}/card", new { cardNumber = "TEST-0001", expiresOn = "2027-08-31" })).StatusCode);
    }

    // ── Sostituzioni ───────────────────────────────────────────────────

    [Fact]
    public async Task Sostituzione_dell_insegnante_assente_con_presenze_compilate_da_chi_sostituisce()
    {
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);       // insegnante di Cerchio Intermedio
        var elena = api.For(Seed.OasiHost, Seed.Elena);
        var valentina = api.For(Seed.OasiHost, ApiFixture.Id("user:tch-valentina"));
        var lesson = (await Lessons(Seed.ClassCerchioInt, fromDays: 2))[0];

        // Prima della sostituzione Elena non gestisce la lezione
        Assert.Equal(HttpStatusCode.Forbidden, (await elena.GetAsync($"/v1/lessons/{lesson}/roster")).StatusCode);
        // Solo l'insegnante della classe o l'amministrazione assegnano la sostituzione, e solo a un insegnante
        Assert.Equal(HttpStatusCode.Forbidden, (await valentina.PutAsJsonAsync($"/v1/lessons/{lesson}/substitute", new { memberId = Member("tch-valentina") })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-sara").PutAsJsonAsync($"/v1/lessons/{lesson}/substitute", new { memberId = Member("tch-elena") })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await chiara.PutAsJsonAsync($"/v1/lessons/{lesson}/substitute", new { memberId = Member("stu-sara") })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.PutAsJsonAsync($"/v1/lessons/{lesson}/substitute", new { memberId = Member("tch-elena"), note = "Sono a una gara" })).StatusCode);

        // Elena la vede nel proprio calendario, apre l'elenco e registra le presenze; Valentina no
        var teaching = await elena.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(1)}&to={InDays(40)}&scope=teaching");
        var row = teaching!.Single(l => l.GetProperty("id").GetGuid() == lesson);
        Assert.Equal("Elena Martinelli", row.GetProperty("substituteName").GetString());
        Assert.Equal(HttpStatusCode.OK, (await elena.GetAsync($"/v1/lessons/{lesson}/roster")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await elena.PutAsJsonAsync($"/v1/lessons/{lesson}/attendance/{Member("stu-sara")}", new { actual = "present" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await valentina.GetAsync($"/v1/lessons/{lesson}/roster")).StatusCode);
        // Chi sostituisce non annulla né sposta la lezione: resta compito dell'insegnante della classe
        Assert.Equal(HttpStatusCode.Forbidden, (await elena.PutAsJsonAsync($"/v1/lessons/{lesson}", new { status = "cancelled", note = "x" })).StatusCode);

        // Avvisi: a chi sostituisce e alle allieve della classe
        Assert.Contains((await elena.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Ti è stata affidata una sostituzione");
        Assert.Contains((await As("stu-sara").GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Lezione con insegnante sostituta");

        // Sostituzione annullata: la lezione torna solo all'insegnante della classe
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.PutAsJsonAsync($"/v1/lessons/{lesson}/substitute", new { memberId = (Guid?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await elena.GetAsync($"/v1/lessons/{lesson}/roster")).StatusCode);
    }
}

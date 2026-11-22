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
/// Regole della piattaforma multi-tenant: impostazioni per struttura, recuperi con diritto
/// residuo, posti atomici, lezioni singole e pacchetti, piani/rate/pagamenti, stagioni,
/// agonismo, genitori, documenti (sostituzione, insegnanti), eventi e notifiche.
/// </summary>
[Collection("api")]
public sealed class SaasTests(ApiFixture api)
{
    private static readonly Guid OasiTenant = Guid.Parse("14920634-3760-5688-8c51-ae5013b84734");
    private static string InDays(int d) => DateTime.Now.AddDays(d).ToString("yyyy-MM-dd");
    private static Guid User(string key) => ApiFixture.Id($"user:{key}");
    private static Guid Member(string key) => ApiFixture.Id($"oasi:member:{key}");

    private HttpClient Admin => api.For(Seed.OasiHost, Seed.OasiAdmin);
    private HttpClient As(string key) => api.For(Seed.OasiHost, User(key));

    private static async Task<JsonElement> Json(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();
    private static async Task<string?> ErrorType(HttpResponseMessage res) => (await Json(res)).GetProperty("type").GetString();
    private static async Task<Guid> CreatedId(HttpResponseMessage res)
    {
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await Json(res)).GetProperty("id").GetGuid();
    }

    /// <summary>Lezioni future regolari di una classe (viste dall'amministrazione), dalla più vicina.</summary>
    private async Task<List<Guid>> Lessons(Guid classId, int fromDays = 3, int toDays = 38)
    {
        var all = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/lessons?from={InDays(fromDays)}&to={InDays(toDays)}&scope=all");
        return all!.Where(l => l.GetProperty("classId").GetGuid() == classId && l.GetProperty("status").GetString() == "scheduled")
            .Select(l => l.GetProperty("id").GetGuid()).ToList();
    }

    private async Task Settings(object patch) => Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync("/v1/settings", patch)).StatusCode);

    private async Task<Guid> PlanId(string name) =>
        (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/plans"))!.Single(p => p.GetProperty("name").GetString() == name).GetProperty("id").GetGuid();

    private static MultipartFormDataContent Upload(Guid typeId, string fileName, string content, Guid? memberId = null, string? expiresOn = null)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", fileName);
        form.Add(new StringContent(typeId.ToString()), "typeId");
        if (memberId is { } m) form.Add(new StringContent(m.ToString()), "memberId");
        form.Add(new StringContent(expiresOn ?? "2030-12-31"), "expiresOn");   // Oasi chiede sempre la scadenza; "" = non indicata
        return form;
    }

    private Task RunJobs() => MaintenanceWorker.RunForTenant(api.Services.GetRequiredService<Db>(), api.Services.GetRequiredService<IFileStorage>(), OasiTenant);

    // ── Impostazioni per struttura ─────────────────────────────────────

    [Fact]
    public async Task Soglie_e_fuso_orario_sono_configurabili_per_struttura_e_non_escono_dal_tenant()
    {
        // Valori di Oasi (dal prompt): prenotazione aperta da 48 ore prima, disdetta libera fino a 6 ore prima,
        // classi in due aree con al massimo due discipline, pagamenti con bonifico e contanti
        var settings = await Admin.GetFromJsonAsync<JsonElement>("/v1/settings");
        Assert.Equal(48, settings.GetProperty("booking").GetProperty("opensHoursBefore").GetInt32());
        Assert.Equal(6, settings.GetProperty("booking").GetProperty("cancelHoursBefore").GetInt32());
        Assert.Equal("attendance", settings.GetProperty("packages").GetProperty("consumeOn").GetString());
        Assert.Equal(2, settings.GetProperty("classes").GetProperty("maxDisciplines").GetInt32());
        Assert.Equal(["Bambini/Ragazzi", "Adulti/Ragazzi"], settings.GetProperty("classes").GetProperty("categories").EnumerateArray().Select(c => c.GetString()!).ToArray());
        Assert.Equal(["bank_transfer", "cash"], settings.GetProperty("payments").GetProperty("methods").EnumerateArray().Select(c => c.GetString()!).ToArray());
        Assert.Equal("Europe/Rome", settings.GetProperty("timezone").GetString());
        // Documenti sostituiti: nessuna eliminazione automatica se non impostata
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("documents").GetProperty("replacedRetentionDays").ValueKind);

        try
        {
            var changed = await Json(await Admin.PutAsJsonAsync("/v1/settings", new { booking = new { cancelHoursBefore = 8 } }));
            Assert.Equal(8, changed.GetProperty("booking").GetProperty("cancelHoursBefore").GetInt32());
            // La modifica parziale non tocca le altre chiavi
            Assert.Equal(48, changed.GetProperty("booking").GetProperty("opensHoursBefore").GetInt32());
            // Studio Prova ha i valori neutri della piattaforma: nessuna finestra, nessun limite di discipline
            var prova = await api.For(Seed.ProvaHost, Seed.ProvaTeacher).GetFromJsonAsync<JsonElement>("/v1/settings");
            Assert.Equal(0, prova.GetProperty("booking").GetProperty("cancelHoursBefore").GetInt32());
            Assert.Equal(JsonValueKind.Null, prova.GetProperty("booking").GetProperty("opensHoursBefore").ValueKind);
            Assert.Equal(JsonValueKind.Null, prova.GetProperty("classes").GetProperty("maxDisciplines").ValueKind);
        }
        finally { await Settings(new { booking = new { cancelHoursBefore = 6 } }); }

        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").PutAsJsonAsync("/v1/settings", new { booking = new { cancelHoursBefore = 0 } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { timezone = "Marte/Olympus" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { payments = new { methods = new[] { "bitcoin" } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { packages = new { consumeOn = "sempre" } })).StatusCode);
    }

    [Fact]
    public async Task L_inizio_della_lezione_e_valutato_nel_fuso_della_struttura_anche_al_cambio_d_ora()
    {
        // 28 marzo 2027: in Italia alle 02:00 scatta l'ora legale. Le 10:00 locali sono le 08:00 UTC, il giorno prima le 09:00 UTC.
        var sql = "select extract(hour from app.local_instant(@d::date, '10:00') at time zone 'UTC')::int";
        await api.Sql($"set app.tenant_id = '{OasiTenant}'");
        Assert.Equal(9, await ScalarInTenant(sql, "2027-03-27"));
        Assert.Equal(8, await ScalarInTenant(sql, "2027-03-28"));
    }

    private async Task<int> ScalarInTenant(string sql, string date)
    {
        await using var conn = new Npgsql.NpgsqlConnection(api.AdminConnectionString);
        await conn.OpenAsync();
        await using (var set = new Npgsql.NpgsqlCommand($"set app.tenant_id = '{OasiTenant}'", conn)) await set.ExecuteNonQueryAsync();
        await using var cmd = new Npgsql.NpgsqlCommand(sql.Replace("@d", "$1"), conn);
        cmd.Parameters.AddWithValue(date);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    // ── Recuperi ───────────────────────────────────────────────────────

    [Fact]
    public async Task Recupero_solo_con_diritto_residuo_entro_la_validita_e_mai_in_un_livello_superiore()
    {
        var ilaria = As("stu-ilaria");         // Tessuti Avanzato
        var tessutiInt = await Lessons(Seed.ClassCerchioInt);   // livello inferiore al suo

        // Nessuna assenza → nessun diritto
        Assert.Equal("no_makeup_credit", await ErrorType(await ilaria.PostAsJsonAsync("/v1/makeups", new { targetLessonId = tessutiInt[0] })));

        var missed = await Seed.DeclareAbsence(api, ilaria, Seed.ClassTessutiAdv);
        var credits = await ilaria.GetFromJsonAsync<JsonElement>("/v1/makeups/credits");
        Assert.Equal(1, credits.GetProperty("available").GetInt32());

        // Livello inferiore consentito (impostazione della struttura): il diritto viene impegnato
        var id = await CreatedId(await ilaria.PostAsJsonAsync("/v1/makeups", new { targetLessonId = tessutiInt[0], missedLessonId = missed }));
        credits = await ilaria.GetFromJsonAsync<JsonElement>("/v1/makeups/credits");
        Assert.Equal(0, credits.GetProperty("available").GetInt32());
        Assert.Equal(1, credits.GetProperty("reserved").GetInt32());
        // Diritto esaurito: una seconda richiesta viene rifiutata
        Assert.Equal("no_makeup_credit", await ErrorType(await ilaria.PostAsJsonAsync("/v1/makeups", new { targetLessonId = tessutiInt[1] })));

        // Ritirando la richiesta il diritto torna disponibile
        Assert.Equal(HttpStatusCode.NoContent, (await ilaria.PostAsync($"/v1/makeups/{id}/cancel", null)).StatusCode);
        Assert.Equal(1, (await ilaria.GetFromJsonAsync<JsonElement>("/v1/makeups/credits")).GetProperty("available").GetInt32());

        // Se la struttura non consente il livello inferiore, la stessa richiesta è rifiutata
        try
        {
            await Settings(new { makeups = new { allowLowerLevel = false } });
            Assert.Equal("lower_level_not_allowed", await ErrorType(await ilaria.PostAsJsonAsync("/v1/makeups", new { targetLessonId = tessutiInt[0] })));
        }
        finally { await Settings(new { makeups = new { allowLowerLevel = true } }); }

        // Mai in una classe di livello superiore
        var anna = As("stu-anna");             // Tessuti Base
        await Seed.DeclareAbsence(api, anna, Seed.ClassTessutiBase);
        var cerchioInt = await Lessons(Seed.ClassCerchioInt);
        Assert.Equal("higher_level", await ErrorType(await anna.PostAsJsonAsync("/v1/makeups", new { targetLessonId = cerchioInt[0] })));

        // Il recupero va fatto entro la validità che ha generato il diritto
        await api.Sql("update app.makeup_credits set expires_on = current_date + 1 where member_id = @m and status = 'available'", new { m = Member("stu-anna") });
        var cerchioBase = await Lessons(Seed.ClassCerchioBase, fromDays: 4);
        Assert.Equal("credit_expired_before_lesson", await ErrorType(await anna.PostAsJsonAsync("/v1/makeups", new { targetLessonId = cerchioBase[0] })));
        // Diritto scaduto: non è più utilizzabile
        await api.Sql("update app.makeup_credits set expires_on = current_date - 1 where member_id = @m and status = 'available'", new { m = Member("stu-anna") });
        Assert.Equal("no_makeup_credit", await ErrorType(await anna.PostAsJsonAsync("/v1/makeups", new { targetLessonId = cerchioBase[0] })));
        Assert.Equal(1, (await anna.GetFromJsonAsync<JsonElement>("/v1/makeups/credits")).GetProperty("expired").GetInt32());
    }

    [Fact]
    public async Task Assenza_annunciata_troppo_tardi_o_ritirata_non_da_diritto_al_recupero()
    {
        var francesca = As("stu-francesca");   // Tessuti Base
        try
        {
            // Soglia di disdetta portata a 30 giorni: qualsiasi annuncio per le prossime lezioni è "tardivo"
            await Settings(new { booking = new { cancelHoursBefore = 720 } });
            await Seed.DeclareAbsence(api, francesca, Seed.ClassTessutiBase);
            Assert.Equal(0, (await francesca.GetFromJsonAsync<JsonElement>("/v1/makeups/credits")).GetProperty("available").GetInt32());
        }
        finally { await Settings(new { booking = new { cancelHoursBefore = 6 } }); }

        // Annuncio per tempo → diritto; se l'allieva ritira l'assenza il diritto viene tolto
        var lesson = await Seed.DeclareAbsence(api, francesca, Seed.ClassTessutiBase);
        Assert.Equal(1, (await francesca.GetFromJsonAsync<JsonElement>("/v1/makeups/credits")).GetProperty("available").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await francesca.PutAsJsonAsync($"/v1/lessons/{lesson}/declaration", new { declared = (string?)null })).StatusCode);
        Assert.Equal(0, (await francesca.GetFromJsonAsync<JsonElement>("/v1/makeups/credits")).GetProperty("available").GetInt32());
    }

    [Fact]
    public async Task Due_richieste_simultanee_per_l_ultimo_posto_non_superano_la_capienza()
    {
        var elisa = As("stu-elisa");
        var lucia = As("stu-lucia");            // entrambe Cerchio Avanzato
        await Seed.DeclareAbsence(api, elisa, Seed.ClassCerchioAdv);
        await Seed.DeclareAbsence(api, lucia, Seed.ClassCerchioAdv);
        var target = (await Lessons(Seed.ClassTessutiAdv)).Last();
        try
        {
            // Tessuti Avanzato ha 2 iscritte: con capienza 3 resta un solo posto
            await api.Sql("update app.classes set capacity = 3 where id = @id", new { id = Seed.ClassTessutiAdv });
            var results = await Task.WhenAll(
                elisa.PostAsJsonAsync("/v1/makeups", new { targetLessonId = target }),
                lucia.PostAsJsonAsync("/v1/makeups", new { targetLessonId = target }));
            Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
            var refused = results.Single(r => r.StatusCode != HttpStatusCode.Created);
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal("lesson_full", await ErrorType(refused));
            // Anche una lezione singola viene rifiutata: la lezione è piena
            Assert.Equal("lesson_full", await ErrorType(await Admin.PostAsJsonAsync("/v1/bookings", new { lessonId = target, memberId = Member("stu-sofia"), @override = true })));
            // Anche le nuove iscrizioni alla classe sono bloccate: capienza raggiunta
            await api.Sql("update app.classes set capacity = 2 where id = @id", new { id = Seed.ClassTessutiAdv });
            Assert.Equal("class_full", await ErrorType(await As("stu-sofia").PostAsJsonAsync("/v1/enrollments", new { classId = Seed.ClassTessutiAdv })));
        }
        finally { await api.Sql("update app.classes set capacity = 6 where id = @id", new { id = Seed.ClassTessutiAdv }); }
    }

    // ── Lezioni singole e pacchetti ────────────────────────────────────

    [Fact]
    public async Task Lezione_singola_prenotabile_da_48_ore_prima_e_disdetta_libera_fino_a_6_ore_prima()
    {
        var beatrice = As("stu-beatrice");     // Cerchio Base
        // Oasi: la prenotazione si apre 48 ore prima. Una lezione tra 4 o più giorni non è ancora prenotabile.
        var far = (await Lessons(Seed.ClassTessutiBase, fromDays: 4))[0];
        var notOpen = await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far });
        var problem = await Json(notOpen);
        Assert.Equal("booking_not_open", problem.GetProperty("type").GetString());
        Assert.Contains("48 ore prima", problem.GetProperty("title").GetString());
        // L'elenco delle lezioni prenotabili lo indica
        var open = await beatrice.GetFromJsonAsync<JsonElement[]>("/v1/bookings/lessons");
        var farRow = open!.Single(l => l.GetProperty("id").GetGuid() == far);
        Assert.False(farRow.GetProperty("bookableNow").GetBoolean());
        var hours = farRow.GetProperty("hoursToStart").GetDouble();

        try
        {
            // Esattamente al confine: con l'apertura appena sotto le ore che mancano non si prenota, appena sopra sì
            await Settings(new { booking = new { opensHoursBefore = (int)Math.Floor(hours) - 1 } });
            Assert.Equal("booking_not_open", await ErrorType(await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far })));
            // Eccezione registrata dall'amministrazione (un'allieva non può forzarla)
            Assert.Equal("booking_not_open", await ErrorType(await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far, @override = true })));
            var exception = await CreatedId(await Admin.PostAsJsonAsync("/v1/bookings", new { lessonId = far, memberId = Member("stu-beatrice"), @override = true }));
            Assert.Equal(HttpStatusCode.OK, (await Admin.DeleteAsync($"/v1/bookings/{exception}?override=true")).StatusCode);

            await Settings(new { booking = new { opensHoursBefore = (int)Math.Ceiling(hours) + 1 } });
            var id = await CreatedId(await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far }));
            Assert.Equal("already_in_lesson", await ErrorType(await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far })));
            // Compare nell'elenco della lezione e genera la quota della lezione singola (€15, valore configurato)
            var roster = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/lessons/{far}/roster");
            Assert.Contains(roster!, r => r.GetProperty("memberId").GetGuid() == Member("stu-beatrice") && r.GetProperty("isBooking").GetBoolean());
            var account = await beatrice.GetFromJsonAsync<JsonElement>($"/v1/members/{Member("stu-beatrice")}/account");
            Assert.Contains(account.GetProperty("charges").EnumerateArray(), c => c.GetProperty("amountCents").GetInt32() == 1500 && c.GetProperty("state").GetString() == "open");

            // Disdetta prima della soglia di 6 ore (qui la lezione è a giorni di distanza): nessuna conseguenza
            var cancelled = await Json(await beatrice.DeleteAsync($"/v1/bookings/{id}"));
            Assert.Equal("cancelled", cancelled.GetProperty("status").GetString());
            Assert.True(cancelled.GetProperty("entryRefunded").GetBoolean());

            // Disdetta dopo la soglia (soglia portata oltre le ore che mancano): resta dovuta e l'esito lo dice
            var late = await CreatedId(await beatrice.PostAsJsonAsync("/v1/bookings", new { lessonId = far }));
            await Settings(new { booking = new { cancelHoursBefore = (int)Math.Ceiling(hours) + 1 } });
            var res = await Json(await beatrice.DeleteAsync($"/v1/bookings/{late}"));
            Assert.Equal("late_cancelled", res.GetProperty("status").GetString());
            Assert.False(res.GetProperty("entryRefunded").GetBoolean());
            Assert.Equal("open", await api.Scalar<string>("select ch.status from app.member_charges ch join app.lesson_bookings b on b.charge_id = ch.id where b.id = @late", new { late }));

            // Termine di chiusura delle prenotazioni (es. Circo Baby: almeno 24 ore prima)
            await Settings(new { booking = new { opensHoursBefore = (int)Math.Ceiling(hours) + 10, closesHoursBefore = (int)Math.Ceiling(hours) + 1, cancelHoursBefore = 6 } });
            // Una finestra incoerente (apertura più vicina della chiusura) non si può salvare
            Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync("/v1/settings", new { booking = new { opensHoursBefore = 2, closesHoursBefore = 24 } })).StatusCode);
            Assert.Equal("too_late_to_book", await ErrorType(await As("stu-sara").PostAsJsonAsync("/v1/bookings", new { lessonId = far })));
        }
        finally { await Settings(new { booking = new { opensHoursBefore = 48, closesHoursBefore = 0, cancelHoursBefore = 6 } }); }
    }

    [Fact]
    public async Task Pacchetto_scala_gli_ingressi_rispetta_scadenza_durata_ed_eta()
    {
        var noemi = As("stu-noemi");            // Cerchio Base e Tessuti Base
        var noemiId = Member("stu-noemi");
        // Pacchetto di prova da 2 ingressi (un pacchetto è una configurazione, non una funzione dedicata)
        var planId = await CreatedId(await Admin.PostAsJsonAsync("/v1/plans", new
        {
            name = "Test · Pacchetto 2 ingressi", kind = "package", amountCents = 3000, entries = 2, validFrom = InDays(-1), validUntil = InDays(60), bookingRequired = true,
        }));
        var pack = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = noemiId, planId }));
        var packId = pack.GetProperty("id").GetGuid();
        var lessons = await Lessons(Seed.ClassCerchioInt, fromDays: 4);

        var first = await CreatedId(await noemi.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[0], memberPlanId = packId }));
        await CreatedId(await noemi.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[1], memberPlanId = packId }));
        var plans = await noemi.GetFromJsonAsync<JsonElement[]>("/v1/member-plans");
        Assert.Equal(0, plans!.Single(p => p.GetProperty("id").GetGuid() == packId).GetProperty("entriesLeft").GetInt32());
        // Ingressi esauriti
        Assert.Equal("package_exhausted", await ErrorType(await noemi.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[2], memberPlanId = packId })));
        // Disdetta per tempo: l'ingresso torna nel saldo
        Assert.Equal(HttpStatusCode.OK, (await noemi.DeleteAsync($"/v1/bookings/{first}")).StatusCode);
        plans = await noemi.GetFromJsonAsync<JsonElement[]>("/v1/member-plans");
        Assert.Equal(1, plans!.Single(p => p.GetProperty("id").GetGuid() == packId).GetProperty("entriesLeft").GetInt32());
        // Il pacchetto di un'altra persona non si può usare
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-greta").PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[2], memberPlanId = packId })).StatusCode);
        // Pacchetto scaduto
        await api.Sql("update app.member_plans set valid_until = current_date + 1 where id = @packId", new { packId });
        Assert.Equal("package_expired", await ErrorType(await noemi.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[2], memberPlanId = packId })));

        // Il "Pacchetto 5 lezioni" di Oasi copre lezioni da 60 o 75 minuti: una lezione da 90 non è coperta
        var five = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = noemiId, planId = await PlanId("Pacchetto 5 lezioni") }));
        Assert.Equal("lesson_not_covered", await ErrorType(await noemi.PostAsJsonAsync("/v1/bookings", new { lessonId = lessons[2], memberPlanId = five.GetProperty("id").GetGuid() })));
        // "Circo Baby" è per 12–36 mesi: un'adulta non può acquistarlo
        var circo = await PlanId("Circo Baby · 8 ingressi (1° periodo)");
        Assert.Equal("age_out_of_range", await ErrorType(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = noemiId, planId = circo })));
    }

    // ── Piani, rate e pagamenti registrati ─────────────────────────────

    [Fact]
    public async Task Piano_a_rate_genera_le_quote_e_i_pagamenti_si_registrano_anche_parziali()
    {
        var camillaId = Member("stu-camilla");  // Tessuti Intermedio e Cerchio Intermedio
        var camilla = As("stu-camilla");
        var planId = await PlanId("Baby/Teen · 1 frequenza");

        // Una frequenza: non si possono collegare due classi
        Assert.Equal("too_many_classes", await ErrorType(await Admin.PostAsJsonAsync("/v1/member-plans",
            new { memberId = camillaId, planId, classIds = new[] { Seed.ClassCerchioInt, Seed.ClassTessutiInt } })));
        // Un'allieva non assegna piani
        Assert.Equal(HttpStatusCode.Forbidden, (await camilla.PostAsJsonAsync("/v1/member-plans", new { memberId = camillaId, planId })).StatusCode);

        // Coerenza piano ↔ classe: Baby/Teen è per le classi Bambini/Ragazzi, Cerchio Intermedio è Adulti/Ragazzi
        Assert.Equal("plan_class_mismatch", await ErrorType(await Admin.PostAsJsonAsync("/v1/member-plans",
            new { memberId = camillaId, planId, classIds = new[] { Seed.ClassCerchioInt } })));
        // ...e Agonismo Teen solo per classi agonistiche
        Assert.Equal("plan_class_mismatch", await ErrorType(await Admin.PostAsJsonAsync("/v1/member-plans",
            new { memberId = camillaId, planId = await PlanId("Agonismo Teen"), classIds = new[] { Seed.ClassCerchioInt } })));

        // Genitori & Figli: due rate da €300 oppure €550 annuali (piano senza vincolo di categoria)
        var mp = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = camillaId, planId = await PlanId("Genitori & Figli (a coppia)"), paymentMode = "installments", classIds = new[] { Seed.ClassCerchioInt } }));
        Assert.Equal("2027-05-30", mp.GetProperty("validUntil").GetString());

        // Le due rate sono quote dello stesso piano: €300 + €300
        var account = await camilla.GetFromJsonAsync<JsonElement>($"/v1/members/{camillaId}/account");
        var charges = account.GetProperty("charges").EnumerateArray().Where(c => c.GetProperty("memberPlanId").ValueKind != JsonValueKind.Null).ToList();
        Assert.Equal(2, charges.Count);
        Assert.All(charges, c => Assert.Equal(30000, c.GetProperty("amountCents").GetInt32()));
        var first = charges.Single(c => c.GetProperty("installmentNo").GetInt32() == 1);
        Assert.Equal("overdue", first.GetProperty("state").GetString());   // scadenza 15/09/2026, non pagata
        var chargeId = first.GetProperty("id").GetGuid();

        // Pagamento parziale, poi saldo; mai oltre il dovuto; solo l'amministrazione registra
        Assert.Equal(HttpStatusCode.Forbidden, (await camilla.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 30000, paidOn = InDays(0), method = "cash" })).StatusCode);
        // Oasi accetta bonifico e contanti: altri metodi solo se abilitati nelle impostazioni
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 1000, paidOn = InDays(0), method = "pos" })).StatusCode);
        var partial = await Json(await Admin.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 10000, paidOn = InDays(0), method = "bank_transfer", note = "Bonifico" }));
        Assert.Equal(20000, partial.GetProperty("residualCents").GetInt32());
        Assert.Equal("overpayment", await ErrorType(await Admin.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 20001, paidOn = InDays(0), method = "cash" })));
        var full = await Json(await Admin.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 20000, paidOn = InDays(0), method = "cash" }));
        Assert.Equal("paid", full.GetProperty("chargeState").GetString());

        account = await camilla.GetFromJsonAsync<JsonElement>($"/v1/members/{camillaId}/account");
        Assert.Equal(30000, account.GetProperty("paidCents").GetInt32());
        // Un'altra allieva non vede il riepilogo di Camilla; il riepilogo generale è dell'amministrazione
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").GetAsync($"/v1/members/{camillaId}/account")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await camilla.GetAsync("/v1/reports/overview")).StatusCode);
        var overview = await Admin.GetFromJsonAsync<JsonElement>("/v1/reports/overview");
        Assert.True(overview.GetProperty("totals").GetProperty("paidCents").GetInt32() >= 30000);

        // Il diritto di recupero nato da una lezione della classe collegata scade con il piano
        await Seed.DeclareAbsence(api, camilla, Seed.ClassCerchioInt);
        Assert.Equal(new DateOnly(2027, 5, 30), await api.Scalar<DateOnly>(
            "select expires_on from app.makeup_credits where member_id = @camillaId and member_plan_id = @mp", new { camillaId, mp = mp.GetProperty("id").GetGuid() }));

        // Studio Prova non raggiunge piani e quote di Oasi
        var prova = api.For(Seed.ProvaHost, Seed.ProvaTeacher);
        Assert.NotEqual(HttpStatusCode.OK, (await prova.GetAsync("/v1/plans")).StatusCode);
        Assert.NotEqual(HttpStatusCode.Created, (await prova.PostAsJsonAsync($"/v1/charges/{chargeId}/payments", new { amountCents = 100, paidOn = InDays(0), method = "cash" })).StatusCode);
    }

    [Fact]
    public async Task Validita_di_annuale_periodico_e_mensile_segue_la_configurazione()
    {
        var ilaria = Member("stu-ilaria");
        // Annuale in unica soluzione: una sola quota, validità fino a fine stagione
        var annual = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = ilaria, planId = await PlanId("Adulti/Teen · 1x · annuale") }));
        Assert.Equal("2027-05-30", annual.GetProperty("validUntil").GetString());
        Assert.Equal(1L, await api.Scalar<long>("select count(*) from app.member_charges where member_plan_id = @id and amount_cents = 34000", new { id = annual.GetProperty("id").GetGuid() }));
        // Questo piano non prevede rate
        Assert.Equal("no_installments", await ErrorType(await Admin.PostAsJsonAsync("/v1/member-plans",
            new { memberId = ilaria, planId = await PlanId("Adulti/Teen · 1x · annuale"), paymentMode = "installments" })));

        // Periodico: serve il periodo; la validità è quella del periodo scelto
        var periodic = await PlanId("Adulti/Teen · 2x · periodico");
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = ilaria, planId = periodic })).StatusCode);
        var seasons = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/seasons");
        var p2 = seasons!.Single(s => s.GetProperty("status").GetString() == "active").GetProperty("periods").EnumerateArray().Single(p => p.GetProperty("position").GetInt32() == 2);
        var mp = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = ilaria, planId = periodic, periodId = p2.GetProperty("id").GetGuid() }));
        Assert.Equal("2026-11-09", mp.GetProperty("validFrom").GetString());
        Assert.Equal("2027-01-24", mp.GetProperty("validUntil").GetString());

        // Mensile: 4 settimane consecutive dalla data di inizio
        var monthly = await Json(await Admin.PostAsJsonAsync("/v1/member-plans", new { memberId = ilaria, planId = await PlanId("Adulti/Teen · 1x · mensile"), validFrom = "2026-11-16" }));
        Assert.Equal("2026-12-13", monthly.GetProperty("validUntil").GetString());

        // Piano scaduto: lo stato viene aggiornato
        await api.Sql("update app.member_plans set valid_until = current_date - 1, valid_from = current_date - 30 where id = @id", new { id = monthly.GetProperty("id").GetGuid() });
        var list = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/member-plans?memberId={ilaria}");
        Assert.Equal("expired", list!.Single(p => p.GetProperty("id").GetGuid() == monthly.GetProperty("id").GetGuid()).GetProperty("status").GetString());
    }

    // ── Stagioni, periodi, chiusure ────────────────────────────────────

    [Fact]
    public async Task Stagione_segnala_le_incongruenze_e_la_nuova_stagione_conserva_lo_storico()
    {
        var seasons = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/seasons");
        var current = seasons!.Single(s => s.GetProperty("status").GetString() == "active");
        Assert.Equal("2026/2027", current.GetProperty("name").GetString());
        Assert.Equal(4, current.GetProperty("periods").GetArrayLength());
        var currentId = current.GetProperty("id").GetGuid();

        // Incongruenza reale dei dati forniti: la lezione singola vale dal 14/09, la stagione parte il 15/09. Segnalata, non corretta.
        var check = await Admin.GetFromJsonAsync<JsonElement>($"/v1/seasons/{currentId}/check");
        Assert.Contains(check.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("Lezione singola"));
        Assert.Equal(new DateOnly(2026, 9, 14), await api.Scalar<DateOnly>("select valid_from from app.fee_plans where name = 'Lezione singola' and season_id = @currentId", new { currentId }));

        // Le chiusure della stagione non lasciano lezioni regolari
        Assert.Equal(0L, await api.Scalar<long>(@"select count(*) from app.lessons l join app.closures x on x.tenant_id = l.tenant_id and l.date between x.start_date and x.end_date
            where l.tenant_id = @t and l.status <> 'cancelled'", new { t = OasiTenant }));

        // Nuova stagione: i piani vengono copiati disattivati e senza date; periodi sovrapposti segnalati
        var res = await Admin.PostAsJsonAsync("/v1/seasons", new
        {
            name = "Test 2027/2028", startDate = "2027-09-13", endDate = "2028-05-28", copyPlansFromSeasonId = currentId,
            periods = new[] { new { name = "P1", startDate = "2027-09-13", endDate = "2027-11-10" }, new { name = "P2", startDate = "2027-11-08", endDate = "2028-05-28" } },
        });
        var next = await Json(res);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Contains(next.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("si sovrappongono"));
        var nextId = next.GetProperty("id").GetGuid();
        var copied = await Admin.GetFromJsonAsync<JsonElement[]>($"/v1/plans?seasonId={nextId}&includeInactive=true");
        Assert.True(copied!.Length >= 25);
        Assert.All(copied, p => Assert.False(p.GetProperty("isActive").GetBoolean()));
        // Un periodo fuori dalla stagione è rifiutato; le allieve non configurano stagioni
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync($"/v1/seasons/{nextId}", new
        {
            name = "Test 2027/2028", startDate = "2027-09-13", endDate = "2028-05-28", periods = new[] { new { name = "P1", startDate = "2027-09-01", endDate = "2027-11-10" } },
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").PostAsJsonAsync($"/v1/seasons/{nextId}/activate", new { })).StatusCode);

        try
        {
            // Attivando la nuova, la precedente passa allo storico con i suoi piani
            Assert.Equal(HttpStatusCode.NoContent, (await Admin.PostAsync($"/v1/seasons/{nextId}/activate", null)).StatusCode);
            seasons = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/seasons");
            Assert.Equal("archived", seasons!.Single(s => s.GetProperty("id").GetGuid() == currentId).GetProperty("status").GetString());
            Assert.Equal(25L, await api.Scalar<long>("select count(*) from app.fee_plans where season_id = @currentId", new { currentId }));
            // Lo storico non si modifica
            Assert.Equal(HttpStatusCode.Conflict, (await Admin.PutAsJsonAsync($"/v1/seasons/{currentId}", new { name = "x", startDate = "2026-09-15", endDate = "2027-05-30" })).StatusCode);
        }
        finally
        {
            // Ripristino per gli altri test: la stagione 2026/27 torna attiva
            await api.Sql("update app.seasons set status = 'draft' where id = @nextId", new { nextId });
            await api.Sql("update app.seasons set status = 'active' where id = @currentId", new { currentId });
        }
    }

    [Fact]
    public async Task Promemoria_nuova_stagione_inviato_una_sola_volta()
    {
        var seasonId = await api.Scalar<Guid>("select id from app.seasons where tenant_id = @t and status = 'active'", new { t = OasiTenant });
        try
        {
            await api.Sql("update app.seasons set end_date = current_date + 30 where id = @seasonId", new { seasonId });
            await api.Sql("update app.seasons set start_date = start_date - 1000, end_date = end_date - 1000 where tenant_id = @t and status = 'draft'", new { t = OasiTenant });
            await RunJobs();
            await RunJobs();
            var notes = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/notifications");
            Assert.Single(notes!, n => n.GetProperty("title").GetString() == "Configura la nuova stagione");
            Assert.True((await Admin.GetFromJsonAsync<JsonElement>("/v1/reports/overview")).GetProperty("seasonSetupNeeded").GetBoolean());
        }
        finally { await api.Sql("update app.seasons set end_date = '2027-05-30' where id = @seasonId", new { seasonId }); }
    }

    // ── Agonismo, minori, permessi ─────────────────────────────────────

    [Fact]
    public async Task Certificato_agonistico_obbligatorio_solo_per_agonisti_e_verificato_dal_server()
    {
        var greta = As("stu-greta");            // Cerchio Base e Tessuti Base
        var gretaId = Member("stu-greta");
        var certType = await api.Scalar<Guid>("select id from app.document_types where tenant_id = @t and name = 'Certificato medico agonistico'", new { t = OasiTenant });

        // Non agonista: il certificato agonistico non è tra i documenti mancanti
        var docs = await greta.GetFromJsonAsync<JsonElement>($"/v1/members/{gretaId}/documents");
        Assert.DoesNotContain(docs.GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == certType);

        // La classe diventa agonistica (anche con più discipline, scelte dall'archivio esistente)
        var cls = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/classes"))!.Single(c => c.GetProperty("id").GetGuid() == Seed.ClassCerchioAdv);
        var disciplines = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/disciplines"))!.Select(d => d.GetProperty("id").GetGuid()).ToArray();
        object ClassBody(string level) => new
        {
            name = cls.GetProperty("name").GetString(), disciplineId = cls.GetProperty("disciplineId").GetGuid(), levelId = cls.GetProperty("levelId").GetGuid(),
            roomId = cls.GetProperty("roomId").GetGuid(), capacity = cls.GetProperty("capacity").GetInt32(), weekday = cls.GetProperty("weekday").GetInt32(),
            startTime = cls.GetProperty("startTime").GetString(), endTime = cls.GetProperty("endTime").GetString(), description = cls.GetProperty("description").GetString(),
            disciplineIds = disciplines, competitiveLevel = level,
        };
        try
        {
            Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/classes/{Seed.ClassCerchioAdv}", ClassBody("competitive"))).StatusCode);
            var updated = (await Admin.GetFromJsonAsync<JsonElement[]>("/v1/classes"))!.Single(c => c.GetProperty("id").GetGuid() == Seed.ClassCerchioAdv);
            Assert.Equal(disciplines.Length, updated.GetProperty("disciplineIds").GetArrayLength());
            Assert.True(disciplines.Length >= 2);
            Assert.Equal("competitive", updated.GetProperty("competitiveLevel").GetString());

            // Iscrizione a una classe agonistica senza certificato valido: bloccata dal server
            var enrollment = await CreatedId(await greta.PostAsJsonAsync("/v1/enrollments", new { classId = Seed.ClassCerchioAdv }));
            Assert.Equal("certificate_required", await ErrorType(await Admin.PostAsJsonAsync($"/v1/enrollments/{enrollment}/decision", new { approve = true })));

            // Il certificato va caricato con la scadenza; finché non è approvato non basta
            Assert.Equal(HttpStatusCode.BadRequest, (await greta.PostAsync("/v1/documents", Upload(certType, "agonistico.pdf", "certificato", expiresOn: ""))).StatusCode);
            var docId = await CreatedId(await greta.PostAsync("/v1/documents", Upload(certType, "agonistico.pdf", "certificato", expiresOn: InDays(300))));
            Assert.Equal("certificate_required", await ErrorType(await Admin.PostAsJsonAsync($"/v1/enrollments/{enrollment}/decision", new { approve = true })));
            Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/documents/{docId}/review", new { action = "approve" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/enrollments/{enrollment}/decision", new { approve = true })).StatusCode);

            // Badge AGONISTA per amministrazione e insegnanti; certificato scaduto → di nuovo mancante
            var member = await Admin.GetFromJsonAsync<JsonElement>($"/v1/members/{gretaId}");
            Assert.True(member.GetProperty("member").GetProperty("competitiveBadge").GetBoolean());
            Assert.False(member.GetProperty("member").GetProperty("certificateMissing").GetBoolean());
            await api.Sql("update app.documents set expires_on = current_date - 1 where id = @docId", new { docId });
            member = await Admin.GetFromJsonAsync<JsonElement>($"/v1/members/{gretaId}");
            Assert.True(member.GetProperty("member").GetProperty("certificateMissing").GetBoolean());
            docs = await greta.GetFromJsonAsync<JsonElement>($"/v1/members/{gretaId}/documents");
            Assert.Contains(docs.GetProperty("missing").EnumerateArray(), t => t.GetProperty("id").GetGuid() == certType);
            Assert.Equal("expired", docs.GetProperty("documents").EnumerateArray().Single(d => d.GetProperty("id").GetGuid() == docId).GetProperty("state").GetString());
        }
        finally
        {
            await Admin.PutAsJsonAsync($"/v1/classes/{Seed.ClassCerchioAdv}", ClassBody("none"));
            await api.Sql("update app.enrollments set status = 'withdrawn' where member_id = @gretaId and class_id = @c", new { gretaId, c = Seed.ClassCerchioAdv });
        }

        // Agonista per classificazione della persona: l'amministrazione vede subito cosa manca
        var sofia = Member("stu-sofia");
        var set = await Json(await Admin.PutAsJsonAsync($"/v1/members/{sofia}/competitive", new { isCompetitive = true }));
        Assert.Contains(set.GetProperty("missingCertificates").EnumerateArray(), n => n.GetString() == "Certificato medico agonistico");
        // L'atleta stessa può dichiararsi agonista (o no), non può cambiarlo per un'altra persona
        Assert.Equal(HttpStatusCode.OK, (await As("stu-sofia").PutAsJsonAsync($"/v1/members/{sofia}/competitive", new { isCompetitive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").PutAsJsonAsync($"/v1/members/{sofia}/competitive", new { isCompetitive = true })).StatusCode);
        var self = await Json(await As("stu-sofia").PutAsJsonAsync($"/v1/members/{sofia}/competitive", new { isCompetitive = true }));
        Assert.Contains(self.GetProperty("missingCertificates").EnumerateArray(), n => n.GetString() == "Certificato medico agonistico");
        // Da agonista vede il certificato agonistico tra i documenti da caricare
        var sofiaDocs = await As("stu-sofia").GetFromJsonAsync<JsonElement>($"/v1/members/{sofia}/documents");
        Assert.Contains(sofiaDocs.GetProperty("missing").EnumerateArray(), t => t.GetProperty("name").GetString() == "Certificato medico agonistico");
        await Admin.PutAsJsonAsync($"/v1/members/{sofia}/competitive", new { isCompetitive = false });
    }

    [Fact]
    public async Task Genitore_vede_solo_i_figli_collegati_e_ogni_ruolo_solo_cio_che_gli_spetta()
    {
        // Studio Prova: Laura è genitore di una minore senza account
        var laura = api.For(Seed.ProvaHost, Seed.Laura);
        var children = await laura.GetFromJsonAsync<JsonElement[]>("/v1/members/children");
        var child = Assert.Single(children!);
        Assert.Equal(Seed.ChildMember, child.GetProperty("member").GetProperty("id").GetGuid());
        Assert.False(child.GetProperty("member").GetProperty("hasAccount").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await laura.GetAsync($"/v1/members/{Seed.ChildMember}")).StatusCode);
        // Non accede ai dati di altre persone della struttura, né a persone di un'altra struttura
        var teacherMember = ApiFixture.Id("prova:member:teacher");
        var other = await api.Scalar<Guid>("select member_id from app.memberships where user_id = @u", new { u = Seed.ProvaTeacher });
        Assert.Equal(HttpStatusCode.Forbidden, (await laura.GetAsync($"/v1/members/{other}")).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await laura.GetAsync($"/v1/members/{Seed.GiuliaMember}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await laura.GetAsync("/v1/members")).StatusCode);
        _ = teacherMember;

        // Oasi: un'insegnante vede solo gli allievi delle proprie classi e senza contatti; l'amministrazione tutti
        var chiara = await api.For(Seed.OasiHost, Seed.Chiara).GetFromJsonAsync<JsonElement[]>("/v1/members");
        Assert.DoesNotContain(chiara!, m => m.GetProperty("id").GetGuid() == Member("stu-anna"));   // Tessuti Base: non è allieva di Chiara
        Assert.Contains(chiara!, m => m.GetProperty("id").GetGuid() == Member("stu-sofia"));
        Assert.All(chiara!, m => Assert.Equal(JsonValueKind.Null, m.GetProperty("email").ValueKind));
        var all = await Admin.GetFromJsonAsync<JsonElement[]>("/v1/members");
        Assert.Contains(all!, m => m.GetProperty("id").GetGuid() == Member("stu-anna") && m.GetProperty("email").ValueKind == JsonValueKind.String);
        Assert.DoesNotContain(all!, m => m.GetProperty("id").GetGuid() == Seed.ChildMember);          // nessuna persona di Studio Prova
        // Dati amministrativi di un'allieva: non visibili all'insegnante
        var asTeacher = await api.For(Seed.OasiHost, Seed.Chiara).GetFromJsonAsync<JsonElement>($"/v1/members/{Member("stu-sofia")}");
        Assert.Equal(JsonValueKind.Null, asTeacher.GetProperty("administrative").ValueKind);
    }

    // ── Documenti ──────────────────────────────────────────────────────

    [Fact]
    public async Task Documento_sostituito_resta_nello_storico_salvo_periodo_di_conservazione_configurato()
    {
        var anna = As("stu-anna");
        var typeId = await CreatedId(await Admin.PostAsJsonAsync("/v1/document-types", new { name = "Test · Sostituzione", category = "other", isRequired = false }));
        var v1 = await CreatedId(await anna.PostAsync("/v1/documents", Upload(typeId, "v1.pdf", "prima versione")));
        var v2 = await CreatedId(await anna.PostAsync("/v1/documents", Upload(typeId, "v2.pdf", "seconda versione")));

        // Valore predefinito: la versione sostituita resta nello storico con il suo file, senza eliminazione automatica
        Assert.True(await api.Scalar<bool>("select not is_current and purge_after is null from app.documents where id = @v1", new { v1 }));
        await RunJobs();
        Assert.Equal(HttpStatusCode.OK, (await anna.GetAsync($"/v1/documents/{v1}/file")).StatusCode);

        // La struttura può impostare un periodo di conservazione: qui 7 giorni
        try
        {
        await Settings(new { documents = new { replacedRetentionDays = 7 } });
        var v3 = await CreatedId(await anna.PostAsync("/v1/documents", Upload(typeId, "v3.pdf", "terza versione")));
        // La versione sostituita ha una data di eliminazione a 7 giorni
        Assert.True(await api.Scalar<bool>("select not is_current and purge_after > now() + interval '6 days 23 hours' and purge_after <= now() + interval '7 days' from app.documents where id = @v2", new { v2 }));
        Assert.Equal(HttpStatusCode.OK, (await anna.GetAsync($"/v1/documents/{v2}/file")).StatusCode);
        var path = await api.Scalar<string>("select file_path from app.documents where id = @v2", new { v2 });
        var storage = api.Services.GetRequiredService<IFileStorage>();
        Assert.NotNull(await storage.GetAsync(path!));

        // Prima della scadenza il lavoro pianificato non tocca nulla
        await RunJobs();
        Assert.Equal(HttpStatusCode.OK, (await anna.GetAsync($"/v1/documents/{v2}/file")).StatusCode);

        // Trascorsi i 7 giorni: file eliminato dallo storage, resta solo l'evento di audit
        await api.Sql("update app.documents set purge_after = now() - interval '1 minute' where id = @v2", new { v2 });
        await RunJobs();
        Assert.Null(await storage.GetAsync(path!));
        Assert.Equal(HttpStatusCode.Gone, (await anna.GetAsync($"/v1/documents/{v2}/file")).StatusCode);
        Assert.True(await api.Scalar<bool>("select file_path is null and file_sha256 is null and file_deleted_at is not null from app.documents where id = @v2", new { v2 }));
        Assert.Equal(1L, await api.Scalar<long>("select count(*) from app.document_events where document_id = @v2 and action = 'file_deleted'", new { v2 }));
        Assert.Equal(1L, await api.Scalar<long>("select count(*) from app.document_events where document_id = @v2 and action = 'replaced'", new { v2 }));
        // La versione attuale resta disponibile; un secondo giro non fa nulla
        await RunJobs();
        Assert.Equal(HttpStatusCode.OK, (await anna.GetAsync($"/v1/documents/{v3}/file")).StatusCode);

        // Download di gruppo: solo amministrazione, registrato nello storico
        Assert.Equal(HttpStatusCode.Forbidden, (await anna.GetAsync($"/v1/documents/export?memberId={Member("stu-anna")}")).StatusCode);
        var zip = await Admin.GetAsync($"/v1/documents/export?memberId={Member("stu-anna")}&typeId={typeId}");
        Assert.Equal(HttpStatusCode.OK, zip.StatusCode);
        Assert.Equal("application/zip", zip.Content.Headers.ContentType!.MediaType);
        using var archive = new System.IO.Compression.ZipArchive(await zip.Content.ReadAsStreamAsync());
        Assert.Single(archive.Entries);
        Assert.Equal(1L, await api.Scalar<long>("select count(*) from app.document_events where document_id = @v3 and note = 'Download di gruppo'", new { v3 }));
        }
        finally { await Settings(new { documents = new { replacedRetentionDays = (int?)null } }); }
    }

    [Fact]
    public async Task Documenti_degli_insegnanti_richieste_flessibili_scadenza_correggibile_e_notifiche_non_duplicate()
    {
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        var chiaraId = Member("tch-chiara");
        // Tipologia per insegnanti creata dall'amministrazione, con scadenza da indicare
        var typeId = await CreatedId(await Admin.PostAsJsonAsync("/v1/document-types", new { name = "Test · Attestato insegnante", category = "other", isRequired = false, audience = "teachers", expiryRequired = true }));
        Assert.Contains((await chiara.GetFromJsonAsync<JsonElement[]>("/v1/document-types"))!, t => t.GetProperty("id").GetGuid() == typeId);
        Assert.DoesNotContain((await As("stu-anna").GetFromJsonAsync<JsonElement[]>("/v1/document-types"))!, t => t.GetProperty("id").GetGuid() == typeId);
        Assert.Equal(HttpStatusCode.BadRequest, (await As("stu-anna").PostAsync("/v1/documents", Upload(typeId, "x.pdf", "x", expiresOn: InDays(90)))).StatusCode);

        // Richiesta dell'amministrazione: una sola richiesta aperta e una sola notifica, anche se ripetuta
        var request = await CreatedId(await Admin.PostAsJsonAsync("/v1/document-requests", new { memberId = chiaraId, typeId, dueOn = InDays(5), note = "Serve per l'assicurazione" }));
        Assert.Equal(request, await CreatedId(await Admin.PostAsJsonAsync("/v1/document-requests", new { memberId = chiaraId, typeId, dueOn = InDays(6) })));
        var notes = await chiara.GetFromJsonAsync<JsonElement[]>("/v1/notifications");
        var note = Assert.Single(notes!, n => n.GetProperty("title").GetString() == "Documento richiesto: Test · Attestato insegnante");
        Assert.Equal("/documenti", note.GetProperty("link").GetString());   // la notifica porta alla schermata interessata
        var area = await chiara.GetFromJsonAsync<JsonElement>($"/v1/members/{chiaraId}/documents");
        Assert.Single(area.GetProperty("requests").EnumerateArray(), r => r.GetProperty("typeId").GetGuid() == typeId);
        // Un'allieva non vede le richieste degli insegnanti
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").GetAsync($"/v1/document-requests?memberId={chiaraId}")).StatusCode);

        // L'insegnante carica il documento con la scadenza: la richiesta risulta evasa
        var docId = await CreatedId(await chiara.PostAsync("/v1/documents", Upload(typeId, "attestato.pdf", "attestato", expiresOn: InDays(200))));
        Assert.Equal("fulfilled", await api.Scalar<string>("select status from app.document_requests where id = @request", new { request }));

        // Approvato; se l'insegnante corregge la scadenza torna in attesa; se la corregge l'amministrazione resta approvato
        Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/documents/{docId}/review", new { action = "approve" })).StatusCode);
        var corrected = await Json(await chiara.PutAsJsonAsync($"/v1/documents/{docId}/expiry", new { expiresOn = InDays(100) }));
        Assert.Equal("pending_review", corrected.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/v1/documents/{docId}/review", new { action = "approve" })).StatusCode);
        var byAdmin = await Json(await Admin.PutAsJsonAsync($"/v1/documents/{docId}/expiry", new { expiresOn = InDays(10) }));
        Assert.Equal("approved", byAdmin.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync($"/v1/documents/{docId}/expiry", new { expiresOn = (string?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("stu-anna").PutAsJsonAsync($"/v1/documents/{docId}/expiry", new { expiresOn = InDays(1) })).StatusCode);

        // Promemoria di scadenza: una sola notifica anche se il lavoro pianificato gira più volte
        await RunJobs();
        await RunJobs();
        notes = await chiara.GetFromJsonAsync<JsonElement[]>("/v1/notifications");
        Assert.Single(notes!, n => n.GetProperty("title").GetString() == "Documento in scadenza: Test · Attestato insegnante");
        // Documento scaduto: stato "scaduto" e una sola notifica
        await api.Sql("update app.documents set expires_on = current_date - 1 where id = @docId", new { docId });
        await RunJobs();
        await RunJobs();
        notes = await chiara.GetFromJsonAsync<JsonElement[]>("/v1/notifications");
        Assert.Single(notes!, n => n.GetProperty("title").GetString() == "Documento scaduto: Test · Attestato insegnante");
        var doc = await chiara.GetFromJsonAsync<JsonElement>($"/v1/documents/{docId}");
        Assert.Equal("expired", doc.GetProperty("document").GetProperty("state").GetString());

        // Chi disattiva una categoria non riceve più quelle notifiche
        Assert.Equal(HttpStatusCode.NoContent, (await chiara.PutAsJsonAsync("/v1/notifications/preferences", new { mutedCategories = new[] { "documents" } })).StatusCode);
        var before = (await chiara.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!.Length;
        await Admin.PostAsJsonAsync("/v1/document-requests", new { memberId = chiaraId, typeId, note = "Nuova copia" });
        Assert.Equal(before, (await chiara.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!.Length);
        await chiara.PutAsJsonAsync("/v1/notifications/preferences", new { mutedCategories = Array.Empty<string>() });
    }

    // ── Eventi e brani ─────────────────────────────────────────────────

    [Fact]
    public async Task Evento_in_home_con_brani_delle_performance_e_notifiche_solo_agli_interessati()
    {
        var sara = As("stu-sara");              // Cerchio Intermedio
        var body = new
        {
            type = "recital", title = "Test · Saggio d'inverno", description = "Saggio", date = InDays(20), startTime = "17:00", endTime = "19:00", location = "Teatro",
            capacity = 100, isFeatured = true, classIds = new[] { Seed.ClassCerchioInt }, isPublished = true, notify = true, memberIds = Array.Empty<Guid>(),
        };
        // Solo l'amministrazione crea e modifica gli eventi
        Assert.Equal(HttpStatusCode.Forbidden, (await api.For(Seed.OasiHost, Seed.Chiara).PostAsJsonAsync("/v1/events", body)).StatusCode);
        var id = await CreatedId(await Admin.PostAsJsonAsync("/v1/events", body));

        // Home: l'evento principale con titolo, data, orario e luogo
        var next = await sara.GetFromJsonAsync<JsonElement>("/v1/events/next");
        Assert.Equal(id, next.GetProperty("id").GetGuid());
        Assert.Equal("Teatro", next.GetProperty("location").GetString());
        Assert.True(next.GetProperty("isPerformance").GetBoolean());

        // Notifica alle allieve della classe collegata, non alle altre
        const string title = "Nuovo evento: Test · Saggio d'inverno";
        Assert.Single((await sara.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == title);
        Assert.DoesNotContain((await As("stu-anna").GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == title);

        // Salvare senza cambiare data, ora o luogo non genera altre notifiche; cambiando la data sì, una sola
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/events/{id}", body)).StatusCode);
        Assert.DoesNotContain((await sara.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Evento aggiornato: Test · Saggio d'inverno");
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/events/{id}", body with { date = InDays(21) })).StatusCode);
        Assert.Single((await sara.GetFromJsonAsync<JsonElement[]>("/v1/notifications"))!, n => n.GetProperty("title").GetString() == "Evento aggiornato: Test · Saggio d'inverno");

        // Musica della performance: la gestisce l'amministrazione; gli insegnanti consultano, non modificano
        var chiara = api.For(Seed.OasiHost, Seed.Chiara);
        Assert.Equal(HttpStatusCode.Forbidden, (await chiara.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "Experience", classId = Seed.ClassCerchioInt })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sara.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "No" })).StatusCode);
        var track = await CreatedId(await Admin.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "Experience", artist = "Ludovico Einaudi", groupLabel = "Gruppo cerchio", classId = Seed.ClassCerchioInt, linkUrl = "https://example.com/brano" }));
        await CreatedId(await Admin.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "Nuvole bianche", classId = Seed.ClassCerchioInt }));
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "x", linkUrl = "http://non-sicuro.example" })).StatusCode);

        // File audio caricato dall'amministrazione, ascoltabile da chi partecipa (Sara: classe collegata) e dallo staff
        var audio = new MultipartFormDataContent();
        var bytes = new ByteArrayContent(Encoding.UTF8.GetBytes("ID3 finto mp3"));
        bytes.Headers.ContentType = new MediaTypeHeaderValue("audio/mpeg");
        audio.Add(bytes, "file", "experience.mp3");
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PostAsync($"/v1/events/{id}/tracks/{track}/audio", audio)).StatusCode);
        var tracks = await sara.GetFromJsonAsync<JsonElement[]>($"/v1/events/{id}/tracks");
        Assert.Equal(["Experience", "Nuvole bianche"], tracks!.Select(t => t.GetProperty("title").GetString()!).ToArray());
        Assert.True(tracks![0].GetProperty("hasAudio").GetBoolean());
        Assert.Equal("https://example.com/brano", tracks[0].GetProperty("linkUrl").GetString());
        var song = await sara.GetAsync($"/v1/events/{id}/tracks/{track}/audio");
        Assert.Equal(HttpStatusCode.OK, song.StatusCode);
        Assert.Equal("audio/mpeg", song.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.OK, (await chiara.GetAsync($"/v1/events/{id}/tracks/{track}/audio")).StatusCode);
        // Chi non partecipa vede il titolo ma non ascolta, né vede l'elenco dei partecipanti
        var anna = As("stu-anna");
        var annaTracks = await anna.GetFromJsonAsync<JsonElement[]>($"/v1/events/{id}/tracks");
        Assert.False(annaTracks![0].GetProperty("hasAudio").GetBoolean());
        Assert.Equal(JsonValueKind.Null, annaTracks[0].GetProperty("linkUrl").ValueKind);
        Assert.Equal(HttpStatusCode.Forbidden, (await anna.GetAsync($"/v1/events/{id}/tracks/{track}/audio")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await anna.GetAsync($"/v1/events/{id}/participants")).StatusCode);
        // Elenco dei partecipanti: le allieve della classe collegata e le persone assegnate
        var participants = await sara.GetFromJsonAsync<JsonElement[]>($"/v1/events/{id}/participants");
        Assert.Contains(participants!, p => p.GetProperty("memberId").GetGuid() == Member("stu-sara"));
        Assert.DoesNotContain(participants!, p => p.GetProperty("memberId").GetGuid() == Member("stu-anna"));
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PutAsJsonAsync($"/v1/events/{id}", body with { date = InDays(21), memberIds = new[] { Member("stu-anna") }, notify = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anna.GetAsync($"/v1/events/{id}/participants")).StatusCode);
        // Solo l'amministrazione elimina i brani
        Assert.Equal(HttpStatusCode.Forbidden, (await chiara.DeleteAsync($"/v1/events/{id}/tracks/{track}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.DeleteAsync($"/v1/events/{id}/tracks/{track}")).StatusCode);

        // La musica riguarda solo le performance
        var workshop = await CreatedId(await Admin.PostAsJsonAsync("/v1/events", body with { type = "workshop", title = "Test · Workshop", isFeatured = false, notify = false }));
        Assert.Equal("not_a_performance", await ErrorType(await Admin.PostAsJsonAsync($"/v1/events/{workshop}/tracks", new { title = "x" })));

        // Evento non pubblicato: invisibile alle allieve
        var draft = await CreatedId(await Admin.PostAsJsonAsync("/v1/events", body with { title = "Test · Bozza", isPublished = false, isFeatured = false }));
        Assert.DoesNotContain((await sara.GetFromJsonAsync<JsonElement[]>("/v1/events"))!, e => e.GetProperty("id").GetGuid() == draft);
        Assert.Contains((await chiara.GetFromJsonAsync<JsonElement[]>("/v1/events"))!, e => e.GetProperty("id").GetGuid() == draft);
        // Gli eventi di Oasi non esistono per Studio Prova
        Assert.DoesNotContain((await api.For(Seed.ProvaHost, Seed.Laura).GetFromJsonAsync<JsonElement[]>("/v1/events"))!, e => e.GetProperty("id").GetGuid() == id);
        Assert.NotEqual(HttpStatusCode.Created, (await api.For(Seed.ProvaHost, Seed.ProvaTeacher).PostAsJsonAsync($"/v1/events/{id}/tracks", new { title = "x" })).StatusCode);
    }
}

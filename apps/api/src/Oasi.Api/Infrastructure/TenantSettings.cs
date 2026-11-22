using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;

namespace Oasi.Api.Infrastructure;

/// <summary>
/// Impostazioni della struttura: i valori predefiniti della piattaforma
/// (app.default_settings) uniti a quelli salvati dall'amministrazione.
/// Nessuna soglia è scritta nel codice degli endpoint.
/// </summary>
public sealed class TenantSettings
{
    public string Timezone { get; init; } = "Europe/Rome";
    public BookingSettings Booking { get; init; } = new();
    public MakeupSettings Makeups { get; init; } = new();
    public CompetitiveSettings Competitive { get; init; } = new();
    public DocumentSettings Documents { get; init; } = new();
    public PackageSettings Packages { get; init; } = new();
    public ClassSettings Classes { get; init; } = new();
    public PaymentSettings Payments { get; init; } = new();

    /// <summary>Metodi di pagamento che la piattaforma sa registrare. Se ne possono aggiungere altri in futuro.</summary>
    public static readonly string[] KnownPaymentMethods = ["cash", "bank_transfer", "pos", "other"];

    public sealed class BookingSettings
    {
        /// <summary>
        /// Apertura delle prenotazioni di una lezione singola: quante ore prima dell'inizio
        /// si può prenotare (null = nessun limite). Oasi: 48.
        /// </summary>
        public int? OpensHoursBefore { get; init; }
        /// <summary>Chiusura delle prenotazioni: ore prima dell'inizio (0 = fino all'inizio).</summary>
        public int ClosesHoursBefore { get; init; }
        /// <summary>Disdetta libera fino a N ore prima dell'inizio. Oasi: 6.</summary>
        public int CancelHoursBefore { get; init; }
        /// <summary>Una disdetta tardiva consuma comunque l'ingresso / resta dovuta.</summary>
        public bool LateCancelConsumesEntry { get; init; } = true;
        /// <summary>Prenotazione senza presentarsi (assenza registrata): l'ingresso è consumato.</summary>
        public bool NoShowConsumesEntry { get; init; } = true;
    }

    public sealed class MakeupSettings
    {
        /// <summary>"declared_in_time": assenza annunciata entro la soglia di disdetta; "any_absence": qualsiasi assenza registrata.</summary>
        public string CreditOn { get; init; } = "declared_in_time";
        public bool AllowLowerLevel { get; init; } = true;
        public bool SameDisciplineOnly { get; init; }
        public int? MaxPerPlan { get; init; }
        /// <summary>Un recupero si può chiedere al massimo N giorni prima della lezione scelta (null = nessun limite).</summary>
        public int? RequestOpensDaysBefore { get; init; }
        /// <summary>...e al minimo N giorni prima (0 = fino all'inizio). Un giorno = 24 ore.</summary>
        public int RequestClosesDaysBefore { get; init; }
    }

    public sealed class CompetitiveSettings
    {
        public string[] CertificateRequiredFor { get; init; } = ["competitive", "pre_competitive"];
        public bool BlockEnrollmentWithoutCertificate { get; init; } = true;
    }

    public sealed class DocumentSettings
    {
        /// <summary>Giorni dopo i quali il file di una versione sostituita viene eliminato (null = si conserva).</summary>
        public int? ReplacedRetentionDays { get; init; }
        public int ExpiryReminderDays { get; init; } = 30;
        /// <summary>Promemoria N giorni prima del termine di un documento richiesto (es. documenti mensili).</summary>
        public int RequestReminderDays { get; init; } = 3;
    }

    public sealed class PackageSettings
    {
        /// <summary>"attendance": l'ingresso si scala alla partecipazione effettiva; "booking": alla prenotazione.</summary>
        public string ConsumeOn { get; init; } = "attendance";
    }

    public sealed class ClassSettings
    {
        /// <summary>Aree in cui sono organizzate le classi (es. Bambini/Ragazzi, Adulti/Ragazzi). Vuoto = nessuna.</summary>
        public string[] Categories { get; init; } = [];
        /// <summary>Numero massimo di discipline per classe (null = nessun limite). Oasi: 2.</summary>
        public int? MaxDisciplines { get; init; }
    }

    public sealed class PaymentSettings
    {
        /// <summary>Metodi accettati dalla struttura, tra quelli che la piattaforma sa registrare.</summary>
        public string[] Methods { get; init; } = ["cash", "bank_transfer"];
    }

    /// <summary>Le finestre "da … a …" devono essere coerenti: l'apertura non può essere più vicina della chiusura.</summary>
    public void EnsureConsistent()
    {
        if (Booking.OpensHoursBefore is { } o && o <= Booking.ClosesHoursBefore)
            throw ApiException.Invalid($"Lezioni singole: l'apertura ({o} ore prima) deve precedere la chiusura ({Booking.ClosesHoursBefore} ore prima).");
        if (Makeups.RequestOpensDaysBefore is { } m && m <= Makeups.RequestClosesDaysBefore)
            throw ApiException.Invalid($"Recuperi: l'apertura ({m} giorni prima) deve precedere la chiusura ({Makeups.RequestClosesDaysBefore} giorni prima).");
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<TenantSettings> Load(IDbConnection c, IDbTransaction tx)
    {
        var raw = await c.ExecuteScalarAsync<string>("select app.settings()::text", transaction: tx);
        return JsonSerializer.Deserialize<TenantSettings>(raw ?? "{}", Json) ?? new TenantSettings();
    }

    /// <summary>Convalida la parte modificabile dall'amministrazione. Restituisce il JSON da salvare.</summary>
    public static JsonObject Validate(JsonObject patch)
    {
        if (patch["timezone"] is { } tz)
        {
            var name = tz.GetValue<string>();
            if (!TimeZoneInfo.TryFindSystemTimeZoneById(name, out _)) throw ApiException.Invalid($"Fuso orario non riconosciuto: {name}.");
        }
        foreach (var (section, key, min, max) in new[]
                 {
                     ("booking", "opensHoursBefore", 1, 24 * 60), ("booking", "closesHoursBefore", 0, 24 * 30), ("booking", "cancelHoursBefore", 0, 24 * 30),
                     ("documents", "replacedRetentionDays", 0, 3650), ("documents", "expiryReminderDays", 0, 365), ("classes", "maxDisciplines", 1, 20),
                     ("makeups", "requestOpensDaysBefore", 1, 365), ("makeups", "requestClosesDaysBefore", 0, 60),
                 })
        {
            // null è ammesso dove significa "nessun limite"
            if (patch[section] is JsonObject o && o.ContainsKey(key) && o[key] is null && key is "opensHoursBefore" or "replacedRetentionDays" or "maxDisciplines" or "requestOpensDaysBefore") continue;
            if (patch[section]?[key] is not { } v) continue;
            if (v.GetValueKind() != JsonValueKind.Number || v.GetValue<int>() < min || v.GetValue<int>() > max)
                throw ApiException.Invalid($"Valore non valido per {section}.{key} (da {min} a {max}).");
        }
        if (patch["makeups"]?["creditOn"] is { } creditOn && creditOn.GetValue<string>() is not ("declared_in_time" or "any_absence"))
            throw ApiException.Invalid("makeups.creditOn deve essere declared_in_time oppure any_absence.");
        if (patch["packages"]?["consumeOn"] is { } consume && consume.GetValue<string>() is not ("attendance" or "booking"))
            throw ApiException.Invalid("packages.consumeOn deve essere attendance oppure booking.");
        if (patch["payments"]?["methods"] is { } methods)
        {
            var list = methods.AsArray().Select(m => m?.GetValue<string>()).ToArray();
            if (list.Length == 0 || list.Any(m => m is null || !KnownPaymentMethods.Contains(m)))
                throw ApiException.Invalid($"Metodi di pagamento ammessi: {string.Join(", ", KnownPaymentMethods)}.");
        }
        if (patch["classes"]?["categories"] is { } cats && cats.AsArray().Any(c => string.IsNullOrWhiteSpace(c?.GetValue<string>())))
            throw ApiException.Invalid("Le categorie di classe non possono essere vuote.");
        if (patch["makeups"]?["maxPerPlan"] is { } maxPerPlan && maxPerPlan.GetValueKind() == JsonValueKind.Number && maxPerPlan.GetValue<int>() < 0)
            throw ApiException.Invalid("makeups.maxPerPlan non può essere negativo.");
        return patch;
    }
}

/// <summary>Regole condivise su orari e posti: usate da iscrizioni, recuperi e prenotazioni.</summary>
public static class LessonRules
{
    public sealed class LessonInfo
    {
        public Guid Id { get; init; }
        public Guid ClassId { get; init; }
        public string Status { get; init; } = "";
        public DateTime Date { get; init; }
        /// <summary>Ore che mancano all'inizio, calcolate nel fuso della struttura (negative = già iniziata).</summary>
        public double HoursToStart { get; init; }
        public int Minutes { get; init; }
        public int? LevelRank { get; init; }
        public short? AgeMin { get; init; }
        public short? AgeMax { get; init; }
        public string CompetitiveLevel { get; init; } = "none";
        public bool Started => HoursToStart <= 0;
    }

    public static async Task<LessonInfo> Load(IDbConnection c, IDbTransaction tx, Guid id) =>
        await c.QuerySingleOrDefaultAsync<LessonInfo>(@"
            select l.id, l.class_id, l.status, l.date::timestamp as date,
                   extract(epoch from (app.local_instant(l.date, l.start_time) - now())) / 3600.0 as hours_to_start,
                   (extract(epoch from (l.end_time - l.start_time)) / 60)::int as minutes,
                   lv.rank as level_rank, c.age_min, c.age_max, c.competitive_level
            from app.lessons l join app.classes c on c.id = l.class_id
            left join app.levels lv on lv.id = c.level_id
            where l.id = @id", new { id }, tx)
        ?? throw ApiException.NotFound("Lezione");

    /// <summary>
    /// Blocca la riga della classe e verifica che la lezione abbia ancora un posto.
    /// Il blocco rende il controllo atomico: due richieste simultanee per l'ultimo
    /// posto vengono messe in fila e la seconda trova la lezione piena.
    /// </summary>
    public static async Task EnsureSeat(IDbConnection c, IDbTransaction tx, LessonInfo lesson, string code = "lesson_full", string message = "La lezione non ha più posti disponibili.")
    {
        var capacity = await c.ExecuteScalarAsync<int>("select capacity from app.classes where id = @id for update", new { id = lesson.ClassId }, tx);
        var taken = await c.ExecuteScalarAsync<int>("select app.lesson_taken(@id)", new { id = lesson.Id }, tx);
        if (taken >= capacity) throw ApiException.Conflict(code, message);
    }

    /// <summary>Età compatibile con la fascia della classe (se la data di nascita è nota).</summary>
    public static async Task EnsureAge(IDbConnection c, IDbTransaction tx, Guid memberId, short? ageMin, short? ageMax)
    {
        if (ageMin is null && ageMax is null) return;
        var age = await c.ExecuteScalarAsync<int?>("select extract(year from age(app.tenant_today(), birth_date))::int from app.members where id = @memberId", new { memberId }, tx);
        if (age is not null && ((ageMin is { } min && age < min) || (ageMax is { } max && age > max)))
            throw ApiException.Conflict("age_out_of_range", "L'età non rientra nella fascia prevista dalla classe.");
    }
}

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

    public sealed class BookingSettings
    {
        /// <summary>Ore minime di anticipo per prenotare una lezione singola.</summary>
        public int SingleLessonBookHoursBefore { get; init; } = 48;
        /// <summary>Ore minime di anticipo per disdire senza conseguenze.</summary>
        public int CancelHoursBefore { get; init; } = 6;
        /// <summary>Una disdetta tardiva consuma comunque l'ingresso / resta dovuta.</summary>
        public bool LateCancelConsumesEntry { get; init; } = true;
    }

    public sealed class MakeupSettings
    {
        /// <summary>"declared_in_time": assenza annunciata entro la soglia di disdetta; "any_absence": qualsiasi assenza registrata.</summary>
        public string CreditOn { get; init; } = "declared_in_time";
        public bool AllowLowerLevel { get; init; } = true;
        public bool SameDisciplineOnly { get; init; }
        public int? MaxPerPlan { get; init; }
    }

    public sealed class CompetitiveSettings
    {
        public string[] CertificateRequiredFor { get; init; } = ["competitive", "pre_competitive"];
        public bool BlockEnrollmentWithoutCertificate { get; init; } = true;
    }

    public sealed class DocumentSettings
    {
        public int ReplacedRetentionDays { get; init; } = 7;
        public int ExpiryReminderDays { get; init; } = 30;
        /// <summary>Mai più di 7 giorni, qualunque valore sia stato salvato.</summary>
        public int EffectiveRetentionDays => Math.Clamp(ReplacedRetentionDays, 0, 7);
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
                     ("booking", "singleLessonBookHoursBefore", 0, 24 * 60), ("booking", "cancelHoursBefore", 0, 24 * 30),
                     ("documents", "replacedRetentionDays", 0, 7), ("documents", "expiryReminderDays", 0, 365),
                 })
        {
            if (patch[section]?[key] is not { } v) continue;
            if (v.GetValueKind() != JsonValueKind.Number || v.GetValue<int>() < min || v.GetValue<int>() > max)
                throw ApiException.Invalid($"Valore non valido per {section}.{key} (da {min} a {max}).");
        }
        if (patch["makeups"]?["creditOn"] is { } creditOn && creditOn.GetValue<string>() is not ("declared_in_time" or "any_absence"))
            throw ApiException.Invalid("makeups.creditOn deve essere declared_in_time oppure any_absence.");
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

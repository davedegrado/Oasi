using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Piani e listino. L'amministrazione scrive i piani; l'atleta (o il genitore) ne sceglie uno
/// quando chiede l'iscrizione a una classe, e può rinnovarlo. Il prezzo è solo informativo:
/// l'app non calcola né registra pagamenti.
/// Un piano ha: numero di lezioni (vuoto = senza limite), frequenza settimanale, validità in
/// mesi dalla sottoscrizione oppure un periodo preciso, partecipazione automatica (se non c'è,
/// l'atleta dice "ci sarò" a ogni lezione con una prenotazione).
/// </summary>
public static class PlanEndpoints
{
    public static readonly string[] Kinds = ["subscription", "package", "single_lesson", "semi_private", "workshop", "stage", "other", "membership_fee"];

    public sealed record PlanInput(string Name, int AmountCents, string? Kind = null, string? Category = null, string? Description = null,
        int? WeeklyFrequency = null, int? Entries = null, string? ValidityMode = null, int? ValidityMonths = null, string? ValidFrom = null, string? ValidUntil = null,
        bool? AutoAttendance = null, string[]? ClassCategories = null, short[]? LessonMinutes = null, int? BookingOpensHoursBefore = null, int? BookingClosesHoursBefore = null,
        int? AgeMinMonths = null, int? AgeMaxMonths = null, int? Participants = null, int? MaxParticipants = null, string? CompetitiveLevel = null,
        bool? GrantsMakeups = null, bool? IsActive = null, int? Position = null);
    /// <summary>Scelta (o rinnovo) del piano per una classe a cui la persona è iscritta</summary>
    public sealed record ChooseInput(Guid ClassId, Guid PlanId, Guid? MemberId = null);

    public sealed class PlanRow
    {
        public Guid Id { get; init; }
        public string Name { get; init; } = "";
        public string Kind { get; init; } = "";
        /// <summary>Prezzo di listino (informativo)</summary>
        public int AmountCents { get; init; }
        public bool IsActive { get; init; }
        public string Category { get; init; } = "";
        public string Description { get; init; } = "";
        public short? WeeklyFrequency { get; init; }
        /// <summary>Lezioni incluse (null = senza limite nel periodo di validità)</summary>
        public short? Entries { get; init; }
        /// <summary>months: N mesi dalla sottoscrizione · period: dal giorno al giorno</summary>
        public string ValidityMode { get; init; } = "months";
        public short? ValidityMonths { get; init; }
        public string? ValidFrom { get; init; }
        public string? ValidUntil { get; init; }
        /// <summary>Partecipazione automatica: l'atleta è atteso a ogni lezione senza dire "ci sarò"</summary>
        public bool AutoAttendance { get; init; }
        /// <summary>Aree delle classi per cui si può scegliere (vuoto = tutte)</summary>
        public string[] ClassCategories { get; init; } = [];
        public short[]? LessonMinutes { get; init; }
        public short? BookingOpensHoursBefore { get; init; }
        public short? BookingClosesHoursBefore { get; init; }
        public short? AgeMinMonths { get; init; }
        public short? AgeMaxMonths { get; init; }
        public short Participants { get; init; }
        public short? MaxParticipants { get; init; }
        public string CompetitiveLevel { get; init; } = "none";
        public bool GrantsMakeups { get; init; }
        public int Position { get; init; }
    }

    private const string SelectPlans = @"
        select id, name, kind, amount_cents, is_active, category, description, weekly_frequency, entries, validity_mode, validity_months,
               to_char(valid_from, 'YYYY-MM-DD') as valid_from, to_char(valid_until, 'YYYY-MM-DD') as valid_until, auto_attendance, class_categories,
               lesson_minutes, booking_opens_hours_before, booking_closes_hours_before, age_min_months, age_max_months, participants, max_participants,
               competitive_level, grants_makeups, position
        from app.fee_plans";

    public static void Map(WebApplication app)
    {
        var plans = app.MapGroup("/v1/plans").RequireAuthorization().RequireModule("payments");

        // Listino: i piani selezionabili sono visibili a tutti i membri; quelli disattivati solo all'amministrazione.
        // Con classId: solo i piani che si possono scegliere per quella classe.
        plans.MapGet("/", async (HttpContext ctx, Db db, bool? includeInactive, Guid? classId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var list = await LoadPlans(c, tx, includeInactive == true && m.IsAdmin);
                if (classId is null) return list;
                var cls = await LoadClass(c, tx, classId.Value);
                var today = await Today(c, tx);
                return list.Where(p => p.IsActive && Fits(p, cls) && !(p.ValidityMode == "period" && string.CompareOrdinal(p.ValidUntil, today) < 0)).ToList();
            });
        }).RequireMember();

        plans.MapPost("/", async (HttpContext ctx, Db db, PlanInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var newId = await c.ExecuteScalarAsync<Guid>(@"insert into app.fee_plans (tenant_id, name, kind, amount_cents, validity_mode, validity_months, valid_from, valid_until)
                    values (app.current_tenant(), @Name, coalesce(@Kind, 'subscription'), @AmountCents, coalesce(@ValidityMode, 'months'), @ValidityMonths, @ValidFrom::date, @ValidUntil::date) returning id", input, tx);
                await SavePlan(c, tx, newId, input);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "plan.create", newId.ToString(), new { input.Name, input.AmountCents });
                return newId;
            });
            return Results.Created($"/v1/plans/{id}", new { id });
        }).RequireMember(Roles.Admin);

        plans.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, PlanInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (!await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.fee_plans where id = @id)", new { id }, tx)) throw ApiException.NotFound("Piano");
                await SavePlan(c, tx, id, input);
                // Le modifiche valgono per le nuove sottoscrizioni: i piani già scelti restano come sono
                await Audit.Log(c, tx, m.UserId, m.TenantId, "plan.update", id.ToString(), new { input.Name, input.AmountCents });
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        var mp = app.MapGroup("/v1/member-plans").RequireAuthorization().RequireModule("payments");

        // Piani sottoscritti: quelli propri (o dei figli); l'amministrazione vede tutti
        mp.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var subject = memberId ?? (m.IsAdmin ? (Guid?)null : m.MemberId);
                if (subject is { } s && s != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, s, "view");
                await ExpirePlans(c, tx);
                return (await c.QueryAsync(@"
                    select mp.id, mp.member_id, mb.first_name || ' ' || mb.last_name as member_name, mp.plan_id, p.name as plan_name, p.auto_attendance,
                           mp.class_id, cl.name as class_name, mp.status, to_char(mp.valid_from, 'YYYY-MM-DD') as valid_from, to_char(mp.valid_until, 'YYYY-MM-DD') as valid_until,
                           mp.weekly_frequency, mp.entries_total, mp.entries_used,
                           (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_reserved,
                           mp.entries_total - mp.entries_used - (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_left
                    from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id join app.members mb on mb.id = mp.member_id
                    left join app.classes cl on cl.id = mp.class_id
                    where (@subject::uuid is null or mp.member_id = @subject) order by mp.valid_until desc limit 500", new { subject }, tx)).Camel();
            });
        }).RequireMember();

        // L'atleta (o il genitore) sceglie un nuovo piano per una classe a cui è iscritto: rinnovo o cambio.
        // L'amministrazione viene avvisata (il pagamento avviene fuori dall'app).
        mp.MapPost("/", async (HttpContext ctx, Db db, ChooseInput input) =>
        {
            var m = ctx.Member();
            var subject = input.MemberId ?? m.MemberId;
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                var enrolled = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.enrollments where class_id = @ClassId and member_id = @subject and status = 'approved')",
                    new { input.ClassId, subject }, tx);
                if (!enrolled) throw ApiException.Conflict("not_enrolled", "Il piano si sceglie per una classe a cui si è iscritti: prima chiedi l'iscrizione.");
                var sub = await Subscribe(c, tx, subject, input.ClassId, input.PlanId, m.UserId);
                var who = await c.ExecuteScalarAsync<string>("select first_name || ' ' || last_name from app.members where id = @subject", new { subject }, tx);
                await Notifications.Notifier.ToUsers(c, tx, await Notifications.Notifier.UsersWithRoles(c, tx, Roles.Admin), "admin", "Nuovo piano scelto",
                    $"{who} ha scelto «{sub.PlanName}» ({DateOnly.Parse(sub.ValidFrom):dd/MM/yyyy} – {DateOnly.Parse(sub.ValidUntil):dd/MM/yyyy}).", m.UserId, link: "/admin/piani");
                return sub;
            });
            return Results.Created($"/v1/member-plans/{result.Id}", new { id = result.Id, validFrom = result.ValidFrom, validUntil = result.ValidUntil });
        }).RequireMember();

        mp.MapPost("/{id:guid}/cancel", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var n = await c.ExecuteAsync("update app.member_plans set status = 'cancelled' where id = @id and status = 'active'", new { id }, tx);
                if (n == 0) throw ApiException.Conflict("not_active", "Il piano non è attivo.");
                await c.ExecuteAsync("update app.makeup_credits set status = 'cancelled' where member_plan_id = @id and status = 'available'", new { id }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "member_plan.cancel", id.ToString());
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Riepilogo per l'amministrazione: piani in scadenza e documenti mancanti
        app.MapGet("/v1/reports/overview", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await ExpirePlans(c, tx);
                var expiring = (await c.QueryAsync(@"
                    select mp.id, mp.member_id, mb.first_name || ' ' || mb.last_name as member_name, p.name as plan_name, to_char(mp.valid_until, 'YYYY-MM-DD') as valid_until
                    from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id join app.members mb on mb.id = mp.member_id
                    where mp.status = 'active' and mp.valid_until <= app.tenant_today() + 14 order by mp.valid_until limit 200", transaction: tx)).Camel();
                var missingDocs = (await c.QueryAsync(@"
                    select mb.id as member_id, mb.first_name || ' ' || mb.last_name as member_name, t.id as type_id, t.name as type_name
                    from app.members mb
                    join app.document_types t on t.is_active and app.document_required(mb.id, t.audience, t.is_required, t.required_for_competitive)
                    where not app.document_satisfied(mb.id, t.id)
                    order by member_name, type_name limit 500", transaction: tx)).Camel();
                return new { expiringPlans = expiring, missingDocuments = missingDocs };
            });
        }).RequireAuthorization().RequireModule("payments").RequireMember(Roles.Admin);
    }

    public sealed record Subscription(Guid Id, string PlanName, string ValidFrom, string ValidUntil);

    /// <summary>
    /// Sottoscrive un piano per una classe: verifica che sia selezionabile per quella classe
    /// (area, classificazione agonistica, età), calcola la validità (mesi da oggi o periodo del piano)
    /// e collega l'iscrizione al nuovo piano.
    /// </summary>
    internal static async Task<Subscription> Subscribe(IDbConnection c, IDbTransaction tx, Guid memberId, Guid classId, Guid planId, Guid user)
    {
        var plan = (await LoadPlans(c, tx, true, planId)).SingleOrDefault() ?? throw ApiException.NotFound("Piano");
        if (!plan.IsActive) throw ApiException.Conflict("plan_inactive", "Il piano non è selezionabile.");
        var cls = await LoadClass(c, tx, classId);
        if (!Fits(plan, cls)) throw ApiException.Conflict("plan_class_mismatch", $"Il piano «{plan.Name}» non è previsto per la classe «{cls.Name}».");
        await BookingEndpoints.EnsureAgeMonths(c, tx, memberId, plan.AgeMinMonths, plan.AgeMaxMonths);
        var today = await Today(c, tx);
        string from, until;
        if (plan.ValidityMode == "period")
        {
            if (string.CompareOrdinal(plan.ValidUntil, today) < 0) throw ApiException.Conflict("plan_ended", "Il periodo di questo piano è già terminato.");
            (from, until) = (plan.ValidFrom!, plan.ValidUntil!);
        }
        else
        {
            var start = DateOnly.Parse(today);
            (from, until) = (today, start.AddMonths(plan.ValidityMonths ?? 1).AddDays(-1).ToString("yyyy-MM-dd"));
        }
        var id = await c.ExecuteScalarAsync<Guid>(@"
            insert into app.member_plans (tenant_id, member_id, plan_id, class_id, valid_from, valid_until, weekly_frequency, entries_total, created_by)
            values (app.current_tenant(), @memberId, @planId, @classId, @from::date, @until::date, @freq, @entries, @user) returning id",
            new { memberId, planId, classId, from, until, freq = plan.WeeklyFrequency, entries = plan.Entries, user }, tx);
        await c.ExecuteAsync("update app.enrollments set member_plan_id = @id where class_id = @classId and member_id = @memberId and status = 'approved'", new { id, classId, memberId }, tx);
        await Audit.Log(c, tx, user, await c.ExecuteScalarAsync<Guid>("select app.current_tenant()", transaction: tx), "member_plan.create", id.ToString(), new { memberId, planId, classId });
        return new Subscription(id, plan.Name, from, until);
    }

    /// <summary>
    /// Piano richiesto con l'iscrizione: obbligatorio se la struttura ha piani selezionabili per la classe,
    /// e deve essere uno di quelli. Restituisce il piano (o null se la struttura non usa i piani).
    /// </summary>
    internal static async Task<Guid?> EnsureSelectable(IDbConnection c, IDbTransaction tx, Guid classId, Guid? planId)
    {
        var cls = await LoadClass(c, tx, classId);
        var today = await Today(c, tx);
        var options = (await LoadPlans(c, tx, false)).Where(p => Fits(p, cls) && !(p.ValidityMode == "period" && string.CompareOrdinal(p.ValidUntil, today) < 0)).ToList();
        if (planId is null)
        {
            if (options.Count > 0) throw ApiException.Invalid("Scegli il piano con cui frequentare la classe.");
            return null;
        }
        if (!options.Any(p => p.Id == planId)) throw ApiException.Conflict("plan_class_mismatch", "Il piano scelto non è disponibile per questa classe.");
        return planId;
    }

    private sealed record ClassInfo(string Name, string? Category, string CompetitiveLevel);

    private static async Task<ClassInfo> LoadClass(IDbConnection c, IDbTransaction tx, Guid classId) =>
        await c.QuerySingleOrDefaultAsync<ClassInfo>("select name, category, competitive_level from app.classes where id = @classId", new { classId }, tx)
        ?? throw ApiException.NotFound("Classe");

    /// <summary>Coerenza piano ↔ classe: area (es. Bambini/Ragazzi) e classificazione agonistica</summary>
    private static bool Fits(PlanRow p, ClassInfo cls) =>
        (p.ClassCategories.Length == 0 || (cls.Category is not null && p.ClassCategories.Contains(cls.Category)))
        && (p.CompetitiveLevel == "none" || p.CompetitiveLevel == cls.CompetitiveLevel);

    private static async Task<string> Today(IDbConnection c, IDbTransaction tx) =>
        DateOnly.FromDateTime(await c.ExecuteScalarAsync<DateTime>("select app.tenant_today()::timestamp", transaction: tx)).ToString("yyyy-MM-dd");

    internal static async Task<List<PlanRow>> LoadPlans(IDbConnection c, IDbTransaction tx, bool includeInactive, Guid? id = null) =>
        (await c.QueryAsync<PlanRow>(SelectPlans + " where (@id::uuid is null or id = @id) and (is_active or @includeInactive) order by position, category, name",
            new { id, includeInactive }, tx)).ToList();

    /// <summary>Piano dell'atleta per la classe che copre la data (il più recente), con le regole del listino</summary>
    internal sealed class CoveringPlan
    {
        public Guid Id { get; init; }
        public bool AutoAttendance { get; init; }
        public short? EntriesTotal { get; init; }
        public short EntriesUsed { get; init; }
        public short? BookingOpensHoursBefore { get; init; }
        public short? BookingClosesHoursBefore { get; init; }
        public short[]? LessonMinutes { get; init; }
        public short? AgeMinMonths { get; init; }
        public short? AgeMaxMonths { get; init; }
        public int EntriesReserved { get; init; }
    }

    internal static Task<CoveringPlan?> Covering(IDbConnection c, IDbTransaction tx, Guid memberId, Guid classId, DateTime date) =>
        c.QuerySingleOrDefaultAsync<CoveringPlan?>(@"
            select mp.id, p.auto_attendance, mp.entries_total, mp.entries_used, p.booking_opens_hours_before, p.booking_closes_hours_before, p.lesson_minutes, p.age_min_months, p.age_max_months,
                   (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_reserved
            from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id
            where mp.member_id = @memberId and (mp.class_id is null or mp.class_id = @classId) and mp.status = 'active'
              and @date::date between mp.valid_from and mp.valid_until
            order by mp.created_at desc, mp.valid_until desc limit 1 for update of mp", new { memberId, classId, date }, tx);

    private static async Task SavePlan(IDbConnection c, IDbTransaction tx, Guid id, PlanInput i)
    {
        var mode = i.ValidityMode ?? "months";
        await c.ExecuteAsync(@"
            update app.fee_plans set name = @Name, kind = coalesce(@Kind, kind), amount_cents = @AmountCents, category = coalesce(@Category, category),
              description = coalesce(@Description, ''), weekly_frequency = @WeeklyFrequency, entries = @Entries,
              validity_mode = @mode, validity_months = case when @mode = 'months' then @ValidityMonths end,
              valid_from = case when @mode = 'period' then @ValidFrom::date end, valid_until = case when @mode = 'period' then @ValidUntil::date end,
              auto_attendance = coalesce(@AutoAttendance, true), class_categories = coalesce(@ClassCategories, class_categories), lesson_minutes = @LessonMinutes,
              booking_opens_hours_before = @BookingOpensHoursBefore, booking_closes_hours_before = @BookingClosesHoursBefore,
              age_min_months = @AgeMinMonths, age_max_months = @AgeMaxMonths, participants = coalesce(@Participants, 1), max_participants = @MaxParticipants,
              competitive_level = coalesce(@CompetitiveLevel, 'none'), grants_makeups = coalesce(@GrantsMakeups, true), is_active = coalesce(@IsActive, true),
              position = coalesce(@Position, position)
            where id = @id",
            new
            {
                id, mode, i.Name, i.Kind, i.AmountCents, i.Category, i.Description, i.WeeklyFrequency, i.Entries, i.ValidityMonths, i.ValidFrom, i.ValidUntil,
                i.AutoAttendance, i.ClassCategories, i.LessonMinutes, i.BookingOpensHoursBefore, i.BookingClosesHoursBefore, i.AgeMinMonths, i.AgeMaxMonths,
                i.Participants, i.MaxParticipants, i.CompetitiveLevel, i.GrantsMakeups, i.IsActive, i.Position,
            }, tx);
    }

    internal static Task ExpirePlans(IDbConnection c, IDbTransaction tx) =>
        c.ExecuteAsync("update app.member_plans set status = 'expired' where status = 'active' and valid_until < app.tenant_today()", transaction: tx);

    private static void Validate(PlanInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome del piano.");
        if (i.Kind is not null && !Kinds.Contains(i.Kind)) throw ApiException.Invalid("Tipo di piano non valido.");
        if (i.AmountCents < 0) throw ApiException.Invalid("Prezzo non valido.");
        if (i.Entries is <= 0) throw ApiException.Invalid("Il numero di lezioni deve essere almeno 1.");
        if (i.WeeklyFrequency is < 1 or > 7) throw ApiException.Invalid("La frequenza va da 1 a 7 giorni a settimana.");
        if (i.CompetitiveLevel is not (null or "none" or "pre_competitive" or "competitive")) throw ApiException.Invalid("Classificazione non valida.");
        switch (i.ValidityMode ?? "months")
        {
            case "months":
                if (i.ValidityMonths is null or <= 0) throw ApiException.Invalid("Indica per quanti mesi vale il piano dalla sottoscrizione.");
                break;
            case "period":
                if (!DateOnly.TryParse(i.ValidFrom, out var a) || !DateOnly.TryParse(i.ValidUntil, out var b) || b < a)
                    throw ApiException.Invalid("Indica il periodo di validità: dal giorno… al giorno…");
                break;
            default:
                throw ApiException.Invalid("Validità non valida: mesi dalla sottoscrizione oppure periodo.");
        }
    }
}

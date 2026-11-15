using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Prenotazione di lezioni singole e di ingressi di un pacchetto.
/// Le soglie (quante ore prima si prenota e si disdice) sono impostazioni della
/// struttura; un piano può avere una propria soglia di prenotazione. I posti
/// sono verificati in modo atomico. L'amministrazione può registrare eccezioni.
/// </summary>
public static class BookingEndpoints
{
    public sealed record BookingInput(Guid LessonId, Guid? MemberId, Guid? MemberPlanId, Guid? PlanId, bool? Override, string? Note);
    public sealed record BookingDto(Guid Id, Guid LessonId, Guid MemberId, string MemberName, string ClassName, string Date, string StartTime, string Status,
        bool EntryConsumed, Guid? MemberPlanId, DateTime BookedAt, DateTime? CancelledAt, string Note);
    public sealed record OpenLessonDto(Guid Id, Guid ClassId, string ClassName, string Date, string StartTime, string EndTime, int Capacity, int Taken, int? LevelRank, double HoursToStart);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/bookings").RequireAuthorization().RequireModule("bookings");

        // Lezioni future con posti liberi (per scegliere una lezione singola o un recupero)
        g.MapGet("/lessons", async (HttpContext ctx, Db db, string? from, string? to) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var today = DateOnly.FromDateTime(await c.ExecuteScalarAsync<DateTime>("select app.tenant_today()::timestamp", transaction: tx));
                var start = DateOnly.TryParse(from, out var f) && f > today ? f : today;
                var end = DateOnly.TryParse(to, out var t) ? t : start.AddDays(27);
                if (end < start || end.DayNumber - start.DayNumber > 62) throw ApiException.Invalid("Intervallo di date non valido (massimo 62 giorni).");
                return await c.QueryAsync<OpenLessonDto>(@"
                    select l.id, l.class_id, c.name as class_name, to_char(l.date, 'YYYY-MM-DD') as date, to_char(l.start_time, 'HH24:MI') as start_time,
                           to_char(l.end_time, 'HH24:MI') as end_time, c.capacity::int, app.lesson_taken(l.id) as taken, lv.rank as level_rank,
                           extract(epoch from (app.local_instant(l.date, l.start_time) - now())) / 3600.0 as hours_to_start
                    from app.lessons l join app.classes c on c.id = l.class_id left join app.levels lv on lv.id = c.level_id
                    where l.date between @start::date and @end::date and l.status <> 'cancelled' and c.is_active
                      and app.local_instant(l.date, l.start_time) > now()
                    order by l.date, l.start_time", new { start = start.ToString("yyyy-MM-dd"), end = end.ToString("yyyy-MM-dd") }, tx);
            });
        }).RequireMember();

        g.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var subject = memberId ?? (m.IsAdmin ? (Guid?)null : m.MemberId);
                if (subject is { } s && s != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, s, "view");
                return await c.QueryAsync<BookingDto>(@"
                    select b.id, b.lesson_id, b.member_id, mb.first_name || ' ' || mb.last_name as member_name, c.name as class_name,
                           to_char(l.date, 'YYYY-MM-DD') as date, to_char(l.start_time, 'HH24:MI') as start_time, b.status, b.entry_consumed,
                           b.member_plan_id, b.booked_at, b.cancelled_at, b.note
                    from app.lesson_bookings b join app.lessons l on l.id = b.lesson_id join app.classes c on c.id = l.class_id
                    join app.members mb on mb.id = b.member_id
                    where (@subject::uuid is null or b.member_id = @subject) order by l.date desc, l.start_time desc limit 300", new { subject }, tx);
            });
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, BookingInput input) =>
        {
            var m = ctx.Member();
            var subject = input.MemberId ?? m.MemberId;
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                var settings = await TenantSettings.Load(c, tx);
                var lesson = await LessonRules.Load(c, tx, input.LessonId);
                if (lesson.Status == "cancelled" || lesson.Started) throw ApiException.Conflict("lesson_unavailable", "La lezione non è prenotabile.");
                var exception = input.Override == true && m.IsAdmin;   // eccezione registrata dall'amministrazione

                var inClass = await c.ExecuteScalarAsync<bool>(@"select
                    exists(select 1 from app.enrollments where class_id = @classId and member_id = @subject and status = 'approved')
                    or exists(select 1 from app.lesson_bookings where lesson_id = @lessonId and member_id = @subject and status = 'booked')",
                    new { classId = lesson.ClassId, lessonId = lesson.Id, subject }, tx);
                if (inClass) throw ApiException.Conflict("already_in_lesson", "Sei già in questa lezione.");

                Guid? memberPlanId = null, chargeId = null;
                int threshold;
                if (input.MemberPlanId is { } mpId)
                {
                    // Ingresso di un pacchetto: si blocca la riga del piano per scalare il saldo senza doppi utilizzi
                    var mp = await c.QuerySingleOrDefaultAsync<PackRow>(@"
                        select mp.id, mp.member_id, mp.status, mp.valid_from::timestamp as valid_from, mp.valid_until::timestamp as valid_until,
                               mp.entries_total, mp.entries_used, p.booking_hours_before, p.lesson_minutes, p.age_min_months, p.age_max_months
                        from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id where mp.id = @mpId for update of mp", new { mpId }, tx)
                        ?? throw ApiException.NotFound("Pacchetto");
                    if (mp.MemberId != subject) throw ApiException.Forbidden("Il pacchetto appartiene a un'altra persona.");
                    if (mp.EntriesTotal is null) throw ApiException.Conflict("not_a_package", "Questo piano non è un pacchetto a ingressi.");
                    if (mp.Status != "active" || lesson.Date < mp.ValidFrom || lesson.Date > mp.ValidUntil)
                        throw ApiException.Conflict("package_expired", "Il pacchetto non è valido per la data della lezione.");
                    if (mp.EntriesUsed >= mp.EntriesTotal) throw ApiException.Conflict("package_exhausted", "Il pacchetto non ha più ingressi disponibili.");
                    if (mp.LessonMinutes is { Length: > 0 } allowed && !allowed.Contains((short)lesson.Minutes))
                        throw ApiException.Conflict("lesson_not_covered", "Il pacchetto non copre lezioni di questa durata.");
                    await EnsureAgeMonths(c, tx, subject, mp.AgeMinMonths, mp.AgeMaxMonths);
                    threshold = mp.BookingHoursBefore ?? settings.Booking.SingleLessonBookHoursBefore;
                    memberPlanId = mp.Id;
                }
                else
                {
                    // Lezione singola: serve una tariffa configurata dalla struttura (nessun prezzo nel codice)
                    var plan = await c.QuerySingleOrDefaultAsync<(Guid Id, string Name, int AmountCents, short? BookingHoursBefore)?>(@"
                        select id, name, amount_cents, booking_hours_before from app.fee_plans
                        where kind = 'single_lesson' and is_active and (@planId::uuid is null or id = @planId)
                          and (valid_from is null or @d::date >= valid_from) and (valid_until is null or @d::date <= valid_until)
                        order by position, name limit 1", new { planId = input.PlanId, d = lesson.Date }, tx);
                    if (plan is not { } p) throw ApiException.Conflict("single_lesson_not_configured", "La struttura non ha configurato la tariffa per le lezioni singole.");
                    threshold = p.BookingHoursBefore ?? settings.Booking.SingleLessonBookHoursBefore;
                    chargeId = await c.ExecuteScalarAsync<Guid>(@"
                        insert into app.member_charges (tenant_id, member_id, fee_plan_id, description, amount_cents, due_on, kind)
                        values (app.current_tenant(), @subject, @plan, @description, @amount, @due::date, 'plan') returning id",
                        new { subject, plan = p.Id, description = $"{p.Name} del {lesson.Date:dd/MM/yyyy}", amount = p.AmountCents, due = lesson.Date }, tx);
                }

                if (!exception && lesson.HoursToStart < threshold)
                    throw ApiException.Conflict("too_late_to_book", $"La prenotazione va fatta almeno {threshold} ore prima della lezione.");
                if (!exception) await LessonRules.EnsureAge(c, tx, subject, lesson.AgeMin, lesson.AgeMax);
                await LessonRules.EnsureSeat(c, tx, lesson);   // i posti si rispettano anche nelle eccezioni

                if (memberPlanId is not null)
                    await c.ExecuteAsync("update app.member_plans set entries_used = entries_used + 1 where id = @id", new { id = memberPlanId }, tx);
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.lesson_bookings (tenant_id, lesson_id, member_id, member_plan_id, charge_id, entry_consumed, booked_by, note)
                    values (app.current_tenant(), @lesson, @subject, @memberPlanId, @chargeId, @consumed, @user, @note) returning id",
                    new { lesson = lesson.Id, subject, memberPlanId, chargeId, consumed = memberPlanId is not null, user = m.UserId,
                          note = (exception ? "[Eccezione dell'amministrazione] " : "") + (input.Note ?? "") }, tx);
                if (exception) await Audit.Log(c, tx, m.UserId, m.TenantId, "booking.override", newId.ToString(), new { lesson = lesson.Id, subject });
                return newId;
            });
            return Results.Created($"/v1/bookings/{id}", new { id, status = "booked" });
        }).RequireMember();

        // Disdetta: entro la soglia l'ingresso torna disponibile; oltre, vale la regola della struttura
        g.MapDelete("/{id:guid}", async (HttpContext ctx, Db db, Guid id, bool? @override) =>
        {
            var m = ctx.Member();
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var b = await c.QuerySingleOrDefaultAsync<(Guid MemberId, Guid LessonId, string Status, Guid? MemberPlanId, Guid? ChargeId, bool EntryConsumed)?>(
                    "select member_id, lesson_id, status, member_plan_id, charge_id, entry_consumed from app.lesson_bookings where id = @id for update", new { id }, tx)
                    ?? throw ApiException.NotFound("Prenotazione");
                await Relations.EnsureCanActFor(c, tx, m, b.MemberId, "enroll");
                if (b.Status != "booked") throw ApiException.Conflict("not_active", "La prenotazione non è più attiva.");
                var settings = await TenantSettings.Load(c, tx);
                var lesson = await LessonRules.Load(c, tx, b.LessonId);
                if (lesson.Started) throw ApiException.Conflict("lesson_started", "La lezione è già iniziata.");
                var late = lesson.HoursToStart < settings.Booking.CancelHoursBefore && !(@override == true && m.IsAdmin);
                var keepCost = late && settings.Booking.LateCancelConsumesEntry;
                await c.ExecuteAsync("update app.lesson_bookings set status = @s, cancelled_at = now(), entry_consumed = @consumed where id = @id",
                    new { id, s = late ? "late_cancelled" : "cancelled", consumed = keepCost && b.EntryConsumed }, tx);
                if (!keepCost)
                {
                    if (b.EntryConsumed && b.MemberPlanId is not null)
                        await c.ExecuteAsync("update app.member_plans set entries_used = greatest(entries_used - 1, 0) where id = @id", new { id = b.MemberPlanId }, tx);
                    if (b.ChargeId is not null)
                        await c.ExecuteAsync("update app.member_charges set status = 'cancelled' where id = @id and status = 'open'", new { id = b.ChargeId }, tx);
                }
                return new { id, status = late ? "late_cancelled" : "cancelled", entryRefunded = !keepCost };
            });
            return Results.Ok(result);
        }).RequireMember();
    }

    private sealed class PackRow
    {
        public Guid Id { get; init; }
        public Guid MemberId { get; init; }
        public string Status { get; init; } = "";
        public DateTime ValidFrom { get; init; }
        public DateTime ValidUntil { get; init; }
        public short? EntriesTotal { get; init; }
        public short EntriesUsed { get; init; }
        public short? BookingHoursBefore { get; init; }
        public short[]? LessonMinutes { get; init; }
        public short? AgeMinMonths { get; init; }
        public short? AgeMaxMonths { get; init; }
    }

    internal static async Task EnsureAgeMonths(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid memberId, short? min, short? max)
    {
        if (min is null && max is null) return;
        var months = await c.ExecuteScalarAsync<int?>(@"select (extract(year from age(app.tenant_today(), birth_date)) * 12 + extract(month from age(app.tenant_today(), birth_date)))::int
            from app.members where id = @memberId", new { memberId }, tx);
        if (months is null) throw ApiException.Conflict("birth_date_required", "Per questo piano serve la data di nascita.");
        if ((min is { } a && months < a) || (max is { } b && months > b)) throw ApiException.Conflict("age_out_of_range", "L'età non rientra in quella prevista dal piano.");
    }
}

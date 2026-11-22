using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Prenotazione di lezioni singole e di ingressi di un pacchetto.
/// Finestra: la prenotazione si APRE N ore prima dell'inizio (Oasi: 48) e si chiude
/// M ore prima (Oasi: 0, cioè fino all'inizio); un piano può avere una sua finestra
/// (es. Circo Baby: almeno 24 ore prima). Disdetta libera fino a K ore prima (Oasi: 6).
/// Gli ingressi dei pacchetti si scalano alla partecipazione effettiva (o alla
/// prenotazione, se la struttura lo imposta).
/// Le soglie (quante ore prima si prenota e si disdice) sono impostazioni della
/// struttura; un piano può avere una propria soglia di prenotazione. I posti
/// sono verificati in modo atomico. L'amministrazione può registrare eccezioni.
/// </summary>
public static class BookingEndpoints
{
    public sealed record RefundInput(string? Note);
    public sealed record BookingInput(Guid LessonId, Guid? MemberId, Guid? MemberPlanId, Guid? PlanId, bool? Override, string? Note);
    public sealed record BookingDto(Guid Id, Guid LessonId, Guid MemberId, string MemberName, string ClassName, string Date, string StartTime, string Status,
        bool EntryConsumed, Guid? MemberPlanId, DateTime BookedAt, DateTime? CancelledAt, string Note);
    public sealed record OpenLessonDto(Guid Id, Guid ClassId, string ClassName, string Date, string StartTime, string EndTime, int Capacity, int Taken, int? LevelRank, double HoursToStart, int? OpensHoursBefore)
    {
        /// <summary>La finestra di prenotazione della lezione singola è aperta</summary>
        public bool BookableNow => OpensHoursBefore is null || HoursToStart <= OpensHoursBefore;
    }

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
                           (extract(epoch from (app.local_instant(l.date, l.start_time) - now())) / 3600.0)::float8 as hours_to_start,
                           (select (s->'booking'->>'opensHoursBefore')::int from app.settings() s) as opens_hours_before
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
                int? opens;
                int closes;
                if (input.MemberPlanId is { } mpId)
                {
                    // Ingresso di un pacchetto: si blocca la riga del piano per scalare il saldo senza doppi utilizzi
                    var mp = await c.QuerySingleOrDefaultAsync<PackRow>(@"
                        select mp.id, mp.member_id, mp.status, mp.valid_from::timestamp as valid_from, mp.valid_until::timestamp as valid_until,
                               mp.entries_total, mp.entries_used, p.booking_opens_hours_before, p.booking_closes_hours_before, p.lesson_minutes, p.age_min_months, p.age_max_months,
                               (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_reserved
                        from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id where mp.id = @mpId for update of mp", new { mpId }, tx)
                        ?? throw ApiException.NotFound("Pacchetto");
                    if (mp.MemberId != subject) throw ApiException.Forbidden("Il pacchetto appartiene a un'altra persona.");
                    if (mp.EntriesTotal is null) throw ApiException.Conflict("not_a_package", "Questo piano non è un pacchetto a ingressi.");
                    if (mp.Status != "active" || lesson.Date < mp.ValidFrom || lesson.Date > mp.ValidUntil)
                        throw ApiException.Conflict("package_expired", "Il pacchetto non è valido per la data della lezione.");
                    // Saldo: ingressi già consumati più quelli impegnati da prenotazioni in corso
                    if (mp.EntriesUsed + mp.EntriesReserved >= mp.EntriesTotal) throw ApiException.Conflict("package_exhausted", "Il pacchetto non ha più ingressi disponibili.");
                    if (mp.LessonMinutes is { Length: > 0 } allowed && !allowed.Contains((short)lesson.Minutes))
                        throw ApiException.Conflict("lesson_not_covered", "Il pacchetto non copre lezioni di questa durata.");
                    await EnsureAgeMonths(c, tx, subject, mp.AgeMinMonths, mp.AgeMaxMonths);
                    opens = mp.BookingOpensHoursBefore;   // pacchetto: solo la finestra configurata sul piano
                    closes = mp.BookingClosesHoursBefore ?? settings.Booking.ClosesHoursBefore;
                    memberPlanId = mp.Id;
                }
                else
                {
                    // Lezione singola: serve una tariffa configurata dalla struttura (nessun prezzo nel codice)
                    var plan = await c.QuerySingleOrDefaultAsync<(Guid Id, string Name, int AmountCents, short? Opens, short? Closes)?>(@"
                        select id, name, amount_cents, booking_opens_hours_before, booking_closes_hours_before from app.fee_plans
                        where kind = 'single_lesson' and is_active and (@planId::uuid is null or id = @planId)
                          and (valid_from is null or @d::date >= valid_from) and (valid_until is null or @d::date <= valid_until)
                        order by position, name limit 1", new { planId = input.PlanId, d = lesson.Date }, tx);
                    if (plan is not { } p) throw ApiException.Conflict("single_lesson_not_configured", "La struttura non ha configurato la tariffa per le lezioni singole.");
                    opens = p.Opens ?? settings.Booking.OpensHoursBefore;
                    closes = p.Closes ?? settings.Booking.ClosesHoursBefore;
                    chargeId = await c.ExecuteScalarAsync<Guid>(@"
                        insert into app.member_charges (tenant_id, member_id, fee_plan_id, description, amount_cents, due_on, kind)
                        values (app.current_tenant(), @subject, @plan, @description, @amount, @due::date, 'plan') returning id",
                        new { subject, plan = p.Id, description = $"{p.Name} del {lesson.Date:dd/MM/yyyy}", amount = p.AmountCents, due = lesson.Date }, tx);
                }

                if (!exception && opens is { } o && lesson.HoursToStart > o)
                {
                    var from = await c.ExecuteScalarAsync<DateTime>("select (app.local_instant(l.date, l.start_time) - make_interval(hours => @o)) at time zone app.tenant_timezone() from app.lessons l where l.id = @id",
                        new { o, id = lesson.Id }, tx);
                    throw ApiException.Conflict("booking_not_open", $"Le prenotazioni per questa lezione si aprono {o} ore prima: dal {from:dd/MM} alle {from:HH:mm}.");
                }
                if (!exception && lesson.HoursToStart < closes)
                    throw ApiException.Conflict("too_late_to_book", closes > 0 ? $"La prenotazione va fatta almeno {closes} ore prima della lezione." : "La lezione è iniziata.");
                if (!exception) await LessonRules.EnsureAge(c, tx, subject, lesson.AgeMin, lesson.AgeMax);
                await LessonRules.EnsureSeat(c, tx, lesson);   // i posti si rispettano anche nelle eccezioni

                // Ingresso consumato subito solo se la struttura scala alla prenotazione; altrimenti alla presenza
                var consumeNow = memberPlanId is not null && settings.Packages.ConsumeOn == "booking";
                if (consumeNow)
                    await c.ExecuteAsync("update app.member_plans set entries_used = entries_used + 1 where id = @id", new { id = memberPlanId }, tx);
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.lesson_bookings (tenant_id, lesson_id, member_id, member_plan_id, charge_id, entry_consumed, consumed_by, booked_by, note)
                    values (app.current_tenant(), @lesson, @subject, @memberPlanId, @chargeId, @consumed, @by, @user, @note) returning id",
                    new { lesson = lesson.Id, subject, memberPlanId, chargeId, consumed = consumeNow, by = consumeNow ? "booking" : null, user = m.UserId,
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
                // Disdetta tardiva con ingresso non ancora scalato (scalo alla presenza): l'ingresso si consuma ora
                var consumeLate = keepCost && !b.EntryConsumed && b.MemberPlanId is not null;
                if (consumeLate)
                    await c.ExecuteAsync("update app.member_plans set entries_used = entries_used + 1 where id = @id", new { id = b.MemberPlanId }, tx);
                var stillConsumed = keepCost && (b.EntryConsumed || consumeLate);
                await c.ExecuteAsync(@"update app.lesson_bookings set status = @s, cancelled_at = now(), entry_consumed = @consumed,
                    consumed_by = case when not @consumed then null when @lateBy::text is not null then @lateBy else consumed_by end where id = @id",
                    new { id, s = late ? "late_cancelled" : "cancelled", consumed = stillConsumed, lateBy = consumeLate ? "late_cancel" : null }, tx);
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

        // Restituzione manuale di un ingresso: l'ingresso scalato (assenza senza disdetta, disdetta tardiva,
        // presenza) torna nel saldo del pacchetto. Solo l'amministrazione, con motivo e traccia nell'audit.
        g.MapPost("/{id:guid}/refund", async (HttpContext ctx, Db db, Guid id, RefundInput? input) =>
        {
            var m = ctx.Member();
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var b = await c.QuerySingleOrDefaultAsync<(Guid MemberId, Guid? MemberPlanId, bool EntryConsumed, string? ConsumedBy, string Note)?>(
                    "select member_id, member_plan_id, entry_consumed, consumed_by, note from app.lesson_bookings where id = @id for update", new { id }, tx)
                    ?? throw ApiException.NotFound("Prenotazione");
                if (b.MemberPlanId is null) throw ApiException.Conflict("not_a_package", "La prenotazione non usa un pacchetto a ingressi.");
                if (!b.EntryConsumed) throw ApiException.Conflict("not_consumed", "L'ingresso non è stato scalato: non c'è nulla da restituire.");
                await c.ExecuteAsync("update app.member_plans set entries_used = greatest(entries_used - 1, 0) where id = @plan", new { plan = b.MemberPlanId }, tx);
                var reason = string.IsNullOrWhiteSpace(input?.Note) ? "" : $" {input!.Note!.Trim()}";
                await c.ExecuteAsync("update app.lesson_bookings set entry_consumed = false, consumed_by = 'refunded', note = trim(note || @suffix) where id = @id",
                    new { id, suffix = $" [Ingresso restituito dalla segreteria{(reason.Length > 0 ? ":" + reason : "")}]" }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "booking.refund_entry", id.ToString(), new { b.MemberPlanId, previous = b.ConsumedBy, input?.Note });
                await Notifications.Notifier.ToUsers(c, tx, await Notifications.Notifier.UsersOfMember(c, tx, b.MemberId), "lessons", "Ingresso restituito",
                    "La segreteria ti ha restituito un ingresso del pacchetto.", m.UserId, link: "/profilo/quote");
                var left = await c.ExecuteScalarAsync<int>(@"select mp.entries_total - mp.entries_used
                    - (select count(*)::int from app.lesson_bookings x where x.member_plan_id = mp.id and x.status = 'booked' and not x.entry_consumed and x.consumed_by is distinct from 'refunded')
                    from app.member_plans mp where mp.id = @plan", new { plan = b.MemberPlanId }, tx);
                return new { id, entriesLeft = left };
            });
            return Results.Ok(result);
        }).RequireMember(Roles.Admin);
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
        public short? BookingOpensHoursBefore { get; init; }
        public short? BookingClosesHoursBefore { get; init; }
        public int EntriesReserved { get; init; }
        public short[]? LessonMinutes { get; init; }
        public short? AgeMinMonths { get; init; }
        public short? AgeMaxMonths { get; init; }
    }

    /// <summary>
    /// Presenza registrata dall'insegnante su una prenotazione con pacchetto: se la struttura scala
    /// alla partecipazione, l'ingresso si consuma con la presenza (e con l'assenza, se "noShowConsumesEntry").
    /// Togliere la presenza restituisce l'ingresso.
    /// </summary>
    internal static async Task OnAttendance(System.Data.IDbConnection c, System.Data.IDbTransaction tx, TenantSettings s, Guid lessonId, Guid memberId, string? actual)
    {
        if (s.Packages.ConsumeOn != "attendance") return;
        var b = await c.QuerySingleOrDefaultAsync<(Guid Id, Guid? PlanId, bool Consumed, string? By)?>(@"
            select id, member_plan_id, entry_consumed, consumed_by from app.lesson_bookings
            where lesson_id = @lessonId and member_id = @memberId and status = 'booked' and member_plan_id is not null for update", new { lessonId, memberId }, tx);
        if (b is not { } k) return;
        if (k.By == "refunded") return;   // restituito a mano dalla segreteria: la presenza registrata dopo non lo riscala
        var shouldConsume = actual == "present" || (actual == "absent" && s.Booking.NoShowConsumesEntry);
        if (shouldConsume && !k.Consumed)
        {
            await c.ExecuteAsync("update app.member_plans set entries_used = entries_used + 1 where id = @id", new { id = k.PlanId }, tx);
            await c.ExecuteAsync("update app.lesson_bookings set entry_consumed = true, consumed_by = @by where id = @id",
                new { id = k.Id, by = actual == "present" ? "attendance" : "no_show" }, tx);
        }
        else if (!shouldConsume && k.Consumed && k.By is "attendance" or "no_show")
        {
            await c.ExecuteAsync("update app.member_plans set entries_used = greatest(entries_used - 1, 0) where id = @id", new { id = k.PlanId }, tx);
            await c.ExecuteAsync("update app.lesson_bookings set entry_consumed = false, consumed_by = null where id = @id", new { id = k.Id }, tx);
        }
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

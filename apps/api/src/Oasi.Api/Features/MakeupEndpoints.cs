using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Recuperi. Si può chiedere un recupero solo con un diritto residuo, nato da
/// un'assenza valida (vedi MakeupCredits). Il recupero avviene entro la validità
/// del piano che lo ha generato, in una classe dello stesso livello o — se la
/// struttura lo consente — di livello inferiore; mai superiore. I posti sono
/// verificati in modo atomico lato server.
/// </summary>
public static class MakeupEndpoints
{
    public sealed record MakeupDto(Guid Id, Guid MemberId, string MemberName, Guid? MissedLessonId, Guid TargetLessonId, string TargetClassName,
        string TargetDate, string TargetStartTime, string Status, DateTime RequestedAt, string? Note);
    public sealed record CreditDto(Guid Id, Guid MemberId, Guid SourceLessonId, string SourceClassName, string SourceDate, string Status, string ExpiresOn, Guid? MemberPlanId);
    public sealed record MakeupInput(Guid? MemberId, Guid? MissedLessonId, Guid TargetLessonId, string? Note);
    public sealed record DecisionInput(bool Approve, string? Note);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/makeups").RequireAuthorization().RequireModule("makeups");

        g.MapGet("/", async (HttpContext ctx, Db db, string? status) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var children = await Relations.ChildrenOf(c, tx, m);
                return await c.QueryAsync<MakeupDto>(@"
                    select r.id, r.member_id, mb.first_name || ' ' || mb.last_name as member_name, r.missed_lesson_id, r.target_lesson_id,
                           c.name as target_class_name, to_char(l.date, 'YYYY-MM-DD') as target_date, to_char(l.start_time, 'HH24:MI') as target_start_time,
                           r.status, r.requested_at, r.note
                    from app.makeup_requests r
                    join app.lessons l on l.id = r.target_lesson_id join app.classes c on c.id = l.class_id
                    join app.members mb on mb.id = r.member_id
                    where (@status::text is null or r.status = @status)
                      and (@admin or r.member_id = @me or r.member_id = any(@children)
                           or (@teacher and exists(select 1 from app.class_teachers ct where ct.class_id = l.class_id and ct.member_id = @me)))
                    order by l.date, l.start_time",
                    new { status, admin = m.IsAdmin, teacher = m.IsTeacher, me = m.MemberId, children }, tx);
            });
        }).RequireMember();

        // Recuperi disponibili, utilizzati, residui e storico di una persona
        g.MapGet("/credits", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (subject != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, subject, "view");
                await MakeupCredits.ExpireOld(c, tx);
                var credits = (await c.QueryAsync<CreditDto>(@"
                    select k.id, k.member_id, k.source_lesson_id, c.name as source_class_name, to_char(l.date, 'YYYY-MM-DD') as source_date,
                           k.status, to_char(k.expires_on, 'YYYY-MM-DD') as expires_on, k.member_plan_id
                    from app.makeup_credits k join app.lessons l on l.id = k.source_lesson_id join app.classes c on c.id = l.class_id
                    where k.member_id = @subject and k.status <> 'cancelled' order by l.date desc", new { subject }, tx)).ToList();
                return new
                {
                    available = credits.Count(k => k.Status == "available"),
                    reserved = credits.Count(k => k.Status == "reserved"),
                    used = credits.Count(k => k.Status == "used"),
                    expired = credits.Count(k => k.Status == "expired"),
                    credits,
                };
            });
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, MakeupInput input) =>
        {
            var m = ctx.Member();
            var subject = input.MemberId ?? m.MemberId;
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "attendance");
                var settings = await TenantSettings.Load(c, tx);
                var target = await CalendarEndpoints.LoadLesson(c, tx, input.TargetLessonId);
                if (target.Status == "cancelled" || target.Started)
                    throw ApiException.Conflict("lesson_unavailable", "La lezione scelta non è disponibile per un recupero.");
                // Finestra impostata dall'amministrazione: da quante ore prima a quante ore prima della lezione
                // Finestra in giorni (un giorno = 24 ore prima dell'inizio della lezione)
                if (settings.Makeups.RequestOpensDaysBefore is { } opens && target.HoursToStart > opens * 24)
                    throw ApiException.Conflict("makeup_not_open", $"Il recupero per questa lezione si può chiedere a partire da {opens} {(opens == 1 ? "giorno" : "giorni")} prima.");
                if (settings.Makeups.RequestClosesDaysBefore is var closes and > 0 && target.HoursToStart < closes * 24)
                    throw ApiException.Conflict("makeup_too_late", $"Il recupero va chiesto almeno {closes} {(closes == 1 ? "giorno" : "giorni")} prima della lezione.");

                // Diritto residuo: quello dell'assenza indicata, oppure il più vicino alla scadenza
                await MakeupCredits.ExpireOld(c, tx);
                var credit = await c.QuerySingleOrDefaultAsync<(Guid Id, Guid SourceLessonId, DateTime ExpiresOn, Guid SourceClassId, int? SourceRank)?>(@"
                    select k.id, k.source_lesson_id, k.expires_on::timestamp, l.class_id, lv.rank
                    from app.makeup_credits k join app.lessons l on l.id = k.source_lesson_id
                    join app.classes sc on sc.id = l.class_id left join app.levels lv on lv.id = sc.level_id
                    where k.member_id = @subject and k.status = 'available' and (@missed::uuid is null or k.source_lesson_id = @missed)
                    order by k.expires_on, l.date limit 1 for update of k", new { subject, missed = input.MissedLessonId }, tx);
                if (credit is not { } k)
                    throw ApiException.Conflict("no_makeup_credit", input.MissedLessonId is null
                        ? "Non hai recuperi disponibili: un recupero nasce da un'assenza valida."
                        : "Questa assenza non dà diritto a un recupero (o è già stato usato).");
                if (target.Date > k.ExpiresOn)
                    throw ApiException.Conflict("credit_expired_before_lesson", $"Il recupero va fatto entro il {k.ExpiresOn:dd/MM/yyyy}, scadenza del piano.");

                var alreadyEnrolled = await c.ExecuteScalarAsync<bool>(
                    "select exists(select 1 from app.enrollments where class_id = @classId and member_id = @subject and status = 'approved')",
                    new { classId = target.ClassId, subject }, tx);
                if (alreadyEnrolled) throw ApiException.Conflict("already_in_class", "Sei già iscritta a questa classe.");
                var duplicate = await c.ExecuteScalarAsync<bool>(
                    "select exists(select 1 from app.makeup_requests where target_lesson_id = @id and member_id = @subject and status in ('requested', 'approved'))",
                    new { id = target.Id, subject }, tx);
                if (duplicate) throw ApiException.Conflict("already_requested", "Hai già un recupero su questa lezione.");

                // Livello: stesso livello, oppure inferiore se consentito; mai superiore
                if (k.SourceRank is { } own && target.LevelRank is { } wanted)
                {
                    if (wanted > own) throw ApiException.Conflict("higher_level", "Non puoi recuperare in una classe di livello superiore.");
                    if (wanted < own && !settings.Makeups.AllowLowerLevel) throw ApiException.Conflict("lower_level_not_allowed", "Il recupero è consentito solo in classi dello stesso livello.");
                }
                if (settings.Makeups.SameDisciplineOnly)
                {
                    var shared = await c.ExecuteScalarAsync<bool>(@"select exists(select 1 from app.class_disciplines a join app.class_disciplines b on b.discipline_id = a.discipline_id
                        where a.class_id = @source and b.class_id = @target)", new { source = k.SourceClassId, target = target.ClassId }, tx);
                    if (!shared) throw ApiException.Conflict("different_discipline", "Il recupero è consentito solo in classi della stessa disciplina.");
                }
                await LessonRules.EnsureAge(c, tx, subject, target.AgeMin, target.AgeMax);
                await LessonRules.EnsureSeat(c, tx, target);

                await c.ExecuteAsync("update app.makeup_credits set status = 'reserved' where id = @id", new { id = k.Id }, tx);
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.makeup_requests (tenant_id, member_id, missed_lesson_id, target_lesson_id, requested_by, note, credit_id)
                    values (app.current_tenant(), @subject, @missed, @TargetLessonId, @user, @Note, @credit) returning id",
                    new { subject, missed = k.SourceLessonId, input.TargetLessonId, user = m.UserId, input.Note, credit = k.Id }, tx);
                var staff = await c.QueryAsync<Guid>(@"select mb.user_id from app.class_teachers ct join app.members mb on mb.id = ct.member_id
                    where ct.class_id = @classId and mb.user_id is not null", new { classId = target.ClassId }, tx);
                await Notifier.ToUsers(c, tx, staff.Concat(await Notifier.UsersWithRoles(c, tx, Roles.Admin)), "makeups", "Nuova richiesta di recupero",
                    $"Lezione del {target.Date:dd/MM}.", m.UserId, link: $"/lezioni/{target.Id}");
                return newId;
            });
            return Results.Created($"/v1/makeups/{id}", new { id, status = "requested" });
        }).RequireMember();

        // L'interessata ritira la richiesta: il diritto torna disponibile
        g.MapPost("/{id:guid}/cancel", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var r = await c.QuerySingleOrDefaultAsync<(Guid MemberId, Guid TargetLessonId, string Status, Guid? CreditId)?>(
                    "select member_id, target_lesson_id, status, credit_id from app.makeup_requests where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Richiesta");
                await Relations.EnsureCanActFor(c, tx, m, r.MemberId, "attendance");
                if (r.Status is not ("requested" or "approved")) throw ApiException.Conflict("already_decided", "La richiesta non è più attiva.");
                var settings = await TenantSettings.Load(c, tx);
                var lesson = await CalendarEndpoints.LoadLesson(c, tx, r.TargetLessonId);
                if (lesson.Started) throw ApiException.Conflict("lesson_started", "La lezione è già iniziata.");
                // Disdetta tardiva di un recupero approvato: il diritto si considera utilizzato (se la struttura lo prevede)
                var late = r.Status == "approved" && lesson.HoursToStart < settings.Booking.CancelHoursBefore && settings.Booking.LateCancelConsumesEntry && !m.IsAdmin;
                await c.ExecuteAsync("update app.makeup_requests set status = 'cancelled', decided_at = now(), note = trim(coalesce(note, '') || @suffix) where id = @id",
                    new { id, suffix = late ? " [Disdetta tardiva]" : "" }, tx);
                if (r.CreditId is not null)
                    await c.ExecuteAsync("update app.makeup_credits set status = @s where id = @credit", new { s = late ? "used" : "available", credit = r.CreditId }, tx);
            });
            return Results.NoContent();
        }).RequireMember();

        g.MapPost("/{id:guid}/decision", async (HttpContext ctx, Db db, Guid id, DecisionInput input) =>
        {
            var m = ctx.Member();
            var status = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var r = await c.QuerySingleOrDefaultAsync<(Guid TargetLessonId, string Status, Guid? CreditId, Guid MemberId)?>(
                    "select target_lesson_id, status, credit_id, member_id from app.makeup_requests where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Richiesta");
                var lesson = await CalendarEndpoints.LoadLesson(c, tx, r.TargetLessonId);
                await Relations.EnsureCanManageClass(c, tx, m, lesson.ClassId);
                if (r.Status != "requested") throw ApiException.Conflict("already_decided", "La richiesta è già stata gestita.");
                if (input.Approve)
                {
                    // La richiesta occupa già un posto: qui si verifica solo che la capienza non sia stata superata nel frattempo
                    var capacity = await c.ExecuteScalarAsync<int>("select capacity from app.classes where id = @classId for update", new { classId = lesson.ClassId }, tx);
                    var taken = await c.ExecuteScalarAsync<int>("select app.lesson_taken(@lessonId)", new { lessonId = lesson.Id }, tx);
                    if (taken > capacity) throw ApiException.Conflict("lesson_full", "La lezione non ha più posti disponibili.");
                }
                var next = input.Approve ? "approved" : "rejected";
                await c.ExecuteAsync("update app.makeup_requests set status = @next, decided_by = @user, decided_at = now(), note = coalesce(@Note, note) where id = @id",
                    new { id, next, user = m.UserId, input.Note }, tx);
                if (r.CreditId is not null)
                    await c.ExecuteAsync("update app.makeup_credits set status = @s where id = @credit", new { s = input.Approve ? "used" : "available", credit = r.CreditId }, tx);
                await Notifier.ToUsers(c, tx, await Notifier.UsersOfMember(c, tx, r.MemberId), "makeups",
                    input.Approve ? "Recupero confermato" : "Recupero non accettato", input.Note ?? $"Lezione del {lesson.Date:dd/MM}.", m.UserId, link: "/calendario");
                return next;
            });
            return Results.Ok(new { id, status });
        }).RequireMember(Roles.Admin, Roles.Teacher);
    }
}

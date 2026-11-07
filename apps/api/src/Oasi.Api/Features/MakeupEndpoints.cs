using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Richieste di recupero: l'allieva sceglie una lezione disponibile, l'insegnante o l'admin decide.</summary>
public static class MakeupEndpoints
{
    public sealed record MakeupDto(Guid Id, Guid MemberId, string MemberName, Guid? MissedLessonId, Guid TargetLessonId, string TargetClassName,
        string TargetDate, string TargetStartTime, string Status, DateTime RequestedAt, string? Note);
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

        g.MapPost("/", async (HttpContext ctx, Db db, MakeupInput input) =>
        {
            var m = ctx.Member();
            var subject = input.MemberId ?? m.MemberId;
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "attendance");
                var target = await CalendarEndpoints.LoadLesson(c, tx, input.TargetLessonId);
                if (target.Status == "cancelled" || target.Starts <= DateTime.Now)
                    throw ApiException.Conflict("lesson_unavailable", "La lezione scelta non è disponibile per un recupero.");
                if (input.MissedLessonId is { } missed)
                {
                    var ok = await c.ExecuteScalarAsync<bool>(@"select exists(select 1 from app.lessons l join app.enrollments e on e.class_id = l.class_id
                        where l.id = @missed and e.member_id = @subject and e.status = 'approved')", new { missed, subject }, tx);
                    if (!ok) throw ApiException.Conflict("not_own_lesson", "La lezione da recuperare non è una delle tue.");
                }
                var alreadyEnrolled = await c.ExecuteScalarAsync<bool>(
                    "select exists(select 1 from app.enrollments where class_id = @classId and member_id = @subject and status = 'approved')",
                    new { classId = target.ClassId, subject }, tx);
                if (alreadyEnrolled) throw ApiException.Conflict("already_in_class", "Sei già iscritta a questa classe.");
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.makeup_requests (tenant_id, member_id, missed_lesson_id, target_lesson_id, requested_by, note)
                    values (app.current_tenant(), @subject, @MissedLessonId, @TargetLessonId, @user, @Note) returning id",
                    new { subject, input.MissedLessonId, input.TargetLessonId, user = m.UserId, input.Note }, tx);
            });
            return Results.Created($"/v1/makeups/{id}", new { id, status = "requested" });
        }).RequireMember();

        g.MapPost("/{id:guid}/decision", async (HttpContext ctx, Db db, Guid id, DecisionInput input) =>
        {
            var m = ctx.Member();
            var status = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var r = await c.QuerySingleOrDefaultAsync<(Guid TargetLessonId, string Status)?>(
                    "select target_lesson_id, status from app.makeup_requests where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Richiesta");
                var lesson = await CalendarEndpoints.LoadLesson(c, tx, r.TargetLessonId);
                await Relations.EnsureCanManageClass(c, tx, m, lesson.ClassId);
                if (r.Status != "requested") throw ApiException.Conflict("already_decided", "La richiesta è già stata gestita.");
                if (input.Approve)
                {
                    var (capacity, taken) = await c.QuerySingleAsync<(int, int)>(@"
                        select c.capacity,
                          (select count(*)::int from app.enrollments e where e.class_id = c.id and e.status = 'approved')
                          + (select count(*)::int from app.makeup_requests x where x.target_lesson_id = @lessonId and x.status = 'approved')
                        from app.classes c where c.id = @classId for update", new { classId = lesson.ClassId, lessonId = lesson.Id }, tx);
                    if (taken >= capacity) throw ApiException.Conflict("lesson_full", "La lezione non ha più posti disponibili.");
                }
                var next = input.Approve ? "approved" : "rejected";
                await c.ExecuteAsync("update app.makeup_requests set status = @next, decided_by = @user, decided_at = now(), note = coalesce(@Note, note) where id = @id",
                    new { id, next, user = m.UserId, input.Note }, tx);
                return next;
            });
            return Results.Ok(new { id, status });
        }).RequireMember(Roles.Admin, Roles.Teacher);
    }
}

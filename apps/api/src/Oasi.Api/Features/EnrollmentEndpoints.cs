using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Richieste di iscrizione alle classi, con approvazione o rifiuto.</summary>
public static class EnrollmentEndpoints
{
    public sealed record EnrollmentDto(Guid Id, Guid ClassId, string ClassName, Guid MemberId, string MemberName, string Status, DateTime RequestedAt, DateTime? DecidedAt, string? Note);
    public sealed record RequestInput(Guid ClassId, Guid? MemberId, string? Note);
    public sealed record DecisionInput(bool Approve, string? Note);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/enrollments").RequireAuthorization().RequireModule("bookings");

        g.MapGet("/", async (HttpContext ctx, Db db, string? status) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var children = await Relations.ChildrenOf(c, tx, m);
                return await c.QueryAsync<EnrollmentDto>(@"
                    select e.id, e.class_id, c.name as class_name, e.member_id, mb.first_name || ' ' || mb.last_name as member_name,
                           e.status, e.requested_at, e.decided_at, e.note
                    from app.enrollments e join app.classes c on c.id = e.class_id join app.members mb on mb.id = e.member_id
                    where (@status::text is null or e.status = @status)
                      and (@admin
                           or e.member_id = @me or e.member_id = any(@children)
                           or (@teacher and exists(select 1 from app.class_teachers ct where ct.class_id = e.class_id and ct.member_id = @me)))
                    order by e.requested_at desc",
                    new { status, admin = m.IsAdmin, teacher = m.IsTeacher, me = m.MemberId, children }, tx);
            });
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, RequestInput input) =>
        {
            var m = ctx.Member();
            var subject = input.MemberId ?? m.MemberId;
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                var cls = await c.QuerySingleOrDefaultAsync<(bool IsActive, int? AgeMin, int? AgeMax)?>(
                    "select is_active, age_min::int, age_max::int from app.classes where id = @ClassId", new { input.ClassId }, tx)
                    ?? throw ApiException.NotFound("Classe");
                if (!cls.IsActive) throw ApiException.Conflict("class_inactive", "La classe non accetta iscrizioni.");
                var age = await c.ExecuteScalarAsync<int?>("select extract(year from age(birth_date))::int from app.members where id = @subject", new { subject }, tx);
                if (age is not null && ((cls.AgeMin is { } min && age < min) || (cls.AgeMax is { } max && age > max)))
                    throw ApiException.Conflict("age_out_of_range", "L'età non rientra nella fascia prevista dalla classe.");
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.enrollments (tenant_id, class_id, member_id, status, requested_by, note)
                    values (app.current_tenant(), @ClassId, @subject, 'requested', @user, @Note) returning id",
                    new { input.ClassId, subject, user = m.UserId, input.Note }, tx);
            });
            return Results.Created($"/v1/enrollments/{id}", new { id, status = "requested" });
        }).RequireMember();

        g.MapPost("/{id:guid}/decision", async (HttpContext ctx, Db db, Guid id, DecisionInput input) =>
        {
            var m = ctx.Member();
            var status = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var e = await c.QuerySingleOrDefaultAsync<(Guid ClassId, string Status)?>(
                    "select class_id, status from app.enrollments where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Richiesta");
                await Relations.EnsureCanManageClass(c, tx, m, e.ClassId);
                if (e.Status != "requested") throw ApiException.Conflict("already_decided", "La richiesta è già stata gestita.");
                if (input.Approve)
                {
                    // Blocca la classe per evitare di superare la capienza con approvazioni concorrenti
                    var (capacity, enrolled) = await c.QuerySingleAsync<(int, int)>(@"
                        select c.capacity, (select count(*)::int from app.enrollments x where x.class_id = c.id and x.status = 'approved')
                        from app.classes c where c.id = @classId for update", new { classId = e.ClassId }, tx);
                    if (enrolled >= capacity) throw ApiException.Conflict("class_full", "La classe ha raggiunto la capienza massima.");
                }
                var next = input.Approve ? "approved" : "rejected";
                await c.ExecuteAsync("update app.enrollments set status = @next, decided_by = @user, decided_at = now(), note = coalesce(@Note, note) where id = @id",
                    new { id, next, user = m.UserId, input.Note }, tx);
                return next;
            });
            return Results.Ok(new { id, status });
        }).RequireMember(Roles.Admin, Roles.Teacher);
    }
}

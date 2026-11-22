using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Richieste di iscrizione alle classi, con approvazione o rifiuto.</summary>
public static class EnrollmentEndpoints
{
    public sealed record EnrollmentDto(Guid Id, Guid ClassId, string ClassName, Guid MemberId, string MemberName, string Status, DateTime RequestedAt, DateTime? DecidedAt, string? Note,
        Guid? PlanId = null, string? PlanName = null);
    /// <summary>Con la richiesta l'atleta sceglie il piano (obbligatorio se la struttura ha piani per la classe)</summary>
    public sealed record RequestInput(Guid ClassId, Guid? MemberId, string? Note, Guid? PlanId = null);
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
                           e.status, e.requested_at, e.decided_at, e.note, e.plan_id, p.name as plan_name
                    from app.enrollments e join app.classes c on c.id = e.class_id join app.members mb on mb.id = e.member_id
                    left join app.fee_plans p on p.id = e.plan_id
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
                var cls = await c.QuerySingleOrDefaultAsync<(bool IsActive, short? AgeMin, short? AgeMax, int Capacity, int Enrolled)?>(@"
                    select is_active, age_min, age_max, capacity::int,
                           (select count(*)::int from app.enrollments x where x.class_id = c.id and x.status = 'approved')
                    from app.classes c where id = @ClassId", new { input.ClassId }, tx)
                    ?? throw ApiException.NotFound("Classe");
                if (!cls.IsActive) throw ApiException.Conflict("class_inactive", "La classe non accetta iscrizioni.");
                // Classe piena: la richiesta viene bloccata subito (il controllo definitivo, con blocco, è all'approvazione)
                if (cls.Enrolled >= cls.Capacity) throw ApiException.Conflict("class_full", "La classe ha raggiunto la capienza massima.");
                await LessonRules.EnsureAge(c, tx, subject, cls.AgeMin, cls.AgeMax);
                var planId = await PlanEndpoints.EnsureSelectable(c, tx, input.ClassId, input.PlanId);
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.enrollments (tenant_id, class_id, member_id, status, requested_by, note, plan_id)
                    values (app.current_tenant(), @ClassId, @subject, 'requested', @user, @Note, @planId) returning id",
                    new { input.ClassId, subject, user = m.UserId, input.Note, planId }, tx);
            });
            return Results.Created($"/v1/enrollments/{id}", new { id, status = "requested" });
        }).RequireMember();

        g.MapPost("/{id:guid}/decision", async (HttpContext ctx, Db db, Guid id, DecisionInput input) =>
        {
            var m = ctx.Member();
            var status = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var e = await c.QuerySingleOrDefaultAsync<(Guid ClassId, string Status, Guid MemberId, Guid? PlanId)?>(
                    "select class_id, status, member_id, plan_id from app.enrollments where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Richiesta");
                await Relations.EnsureCanManageClass(c, tx, m, e.ClassId);
                if (e.Status != "requested") throw ApiException.Conflict("already_decided", "La richiesta è già stata gestita.");
                if (input.Approve)
                {
                    // Blocca la classe per evitare di superare la capienza con approvazioni concorrenti
                    var (capacity, competitiveLevel) = await c.QuerySingleAsync<(int, string)>(
                        "select capacity::int, competitive_level from app.classes where id = @classId for update", new { classId = e.ClassId }, tx);
                    var enrolled = await c.ExecuteScalarAsync<int>("select count(*) from app.enrollments where class_id = @classId and status = 'approved'", new { classId = e.ClassId }, tx);
                    if (enrolled >= capacity) throw ApiException.Conflict("class_full", "La classe ha raggiunto la capienza massima.");
                    // Classe agonistica o preagonistica: serve il certificato approvato e valido
                    await Competitive.EnsureCertificateForClass(c, tx, e.MemberId, competitiveLevel);
                }
                var next = input.Approve ? "approved" : "rejected";
                await c.ExecuteAsync("update app.enrollments set status = @next, decided_by = @user, decided_at = now(), note = coalesce(@Note, note) where id = @id",
                    new { id, next, user = m.UserId, input.Note }, tx);
                // Il piano scelto parte dal giorno in cui l'iscrizione viene accettata
                if (input.Approve && e.PlanId is { } planId) await PlanEndpoints.Subscribe(c, tx, e.MemberId, e.ClassId, planId, m.UserId);
                return next;
            });
            return Results.Ok(new { id, status });
        }).RequireMember(Roles.Admin, Roles.Teacher);
    }
}

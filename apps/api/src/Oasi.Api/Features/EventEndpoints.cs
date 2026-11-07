using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Eventi (workshop, stage, gare, saggi, spettacoli…) con capienza e scadenza delle adesioni.</summary>
public static class EventEndpoints
{
    public static readonly string[] Types = ["workshop", "stage", "competition", "recital", "show", "exhibition", "special", "social"];

    public sealed record EventDto(Guid Id, string Type, string Title, string Description, string Date, string StartTime, string EndTime, string Location,
        string? ImagePath, int Capacity, DateTime? SignupDeadline, int Signups, bool Joined);
    public sealed record EventInput(string Type, string Title, string? Description, string Date, string StartTime, string EndTime, string? Location,
        string? ImagePath, int Capacity, DateTime? SignupDeadline);
    public sealed record SignupInput(Guid? MemberId);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/events").RequireAuthorization().RequireModule("events");

        g.MapGet("/", async (HttpContext ctx, Db db, bool? past) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<EventDto>(@"
                select e.id, e.type, e.title, e.description, to_char(e.date, 'YYYY-MM-DD') as date, to_char(e.start_time, 'HH24:MI') as start_time,
                       to_char(e.end_time, 'HH24:MI') as end_time, e.location, e.image_path, e.capacity, e.signup_deadline,
                       (select count(*)::int from app.event_signups s where s.event_id = e.id and s.status = 'confirmed') as signups,
                       exists(select 1 from app.event_signups s where s.event_id = e.id and s.member_id = @me and s.status = 'confirmed') as joined
                from app.events e where (@past and e.date < current_date) or (not @past and e.date >= current_date)
                order by e.date", new { me = m.MemberId, past = past ?? false }, tx));
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, EventInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<Guid>(@"
                insert into app.events (tenant_id, type, title, description, date, start_time, end_time, location, image_path, capacity, signup_deadline)
                values (app.current_tenant(), @Type, @Title, coalesce(@Description, ''), @Date::date, @StartTime::time, @EndTime::time, coalesce(@Location, ''), @ImagePath, @Capacity, @SignupDeadline)
                returning id", input, tx));
            return Results.Created($"/v1/events/{id}", new { id });
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, EventInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var signups = await c.ExecuteScalarAsync<int>("select count(*) from app.event_signups where event_id = @id and status = 'confirmed'", new { id }, tx);
                if (input.Capacity < signups) throw ApiException.Conflict("capacity_below_signups", $"Ci sono già {signups} adesioni.");
                return await c.ExecuteAsync(@"update app.events set type = @Type, title = @Title, description = coalesce(@Description, ''), date = @Date::date,
                    start_time = @StartTime::time, end_time = @EndTime::time, location = coalesce(@Location, ''), image_path = @ImagePath,
                    capacity = @Capacity, signup_deadline = @SignupDeadline where id = @id",
                    new { id, input.Type, input.Title, input.Description, input.Date, input.StartTime, input.EndTime, input.Location, input.ImagePath, input.Capacity, input.SignupDeadline }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapGet("/{id:guid}/signups", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<(Guid MemberId, string Name, DateTime CreatedAt)>(@"
                select s.member_id, mb.first_name || ' ' || mb.last_name as name, s.created_at
                from app.event_signups s join app.members mb on mb.id = s.member_id
                where s.event_id = @id and s.status = 'confirmed' order by s.created_at", new { id }, tx)
                .ContinueWith(t => t.Result.Select(r => new { memberId = r.MemberId, name = r.Name, createdAt = r.CreatedAt })));
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapPost("/{id:guid}/signup", async (HttpContext ctx, Db db, Guid id, SignupInput? input) =>
        {
            var m = ctx.Member();
            var subject = input?.MemberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                var e = await c.QuerySingleOrDefaultAsync<(int Capacity, DateTime? SignupDeadline, DateTime Starts)?>(
                    "select capacity, signup_deadline, (date + start_time)::timestamp as starts from app.events where id = @id for update", new { id }, tx)
                    ?? throw ApiException.NotFound("Evento");
                var now = DateTime.UtcNow;
                if ((e.SignupDeadline is { } d && d < now) || e.Starts < DateTime.Now) throw ApiException.Conflict("signup_closed", "Le adesioni sono chiuse.");
                var count = await c.ExecuteScalarAsync<int>("select count(*) from app.event_signups where event_id = @id and status = 'confirmed'", new { id }, tx);
                if (count >= e.Capacity) throw ApiException.Conflict("event_full", "Posti esauriti.");
                await c.ExecuteAsync(@"insert into app.event_signups (tenant_id, event_id, member_id, status) values (app.current_tenant(), @id, @subject, 'confirmed')
                    on conflict (tenant_id, event_id, member_id) do update set status = 'confirmed', created_at = now()", new { id, subject }, tx);
            });
            return Results.NoContent();
        }).RequireMember();

        g.MapDelete("/{id:guid}/signup", async (HttpContext ctx, Db db, Guid id, Guid? memberId) =>
        {
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                await c.ExecuteAsync("update app.event_signups set status = 'cancelled' where event_id = @id and member_id = @subject", new { id, subject }, tx);
            });
            return Results.NoContent();
        }).RequireMember();
    }

    private static void Validate(EventInput i)
    {
        if (!Types.Contains(i.Type)) throw ApiException.Invalid("Tipo di evento non valido.");
        if (string.IsNullOrWhiteSpace(i.Title)) throw ApiException.Invalid("Inserisci un titolo.");
        if (!DateOnly.TryParse(i.Date, out _)) throw ApiException.Invalid("Data non valida.");
        if (!TimeOnly.TryParse(i.StartTime, out var s) || !TimeOnly.TryParse(i.EndTime, out var e) || e <= s) throw ApiException.Invalid("Orario non valido.");
        if (i.Capacity < 1) throw ApiException.Invalid("Capienza non valida.");
    }
}

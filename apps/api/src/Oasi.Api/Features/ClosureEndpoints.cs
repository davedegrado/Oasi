using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Chiusure della palestra (festività, scioperi, chiusure straordinarie) e
/// calendario generale. Una chiusura annulla le lezioni nelle sue date per
/// tutti i calendari; eliminandola le lezioni tornano regolari.
/// </summary>
public static class ClosureEndpoints
{
    public static readonly string[] Kinds = ["holiday", "strike", "closure"];

    public sealed record ClosureDto(Guid Id, string Kind, string Title, string StartDate, string EndDate, string Note, DateTime? ReminderSentAt, int CancelledLessons);
    public sealed record ClosureInput(string Kind, string Title, string StartDate, string EndDate, string? Note, bool? NotifyNow);

    private const string SelectClosures = @"
        select c.id, c.kind, c.title, to_char(c.start_date, 'YYYY-MM-DD') as start_date, to_char(c.end_date, 'YYYY-MM-DD') as end_date,
               c.note, c.reminder_sent_at, (select count(*)::int from app.lessons l where l.closure_id = c.id) as cancelled_lessons
        from app.closures c";

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/closures").RequireAuthorization().RequireModule("calendar");

        g.MapGet("/", async (HttpContext ctx, Db db, string? from, string? to) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<ClosureDto>(
                SelectClosures + " where (@from::date is null or c.end_date >= @from::date) and (@to::date is null or c.start_date <= @to::date) order by c.start_date",
                new { from, to }, tx));
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, ClosureInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.closures (tenant_id, kind, title, start_date, end_date, note, created_by)
                    values (app.current_tenant(), @Kind, @Title, @StartDate::date, @EndDate::date, coalesce(@Note, ''), @user) returning id",
                    new { input.Kind, input.Title, input.StartDate, input.EndDate, input.Note, user = m.UserId }, tx);
                await Apply(c, tx, newId);
                if (input.NotifyNow == true) await Remind(c, tx, newId, m.UserId);
                return newId;
            });
            return Results.Created($"/v1/closures/{id}", new { id });
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, ClosureInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Restore(c, tx, id);
                var n = await c.ExecuteAsync(@"update app.closures set kind = @Kind, title = @Title, start_date = @StartDate::date, end_date = @EndDate::date, note = coalesce(@Note, '')
                    where id = @id", new { id, input.Kind, input.Title, input.StartDate, input.EndDate, input.Note }, tx);
                if (n == 0) throw ApiException.NotFound("Chiusura");
                await Apply(c, tx, id);
                if (input.NotifyNow == true) await Remind(c, tx, id, m.UserId);
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        g.MapDelete("/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Restore(c, tx, id);
                return await c.ExecuteAsync("delete from app.closures where id = @id", new { id }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        g.MapPost("/{id:guid}/reminder", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, (c, tx) => Remind(c, tx, id, m.UserId));
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Calendario generale per l'amministrazione: lezioni, chiusure ed eventi
        app.MapGet("/v1/calendar", async (HttpContext ctx, Db db, string? from, string? to) =>
        {
            var m = ctx.Member();
            var start = DateOnly.TryParse(from, out var f) ? f : DateOnly.FromDateTime(DateTime.Now);
            var end = DateOnly.TryParse(to, out var t) ? t : start.AddDays(41);
            if (end < start || end.DayNumber - start.DayNumber > 62) throw ApiException.Invalid("Intervallo di date non valido (massimo 62 giorni).");
            var range = new { from = start.ToString("yyyy-MM-dd"), to = end.ToString("yyyy-MM-dd") };
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) => new
            {
                lessons = await c.QueryAsync(@"
                    select l.id, l.class_id, c.name as class_name, c.discipline_id, to_char(l.date, 'YYYY-MM-DD') as date,
                           to_char(l.start_time, 'HH24:MI') as start_time, to_char(l.end_time, 'HH24:MI') as end_time, l.status, l.closure_id, l.note
                    from app.lessons l join app.classes c on c.id = l.class_id
                    where l.date between @from::date and @to::date order by l.date, l.start_time", range, tx),
                closures = await c.QueryAsync<ClosureDto>(SelectClosures + " where c.end_date >= @from::date and c.start_date <= @to::date order by c.start_date", range, tx),
                events = await c.QueryAsync(@"
                    select id, type, title, to_char(date, 'YYYY-MM-DD') as date, to_char(start_time, 'HH24:MI') as start_time
                    from app.events where date between @from::date and @to::date order by date", range, tx),
            });
        }).RequireAuthorization().RequireModule("calendar").RequireMember(Roles.Admin);
    }

    private static void Validate(ClosureInput i)
    {
        if (!Kinds.Contains(i.Kind)) throw ApiException.Invalid("Tipo di chiusura non valido.");
        if (string.IsNullOrWhiteSpace(i.Title)) throw ApiException.Invalid("Indica il motivo della chiusura.");
        if (!DateOnly.TryParse(i.StartDate, out var s) || !DateOnly.TryParse(i.EndDate, out var e) || e < s)
            throw ApiException.Invalid("Date non valide: la fine deve essere uguale o successiva all'inizio.");
        if (e.DayNumber - s.DayNumber > 120) throw ApiException.Invalid("Una chiusura può durare al massimo 120 giorni.");
    }

    /// <summary>Annulla le lezioni nelle date della chiusura (quelle già annullate per altri motivi restano com'erano).</summary>
    internal static Task Apply(IDbConnection c, IDbTransaction tx, Guid closureId) =>
        c.ExecuteAsync(@"
            update app.lessons l set status = 'cancelled', closure_id = x.id,
              note = case when x.note = '' then x.title else x.title || ': ' || x.note end
            from app.closures x
            where x.id = @closureId and l.date between x.start_date and x.end_date and l.status <> 'cancelled'", new { closureId }, tx);

    /// <summary>Applica tutte le chiusure alle lezioni di una classe appena creata.</summary>
    internal static Task ApplyAllClosures(IDbConnection c, IDbTransaction tx, Guid classId) =>
        c.ExecuteAsync(@"
            update app.lessons l set status = 'cancelled', closure_id = x.id,
              note = case when x.note = '' then x.title else x.title || ': ' || x.note end
            from app.closures x
            where l.class_id = @classId and l.date between x.start_date and x.end_date and l.status <> 'cancelled'", new { classId }, tx);

    /// <summary>Riporta allo stato regolare solo le lezioni annullate da questa chiusura.</summary>
    private static Task Restore(IDbConnection c, IDbTransaction tx, Guid closureId) =>
        c.ExecuteAsync(@"
            update app.lessons l set status = 'scheduled', closure_id = null, note = null,
              start_time = c.start_time, end_time = c.end_time, original_start_time = null, original_end_time = null
            from app.classes c where c.id = l.class_id and l.closure_id = @closureId", new { closureId }, tx);

    private static async Task Remind(IDbConnection c, IDbTransaction tx, Guid closureId, Guid actor)
    {
        var x = await c.QuerySingleOrDefaultAsync<(string Title, DateTime Start, DateTime End, string Note)?>(
            "select title, start_date::timestamp, end_date::timestamp, note from app.closures where id = @closureId", new { closureId }, tx)
            ?? throw ApiException.NotFound("Chiusura");
        var it = System.Globalization.CultureInfo.GetCultureInfo("it-IT");
        var when = x.Start == x.End ? x.Start.ToString("dddd d MMMM", it) : $"dal {x.Start.ToString("d MMMM", it)} al {x.End.ToString("d MMMM", it)}";
        var users = await Notifier.UsersWithRoles(c, tx, Roles.Student, Roles.Guardian, Roles.Teacher);
        await Notifier.ToUsers(c, tx, users, "schedule_changes", $"Palestra chiusa: {x.Title}", $"Nessuna lezione {when}.{(x.Note == "" ? "" : " " + x.Note)}", actor, new { roles = new[] { "student", "guardian", "teacher" } });
        await c.ExecuteAsync("update app.closures set reminder_sent_at = now() where id = @closureId", new { closureId }, tx);
    }
}

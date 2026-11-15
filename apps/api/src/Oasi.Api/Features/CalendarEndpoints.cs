using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

public static class CalendarEndpoints
{
    public sealed record LessonDto(Guid Id, Guid ClassId, string ClassName, Guid DisciplineId, string Date, string StartTime, string EndTime,
        string Status, string? OriginalStartTime, string? OriginalEndTime, string? Note, bool IsMakeup, string? Declared, string? Actual);

    public sealed record RosterEntry(Guid MemberId, string FirstName, string LastName, bool IsMakeup, bool IsBooking, bool IsCompetitive, string? Declared, string? Actual);

    public sealed record LessonUpdate(string Status, string? StartTime, string? EndTime, string? Note);
    public sealed record AttendanceInput(string? Actual);
    public sealed record DeclarationInput(Guid? MemberId, string? Declared);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/lessons").RequireAuthorization().RequireModule("calendar");

        // Calendario: giorno, settimana o mese (intervallo massimo 62 giorni)
        g.MapGet("/", async (HttpContext ctx, Db db, string? from, string? to, string? scope, Guid? memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                // Senza date: la settimana corrente (lunedì–domenica) nel fuso della struttura
                var today = DateOnly.FromDateTime(await c.ExecuteScalarAsync<DateTime>("select app.tenant_today()::timestamp", transaction: tx));
                var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
                var start = DateOnly.TryParse(from, out var f) ? f : monday;
                var end = DateOnly.TryParse(to, out var t) ? t : start.AddDays(6);
                if (end < start || end.DayNumber - start.DayNumber > 62) throw ApiException.Invalid("Intervallo di date non valido (massimo 62 giorni).");

                // Per chi stiamo guardando il calendario personale?
                var subject = memberId ?? m.MemberId;
                if (subject != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, subject, "view");

                var everything = scope == "all" && m.IsAdmin;
                var teaching = scope == "teaching" && m.IsTeacher;
                return await c.QueryAsync<LessonDto>(@"
                    select l.id, l.class_id, c.name as class_name, c.discipline_id, to_char(l.date, 'YYYY-MM-DD') as date,
                           to_char(l.start_time, 'HH24:MI') as start_time, to_char(l.end_time, 'HH24:MI') as end_time, l.status,
                           to_char(l.original_start_time, 'HH24:MI') as original_start_time, to_char(l.original_end_time, 'HH24:MI') as original_end_time,
                           l.note,
                           (exists(select 1 from app.makeup_requests r where r.target_lesson_id = l.id and r.member_id = @subject and r.status = 'approved')
                            or exists(select 1 from app.lesson_bookings b where b.lesson_id = l.id and b.member_id = @subject and b.status = 'booked')) as is_makeup,
                           a.declared, a.actual
                    from app.lessons l
                    join app.classes c on c.id = l.class_id
                    left join app.attendance a on a.lesson_id = l.id and a.member_id = @subject
                    where l.date between @start::date and @end::date
                      and (
                        @everything
                        or (@teaching and exists(select 1 from app.class_teachers ct where ct.class_id = l.class_id and ct.member_id = @me))
                        or (not @everything and not @teaching and (
                              exists(select 1 from app.enrollments e where e.class_id = l.class_id and e.member_id = @subject and e.status = 'approved')
                              or exists(select 1 from app.makeup_requests r where r.target_lesson_id = l.id and r.member_id = @subject and r.status = 'approved')
                              or exists(select 1 from app.lesson_bookings b where b.lesson_id = l.id and b.member_id = @subject and b.status = 'booked')))
                      )
                    order by l.date, l.start_time",
                    new { subject, me = m.MemberId, everything, teaching, start = start.ToString("yyyy-MM-dd"), end = end.ToString("yyyy-MM-dd") }, tx);
            });
        }).RequireMember();

        // Variazione di orario o annullamento (insegnante della classe o admin)
        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, LessonUpdate input) =>
        {
            var m = ctx.Member();
            if (input.Status is not ("scheduled" or "cancelled" or "rescheduled")) throw ApiException.Invalid("Stato non valido.");
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var lesson = await LoadLesson(c, tx, id);
                await Relations.EnsureCanManageClass(c, tx, m, lesson.ClassId);
                var inClosure = await c.ExecuteScalarAsync<bool>("select closure_id is not null from app.lessons where id = @id", new { id }, tx);
                if (inClosure) throw ApiException.Conflict("lesson_in_closure", "La palestra è chiusa in quella data: modifica la chiusura dalla sezione Gestione.");
                if (input.Status == "rescheduled")
                {
                    if (!TimeOnly.TryParse(input.StartTime, out var s) || !TimeOnly.TryParse(input.EndTime, out var e) || e <= s)
                        throw ApiException.Invalid("Indica un nuovo orario valido.");
                    await c.ExecuteAsync(@"update app.lessons set status = 'rescheduled',
                        original_start_time = coalesce(original_start_time, start_time), original_end_time = coalesce(original_end_time, end_time),
                        start_time = @StartTime::time, end_time = @EndTime::time, note = @Note where id = @id", new { id, input.StartTime, input.EndTime, input.Note }, tx);
                }
                else if (input.Status == "cancelled")
                {
                    await c.ExecuteAsync("update app.lessons set status = 'cancelled', note = @Note where id = @id", new { id, input.Note }, tx);
                }
                else
                {
                    await c.ExecuteAsync(@"update app.lessons l set status = 'scheduled', start_time = c.start_time, end_time = c.end_time,
                        original_start_time = null, original_end_time = null, note = null
                        from app.classes c where c.id = l.class_id and l.id = @id", new { id }, tx);
                }
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        // Elenco della lezione: iscritte + recuperi approvati, con presenza dichiarata ed effettiva
        g.MapGet("/{id:guid}/roster", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var lesson = await LoadLesson(c, tx, id);
                await Relations.EnsureCanManageClass(c, tx, m, lesson.ClassId);
                return await c.QueryAsync<RosterEntry>(@"
                    with people as (
                      select e.member_id, false as is_makeup, false as is_booking from app.enrollments e where e.class_id = @classId and e.status = 'approved'
                      union
                      select r.member_id, true, false from app.makeup_requests r where r.target_lesson_id = @id and r.status = 'approved'
                      union
                      select b.member_id, false, true from app.lesson_bookings b where b.lesson_id = @id and b.status = 'booked'
                    )
                    select p.member_id, mb.first_name, mb.last_name, p.is_makeup, p.is_booking, mb.is_competitive, a.declared, a.actual
                    from people p join app.members mb on mb.id = p.member_id
                    left join app.attendance a on a.lesson_id = @id and a.member_id = p.member_id
                    order by mb.last_name, mb.first_name", new { id, classId = lesson.ClassId }, tx);
            });
        }).RequireMember(Roles.Admin, Roles.Teacher).RequireModule("attendance");

        // Presenza effettiva registrata dall'insegnante
        g.MapPut("/{id:guid}/attendance/{memberId:guid}", async (HttpContext ctx, Db db, Guid id, Guid memberId, AttendanceInput input) =>
        {
            var m = ctx.Member();
            if (input.Actual is not (null or "present" or "absent")) throw ApiException.Invalid("Valore non valido.");
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var lesson = await LoadLesson(c, tx, id);
                await Relations.EnsureCanManageClass(c, tx, m, lesson.ClassId);
                if (lesson.Status == "cancelled") throw ApiException.Conflict("lesson_cancelled", "La lezione è annullata.");
                await EnsureInRoster(c, tx, lesson, memberId);
                await c.ExecuteAsync(@"
                    insert into app.attendance (tenant_id, lesson_id, member_id, actual, recorded_by, recorded_at)
                    values (app.current_tenant(), @id, @memberId, @Actual, @user, now())
                    on conflict (tenant_id, lesson_id, member_id) do update set actual = excluded.actual, recorded_by = excluded.recorded_by, recorded_at = now()",
                    new { id, memberId, input.Actual, user = m.UserId }, tx);
                await MakeupCredits.OnActual(c, tx, await TenantSettings.Load(c, tx), await LessonRules.Load(c, tx, id), memberId, input.Actual);
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher).RequireModule("attendance");

        // Presenza o assenza dichiarata in anticipo dall'allieva (o dal genitore)
        g.MapPut("/{id:guid}/declaration", async (HttpContext ctx, Db db, Guid id, DeclarationInput input) =>
        {
            var m = ctx.Member();
            if (input.Declared is not (null or "present" or "absent")) throw ApiException.Invalid("Valore non valido.");
            var subject = input.MemberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "attendance");
                var lesson = await LoadLesson(c, tx, id);
                if (lesson.Status == "cancelled") throw ApiException.Conflict("lesson_cancelled", "La lezione è annullata.");
                if (lesson.Started) throw ApiException.Conflict("lesson_started", "Non puoi più modificare la dichiarazione: la lezione è iniziata.");
                await EnsureInRoster(c, tx, lesson, subject);
                await c.ExecuteAsync(@"
                    insert into app.attendance (tenant_id, lesson_id, member_id, declared, declared_at)
                    values (app.current_tenant(), @id, @subject, @Declared, now())
                    on conflict (tenant_id, lesson_id, member_id) do update set declared = excluded.declared, declared_at = now()",
                    new { id, subject, input.Declared }, tx);
                await MakeupCredits.OnDeclaration(c, tx, await TenantSettings.Load(c, tx), await LessonRules.Load(c, tx, id), subject, input.Declared);
            });
            return Results.NoContent();
        }).RequireMember().RequireModule("attendance");
    }

    /// <summary>Lezione con l'inizio valutato nel fuso orario della struttura (mai nell'ora del server).</summary>
    internal static Task<LessonRules.LessonInfo> LoadLesson(IDbConnection c, IDbTransaction tx, Guid id) => LessonRules.Load(c, tx, id);

    private static async Task EnsureInRoster(IDbConnection c, IDbTransaction tx, LessonRules.LessonInfo lesson, Guid memberId)
    {
        var ok = await c.ExecuteScalarAsync<bool>(@"select
            exists(select 1 from app.enrollments where class_id = @classId and member_id = @memberId and status = 'approved')
            or exists(select 1 from app.makeup_requests where target_lesson_id = @id and member_id = @memberId and status = 'approved')
            or exists(select 1 from app.lesson_bookings where lesson_id = @id and member_id = @memberId and status = 'booked')",
            new { classId = lesson.ClassId, id = lesson.Id, memberId }, tx);
        if (!ok) throw ApiException.Conflict("not_in_roster", "La persona non è iscritta a questa lezione.");
    }
}

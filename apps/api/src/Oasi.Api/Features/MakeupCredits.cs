using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Features;

/// <summary>
/// Diritti di recupero. Un diritto nasce da un'assenza valida a una lezione
/// della propria classe e vale fino alla scadenza del piano che copre quella lezione.
/// Quale assenza sia "valida" è un'impostazione della struttura (makeups.creditOn).
/// </summary>
public static class MakeupCredits
{
    /// <summary>L'atleta (o il genitore) ha annunciato o ritirato un'assenza.</summary>
    public static async Task OnDeclaration(IDbConnection c, IDbTransaction tx, TenantSettings s, LessonRules.LessonInfo lesson, Guid memberId, string? declared)
    {
        if (declared == "absent")
        {
            if (s.Makeups.CreditOn == "declared_in_time" && lesson.HoursToStart >= s.Booking.CancelHoursBefore)
                await Grant(c, tx, s, lesson, memberId);
        }
        else await Revoke(c, tx, lesson.Id, memberId);
    }

    /// <summary>L'insegnante ha registrato la presenza effettiva.</summary>
    public static async Task OnActual(IDbConnection c, IDbTransaction tx, TenantSettings s, LessonRules.LessonInfo lesson, Guid memberId, string? actual)
    {
        if (actual == "present") await Revoke(c, tx, lesson.Id, memberId);
        else if (actual == "absent" && s.Makeups.CreditOn == "any_absence") await Grant(c, tx, s, lesson, memberId);
    }

    private static async Task Grant(IDbConnection c, IDbTransaction tx, TenantSettings s, LessonRules.LessonInfo lesson, Guid memberId)
    {
        if (lesson.Status == "cancelled") return;   // una lezione annullata (es. chiusura) non genera recuperi
        // Solo le lezioni della propria classe: un recupero o una prenotazione non generano altri recuperi
        var enrolled = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.enrollments where class_id = @classId and member_id = @memberId and status = 'approved')",
            new { classId = lesson.ClassId, memberId }, tx);
        if (!enrolled) return;
        // Il diritto vale fino alla scadenza del piano dell'atleta che copre la lezione (se il piano prevede recuperi)
        var plan = await c.QuerySingleOrDefaultAsync<(Guid Id, DateTime Until, bool Grants)?>(@"
            select mp.id, mp.valid_until::timestamp, p.grants_makeups from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id
            where mp.member_id = @memberId and (mp.class_id is null or mp.class_id = @classId) and mp.status = 'active' and @d::date between mp.valid_from and mp.valid_until
            order by mp.created_at desc, mp.valid_until desc limit 1", new { memberId, classId = lesson.ClassId, d = lesson.Date }, tx);
        if (plan is not { Grants: true } e) return;   // nessun piano valido per quella lezione, o piano senza recuperi
        var expires = e.Until;
        if (s.Makeups.MaxPerPlan is { } max)
        {
            var n = await c.ExecuteScalarAsync<int>(
                "select count(*) from app.makeup_credits where member_plan_id = @plan and status <> 'cancelled' and source_lesson_id <> @lesson",
                new { plan = e.Id, lesson = lesson.Id }, tx);
            if (n >= max) return;
        }

        await c.ExecuteAsync(@"
            insert into app.makeup_credits (tenant_id, member_id, source_lesson_id, member_plan_id, expires_on)
            values (app.current_tenant(), @memberId, @lesson, @plan, @expires::date)
            on conflict (tenant_id, member_id, source_lesson_id) do update
              set status = 'available', expires_on = excluded.expires_on, member_plan_id = excluded.member_plan_id
              where app.makeup_credits.status = 'cancelled'",
            new { memberId, lesson = lesson.Id, plan = e.Id, expires }, tx);
    }

    /// <summary>Ritira il diritto non ancora utilizzato (l'assenza non c'è più).</summary>
    private static Task Revoke(IDbConnection c, IDbTransaction tx, Guid lessonId, Guid memberId) =>
        c.ExecuteAsync("update app.makeup_credits set status = 'cancelled' where source_lesson_id = @lessonId and member_id = @memberId and status = 'available'",
            new { lessonId, memberId }, tx);

    /// <summary>Segna come scaduti i diritti oltre la validità (usato anche dal lavoro pianificato).</summary>
    public static Task ExpireOld(IDbConnection c, IDbTransaction tx) =>
        c.ExecuteAsync("update app.makeup_credits set status = 'expired' where status = 'available' and expires_on < app.tenant_today()", transaction: tx);
}

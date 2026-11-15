using System.Data;
using System.Text.Json;
using Dapper;

namespace Oasi.Api.Notifications;

/// <summary>
/// Notifiche nel centro notifiche interno (app.notifications + consegne).
/// Le push native useranno le stesse righe come sorgente.
/// </summary>
public static class Notifier
{
    /// <summary>Notifica gli utenti indicati (solo appartenenti al tenant corrente: vincolo del database).</summary>
    public static async Task ToUsers(IDbConnection c, IDbTransaction tx, IEnumerable<Guid> userIds, string category, string title, string body, Guid? createdBy, object? audience = null, string? link = null)
    {
        var users = userIds.Distinct().ToArray();
        if (users.Length == 0) return;
        var id = await c.ExecuteScalarAsync<Guid>(@"
            insert into app.notifications (tenant_id, category, title, body, audience, created_by, link)
            values (app.current_tenant(), @category, @title, @body, @audience::jsonb, @createdBy, @link) returning id",
            new { category, title, body, audience = JsonSerializer.Serialize(audience ?? new { users }), createdBy, link }, tx);
        await c.ExecuteAsync(@"
            insert into app.notification_deliveries (tenant_id, notification_id, user_id, channel)
            select app.current_tenant(), @id, m.user_id, 'in_app' from app.memberships m
            where m.user_id = any(@users) and m.status = 'active'
              and not exists (select 1 from app.notification_preferences p where p.user_id = m.user_id and @category = any(p.muted_categories))",
            new { id, users, category }, tx);
    }

    /// <summary>
    /// Notifica una sola volta: la chiave resta in app.reminder_log e un secondo invio
    /// con la stessa chiave viene ignorato (promemoria dei lavori pianificati).
    /// </summary>
    public static async Task<bool> Once(IDbConnection c, IDbTransaction tx, string key, IEnumerable<Guid> userIds, string category, string title, string body, string? link = null)
    {
        var first = await c.ExecuteAsync(
            "insert into app.reminder_log (tenant_id, key) values (app.current_tenant(), @key) on conflict do nothing", new { key }, tx);
        if (first == 0) return false;
        await ToUsers(c, tx, userIds, category, title, body, null, link: link);
        return true;
    }

    /// <summary>La persona (se ha un account) e i suoi genitori/tutori.</summary>
    public static Task<Guid[]> UsersOfMember(IDbConnection c, IDbTransaction tx, Guid memberId) =>
        c.QueryAsync<Guid>(@"
            select user_id from app.members where id = @memberId and user_id is not null
            union
            select g.user_id from app.guardianships x join app.members g on g.id = x.guardian_member_id
            where x.child_member_id = @memberId and g.user_id is not null", new { memberId }, tx)
         .ContinueWith(t => t.Result.ToArray());

    public static Task<Guid[]> UsersWithRoles(IDbConnection c, IDbTransaction tx, params string[] roles) =>
        c.QueryAsync<Guid>("select user_id from app.memberships where status = 'active' and roles && @roles", new { roles }, tx)
         .ContinueWith(t => t.Result.ToArray());
}

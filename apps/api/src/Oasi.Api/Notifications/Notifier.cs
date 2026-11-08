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
    public static async Task ToUsers(IDbConnection c, IDbTransaction tx, IEnumerable<Guid> userIds, string category, string title, string body, Guid? createdBy, object? audience = null)
    {
        var users = userIds.Distinct().ToArray();
        if (users.Length == 0) return;
        var id = await c.ExecuteScalarAsync<Guid>(@"
            insert into app.notifications (tenant_id, category, title, body, audience, created_by)
            values (app.current_tenant(), @category, @title, @body, @audience::jsonb, @createdBy) returning id",
            new { category, title, body, audience = JsonSerializer.Serialize(audience ?? new { users }), createdBy }, tx);
        await c.ExecuteAsync(@"
            insert into app.notification_deliveries (tenant_id, notification_id, user_id, channel)
            select app.current_tenant(), @id, m.user_id, 'in_app' from app.memberships m
            where m.user_id = any(@users) and m.status = 'active'", new { id, users }, tx);
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

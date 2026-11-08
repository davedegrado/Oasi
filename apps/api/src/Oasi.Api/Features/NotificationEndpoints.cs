using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

public static class NotificationEndpoints
{
    public sealed record NotificationDto(Guid Id, string Category, string Title, string Body, DateTime CreatedAt, bool Read);
    public sealed record ReadInput(Guid[] Ids);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/notifications").RequireAuthorization().RequireMember();

        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<NotificationDto>(@"
                select n.id, n.category, n.title, n.body, n.created_at, bool_or(d.status = 'read') as read
                from app.notifications n join app.notification_deliveries d on d.notification_id = n.id
                where d.user_id = @user group by n.tenant_id, n.id order by n.created_at desc limit 100", new { user = m.UserId }, tx));
        });

        g.MapPost("/read", async (HttpContext ctx, Db db, ReadInput input) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync(
                "update app.notification_deliveries set status = 'read', read_at = now() where user_id = @user and notification_id = any(@ids)",
                new { user = m.UserId, ids = input.Ids }, tx));
            return Results.NoContent();
        });
    }
}

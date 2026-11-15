using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

public static class NotificationEndpoints
{
    public sealed record NotificationDto(Guid Id, string Category, string Title, string Body, string? Link, DateTime CreatedAt, bool Read, string DeliveryStatus);
    public sealed record PreferencesInput(string[] MutedCategories);
    public sealed record ReadInput(Guid[] Ids);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/notifications").RequireAuthorization().RequireMember();

        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<NotificationDto>(@"
                select n.id, n.category, n.title, n.body, n.link, n.created_at, bool_or(d.status = 'read') as read, min(d.status) as delivery_status
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

        // Preferenze: categorie che l'utente non vuole ricevere
        g.MapGet("/preferences", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            var muted = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<string[]>(
                "select muted_categories from app.notification_preferences where user_id = @user", new { user = m.UserId }, tx));
            return Results.Ok(new { mutedCategories = muted ?? [], categories = Categories });
        });

        g.MapPut("/preferences", async (HttpContext ctx, Db db, PreferencesInput input) =>
        {
            var m = ctx.Member();
            if (m.MemberId == Guid.Empty) throw ApiException.Forbidden();
            var muted = (input.MutedCategories ?? []).Distinct().ToArray();
            if (muted.Except(Categories).Any()) throw ApiException.Invalid("Categoria di notifica non valida.");
            await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync(@"
                insert into app.notification_preferences (tenant_id, user_id, muted_categories) values (app.current_tenant(), @user, @muted)
                on conflict (tenant_id, user_id) do update set muted_categories = excluded.muted_categories", new { user = m.UserId, muted }, tx));
            return Results.NoContent();
        });
    }

    public static readonly string[] Categories = ["lessons", "schedule_changes", "attendance", "makeups", "events", "workshops", "teaching", "admin", "documents", "payments"];
}

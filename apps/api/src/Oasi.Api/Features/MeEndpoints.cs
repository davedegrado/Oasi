using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;
using Oasi.Api.Tenancy;

namespace Oasi.Api.Features;

public static class MeEndpoints
{
    public static void Map(WebApplication app)
    {
        // Le palestre a cui l'utente appartiene (per la scelta dell'organizzazione dopo il login)
        app.MapGet("/v1/me", async (HttpContext ctx, Db db) =>
        {
            var userId = ctx.RequireUserId();
            var current = ctx.TryGetTenant();
            var memberships = (await db.InTenant(null, userId, (c, tx) => c.QueryAsync<MembershipRow>(
                "select tenant_id, member_id, roles from app.memberships where user_id = @userId and status = 'active'", new { userId }, tx))).ToList();
            var tenantIds = memberships.Select(m => m.TenantId).ToArray();
            var tenants = (await db.Platform((c, tx) => c.QueryAsync<(Guid Id, string Slug, string DisplayName, string Status, string? Hostname)>(
                @"select t.id, t.slug, t.display_name, t.status,
                         (select hostname from platform.domains d where d.tenant_id = t.id order by is_primary desc limit 1)
                  from platform.tenants t where t.id = any(@tenantIds) and t.status in ('active', 'trial')", new { tenantIds }, tx)))
                .ToDictionary(t => t.Id);
            var isStaff = await db.Platform((c, tx) => c.ExecuteScalarAsync<bool>("select exists(select 1 from platform.staff where user_id = @userId)", new { userId }, tx));

            var list = memberships.Where(m => tenants.ContainsKey(m.TenantId)).Select(m =>
            {
                var t = tenants[m.TenantId];
                return new { tenantId = t.Id, slug = t.Slug, name = t.DisplayName, hostname = t.Hostname, memberId = m.MemberId, roles = m.Roles };
            }).ToList();

            object? profile = null;
            var currentMembership = current is null ? null : list.FirstOrDefault(m => m.tenantId == current.Id);
            if (current is not null && currentMembership is not null)
            {
                profile = await db.InTenant(current.Id, userId, (c, tx) => c.QuerySingleAsync<MemberProfile>(
                    "select id, first_name, last_name, email, avatar_path from app.members where id = @id", new { id = currentMembership.memberId }, tx));
            }

            return Results.Ok(new
            {
                userId,
                isPlatformStaff = isStaff,
                currentTenantId = current?.Id,
                current = currentMembership,
                profile,
                memberships = list,
            });
        }).RequireAuthorization();
    }

    public sealed record MemberProfile(Guid Id, string FirstName, string LastName, string? Email, string? AvatarPath);
}

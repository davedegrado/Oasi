using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Tenancy;

namespace Oasi.Api.Security;

/// <summary>Appartenenza verificata dell'utente al tenant della richiesta.</summary>
public sealed record Member(Guid TenantId, Guid UserId, Guid MemberId, string[] Roles)
{
    public bool Has(string role) => Roles.Contains(role);
    public bool IsAdmin => Has("admin");
    public bool IsTeacher => Has("teacher");
}

public static class Roles
{
    public const string Admin = "admin", Teacher = "teacher", Student = "student", Guardian = "guardian";
}

public static class MemberHttpContextExtensions
{
    private const string Key = "oasi.member";
    public static Member Member(this HttpContext ctx) =>
        ctx.Items[Key] as Member ?? throw new InvalidOperationException("Endpoint senza filtro RequireMember");
    internal static void SetMember(this HttpContext ctx, Member m) => ctx.Items[Key] = m;
}

/// <summary>
/// Filtro: tenant risolto e attivo + utente autenticato + appartenenza attiva
/// con almeno uno dei ruoli richiesti (nessun ruolo = qualsiasi appartenenza).
/// </summary>
public sealed class RequireMemberFilter(string[] anyOf) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var ctx = context.HttpContext;
        var tenant = ctx.RequireTenant();
        if (!tenant.IsUsable) throw new ApiException(423, "tenant_suspended", "Questa palestra non è al momento attiva.");
        var userId = ctx.RequireUserId();
        var db = ctx.RequestServices.GetRequiredService<Db>();
        var m = await db.InTenant(tenant.Id, userId, (c, tx) => c.QuerySingleOrDefaultAsync<MembershipRow>(
            "select tenant_id, member_id, roles from app.memberships where user_id = @userId and status = 'active' and tenant_id = app.current_tenant()", new { userId }, tx));
        if (m is null)
        {
            // Assistenza: lo staff della piattaforma accede in sola lettura solo con un
            // accesso approvato dall'amministratore della palestra e ancora valido.
            var grant = await db.Platform((c, tx) => c.ExecuteScalarAsync<Guid?>(
                @"select g.id from platform.support_grants g join platform.staff s on s.user_id = g.staff_user_id
                  where g.tenant_id = @tenantId and g.staff_user_id = @userId and g.approved_by is not null
                    and g.revoked_at is null and now() between g.starts_at and g.expires_at limit 1",
                new { tenantId = tenant.Id, userId }, tx));
            if (grant is null) throw ApiException.Forbidden("Non fai parte di questa palestra.");
            if (!HttpMethods.IsGet(ctx.Request.Method)) throw ApiException.Forbidden("L'accesso di assistenza è in sola lettura.");
            if (anyOf.Length > 0) throw ApiException.Forbidden();
            await db.Platform((c, tx) => Features.Audit.Log(c, tx, userId, tenant.Id, "support.access", ctx.Request.Path, new { grant }).ContinueWith(_ => 0));
            ctx.SetMember(new Member(tenant.Id, userId, Guid.Empty, ["support"]));
            return await next(context);
        }
        if (anyOf.Length > 0 && !anyOf.Intersect(m.Roles).Any()) throw ApiException.Forbidden();
        ctx.SetMember(new Member(tenant.Id, userId, m.MemberId, m.Roles));
        return await next(context);
    }
}

public static class AccessExtensions
{
    public static TBuilder RequireMember<TBuilder>(this TBuilder builder, params string[] anyOf) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new RequireMemberFilter(anyOf));
}

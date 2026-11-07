using Dapper;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Security;

public sealed record Staff(Guid UserId, string Role, string[] Permissions)
{
    public bool Can(string permission) => Role == "owner" || Permissions.Contains(permission);
}

/// <summary>Area Super Admin: solo lo staff della piattaforma, con permesso specifico.</summary>
public sealed class RequireStaffFilter(string permission) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var ctx = context.HttpContext;
        var userId = ctx.RequireUserId();
        var db = ctx.RequestServices.GetRequiredService<Db>();
        var s = await db.Platform((c, tx) => c.QuerySingleOrDefaultAsync<StaffRow>(
            "select role, permissions from platform.staff where user_id = @userId", new { userId }, tx));
        if (s is null) throw ApiException.Forbidden("Area riservata allo staff della piattaforma.");
        var staff = new Staff(userId, s.Role, s.Permissions);
        if (!staff.Can(permission)) throw ApiException.Forbidden();
        ctx.Items["oasi.staff"] = staff;
        return await next(context);
    }
}

public static class StaffExtensions
{
    public static Staff Staff(this HttpContext ctx) => (Staff)ctx.Items["oasi.staff"]!;
    public static TBuilder RequireStaff<TBuilder>(this TBuilder builder, string permission) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new RequireStaffFilter(permission));
}

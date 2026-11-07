using System.Security.Claims;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Security;

public static class CurrentUser
{
    /// <summary>Id dell'utente Supabase (claim "sub") del token verificato.</summary>
    public static Guid? UserId(this HttpContext ctx)
    {
        var sub = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    public static Guid RequireUserId(this HttpContext ctx) =>
        ctx.UserId() ?? throw new ApiException(401, "unauthenticated", "Accesso richiesto.");
}

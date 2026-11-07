using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Oasi.Api.Infrastructure;
using Oasi.Api.Tenancy;

namespace Oasi.Api.Security;

/// <summary>
/// Blocca l'endpoint se il modulo non è attivo per il tenant: nascondere il
/// modulo nel frontend non basta.
/// </summary>
public sealed class RequireModuleFilter(string moduleKey) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var ctx = context.HttpContext;
        var tenant = ctx.RequireTenant();
        var modules = await ModuleCatalog.EnabledModules(ctx.RequestServices, tenant.Id);
        if (!modules.Contains(moduleKey))
            throw new ApiException(403, "module_disabled", "Questa funzionalità non è attiva per la tua palestra.");
        return await next(context);
    }
}

public static class ModuleCatalog
{
    public static async Task<HashSet<string>> EnabledModules(IServiceProvider services, Guid tenantId)
    {
        var cache = services.GetRequiredService<IMemoryCache>();
        return (await cache.GetOrCreateAsync($"modules:{tenantId}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            var db = services.GetRequiredService<Db>();
            var keys = await db.Platform((c, tx) => c.QueryAsync<string>(
                @"select m.key from platform.modules m
                  left join platform.tenant_modules tm on tm.module_key = m.key and tm.tenant_id = @tenantId
                  where m.is_core or tm.enabled", new { tenantId }, tx));
            return keys.ToHashSet();
        }))!;
    }

    public static void Invalidate(IServiceProvider services, Guid tenantId) =>
        services.GetRequiredService<IMemoryCache>().Remove($"modules:{tenantId}");

    public static TBuilder RequireModule<TBuilder>(this TBuilder builder, string moduleKey) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new RequireModuleFilter(moduleKey));
}

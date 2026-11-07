using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Tenancy;

/// <summary>
/// Individua la palestra dalla richiesta, in quest'ordine:
///   1. header X-Oasi-App (identificativo dell'app nativa, es. it.oasimetropolitana.app)
///   2. header Origin (dominio della Web App che chiama l'API dal browser)
///   3. header X-Forwarded-Host (quando l'API è servita sotto il dominio della palestra)
///   4. header Host
/// Il risultato è solo un'indicazione: ogni endpoint protetto verifica poi che
/// l'utente autenticato appartenga davvero a quel tenant.
/// </summary>
public sealed class TenantResolutionMiddleware(RequestDelegate next, IMemoryCache cache)
{
    public async Task InvokeAsync(HttpContext ctx, Db db)
    {
        var tenant = await Resolve(ctx, db);
        if (tenant is not null) ctx.SetTenant(tenant);
        await next(ctx);
    }

    private async Task<ResolvedTenant?> Resolve(HttpContext ctx, Db db)
    {
        var appId = ctx.Request.Headers["X-Oasi-App"].ToString();
        if (!string.IsNullOrWhiteSpace(appId))
            return await Lookup(db, "app", appId.Trim().ToLowerInvariant(),
                "select t.id, t.slug, t.status from platform.native_apps a join platform.tenants t on t.id = a.tenant_id where lower(a.bundle_id) = @key");

        foreach (var host in CandidateHosts(ctx))
        {
            var found = await Lookup(db, "host", host,
                "select t.id, t.slug, t.status from platform.domains d join platform.tenants t on t.id = d.tenant_id where d.hostname = @key");
            if (found is not null) return found;
        }
        return null;
    }

    private static IEnumerable<string> CandidateHosts(HttpContext ctx)
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri)) yield return uri.Host.ToLowerInvariant();
        var forwarded = ctx.Request.Headers["X-Forwarded-Host"].ToString();
        if (!string.IsNullOrWhiteSpace(forwarded)) yield return forwarded.Split(',')[0].Split(':')[0].Trim().ToLowerInvariant();
        yield return ctx.Request.Host.Host.ToLowerInvariant();
    }

    private async Task<ResolvedTenant?> Lookup(Db db, string kind, string key, string sql)
    {
        var cacheKey = $"tenant:{kind}:{key}";
        if (cache.TryGetValue(cacheKey, out ResolvedTenant? cached)) return cached;
        var row = await db.Platform((c, tx) => c.QuerySingleOrDefaultAsync<(Guid Id, string Slug, string Status)?>(sql, new { key }, tx));
        var result = row is { } r ? new ResolvedTenant(r.Id, r.Slug, r.Status, kind) : null;
        cache.Set(cacheKey, result, TimeSpan.FromSeconds(30));
        return result;
    }
}

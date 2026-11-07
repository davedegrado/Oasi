namespace Oasi.Api.Tenancy;

/// <summary>Tenant risolto per la richiesta corrente (mai preso da un campo inviato dal client).</summary>
public sealed record ResolvedTenant(Guid Id, string Slug, string Status, string ResolvedBy)
{
    public bool IsUsable => Status is "active" or "trial";
}

public static class TenantHttpContextExtensions
{
    private const string Key = "oasi.tenant";

    public static void SetTenant(this HttpContext ctx, ResolvedTenant tenant) => ctx.Items[Key] = tenant;

    public static ResolvedTenant? TryGetTenant(this HttpContext ctx) => ctx.Items[Key] as ResolvedTenant;

    public static ResolvedTenant RequireTenant(this HttpContext ctx) =>
        ctx.TryGetTenant() ?? throw new Infrastructure.ApiException(404, "tenant_not_found", "Palestra non trovata per questo dominio.");
}

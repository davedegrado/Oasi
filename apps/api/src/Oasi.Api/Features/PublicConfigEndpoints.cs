using System.Text.Json;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;
using Oasi.Api.Tenancy;

namespace Oasi.Api.Features;

/// <summary>
/// Configurazione pubblica del tenant: il frontend la legge all'avvio per
/// applicare marchio, colori, testi e moduli. Non contiene dati personali.
/// </summary>
public static class PublicConfigEndpoints
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/public");

        g.MapGet("/tenant-config", async (HttpContext ctx, Db db) =>
        {
            var tenant = ctx.RequireTenant();
            var cfg = await LoadConfig(db, tenant);
            var modules = await ModuleCatalog.EnabledModules(ctx.RequestServices, tenant.Id);
            var (disciplines, levels) = await db.InTenant(tenant.Id, null, async (c, tx) => (
                (await c.QueryAsync<DisciplineDto>("select id, slug, name, color, icon, apparatus, has_figure_archive from app.disciplines where is_active order by position, name", transaction: tx)).ToList(),
                (await c.QueryAsync<LevelDto>("select id, name, rank from app.levels order by rank", transaction: tx)).ToList()));
            ctx.Response.Headers.CacheControl = "public, max-age=60";
            return Results.Ok(new
            {
                tenant = new { id = tenant.Id, slug = tenant.Slug, status = tenant.Status },
                branding = cfg,
                modules = modules.Order(),
                disciplines,
                levels,
            });
        });

        // Manifest PWA specifico del tenant: nome, colori e icone diversi per ogni palestra
        g.MapGet("/manifest.webmanifest", async (HttpContext ctx, Db db) =>
        {
            var tenant = ctx.RequireTenant();
            var cfg = await LoadConfig(db, tenant);
            var theme = cfg.Colors.TryGetValue("themeColor", out var t) ? t : "#E9A4C0";
            var background = cfg.Colors.TryGetValue("background", out var b) ? b : "#FFFFFF";
            var icon = cfg.IconPath ?? "/icons/icon-512.png";
            ctx.Response.Headers.CacheControl = "public, max-age=300";
            return Results.Json(new
            {
                id = $"/?tenant={tenant.Slug}",
                name = cfg.AppName,
                short_name = cfg.ShortName,
                lang = "it",
                start_url = "/",
                scope = "/",
                display = "standalone",
                orientation = "portrait",
                theme_color = theme,
                background_color = background,
                icons = new object[]
                {
                    new { src = icon, sizes = "512x512", type = "image/png" },
                    new { src = icon, sizes = "512x512", type = "image/png", purpose = "maskable" },
                },
            }, contentType: "application/manifest+json");
        });
    }

    public sealed class DisciplineDto
    {
        public Guid Id { get; init; }
        public string Slug { get; init; } = "";
        public string Name { get; init; } = "";
        public string Color { get; init; } = "";
        public string Icon { get; init; } = "";
        public string[] Apparatus { get; init; } = [];
        public bool HasFigureArchive { get; init; }
    }
    public sealed record LevelDto(Guid Id, string Name, int Rank);

    public sealed record BrandingDto(string AppName, string ShortName, string? LogoPath, string? IconPath, string? CoverPath,
        Dictionary<string, string> Colors, Dictionary<string, string> Fonts, Dictionary<string, string> Texts, Dictionary<string, string> Contacts);

    private static async Task<BrandingDto> LoadConfig(Db db, ResolvedTenant tenant)
    {
        var row = await db.Platform((c, tx) => c.QuerySingleOrDefaultAsync<(string AppName, string ShortName, string? LogoPath, string? IconPath, string? CoverPath, string Colors, string Fonts, string Texts, string Contacts)?>(
            @"select app_name, short_name, logo_path, icon_path, cover_path, colors::text, fonts::text, texts::text, contacts::text
              from platform.branding where tenant_id = @id", new { id = tenant.Id }, tx));
        if (row is not { } r) throw ApiException.NotFound("Configurazione");
        static Dictionary<string, string> Parse(string json) =>
            JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!
                .ToDictionary(kv => kv.Key, kv => kv.Value.ValueKind == JsonValueKind.String ? kv.Value.GetString()! : kv.Value.ToString());
        return new BrandingDto(r.AppName, r.ShortName, r.LogoPath, r.IconPath, r.CoverPath, Parse(r.Colors), Parse(r.Fonts), Parse(r.Texts), Parse(r.Contacts));
    }
}

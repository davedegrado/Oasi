using System.Text.Json.Nodes;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Impostazioni della struttura: fuso orario, soglie di prenotazione e disdetta,
/// regole dei recuperi, agonismo, conservazione dei documenti sostituiti.
/// </summary>
public static class SettingsEndpoints
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/settings").RequireAuthorization();

        // Valori effettivi (predefiniti + personalizzazioni): servono a tutti per mostrare le regole in vigore
        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            var json = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<string>("select app.settings()::text", transaction: tx));
            return Results.Text(json ?? "{}", "application/json");
        }).RequireMember();

        // Modifica parziale: le chiavi inviate sostituiscono quelle salvate, le altre restano
        g.MapPut("/", async (HttpContext ctx, Db db, JsonObject patch) =>
        {
            var m = ctx.Member();
            var valid = TenantSettings.Validate(patch).ToJsonString();
            var json = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await c.ExecuteAsync(@"
                    insert into app.tenant_settings (tenant_id, settings) values (app.current_tenant(), @valid::jsonb)
                    on conflict (tenant_id) do update set settings = app.jsonb_deep_merge(app.tenant_settings.settings, excluded.settings)", new { valid }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "settings.update", null, new { keys = patch.Select(p => p.Key).ToArray() });
                return await c.ExecuteScalarAsync<string>("select app.settings()::text", transaction: tx);
            });
            return Results.Text(json ?? "{}", "application/json");
        }).RequireMember(Roles.Admin);
    }
}

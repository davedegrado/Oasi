using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Sale della struttura: le sceglie l'amministrazione quando crea una classe.
/// Rinominare non tocca le classi (sono collegate per identificativo); una sala
/// usata da una classe non si elimina.
/// </summary>
public static class RoomEndpoints
{
    public sealed record RoomInput(string Name);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/rooms").RequireAuthorization().RequireModule("classes");

        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) => (await c.QueryAsync(@"
                select r.id, r.name, (select count(*)::int from app.classes k where k.room_id = r.id) as classes
                from app.rooms r order by r.name", transaction: tx)).Camel());
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, RoomInput input) =>
        {
            var name = Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.rooms where lower(name) = lower(@name))", new { name }, tx))
                    throw ApiException.Conflict("room_exists", "Esiste già una sala con questo nome.");
                return await c.ExecuteScalarAsync<Guid>("insert into app.rooms (tenant_id, name) values (app.current_tenant(), @name) returning id", new { name }, tx);
            });
            return Results.Created($"/v1/rooms/{id}", new { id });
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, RoomInput input) =>
        {
            var name = Validate(input);
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.rooms where lower(name) = lower(@name) and id <> @id)", new { name, id }, tx))
                    throw ApiException.Conflict("room_exists", "Esiste già una sala con questo nome.");
                return await c.ExecuteAsync("update app.rooms set name = @name where id = @id", new { name, id }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        g.MapDelete("/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var used = (await c.QueryAsync<string>("select name from app.classes where room_id = @id order by name", new { id }, tx)).ToList();
                if (used.Count > 0) throw ApiException.Conflict("room_in_use", $"La sala è usata da: {string.Join(", ", used)}. Sposta prima le classi.");
                return await c.ExecuteAsync("delete from app.rooms where id = @id", new { id }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);
    }

    private static string Validate(RoomInput i)
    {
        var name = (i.Name ?? "").Trim();
        if (name.Length is 0 or > 60) throw ApiException.Invalid("Il nome della sala deve avere da 1 a 60 caratteri.");
        return name;
    }
}

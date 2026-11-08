using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Discipline come dati della palestra: si creano, modificano, attivano e
/// disattivano senza toccare il codice. Disattivare non elimina classi né storico.
/// </summary>
public static class DisciplineEndpoints
{
    public sealed class DisciplineRow
    {
        public Guid Id { get; init; }
        public string Slug { get; init; } = "";
        public string Name { get; init; } = "";
        public string Description { get; init; } = "";
        public string Color { get; init; } = "";
        public string Icon { get; init; } = "";
        public string[] Apparatus { get; init; } = [];
        public bool HasFigureArchive { get; init; }
        public bool IsActive { get; init; }
        public int Classes { get; init; }
        public int ActiveClasses { get; init; }
    }

    public sealed record DisciplineInput(string Name, string? Description, string? Color, string? Icon, string[]? Apparatus, bool? HasFigureArchive);
    public sealed record ActiveInput(bool IsActive);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/disciplines").RequireAuthorization().RequireModule("classes");

        g.MapGet("/", async (HttpContext ctx, Db db, bool? includeInactive) =>
        {
            var m = ctx.Member();
            var all = includeInactive == true && m.IsAdmin;
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<DisciplineRow>(@"
                select d.id, d.slug, d.name, d.description, d.color, d.icon, d.apparatus, d.has_figure_archive, d.is_active,
                       (select count(*)::int from app.classes c where c.discipline_id = d.id) as classes,
                       (select count(*)::int from app.classes c where c.discipline_id = d.id and c.is_active) as active_classes
                from app.disciplines d where d.is_active or @all order by d.position, d.name", new { all }, tx));
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, DisciplineInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var slug = Slugify(input.Name);
                var exists = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.disciplines where slug = @slug)", new { slug }, tx);
                if (exists) throw ApiException.Conflict("discipline_exists", "Esiste già una disciplina con questo nome.");
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.disciplines (tenant_id, slug, name, description, color, icon, apparatus, has_figure_archive, position)
                    values (app.current_tenant(), @slug, @Name, coalesce(@Description, ''), coalesce(@Color, '#D66A9B'), coalesce(@Icon, 'circle'),
                            coalesce(@Apparatus::text[], '{}'), coalesce(@HasFigureArchive, false),
                            (select coalesce(max(position), 0) + 1 from app.disciplines)) returning id",
                    new { slug, input.Name, input.Description, input.Color, input.Icon, input.Apparatus, input.HasFigureArchive }, tx);
            });
            return Results.Created($"/v1/disciplines/{id}", new { id });
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, DisciplineInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            // Lo slug resta invariato: classi, figure e storico restano collegati
            var n = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync(@"
                update app.disciplines set name = @Name, description = coalesce(@Description, description), color = coalesce(@Color, color),
                  icon = coalesce(@Icon, icon), apparatus = coalesce(@Apparatus::text[], apparatus), has_figure_archive = coalesce(@HasFigureArchive, has_figure_archive)
                where id = @id", new { id, input.Name, input.Description, input.Color, input.Icon, input.Apparatus, input.HasFigureArchive }, tx));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        g.MapPatch("/{id:guid}/active", async (HttpContext ctx, Db db, Guid id, ActiveInput input) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync(
                "update app.disciplines set is_active = @IsActive where id = @id", new { id, input.IsActive }, tx));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);
    }

    private static void Validate(DisciplineInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 60) throw ApiException.Invalid("Inserisci il nome della disciplina (massimo 60 caratteri).");
        if (i.Color is not null && !System.Text.RegularExpressions.Regex.IsMatch(i.Color, "^#[0-9A-Fa-f]{6}$")) throw ApiException.Invalid("Colore non valido.");
    }

    internal static string Slugify(string s) =>
        System.Text.RegularExpressions.Regex.Replace(
            new string(s.ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD).Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray()),
            "[^a-z0-9]+", "-").Trim('-');
}

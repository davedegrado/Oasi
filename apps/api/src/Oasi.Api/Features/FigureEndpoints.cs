using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Archivio didattico, progressi personali (3 stati) e feedback delle insegnanti.</summary>
public static class FigureEndpoints
{
    public static readonly string[] ProgressStates = ["to_learn", "planned", "achieved"]; // Da imparare · In progetto · Riuscita

    public sealed record StepDto(Guid Id, int Position, string ImagePath, string Caption);
    public sealed record FigureDto
    {
        public Guid Id { get; init; }
        public Guid DisciplineId { get; init; }
        public string? Apparatus { get; init; }
        public string Name { get; init; } = "";
        public Guid? LevelId { get; init; }
        public short Difficulty { get; init; }
        public string Description { get; init; } = "";
        public string[] AttentionPoints { get; init; } = [];
        public string[] Prerequisites { get; init; } = [];
        public string? CoverPath { get; init; }
        public string? VideoPath { get; init; }
        public Guid? AuthorMemberId { get; init; }
        public DateTime CreatedAt { get; init; }
        public List<StepDto> Steps { get; init; } = [];
        public string? TeacherNotes { get; init; }
    }
    public sealed record StepInput(string ImagePath, string? Caption);
    public sealed record FigureInput(Guid DisciplineId, string? Apparatus, string Name, Guid? LevelId, int Difficulty, string? Description,
        string[]? AttentionPoints, string[]? Prerequisites, string? TeacherNotes, string? CoverPath, string? VideoPath, StepInput[] Steps);
    public sealed record ProgressDto(Guid FigureId, string Status, string StudentNote, DateTime UpdatedAt);
    public sealed record ProgressInput(string Status, string? Note);
    public sealed record FeedbackDto(Guid Id, Guid MemberId, Guid? FigureId, Guid AuthorMemberId, string AuthorName, string Body, bool VisibleToStudent, DateTime CreatedAt);
    public sealed record FeedbackInput(Guid MemberId, Guid? FigureId, string Body, bool? VisibleToStudent);

    private const string SelectFigure = @"select id, discipline_id, apparatus, name, level_id, difficulty, description, attention_points, prerequisites,
        cover_path, video_path, author_member_id, created_at, teacher_notes from app.figures";

    public static void Map(WebApplication app)
    {
        var figures = app.MapGroup("/v1/figures").RequireAuthorization().RequireModule("figure_archive");

        figures.MapGet("/", async (HttpContext ctx, Db db, Guid? disciplineId) =>
        {
            var m = ctx.Member();
            var staff = m.IsAdmin || m.IsTeacher;
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var list = (await c.QueryAsync<FigureDto>(SelectFigure + " where @d::uuid is null or discipline_id = @d order by name", new { d = disciplineId }, tx)).ToList();
                var steps = (await c.QueryAsync<(Guid FigureId, Guid Id, int Position, string ImagePath, string Caption)>(
                    "select figure_id, id, position::int, image_path, caption from app.figure_steps order by position", transaction: tx)).ToLookup(s => s.FigureId);
                return list.Select(f => f with
                {
                    Steps = steps[f.Id].Select(s => new StepDto(s.Id, s.Position, s.ImagePath, s.Caption)).ToList(),
                    TeacherNotes = staff ? f.TeacherNotes : null, // le note interne restano alle insegnanti
                });
            });
        }).RequireMember();

        figures.MapPost("/", async (HttpContext ctx, Db db, FigureInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.figures (tenant_id, discipline_id, apparatus, name, level_id, difficulty, description, attention_points, prerequisites, teacher_notes, cover_path, video_path, author_member_id)
                    values (app.current_tenant(), @DisciplineId, @Apparatus, @Name, @LevelId, @Difficulty, coalesce(@Description, ''), coalesce(@AttentionPoints::text[], '{}'), coalesce(@Prerequisites::text[], '{}'), coalesce(@TeacherNotes, ''),
                            coalesce(@CoverPath, @firstImage), @VideoPath, @author) returning id",
                    new { input.DisciplineId, input.Apparatus, input.Name, input.LevelId, input.Difficulty, input.Description, input.AttentionPoints, input.Prerequisites, input.TeacherNotes, input.CoverPath, input.VideoPath, firstImage = input.Steps[0].ImagePath, author = m.MemberId }, tx);
                await ReplaceSteps(c, tx, m.TenantId, newId, input.Steps);
                return newId;
            });
            return Results.Created($"/v1/figures/{id}", new { id });
        }).RequireMember(Roles.Admin, Roles.Teacher);

        figures.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, FigureInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var n = await c.ExecuteAsync(@"
                    update app.figures set discipline_id = @DisciplineId, apparatus = @Apparatus, name = @Name, level_id = @LevelId, difficulty = @Difficulty,
                      description = coalesce(@Description, ''), attention_points = coalesce(@AttentionPoints::text[], '{}'), prerequisites = coalesce(@Prerequisites::text[], '{}'),
                      teacher_notes = coalesce(@TeacherNotes, ''), cover_path = coalesce(@CoverPath, @firstImage), video_path = @VideoPath
                    where id = @id",
                    new { id, input.DisciplineId, input.Apparatus, input.Name, input.LevelId, input.Difficulty, input.Description, input.AttentionPoints, input.Prerequisites, input.TeacherNotes, input.CoverPath, input.VideoPath, firstImage = input.Steps[0].ImagePath }, tx);
                if (n == 0) throw ApiException.NotFound("Figura");
                await ReplaceSteps(c, tx, m.TenantId, id, input.Steps);
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        figures.MapDelete("/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync("delete from app.figures where id = @id", new { id }, tx));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        // ── Progressi ────────────────────────────────────────────────
        var progress = app.MapGroup("/v1/progress").RequireAuthorization().RequireModule("progress");

        progress.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (subject != m.MemberId && !m.IsTeacher) await Relations.EnsureCanActFor(c, tx, m, subject, "view");
                return await c.QueryAsync<ProgressDto>("select figure_id, status, student_note, updated_at from app.figure_progress where member_id = @subject", new { subject }, tx);
            });
        }).RequireMember();

        // Solo l'allieva (o il genitore) aggiorna il proprio stato: le valutazioni sono formative
        progress.MapPut("/{figureId:guid}", async (HttpContext ctx, Db db, Guid figureId, ProgressInput input, Guid? memberId) =>
        {
            if (!ProgressStates.Contains(input.Status)) throw ApiException.Invalid("Stato non valido: usa to_learn, planned o achieved.");
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (subject != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, subject, "view");
                await c.ExecuteAsync(@"
                    insert into app.figure_progress (tenant_id, member_id, figure_id, status, student_note, updated_at)
                    values (app.current_tenant(), @subject, @figureId, @Status, coalesce(@Note, ''), now())
                    on conflict (tenant_id, member_id, figure_id) do update set status = excluded.status,
                      student_note = coalesce(@Note, app.figure_progress.student_note), updated_at = now()",
                    new { subject, figureId, input.Status, input.Note }, tx);
            });
            return Results.NoContent();
        }).RequireMember();

        // ── Feedback e osservazioni delle insegnanti ─────────────────
        var feedback = app.MapGroup("/v1/feedback").RequireAuthorization().RequireModule("progress");

        feedback.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            var staff = m.IsAdmin || m.IsTeacher;
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (subject != m.MemberId && !staff) await Relations.EnsureCanActFor(c, tx, m, subject, "view");
                return await c.QueryAsync<FeedbackDto>(@"
                    select f.id, f.member_id, f.figure_id, f.author_member_id, a.first_name || ' ' || a.last_name as author_name, f.body, f.visible_to_student, f.created_at
                    from app.feedback f join app.members a on a.id = f.author_member_id
                    where f.member_id = @subject and (@staff or f.visible_to_student) order by f.created_at desc", new { subject, staff }, tx);
            });
        }).RequireMember();

        feedback.MapPost("/", async (HttpContext ctx, Db db, FeedbackInput input) =>
        {
            if (string.IsNullOrWhiteSpace(input.Body)) throw ApiException.Invalid("Scrivi un'osservazione.");
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (!m.IsAdmin)
                {
                    // L'insegnante scrive solo per allieve delle proprie classi
                    var ok = await c.ExecuteScalarAsync<bool>(@"select exists(select 1 from app.enrollments e join app.class_teachers t on t.class_id = e.class_id
                        where e.member_id = @MemberId and e.status = 'approved' and t.member_id = @me)", new { input.MemberId, me = m.MemberId }, tx);
                    if (!ok) throw ApiException.Forbidden("Puoi lasciare osservazioni solo alle allieve delle tue classi.");
                }
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.feedback (tenant_id, member_id, figure_id, author_member_id, body, visible_to_student)
                    values (app.current_tenant(), @MemberId, @FigureId, @me, @Body, coalesce(@VisibleToStudent, true)) returning id",
                    new { input.MemberId, input.FigureId, me = m.MemberId, input.Body, input.VisibleToStudent }, tx);
            });
            return Results.Created($"/v1/feedback/{id}", new { id });
        }).RequireMember(Roles.Admin, Roles.Teacher);
    }

    private static void Validate(FigureInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome della figura.");
        if (i.Difficulty is < 1 or > 5) throw ApiException.Invalid("La difficoltà va da 1 a 5.");
        if (i.Steps is null || i.Steps.Length == 0) throw ApiException.Invalid("Aggiungi almeno un'immagine alla sequenza.");
        if (i.Steps.Length > 20) throw ApiException.Invalid("Massimo 20 passaggi per figura.");
    }

    private static async Task ReplaceSteps(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid tenantId, Guid figureId, StepInput[] steps)
    {
        foreach (var s in steps)
            if (!MediaPaths.IsAllowed(tenantId, s.ImagePath)) throw ApiException.Invalid("Immagine non valida per questa palestra.");
        await c.ExecuteAsync("delete from app.figure_steps where figure_id = @figureId", new { figureId }, tx);
        for (var i = 0; i < steps.Length; i++)
            await c.ExecuteAsync("insert into app.figure_steps (tenant_id, figure_id, position, image_path, caption) values (app.current_tenant(), @figureId, @p, @img, @cap)",
                new { figureId, p = i + 1, img = steps[i].ImagePath, cap = steps[i].Caption ?? "" }, tx);
    }
}

/// <summary>
/// Percorsi file ammessi: file dello storage del tenant ("tenants/{id}/…") oppure
/// immagini dimostrative pubbliche della piattaforma ("/images/…").
/// Impedisce di referenziare file di un'altra palestra.
/// </summary>
public static class MediaPaths
{
    public static bool IsAllowed(Guid tenantId, string path) =>
        path.StartsWith($"tenants/{tenantId}/", StringComparison.Ordinal) && !path.Contains("..")
        || path.StartsWith("/images/", StringComparison.Ordinal) && !path.Contains("..");
}

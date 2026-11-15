using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Persone della struttura. L'amministrazione vede tutti; un insegnante solo gli
/// allievi delle proprie classi e senza dati amministrativi; un genitore solo i
/// figli collegati al proprio account; ciascuno il proprio profilo.
/// </summary>
public static class MemberEndpoints
{
    public sealed class MemberRow
    {
        public Guid Id { get; init; }
        public string FirstName { get; init; } = "";
        public string LastName { get; init; } = "";
        public string? BirthDate { get; init; }
        public bool IsMinor { get; init; }
        public bool HasAccount { get; init; }
        public bool HasAvatar { get; init; }
        public string[] Roles { get; init; } = [];
        public bool IsCompetitive { get; init; }
        /// <summary>Agonista per classificazione propria o della classe: mostra il badge AGONISTA.</summary>
        public bool CompetitiveBadge { get; init; }
        public bool CertificateMissing { get; init; }
        public Guid[] ClassIds { get; init; } = [];
        public string? Email { get; init; }
        public string? Phone { get; init; }
    }

    public sealed record CompetitiveInput(bool IsCompetitive);
    public sealed record ProfileInput(string? Phone, string? Bio, string[]? Goals);

    private const string SelectMembers = @"
        select mb.id, mb.first_name, mb.last_name, to_char(mb.birth_date, 'YYYY-MM-DD') as birth_date,
               coalesce(age(app.tenant_today(), mb.birth_date) < interval '18 years', false) as is_minor,
               mb.user_id is not null as has_account, mb.avatar_path is not null as has_avatar,
               coalesce((select ms.roles from app.memberships ms where ms.member_id = mb.id and ms.status = 'active' limit 1), '{}') as roles,
               mb.is_competitive, app.needs_competitive_certificate(mb.id) as competitive_badge,
               (app.needs_competitive_certificate(mb.id) and exists (
                  select 1 from app.document_types t where t.is_active and t.required_for_competitive and app.document_type_applies(mb.id, t.audience)
                    and not exists (select 1 from app.documents d where d.member_id = mb.id and d.type_id = t.id and d.is_current
                      and d.status = 'approved' and (d.expires_on is null or d.expires_on >= app.tenant_today())))) as certificate_missing,
               coalesce((select array_agg(e.class_id) from app.enrollments e where e.member_id = mb.id and e.status = 'approved'), '{}') as class_ids,
               case when @full then mb.email end as email, case when @full then mb.phone end as phone
        from app.members mb";

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/members").RequireAuthorization().RequireModule("students");

        g.MapGet("/", async (HttpContext ctx, Db db, string? q, Guid? classId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<MemberRow>(SelectMembers + @"
                where (@q::text is null or (mb.first_name || ' ' || mb.last_name) ilike '%' || @q || '%')
                  and (@classId::uuid is null or exists (select 1 from app.enrollments e where e.member_id = mb.id and e.class_id = @classId and e.status = 'approved'))
                  and (@full or exists (select 1 from app.enrollments e join app.class_teachers ct on ct.class_id = e.class_id
                        where e.member_id = mb.id and e.status = 'approved' and ct.member_id = @me))
                order by mb.last_name, mb.first_name limit 1000", new { q, classId, full = m.IsAdmin, me = m.MemberId }, tx));
        }).RequireMember(Roles.Admin, Roles.Teacher);

        // I figli collegati al proprio account (genitore/tutore): mai i dati di altri allievi
        g.MapGet("/children", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var rows = await c.QueryAsync<MemberRow>(SelectMembers + @" join app.guardianships g on g.child_member_id = mb.id
                    where g.guardian_member_id = @me order by mb.first_name", new { full = true, me = m.MemberId }, tx);
                var permissions = (await c.QueryAsync<(Guid Child, string[] Permissions)>(
                    "select child_member_id, permissions from app.guardianships where guardian_member_id = @me", new { me = m.MemberId }, tx)).ToDictionary(p => p.Child, p => p.Permissions);
                return rows.Select(r => new { member = r, permissions = permissions.GetValueOrDefault(r.Id) ?? [] });
            });
        }).RequireMember();

        g.MapGet("/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var own = id == m.MemberId || m.IsAdmin;
                if (!own)
                {
                    var teaches = m.IsTeacher && await c.ExecuteScalarAsync<bool>(@"select exists(select 1 from app.enrollments e join app.class_teachers ct on ct.class_id = e.class_id
                        where e.member_id = @id and e.status = 'approved' and ct.member_id = @me)", new { id, me = m.MemberId }, tx);
                    if (!teaches) { await Relations.EnsureCanActFor(c, tx, m, id, "view"); own = true; }
                }
                var row = await c.QuerySingleOrDefaultAsync<MemberRow>(SelectMembers + " where mb.id = @id", new { id, full = own }, tx) ?? throw ApiException.NotFound("Persona");
                // Dati amministrativi (tessera, validità): solo amministrazione, interessato e genitore
                var admin = own ? await c.QuerySingleOrDefaultAsync(@"select membership_status, card_number, to_char(card_expires_on, 'YYYY-MM-DD') as card_expires_on,
                    coalesce(card_expires_on >= app.tenant_today(), false) as card_valid from app.member_admin where member_id = @id", new { id }, tx) : null;
                return new { member = row, administrative = admin };
            });
        }).RequireMember();

        // Impostazione agonista / non agonista (amministrazione)
        g.MapPut("/{id:guid}/competitive", async (HttpContext ctx, Db db, Guid id, CompetitiveInput input) =>
        {
            var m = ctx.Member();
            var missing = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (await c.ExecuteAsync("update app.members set is_competitive = @IsCompetitive where id = @id", new { id, input.IsCompetitive }, tx) == 0) throw ApiException.NotFound("Persona");
                await Audit.Log(c, tx, m.UserId, m.TenantId, "member.competitive", id.ToString(), new { input.IsCompetitive });
                return input.IsCompetitive ? (await Competitive.MissingCertificates(c, tx, id)).ToArray() : [];
            });
            return Results.Ok(new { id, isCompetitive = input.IsCompetitive, missingCertificates = missing });
        }).RequireMember(Roles.Admin);

        // Dati modificabili dall'interessato (o dal genitore per il figlio)
        g.MapPut("/{id:guid}/profile", async (HttpContext ctx, Db db, Guid id, ProfileInput input) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, id, "view");
                await c.ExecuteAsync("update app.members set phone = coalesce(@Phone, phone), bio = coalesce(@Bio, bio), goals = coalesce(@Goals, goals) where id = @id",
                    new { id, input.Phone, input.Bio, input.Goals }, tx);
            });
            return Results.NoContent();
        }).RequireMember();

        // Foto del profilo: caricata dall'interessato, dal genitore o dall'amministrazione
        g.MapPost("/{id:guid}/avatar", async (HttpContext ctx, Db db, IFileStorage storage, Guid id) =>
        {
            var m = ctx.Member();
            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file") ?? throw ApiException.Invalid("Allega la foto.");
            if (file.Length == 0 || file.Length > 5 * 1024 * 1024) throw ApiException.Invalid("La foto deve pesare al massimo 5 MB.");
            if (file.ContentType is not ("image/jpeg" or "image/png" or "image/webp")) throw ApiException.Invalid("Formato non ammesso: usa JPG, PNG o WEBP.");
            var path = $"tenants/{m.TenantId}/avatars/{id}/{Guid.NewGuid():N}";
            var old = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, id, "view");
                await using var s = file.OpenReadStream();
                await storage.PutAsync(path, s, file.ContentType);
                var previous = await c.ExecuteScalarAsync<string?>("select avatar_path from app.members where id = @id for update", new { id }, tx);
                await c.ExecuteAsync("update app.members set avatar_path = @path where id = @id", new { id, path }, tx);
                await c.ExecuteAsync(@"insert into app.media_objects (tenant_id, path, content_type, bytes, owner_member_id, subject_member_ids)
                    values (app.current_tenant(), @path, @ct, @bytes, @id, array[@id]::uuid[])", new { path, ct = file.ContentType, bytes = file.Length, id }, tx);
                if (previous is not null) await c.ExecuteAsync("delete from app.media_objects where path = @previous", new { previous }, tx);
                return previous;
            });
            if (old is not null && old.StartsWith($"tenants/{m.TenantId}/", StringComparison.Ordinal)) await storage.DeleteAsync(old);
            return Results.NoContent();
        }).RequireMember();

        g.MapGet("/{id:guid}/avatar", async (HttpContext ctx, Db db, IFileStorage storage, Guid id) =>
        {
            var m = ctx.Member();
            var row = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                // Le foto degli allievi sono visibili a staff, interessato e genitore
                if (!m.IsAdmin && !m.IsTeacher && id != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, id, "view");
                return await c.QuerySingleOrDefaultAsync<(string? Path, string? Type)?>(@"
                    select mb.avatar_path, o.content_type from app.members mb left join app.media_objects o on o.path = mb.avatar_path where mb.id = @id", new { id }, tx);
            });
            if (row?.Path is not { } path || !path.StartsWith($"tenants/{m.TenantId}/", StringComparison.Ordinal)) throw ApiException.NotFound("Foto");
            var stream = await storage.GetAsync(path) ?? throw ApiException.NotFound("Foto");
            return Results.File(stream, row.Value.Type ?? "image/jpeg");
        }).RequireMember();
    }
}

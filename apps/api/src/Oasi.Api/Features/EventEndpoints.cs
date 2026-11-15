using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>Eventi (workshop, stage, gare, saggi, spettacoli…) con capienza e scadenza delle adesioni.</summary>
public static class EventEndpoints
{
    public static readonly string[] Types = ["workshop", "stage", "competition", "recital", "show", "exhibition", "special", "social"];

    /// <summary>Tipi che prevedono un'esibizione: per questi si possono indicare i brani musicali.</summary>
    public static readonly string[] PerformanceTypes = ["competition", "recital", "show", "exhibition"];

    public sealed class EventDto
    {
        public Guid Id { get; init; }
        public string Type { get; init; } = "";
        public string Title { get; init; } = "";
        public string Description { get; init; } = "";
        public string Date { get; init; } = "";
        public string StartTime { get; init; } = "";
        public string EndTime { get; init; } = "";
        public string Location { get; init; } = "";
        public string? ImagePath { get; init; }
        public int Capacity { get; init; }
        public DateTime? SignupDeadline { get; init; }
        public int Signups { get; init; }
        public bool Joined { get; init; }
        public bool IsPublished { get; init; }
        public bool IsFeatured { get; init; }
        public bool IsPerformance => PerformanceTypes.Contains(Type);
        public Guid[] ClassIds { get; init; } = [];
        public Guid[] DisciplineIds { get; init; } = [];
        public Guid[] TeacherIds { get; init; } = [];
    }
    public sealed record EventInput(string Type, string Title, string? Description, string Date, string StartTime, string EndTime, string? Location,
        string? ImagePath, int Capacity, DateTime? SignupDeadline, bool? IsPublished = null, bool? IsFeatured = null,
        Guid[]? ClassIds = null, Guid[]? DisciplineIds = null, Guid[]? TeacherIds = null, bool? Notify = null);
    public sealed record TrackInput(string Title, string? Artist, string? GroupLabel, Guid? ClassId, int? Position);

    private const string SelectEvents = @"
        select e.id, e.type, e.title, e.description, to_char(e.date, 'YYYY-MM-DD') as date, to_char(e.start_time, 'HH24:MI') as start_time,
               to_char(e.end_time, 'HH24:MI') as end_time, e.location, e.image_path, e.capacity, e.signup_deadline,
               (select count(*)::int from app.event_signups s where s.event_id = e.id and s.status = 'confirmed') as signups,
               exists(select 1 from app.event_signups s where s.event_id = e.id and s.member_id = @me and s.status = 'confirmed') as joined,
               e.is_published, e.is_featured,
               coalesce((select array_agg(k.target_id) from app.event_links k where k.event_id = e.id and k.kind = 'class'), '{}') as class_ids,
               coalesce((select array_agg(k.target_id) from app.event_links k where k.event_id = e.id and k.kind = 'discipline'), '{}') as discipline_ids,
               coalesce((select array_agg(k.target_id) from app.event_links k where k.event_id = e.id and k.kind = 'teacher'), '{}') as teacher_ids
        from app.events e";
    public sealed record SignupInput(Guid? MemberId);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/events").RequireAuthorization().RequireModule("events");

        g.MapGet("/", async (HttpContext ctx, Db db, bool? past) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<EventDto>(SelectEvents + @"
                where ((@past and e.date < app.tenant_today()) or (not @past and e.date >= app.tenant_today()))
                  and (e.is_published or @staff)
                order by e.date", new { me = m.MemberId, past = past ?? false, staff = m.IsAdmin || m.IsTeacher }, tx));
        }).RequireMember();

        // Home: il prossimo saggio o evento principale (quello in evidenza, altrimenti il più vicino)
        g.MapGet("/next", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            var e = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryFirstOrDefaultAsync<EventDto>(SelectEvents + @"
                where e.is_published and app.local_instant(e.date, e.end_time) >= now()
                order by e.is_featured desc, e.date, e.start_time limit 1", new { me = m.MemberId }, tx));
            return e is null ? Results.NoContent() : Results.Ok(e);
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, EventInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.events (tenant_id, type, title, description, date, start_time, end_time, location, image_path, capacity, signup_deadline, is_published, is_featured, created_by)
                    values (app.current_tenant(), @Type, @Title, coalesce(@Description, ''), @Date::date, @StartTime::time, @EndTime::time, coalesce(@Location, ''), @ImagePath, @Capacity, @SignupDeadline,
                            coalesce(@IsPublished, true), coalesce(@IsFeatured, false), @user) returning id",
                    new { input.Type, input.Title, input.Description, input.Date, input.StartTime, input.EndTime, input.Location, input.ImagePath, input.Capacity, input.SignupDeadline,
                          input.IsPublished, input.IsFeatured, user = m.UserId }, tx);
                await SaveLinks(c, tx, newId, input);
                if (input.IsFeatured == true) await c.ExecuteAsync("update app.events set is_featured = false where id <> @newId and is_featured", new { newId }, tx);
                if (input.Notify != false && input.IsPublished != false) await NotifyAudience(c, tx, newId, m.UserId, "Nuovo evento", input);
                return newId;
            });
            return Results.Created($"/v1/events/{id}", new { id });
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, EventInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var signups = await c.ExecuteScalarAsync<int>("select count(*) from app.event_signups where event_id = @id and status = 'confirmed'", new { id }, tx);
                if (input.Capacity < signups) throw ApiException.Conflict("capacity_below_signups", $"Ci sono già {signups} adesioni.");
                var before = await c.QuerySingleOrDefaultAsync<(string Date, string Start, string Location, bool Published)?>(
                    "select to_char(date, 'YYYY-MM-DD'), to_char(start_time, 'HH24:MI'), location, is_published from app.events where id = @id", new { id }, tx);
                if (before is not { } b) return 0;
                var rows = await c.ExecuteAsync(@"update app.events set type = @Type, title = @Title, description = coalesce(@Description, ''), date = @Date::date,
                    start_time = @StartTime::time, end_time = @EndTime::time, location = coalesce(@Location, ''), image_path = @ImagePath,
                    capacity = @Capacity, signup_deadline = @SignupDeadline, is_published = coalesce(@IsPublished, is_published),
                    is_featured = coalesce(@IsFeatured, is_featured), updated_at = now() where id = @id",
                    new { id, input.Type, input.Title, input.Description, input.Date, input.StartTime, input.EndTime, input.Location, input.ImagePath, input.Capacity, input.SignupDeadline, input.IsPublished, input.IsFeatured }, tx);
                await SaveLinks(c, tx, id, input);
                if (input.IsFeatured == true) await c.ExecuteAsync("update app.events set is_featured = false where id <> @id and is_featured", new { id }, tx);
                // Avvisa solo se cambia qualcosa che conta per chi partecipa (data, ora, luogo) o alla prima pubblicazione
                var published = input.IsPublished ?? b.Published;
                var changed = b.Date != input.Date || b.Start != input.StartTime || b.Location != (input.Location ?? "");
                if (input.Notify != false && published && (changed || !b.Published))
                    await NotifyAudience(c, tx, id, m.UserId, b.Published ? "Evento aggiornato" : "Nuovo evento", input);
                return rows;
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Brani delle performance: solo i nomi, nessun file audio
        g.MapGet("/{id:guid}/tracks", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync(@"
                select t.id, t.position, t.title, t.artist, t.group_label, t.class_id, cl.name as class_name
                from app.event_tracks t left join app.classes cl on cl.id = t.class_id
                join app.events e on e.id = t.event_id
                where t.event_id = @id and (e.is_published or @staff) order by t.position, t.created_at", new { id, staff = m.IsAdmin || m.IsTeacher }, tx).ContinueWith(t => t.Result.Camel()));
        }).RequireMember();

        g.MapPost("/{id:guid}/tracks", async (HttpContext ctx, Db db, Guid id, TrackInput input) =>
        {
            if (string.IsNullOrWhiteSpace(input.Title)) throw ApiException.Invalid("Inserisci il titolo del brano.");
            var m = ctx.Member();
            var trackId = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var type = await c.ExecuteScalarAsync<string?>("select type from app.events where id = @id", new { id }, tx) ?? throw ApiException.NotFound("Evento");
                if (!PerformanceTypes.Contains(type)) throw ApiException.Conflict("not_a_performance", "I brani si indicano solo per gare, saggi, spettacoli ed esibizioni.");
                // Un insegnante associa brani solo ai gruppi/classi che gli sono assegnati
                if (!m.IsAdmin && input.ClassId is { } classId) await Relations.EnsureCanManageClass(c, tx, m, classId);
                return await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.event_tracks (tenant_id, event_id, position, title, artist, group_label, class_id, added_by)
                    values (app.current_tenant(), @id, coalesce(@Position, (select coalesce(max(position), 0) + 1 from app.event_tracks where event_id = @id)),
                            @Title, coalesce(@Artist, ''), coalesce(@GroupLabel, ''), @ClassId, @user) returning id",
                    new { id, input.Position, Title = input.Title.Trim(), input.Artist, input.GroupLabel, input.ClassId, user = m.UserId }, tx);
            });
            return Results.Created($"/v1/events/{id}/tracks/{trackId}", new { id = trackId });
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapPut("/{id:guid}/tracks/{trackId:guid}", async (HttpContext ctx, Db db, Guid id, Guid trackId, TrackInput input) =>
        {
            if (string.IsNullOrWhiteSpace(input.Title)) throw ApiException.Invalid("Inserisci il titolo del brano.");
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await EnsureCanEditTrack(c, tx, m, id, trackId);
                if (!m.IsAdmin && input.ClassId is { } classId) await Relations.EnsureCanManageClass(c, tx, m, classId);
                return await c.ExecuteAsync(@"update app.event_tracks set title = @Title, artist = coalesce(@Artist, ''), group_label = coalesce(@GroupLabel, ''),
                    class_id = @ClassId, position = coalesce(@Position, position) where id = @trackId and event_id = @id",
                    new { id, trackId, Title = input.Title.Trim(), input.Artist, input.GroupLabel, input.ClassId, input.Position }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapDelete("/{id:guid}/tracks/{trackId:guid}", async (HttpContext ctx, Db db, Guid id, Guid trackId) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await EnsureCanEditTrack(c, tx, m, id, trackId);
                return await c.ExecuteAsync("delete from app.event_tracks where id = @trackId and event_id = @id", new { id, trackId }, tx);
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapGet("/{id:guid}/signups", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<(Guid MemberId, string Name, DateTime CreatedAt)>(@"
                select s.member_id, mb.first_name || ' ' || mb.last_name as name, s.created_at
                from app.event_signups s join app.members mb on mb.id = s.member_id
                where s.event_id = @id and s.status = 'confirmed' order by s.created_at", new { id }, tx)
                .ContinueWith(t => t.Result.Select(r => new { memberId = r.MemberId, name = r.Name, createdAt = r.CreatedAt })));
        }).RequireMember(Roles.Admin, Roles.Teacher);

        g.MapPost("/{id:guid}/signup", async (HttpContext ctx, Db db, Guid id, SignupInput? input) =>
        {
            var m = ctx.Member();
            var subject = input?.MemberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                var e = await c.QuerySingleOrDefaultAsync<(int Capacity, DateTime? SignupDeadline, bool Started)?>(
                    "select capacity, signup_deadline, app.local_instant(date, start_time) < now() as started from app.events where id = @id for update", new { id }, tx)
                    ?? throw ApiException.NotFound("Evento");
                var now = DateTime.UtcNow;
                if ((e.SignupDeadline is { } d && d < now) || e.Started) throw ApiException.Conflict("signup_closed", "Le adesioni sono chiuse.");
                var count = await c.ExecuteScalarAsync<int>("select count(*) from app.event_signups where event_id = @id and status = 'confirmed'", new { id }, tx);
                if (count >= e.Capacity) throw ApiException.Conflict("event_full", "Posti esauriti.");
                await c.ExecuteAsync(@"insert into app.event_signups (tenant_id, event_id, member_id, status) values (app.current_tenant(), @id, @subject, 'confirmed')
                    on conflict (tenant_id, event_id, member_id) do update set status = 'confirmed', created_at = now()", new { id, subject }, tx);
            });
            return Results.NoContent();
        }).RequireMember();

        g.MapDelete("/{id:guid}/signup", async (HttpContext ctx, Db db, Guid id, Guid? memberId) =>
        {
            var m = ctx.Member();
            var subject = memberId ?? m.MemberId;
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, subject, "enroll");
                await c.ExecuteAsync("update app.event_signups set status = 'cancelled' where event_id = @id and member_id = @subject", new { id, subject }, tx);
            });
            return Results.NoContent();
        }).RequireMember();
    }

    /// <summary>L'amministrazione modifica tutti i brani; un insegnante quelli inseriti da lui o delle sue classi.</summary>
    private static async Task EnsureCanEditTrack(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Member m, Guid eventId, Guid trackId)
    {
        if (m.IsAdmin) return;
        var t = await c.QuerySingleOrDefaultAsync<(Guid? AddedBy, Guid? ClassId)?>("select added_by, class_id from app.event_tracks where id = @trackId and event_id = @eventId", new { trackId, eventId }, tx)
            ?? throw ApiException.NotFound("Brano");
        if (t.AddedBy == m.UserId) return;
        if (t.ClassId is { } classId && await Relations.TeachesClass(c, tx, m, classId)) return;
        throw ApiException.Forbidden("Puoi modificare solo i brani inseriti da te o delle tue classi.");
    }

    private static async Task SaveLinks(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid eventId, EventInput input)
    {
        foreach (var (kind, ids, table) in new[] { ("class", input.ClassIds, "classes"), ("discipline", input.DisciplineIds, "disciplines"), ("teacher", input.TeacherIds, "members") })
        {
            if (ids is null) continue;   // non inviato: i collegamenti restano come sono
            var known = await c.ExecuteScalarAsync<int>($"select count(*) from app.{table} where id = any(@ids)", new { ids }, tx);
            if (known != ids.Distinct().Count()) throw ApiException.Invalid("Uno degli elementi collegati non esiste.");
            await c.ExecuteAsync("delete from app.event_links where event_id = @eventId and kind = @kind", new { eventId, kind }, tx);
            foreach (var target in ids.Distinct())
                await c.ExecuteAsync("insert into app.event_links (tenant_id, event_id, kind, target_id) values (app.current_tenant(), @eventId, @kind, @target)", new { eventId, kind, target }, tx);
        }
    }

    /// <summary>
    /// Destinatari: se l'evento è collegato a classi, discipline o insegnanti, solo gli interessati
    /// (allievi, loro genitori, insegnanti); altrimenti tutta la struttura.
    /// </summary>
    private static async Task NotifyAudience(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid eventId, Guid actor, string title, EventInput input)
    {
        var linked = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.event_links where event_id = @eventId)", new { eventId }, tx);
        IEnumerable<Guid> users;
        if (!linked) users = await Notifications.Notifier.UsersWithRoles(c, tx, Roles.Student, Roles.Guardian, Roles.Teacher);
        else users = await c.QueryAsync<Guid>(@"
            with cls as (
              select k.target_id as class_id from app.event_links k where k.event_id = @eventId and k.kind = 'class'
              union select cd.class_id from app.event_links k join app.class_disciplines cd on cd.discipline_id = k.target_id where k.event_id = @eventId and k.kind = 'discipline'
            ), people as (
              select e.member_id from app.enrollments e join cls on cls.class_id = e.class_id where e.status = 'approved'
              union select ct.member_id from app.class_teachers ct join cls on cls.class_id = ct.class_id
              union select k.target_id from app.event_links k where k.event_id = @eventId and k.kind = 'teacher'
            )
            select mb.user_id from people p join app.members mb on mb.id = p.member_id where mb.user_id is not null
            union
            select g.user_id from people p join app.guardianships x on x.child_member_id = p.member_id join app.members g on g.id = x.guardian_member_id where g.user_id is not null",
            new { eventId }, tx);
        var when = DateOnly.Parse(input.Date).ToString("d MMMM", System.Globalization.CultureInfo.GetCultureInfo("it-IT"));
        await Notifications.Notifier.ToUsers(c, tx, users.Where(u => u != actor), "events", $"{title}: {input.Title}",
            $"{when}, ore {input.StartTime}{(string.IsNullOrWhiteSpace(input.Location) ? "" : " · " + input.Location)}", actor, link: $"/eventi/{eventId}");
    }

    private static void Validate(EventInput i)
    {
        if (!Types.Contains(i.Type)) throw ApiException.Invalid("Tipo di evento non valido.");
        if (string.IsNullOrWhiteSpace(i.Title)) throw ApiException.Invalid("Inserisci un titolo.");
        if (!DateOnly.TryParse(i.Date, out _)) throw ApiException.Invalid("Data non valida.");
        if (!TimeOnly.TryParse(i.StartTime, out var s) || !TimeOnly.TryParse(i.EndTime, out var e) || e <= s) throw ApiException.Invalid("Orario non valido.");
        if (i.Capacity < 1) throw ApiException.Invalid("Capienza non valida.");
    }
}

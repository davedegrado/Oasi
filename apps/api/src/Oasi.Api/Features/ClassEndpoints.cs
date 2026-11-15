using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

public static class ClassEndpoints
{
    public sealed class ClassDto
    {
        public Guid Id { get; init; }
        public string Name { get; init; } = "";
        public Guid DisciplineId { get; init; }
        public Guid? LevelId { get; init; }
        public Guid? RoomId { get; init; }
        public short? AgeMin { get; init; }
        public short? AgeMax { get; init; }
        public short Capacity { get; init; }
        public short Weekday { get; init; }
        public string StartTime { get; init; } = "";
        public string EndTime { get; init; } = "";
        public string Description { get; init; } = "";
        public bool IsActive { get; init; }
        public int Enrolled { get; init; }
        public Guid[] TeacherIds { get; init; } = [];
        /// <summary>Una o più discipline dall'archivio della struttura (la prima è la principale).</summary>
        public Guid[] DisciplineIds { get; init; } = [];
        public string CompetitiveLevel { get; init; } = "none";
    }

    public sealed record ClassInput(string Name, Guid DisciplineId, Guid? LevelId, Guid? RoomId, int? AgeMin, int? AgeMax,
        int Capacity, int Weekday, string StartTime, string EndTime, string? Description, Guid[]? TeacherIds,
        Guid[]? DisciplineIds = null, string? CompetitiveLevel = null);

    private const string SelectClasses = @"
        select c.id, c.name, c.discipline_id, c.level_id, c.room_id, c.age_min, c.age_max, c.capacity, c.weekday,
               to_char(c.start_time, 'HH24:MI') as start_time, to_char(c.end_time, 'HH24:MI') as end_time,
               c.description, c.is_active,
               (select count(*)::int from app.enrollments e where e.class_id = c.id and e.status = 'approved') as enrolled,
               coalesce((select array_agg(member_id) from app.class_teachers t where t.class_id = c.id), '{}') as teacher_ids,
               coalesce((select array_agg(cd.discipline_id order by (cd.discipline_id = c.discipline_id) desc, d.position)
                         from app.class_disciplines cd join app.disciplines d on d.id = cd.discipline_id where cd.class_id = c.id), '{}') as discipline_ids,
               c.competitive_level
        from app.classes c";

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/classes").RequireAuthorization().RequireModule("classes");

        // Catalogo delle classi: visibile a tutti i membri (serve per le richieste di iscrizione)
        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) =>
                c.QueryAsync<ClassDto>(SelectClasses + " where c.is_active or @admin order by c.weekday, c.start_time", new { admin = m.IsAdmin }, tx));
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, ClassInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                foreach (var d in Disciplines(input)) await EnsureActiveDiscipline(c, tx, d);
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.classes (tenant_id, name, discipline_id, level_id, room_id, age_min, age_max, capacity, weekday, start_time, end_time, description, competitive_level)
                    values (app.current_tenant(), @Name, @DisciplineId, @LevelId, @RoomId, @AgeMin, @AgeMax, @Capacity, @Weekday, @StartTime::time, @EndTime::time, coalesce(@Description, ''), coalesce(@CompetitiveLevel, 'none'))
                    returning id", input, tx);
                await SetTeachers(c, tx, newId, input.TeacherIds);
                await SetDisciplines(c, tx, newId, Disciplines(input));
                // Genera le lezioni delle prossime 8 settimane
                await c.ExecuteAsync(@"
                    insert into app.lessons (tenant_id, class_id, date, start_time, end_time)
                    select app.current_tenant(), @newId, d::date, @StartTime::time, @EndTime::time
                    from generate_series(app.tenant_today(), app.tenant_today() + 55, interval '1 day') d
                    where extract(isodow from d) = @Weekday", new { newId, input.StartTime, input.EndTime, input.Weekday }, tx);
                await ClosureEndpoints.ApplyAllClosures(c, tx, newId);
                return newId;
            });
            return Results.Created($"/v1/classes/{id}", new { id });
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, ClassInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var currentDiscipline = await c.ExecuteScalarAsync<Guid?>("select discipline_id from app.classes where id = @id", new { id }, tx)
                    ?? throw ApiException.NotFound("Classe");
                var currentAll = (await c.QueryAsync<Guid>("select discipline_id from app.class_disciplines where class_id = @id", new { id }, tx)).ToHashSet();
                foreach (var d in Disciplines(input).Where(d => d != currentDiscipline && !currentAll.Contains(d))) await EnsureActiveDiscipline(c, tx, d);
                var enrolled = await c.ExecuteScalarAsync<int>("select count(*) from app.enrollments where class_id = @id and status = 'approved'", new { id }, tx);
                if (input.Capacity < enrolled) throw ApiException.Conflict("capacity_below_enrolled", $"La classe ha già {enrolled} iscritte.");
                var n = await c.ExecuteAsync(@"
                    update app.classes set name = @Name, discipline_id = @DisciplineId, level_id = @LevelId, room_id = @RoomId,
                      age_min = @AgeMin, age_max = @AgeMax, capacity = @Capacity, weekday = @Weekday,
                      start_time = @StartTime::time, end_time = @EndTime::time, description = coalesce(@Description, ''),
                      competitive_level = coalesce(@CompetitiveLevel, competitive_level)
                    where id = @id", new { id, input.Name, input.DisciplineId, input.LevelId, input.RoomId, input.AgeMin, input.AgeMax, input.Capacity, input.Weekday, input.StartTime, input.EndTime, input.Description, input.CompetitiveLevel }, tx);
                if (n == 0) throw ApiException.NotFound("Classe");
                await SetDisciplines(c, tx, id, Disciplines(input));
                if (input.TeacherIds is not null) await SetTeachers(c, tx, id, input.TeacherIds);
                // Aggiorna gli orari delle lezioni future regolari
                await c.ExecuteAsync(@"update app.lessons set start_time = @StartTime::time, end_time = @EndTime::time
                    where class_id = @id and date >= app.tenant_today() and status = 'scheduled'", new { id, input.StartTime, input.EndTime }, tx);
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Riepilogo compatto delle presenze della classe: totali e assenze consecutive recenti
        g.MapGet("/{id:guid}/attendance-summary", async (HttpContext ctx, Db db, Guid id, string? from, string? to) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanManageClass(c, tx, m, id);
                return await c.QueryAsync(@"
                    with past as (
                      select l.id, l.date from app.lessons l
                      where l.class_id = @id and l.status <> 'cancelled' and l.date <= app.tenant_today()
                        and (@from::date is null or l.date >= @from::date) and (@to::date is null or l.date <= @to::date)
                    ), marks as (
                      select e.member_id, p.date, a.actual,
                             row_number() over (partition by e.member_id order by p.date desc) as recency
                      from app.enrollments e cross join past p
                      left join app.attendance a on a.lesson_id = p.id and a.member_id = e.member_id
                      where e.class_id = @id and e.status = 'approved'
                    )
                    select mb.id as member_id, mb.first_name, mb.last_name, mb.is_competitive,
                           count(*) filter (where k.actual = 'present')::int as present,
                           count(*) filter (where k.actual = 'absent')::int as absent,
                           count(*) filter (where k.actual is null)::int as unrecorded,
                           -- assenze consecutive a partire dalla lezione più recente registrata
                           coalesce((select count(*) from marks x where x.member_id = mb.id and x.actual = 'absent'
                             and x.recency < coalesce((select min(y.recency) from marks y where y.member_id = mb.id and y.actual = 'present'), 100000)), 0)::int as consecutive_absences,
                           to_char(max(k.date) filter (where k.actual = 'present'), 'YYYY-MM-DD') as last_present
                    from marks k join app.members mb on mb.id = k.member_id
                    group by mb.id, mb.first_name, mb.last_name, mb.is_competitive
                    order by consecutive_absences desc, absent desc, mb.last_name", new { id, from, to }, tx);
            });
        }).RequireMember(Roles.Admin, Roles.Teacher).RequireModule("attendance");
    }

    /// <summary>Discipline della classe: la principale più le altre scelte dall'archivio (nessun limite fisso).</summary>
    private static Guid[] Disciplines(ClassInput i) => new[] { i.DisciplineId }.Concat(i.DisciplineIds ?? []).Distinct().ToArray();

    private static async Task SetDisciplines(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid classId, Guid[] disciplineIds)
    {
        await c.ExecuteAsync("delete from app.class_disciplines where class_id = @classId and discipline_id <> all(@disciplineIds)", new { classId, disciplineIds }, tx);
        foreach (var d in disciplineIds)
            await c.ExecuteAsync(@"insert into app.class_disciplines (tenant_id, class_id, discipline_id) values (app.current_tenant(), @classId, @d)
                on conflict do nothing", new { classId, d }, tx);
    }

    private static async Task EnsureActiveDiscipline(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid disciplineId)
    {
        var active = await c.ExecuteScalarAsync<bool?>("select is_active from app.disciplines where id = @disciplineId", new { disciplineId }, tx)
            ?? throw ApiException.Invalid("Disciplina inesistente.");
        if (!active) throw ApiException.Conflict("discipline_inactive", "La disciplina è disattivata: riattivala per creare nuove classi.");
    }

    private static void Validate(ClassInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome della classe.");
        if (i.Capacity is < 1 or > 200) throw ApiException.Invalid("Capienza non valida.");
        if (i.CompetitiveLevel is not (null or "none" or "pre_competitive" or "competitive")) throw ApiException.Invalid("Classificazione non valida.");
        if (i.Weekday is < 1 or > 7) throw ApiException.Invalid("Giorno non valido.");
        if (!TimeOnly.TryParse(i.StartTime, out var s) || !TimeOnly.TryParse(i.EndTime, out var e) || e <= s)
            throw ApiException.Invalid("L'orario di fine deve essere successivo all'inizio.");
    }

    private static async Task SetTeachers(System.Data.IDbConnection c, System.Data.IDbTransaction tx, Guid classId, Guid[]? teacherIds)
    {
        await c.ExecuteAsync("delete from app.class_teachers where class_id = @classId", new { classId }, tx);
        foreach (var t in teacherIds ?? [])
            await c.ExecuteAsync("insert into app.class_teachers (tenant_id, class_id, member_id) values (app.current_tenant(), @classId, @t)", new { classId, t }, tx);
    }
}

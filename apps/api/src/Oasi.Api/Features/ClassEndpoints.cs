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
    }

    public sealed record ClassInput(string Name, Guid DisciplineId, Guid? LevelId, Guid? RoomId, int? AgeMin, int? AgeMax,
        int Capacity, int Weekday, string StartTime, string EndTime, string? Description, Guid[]? TeacherIds);

    private const string SelectClasses = @"
        select c.id, c.name, c.discipline_id, c.level_id, c.room_id, c.age_min, c.age_max, c.capacity, c.weekday,
               to_char(c.start_time, 'HH24:MI') as start_time, to_char(c.end_time, 'HH24:MI') as end_time,
               c.description, c.is_active,
               (select count(*)::int from app.enrollments e where e.class_id = c.id and e.status = 'approved') as enrolled,
               coalesce((select array_agg(member_id) from app.class_teachers t where t.class_id = c.id), '{}') as teacher_ids
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
                var newId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.classes (tenant_id, name, discipline_id, level_id, room_id, age_min, age_max, capacity, weekday, start_time, end_time, description)
                    values (app.current_tenant(), @Name, @DisciplineId, @LevelId, @RoomId, @AgeMin, @AgeMax, @Capacity, @Weekday, @StartTime::time, @EndTime::time, coalesce(@Description, ''))
                    returning id", input, tx);
                await SetTeachers(c, tx, newId, input.TeacherIds);
                // Genera le lezioni delle prossime 8 settimane
                await c.ExecuteAsync(@"
                    insert into app.lessons (tenant_id, class_id, date, start_time, end_time)
                    select app.current_tenant(), @newId, d::date, @StartTime::time, @EndTime::time
                    from generate_series(current_date, current_date + 55, interval '1 day') d
                    where extract(isodow from d) = @Weekday", new { newId, input.StartTime, input.EndTime, input.Weekday }, tx);
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
                var enrolled = await c.ExecuteScalarAsync<int>("select count(*) from app.enrollments where class_id = @id and status = 'approved'", new { id }, tx);
                if (input.Capacity < enrolled) throw ApiException.Conflict("capacity_below_enrolled", $"La classe ha già {enrolled} iscritte.");
                var n = await c.ExecuteAsync(@"
                    update app.classes set name = @Name, discipline_id = @DisciplineId, level_id = @LevelId, room_id = @RoomId,
                      age_min = @AgeMin, age_max = @AgeMax, capacity = @Capacity, weekday = @Weekday,
                      start_time = @StartTime::time, end_time = @EndTime::time, description = coalesce(@Description, '')
                    where id = @id", new { id, input.Name, input.DisciplineId, input.LevelId, input.RoomId, input.AgeMin, input.AgeMax, input.Capacity, input.Weekday, input.StartTime, input.EndTime, input.Description }, tx);
                if (n == 0) throw ApiException.NotFound("Classe");
                if (input.TeacherIds is not null) await SetTeachers(c, tx, id, input.TeacherIds);
                // Aggiorna gli orari delle lezioni future regolari
                await c.ExecuteAsync(@"update app.lessons set start_time = @StartTime::time, end_time = @EndTime::time
                    where class_id = @id and date >= current_date and status = 'scheduled'", new { id, input.StartTime, input.EndTime }, tx);
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);
    }

    private static void Validate(ClassInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome della classe.");
        if (i.Capacity is < 1 or > 200) throw ApiException.Invalid("Capienza non valida.");
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

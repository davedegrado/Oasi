using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Stagioni e periodi. Una sola stagione è attiva; le precedenti restano
/// nello storico. Le incongruenze nelle date vengono segnalate
/// all'amministrazione (campo "warnings"), mai corrette in silenzio.
/// </summary>
public static class SeasonEndpoints
{
    public sealed record PeriodInput(string Name, string StartDate, string EndDate);
    public sealed record SeasonInput(string Name, string StartDate, string EndDate, PeriodInput[]? Periods, Guid? CopyPlansFromSeasonId);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/seasons").RequireAuthorization().RequireModule("calendar");

        g.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var seasons = await c.QueryAsync(@"select id, name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, status
                    from app.seasons where status <> 'draft' or @admin order by start_date desc", new { admin = m.IsAdmin }, tx);
                var periods = (await c.QueryAsync(@"select id, season_id, name, position, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
                    from app.season_periods order by position", transaction: tx)).ToList();
                return seasons.Select(s => new
                {
                    id = (Guid)s.id, name = (string)s.name, startDate = (string)s.start_date, endDate = (string)s.end_date, status = (string)s.status,
                    periods = periods.Where(p => (Guid)p.season_id == (Guid)s.id)
                        .Select(p => new { id = (Guid)p.id, name = (string)p.name, position = (short)p.position, startDate = (string)p.start_date, endDate = (string)p.end_date }),
                });
            });
        }).RequireMember();

        g.MapPost("/", async (HttpContext ctx, Db db, SeasonInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var id = await c.ExecuteScalarAsync<Guid>(@"insert into app.seasons (tenant_id, name, start_date, end_date)
                    values (app.current_tenant(), @Name, @StartDate::date, @EndDate::date) returning id", input, tx);
                await SavePeriods(c, tx, id, input.Periods ?? []);
                if (input.CopyPlansFromSeasonId is { } from) await CopyPlans(c, tx, from, id);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "season.create", id.ToString(), new { input.Name });
                return new { id, warnings = await Warnings(c, tx, id) };
            });
            return Results.Created($"/v1/seasons/{result.id}", result);
        }).RequireMember(Roles.Admin);

        g.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, SeasonInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var warnings = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var n = await c.ExecuteAsync("update app.seasons set name = @Name, start_date = @StartDate::date, end_date = @EndDate::date where id = @id and status <> 'archived'",
                    new { id, input.Name, input.StartDate, input.EndDate }, tx);
                if (n == 0) throw ApiException.Conflict("season_archived", "La stagione non esiste o è archiviata: lo storico non si modifica.");
                if (input.Periods is not null) await SavePeriods(c, tx, id, input.Periods);
                return await Warnings(c, tx, id);
            });
            return Results.Ok(new { id, warnings });
        }).RequireMember(Roles.Admin);

        // Attiva la stagione: quella precedente passa allo storico (non viene eliminata)
        g.MapPost("/{id:guid}/activate", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var status = await c.ExecuteScalarAsync<string?>("select status from app.seasons where id = @id for update", new { id }, tx) ?? throw ApiException.NotFound("Stagione");
                if (status == "archived") throw ApiException.Conflict("season_archived", "Una stagione archiviata non si riattiva.");
                await c.ExecuteAsync("update app.seasons set status = 'archived' where status = 'active' and id <> @id", new { id }, tx);
                await c.ExecuteAsync("update app.seasons set status = 'active' where id = @id", new { id }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "season.activate", id.ToString());
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Verifica di coerenza prima dell'attivazione
        g.MapGet("/{id:guid}/check", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) => new { id, warnings = await Warnings(c, tx, id) });
        }).RequireMember(Roles.Admin);
    }

    private static void Validate(SeasonInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome della stagione.");
        if (!DateOnly.TryParse(i.StartDate, out var s) || !DateOnly.TryParse(i.EndDate, out var e) || e <= s) throw ApiException.Invalid("Date della stagione non valide.");
        foreach (var p in i.Periods ?? [])
        {
            if (string.IsNullOrWhiteSpace(p.Name)) throw ApiException.Invalid("Ogni periodo deve avere un nome.");
            if (!DateOnly.TryParse(p.StartDate, out var ps) || !DateOnly.TryParse(p.EndDate, out var pe) || pe < ps) throw ApiException.Invalid($"Date non valide per il periodo {p.Name}.");
            if (ps < s || pe > e) throw ApiException.Invalid($"Il periodo {p.Name} esce dalle date della stagione.");
        }
    }

    private static async Task SavePeriods(IDbConnection c, IDbTransaction tx, Guid seasonId, PeriodInput[] periods)
    {
        // Aggiorna per posizione: i periodi già usati da piani acquistati non vengono eliminati
        for (var i = 0; i < periods.Length; i++)
            await c.ExecuteAsync(@"insert into app.season_periods (tenant_id, season_id, name, position, start_date, end_date)
                values (app.current_tenant(), @seasonId, @Name, @pos, @StartDate::date, @EndDate::date)
                on conflict (tenant_id, season_id, position) do update set name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date",
                new { seasonId, pos = (short)(i + 1), periods[i].Name, periods[i].StartDate, periods[i].EndDate }, tx);
        await c.ExecuteAsync(@"delete from app.season_periods p where p.season_id = @seasonId and p.position > @n
            and not exists (select 1 from app.member_plans mp where mp.period_id = p.id)", new { seasonId, n = periods.Length }, tx);
    }

    /// <summary>Copia i piani in una nuova stagione, senza date: l'amministrazione le imposta e li riattiva.</summary>
    private static async Task CopyPlans(IDbConnection c, IDbTransaction tx, Guid from, Guid to)
    {
        var plans = await c.QueryAsync<Guid>("select id from app.fee_plans where season_id = @from and is_active", new { from }, tx);
        foreach (var old in plans)
        {
            var id = await c.ExecuteScalarAsync<Guid>(@"
                insert into app.fee_plans (tenant_id, name, kind, amount_cents, is_active, season_id, category, description, billing, weekly_frequency, entries,
                  validity_weeks, lesson_minutes, booking_required, booking_hours_before, age_min_months, age_max_months, participants, max_participants,
                  competitive_level, grants_makeups, position)
                select tenant_id, name, kind, amount_cents, false, @to, category, description, billing, weekly_frequency, entries,
                  validity_weeks, lesson_minutes, booking_required, booking_hours_before, age_min_months, age_max_months, participants, max_participants,
                  competitive_level, grants_makeups, position
                from app.fee_plans where id = @old returning id", new { old, to }, tx);
            await c.ExecuteAsync(@"insert into app.plan_installments (tenant_id, plan_id, position, amount_cents)
                select tenant_id, @id, position, amount_cents from app.plan_installments where plan_id = @old", new { id, old }, tx);
        }
    }

    /// <summary>Incongruenze da segnalare: sovrapposizioni, buchi, chiusure fuori stagione, piani senza date.</summary>
    internal static async Task<List<string>> Warnings(IDbConnection c, IDbTransaction tx, Guid seasonId)
    {
        var w = new List<string>();
        var season = await c.QuerySingleAsync<(DateTime Start, DateTime End)>("select start_date::timestamp, end_date::timestamp from app.seasons where id = @seasonId", new { seasonId }, tx);
        var periods = (await c.QueryAsync<(string Name, DateTime Start, DateTime End)>(
            "select name, start_date::timestamp, end_date::timestamp from app.season_periods where season_id = @seasonId order by start_date", new { seasonId }, tx)).ToList();
        for (var i = 1; i < periods.Count; i++)
        {
            if (periods[i].Start <= periods[i - 1].End) w.Add($"I periodi «{periods[i - 1].Name}» e «{periods[i].Name}» si sovrappongono.");
            else if ((periods[i].Start - periods[i - 1].End).Days > 1) w.Add($"Tra «{periods[i - 1].Name}» e «{periods[i].Name}» ci sono giorni non coperti da alcun periodo.");
        }
        if (periods.Count > 0)
        {
            if (periods[0].Start > season.Start) w.Add($"La stagione inizia il {season.Start:dd/MM/yyyy} ma il primo periodo parte il {periods[0].Start:dd/MM/yyyy}.");
            if (periods[^1].End < season.End) w.Add($"La stagione finisce il {season.End:dd/MM/yyyy} ma l'ultimo periodo termina il {periods[^1].End:dd/MM/yyyy}.");
        }
        var plans = await c.QueryAsync<(string Name, DateTime? From, DateTime? Until, string Billing, int Amount)>(
            "select name, valid_from::timestamp, valid_until::timestamp, billing, amount_cents from app.fee_plans where season_id = @seasonId and is_active", new { seasonId }, tx);
        foreach (var p in plans)
            if ((p.From is { } f && f < season.Start) || (p.Until is { } u && u > season.End)) w.Add($"Il piano «{p.Name}» ha una validità che esce dalle date della stagione.");
        var installments = await c.QueryAsync<(string Name, int Amount, int Total, int N, DateTime? MinFrom, DateTime? MaxUntil)>(@"
            select p.name, p.amount_cents, sum(i.amount_cents)::int, count(*)::int, min(i.covers_from)::timestamp, max(i.covers_until)::timestamp
            from app.fee_plans p join app.plan_installments i on i.plan_id = p.id where p.season_id = @seasonId and p.is_active group by p.id, p.name, p.amount_cents", new { seasonId }, tx);
        foreach (var p in installments)
        {
            if (p.Total < p.Amount) w.Add($"Piano «{p.Name}»: la somma delle {p.N} rate ({p.Total / 100m:0.00} €) è inferiore al prezzo in unica soluzione ({p.Amount / 100m:0.00} €).");
            if ((p.MinFrom is { } f && f < season.Start) || (p.MaxUntil is { } u && u > season.End)) w.Add($"Piano «{p.Name}»: una rata copre date fuori dalla stagione.");
        }
        var overlaps = await c.QueryAsync<string>(@"
            select p.name from app.fee_plans p join app.plan_installments a on a.plan_id = p.id join app.plan_installments b on b.plan_id = p.id and b.position > a.position
            where p.season_id = @seasonId and a.covers_until >= b.covers_from group by p.name", new { seasonId }, tx);
        foreach (var name in overlaps) w.Add($"Piano «{name}»: i periodi coperti da due rate si sovrappongono.");
        var closures = await c.QueryAsync<string>(@"select title from app.closures where (season_id = @seasonId or season_id is null)
            and start_date <= @end::date and end_date >= @start::date and (start_date < @start::date or end_date > @end::date)", new { seasonId, start = season.Start, end = season.End }, tx);
        foreach (var t in closures) w.Add($"La chiusura «{t}» esce in parte dalle date della stagione.");
        return w;
    }
}

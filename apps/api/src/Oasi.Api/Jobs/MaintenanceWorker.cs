using System.Data;
using Dapper;
using Oasi.Api.Features;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Security;

namespace Oasi.Api.Jobs;

/// <summary>
/// Lavori pianificati, eseguiti per ogni struttura dentro il suo contesto (RLS):
///  · elimina dallo storage i file dei documenti sostituiti, scaduto il periodo di conservazione (≤ 7 giorni);
///  · avvisa di documenti in scadenza e scaduti, e delle richieste non evase (una volta sola);
///  · avvisa delle quote scadute;
///  · segna come scaduti piani e diritti di recupero;
///  · genera le lezioni delle prossime settimane, dentro la stagione e fuori dalle chiusure;
///  · ricorda all'amministrazione di configurare la nuova stagione.
/// </summary>
public sealed class MaintenanceWorker(Db db, IFileStorage storage, IConfiguration config, ILogger<MaintenanceWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        if (!config.GetValue("Jobs:Enabled", true)) return;
        var every = TimeSpan.FromMinutes(config.GetValue("Jobs:IntervalMinutes", 60));
        await Task.Delay(TimeSpan.FromSeconds(config.GetValue("Jobs:StartupDelaySeconds", 20)), stop).ContinueWith(_ => { }, CancellationToken.None);
        while (!stop.IsCancellationRequested)
        {
            try { await RunOnce(db, storage, log, stop); }
            catch (Exception ex) { log.LogError(ex, "Lavori pianificati interrotti"); }
            await Task.Delay(every, stop).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    /// <summary>Un giro completo su tutte le strutture attive. Un errore in una struttura non ferma le altre.</summary>
    public static async Task RunOnce(Db db, IFileStorage storage, ILogger log, CancellationToken ct = default)
    {
        var tenants = await db.Platform((c, tx) => c.QueryAsync<Guid>("select id from platform.tenants where status in ('active', 'trial')", transaction: tx), ct);
        foreach (var tenantId in tenants)
        {
            try { await RunForTenant(db, storage, tenantId, ct); }
            catch (Exception ex) { log.LogError(ex, "Lavori pianificati falliti per la struttura {Tenant}", tenantId); }
        }
    }

    public static async Task RunForTenant(Db db, IFileStorage storage, Guid tenantId, CancellationToken ct = default)
    {
        // 1. File dei documenti sostituiti: prima si marca la riga, poi si elimina dallo storage
        var purged = await db.InTenant(tenantId, null, async (c, tx) =>
        {
            var rows = (await c.QueryAsync<(Guid Id, string Path)>(
                "select id, file_path from app.documents where not is_current and file_path is not null and purge_after <= now() for update skip locked", transaction: tx)).ToList();
            foreach (var r in rows)
            {
                await c.ExecuteAsync("update app.documents set file_path = null, file_sha256 = null, bytes = null, file_deleted_at = now() where id = @Id", new { r.Id }, tx);
                await c.ExecuteAsync(@"insert into app.document_events (tenant_id, document_id, action, note)
                    values (app.current_tenant(), @Id, 'file_deleted', 'File eliminato dopo la sostituzione')", new { r.Id }, tx);
            }
            return rows;
        }, ct);
        foreach (var r in purged) await storage.DeleteAsync(r.Path, ct);

        await db.InTenant(tenantId, null, async (c, tx) =>
        {
            var settings = await TenantSettings.Load(c, tx);
            await PlanEndpoints.ExpirePlans(c, tx);
            await MakeupCredits.ExpireOld(c, tx);
            await DocumentReminders(c, tx, settings);
            await PaymentReminders(c, tx);
            await GenerateLessons(c, tx);
            await SeasonReminder(c, tx);
        }, ct);
    }

    private static async Task DocumentReminders(IDbConnection c, IDbTransaction tx, TenantSettings s)
    {
        var docs = await c.QueryAsync<(Guid Id, Guid MemberId, string TypeName, DateTime ExpiresOn, bool Expired)>(@"
            select d.id, d.member_id, t.name, d.expires_on::timestamp, d.expires_on < app.tenant_today()
            from app.documents d join app.document_types t on t.id = d.type_id
            where d.is_current and d.status = 'approved' and d.expires_on is not null and d.expires_on <= app.tenant_today() + @days", new { days = s.Documents.ExpiryReminderDays }, tx);
        var admins = await Notifier.UsersWithRoles(c, tx, Roles.Admin);
        foreach (var d in docs)
        {
            var key = $"doc:{d.Id}:{(d.Expired ? "expired" : "expiring")}";
            var title = d.Expired ? $"Documento scaduto: {d.TypeName}" : $"Documento in scadenza: {d.TypeName}";
            var body = d.Expired ? $"Scaduto il {d.ExpiresOn:dd/MM/yyyy}: carica la versione aggiornata." : $"Scade il {d.ExpiresOn:dd/MM/yyyy}.";
            if (await Notifier.Once(c, tx, key, await Notifier.UsersOfMember(c, tx, d.MemberId), "documents", title, body, "/documenti") && d.Expired)
                await Notifier.ToUsers(c, tx, admins, "documents", title, "Un documento è scaduto: lo trovi nell'archivio.", null, link: $"/archivio/{d.Id}");
        }
        var requests = await c.QueryAsync<(Guid Id, Guid MemberId, string TypeName)>(@"
            select r.id, r.member_id, t.name from app.document_requests r join app.document_types t on t.id = r.type_id
            where r.status = 'open' and r.due_on < app.tenant_today()", transaction: tx);
        foreach (var r in requests)
            await Notifier.Once(c, tx, $"docreq:{r.Id}:overdue", await Notifier.UsersOfMember(c, tx, r.MemberId), "documents",
                $"Documento mancante: {r.TypeName}", "Il termine indicato dalla segreteria è passato.", "/documenti");
    }

    private static async Task PaymentReminders(IDbConnection c, IDbTransaction tx)
    {
        var overdue = await c.QueryAsync<(Guid Id, Guid MemberId, string Description, DateTime DueOn)>(@"
            select ch.id, ch.member_id, ch.description, ch.due_on::timestamp from app.member_charges ch
            where ch.status = 'open' and ch.due_on < app.tenant_today()", transaction: tx);
        foreach (var o in overdue)
            await Notifier.Once(c, tx, $"charge:{o.Id}:overdue", await Notifier.UsersOfMember(c, tx, o.MemberId), "payments",
                "Quota scaduta", $"{o.Description}, scadenza {o.DueOn:dd/MM/yyyy}. Il pagamento si effettua in segreteria.", "/profilo/quote");
    }

    /// <summary>Lezioni delle prossime 8 settimane: mai oltre la stagione attiva; le chiusure le annullano.</summary>
    private static async Task GenerateLessons(IDbConnection c, IDbTransaction tx)
    {
        await c.ExecuteAsync(@"
            insert into app.lessons (tenant_id, class_id, date, start_time, end_time)
            select app.current_tenant(), cl.id, d::date, cl.start_time, cl.end_time
            from app.classes cl
            cross join generate_series(app.tenant_today(), app.tenant_today() + 55, interval '1 day') d
            where cl.is_active and extract(isodow from d) = cl.weekday
              and (not exists (select 1 from app.seasons where status = 'active')
                   or exists (select 1 from app.seasons s where s.status = 'active' and d::date between s.start_date and s.end_date))
            on conflict (tenant_id, class_id, date) do nothing", transaction: tx);
        await c.ExecuteAsync(@"
            update app.lessons l set status = 'cancelled', closure_id = x.id,
              note = case when x.note = '' then x.title else x.title || ': ' || x.note end
            from app.closures x
            where l.date between x.start_date and x.end_date and l.status = 'scheduled' and l.closure_id is null and l.date >= app.tenant_today()", transaction: tx);
    }

    private static async Task SeasonReminder(IDbConnection c, IDbTransaction tx)
    {
        var season = await c.QuerySingleOrDefaultAsync<(Guid Id, string Name, int DaysLeft)?>(
            "select id, name, (end_date - app.tenant_today())::int from app.seasons where status = 'active'", transaction: tx);
        if (season is not { } s || s.DaysLeft > 60) return;
        var hasNext = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.seasons where status = 'draft' and start_date > app.tenant_today())", transaction: tx);
        if (hasNext) return;
        await Notifier.Once(c, tx, $"season:{s.Id}:setup-next", await Notifier.UsersWithRoles(c, tx, Roles.Admin), "admin",
            "Configura la nuova stagione", $"La stagione {s.Name} termina tra {Math.Max(s.DaysLeft, 0)} giorni: imposta date, periodi, chiusure e piani della prossima.", "/gestione/stagioni");
    }
}

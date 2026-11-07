using System.Data;
using Dapper;
using Npgsql;

namespace Oasi.Api.Infrastructure;

/// <summary>
/// Accesso al database. Ogni operazione gira in una transazione in cui vengono
/// impostati app.tenant_id e app.user_id: le policy RLS del database filtrano
/// tutte le righe in base a questi valori (se mancano, nessuna riga è visibile).
/// </summary>
public sealed class Db(NpgsqlDataSource dataSource)
{
    static Db()
    {
        DefaultTypeMap.MatchNamesWithUnderscores = true;
    }

    /// <summary>Esegue una funzione nel contesto di un tenant (e opzionalmente di un utente).</summary>
    public async Task<T> InTenant<T>(Guid? tenantId, Guid? userId, Func<IDbConnection, IDbTransaction, Task<T>> work, CancellationToken ct = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await conn.ExecuteAsync(
            "select set_config('app.tenant_id', @t, true), set_config('app.user_id', @u, true)",
            new { t = tenantId?.ToString() ?? "", u = userId?.ToString() ?? "" }, tx);
        var result = await work(conn, tx);
        await tx.CommitAsync(ct);
        return result;
    }

    public Task InTenant(Guid? tenantId, Guid? userId, Func<IDbConnection, IDbTransaction, Task> work, CancellationToken ct = default) =>
        InTenant<bool>(tenantId, userId, async (c, t) => { await work(c, t); return true; }, ct);

    /// <summary>Query sulle tabelle di piattaforma (nessun tenant impostato).</summary>
    public Task<T> Platform<T>(Func<IDbConnection, IDbTransaction, Task<T>> work, CancellationToken ct = default) =>
        InTenant(null, null, work, ct);
}

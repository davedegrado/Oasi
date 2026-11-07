using Dapper;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Tenancy;

/// <summary>Elenco dei domini registrati, usato per il CORS (aggiornato ogni minuto).</summary>
public sealed class DomainAllowList
{
    public static DomainAllowList? Instance { get; private set; }

    private readonly Db _db;
    private readonly string[] _extra;
    private HashSet<string> _hosts = [];
    private DateTime _loadedAt = DateTime.MinValue;
    private readonly Lock _lock = new();

    public DomainAllowList(Db db, IConfiguration config)
    {
        _db = db;
        _extra = config.GetSection("Cors:ExtraOrigins").Get<string[]>() ?? [];
        Instance = this;
    }

    public bool IsAllowed(string origin)
    {
        if (_extra.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        if (DateTime.UtcNow - _loadedAt > TimeSpan.FromMinutes(1)) Reload();
        return _hosts.Contains(uri.Host.ToLowerInvariant());
    }

    private void Reload()
    {
        lock (_lock)
        {
            if (DateTime.UtcNow - _loadedAt <= TimeSpan.FromMinutes(1)) return;
            var hosts = _db.Platform((c, tx) => c.QueryAsync<string>("select hostname from platform.domains", transaction: tx)).GetAwaiter().GetResult();
            _hosts = hosts.ToHashSet();
            _loadedAt = DateTime.UtcNow;
        }
    }
}

using System.Data;
using System.Text.Json;
using Dapper;

namespace Oasi.Api.Features;

public static class Audit
{
    public static Task Log(IDbConnection c, IDbTransaction tx, Guid? actor, Guid? tenantId, string action, string? target, object? details = null) =>
        c.ExecuteAsync(
            "insert into platform.audit_log (actor_user, tenant_id, action, target, details) values (@actor, @tenantId, @action, @target, @details::jsonb)",
            new { actor, tenantId, action, target, details = JsonSerializer.Serialize(details ?? new { }) }, tx);
}

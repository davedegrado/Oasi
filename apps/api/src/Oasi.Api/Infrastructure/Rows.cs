namespace Oasi.Api.Infrastructure;

/// <summary>Righe lette dal database che contengono array (Dapper le mappa per proprietà).</summary>
public sealed class MembershipRow
{
    public Guid TenantId { get; init; }
    public Guid MemberId { get; init; }
    public string[] Roles { get; init; } = [];
}

public sealed class StaffRow
{
    public string Role { get; init; } = "";
    public string[] Permissions { get; init; } = [];
}

/// <summary>Righe dinamiche di Dapper restituite al client con chiavi camelCase, come tutti gli altri DTO.</summary>
public static class DynamicRows
{
    public static IEnumerable<Dictionary<string, object?>> Camel(this IEnumerable<dynamic> rows) => rows.Select(r => Camel((object)r)!);

    public static Dictionary<string, object?>? Camel(object? row)
    {
        if (row is not IDictionary<string, object> d) return null;
        var result = new Dictionary<string, object?>(d.Count);
        foreach (var (key, value) in d)
        {
            var parts = key.Split('_', StringSplitOptions.RemoveEmptyEntries);
            result[parts[0] + string.Concat(parts.Skip(1).Select(p => char.ToUpperInvariant(p[0]) + p[1..]))] = value;
        }
        return result;
    }
}

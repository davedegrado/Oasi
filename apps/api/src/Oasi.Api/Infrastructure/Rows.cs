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

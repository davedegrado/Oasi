using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Security;

/// <summary>Controlli sulle relazioni: insegnante ↔ classe, genitore ↔ figlio.</summary>
public static class Relations
{
    public static Task<bool> TeachesClass(IDbConnection c, IDbTransaction tx, Member m, Guid classId) =>
        c.ExecuteScalarAsync<bool>("select exists(select 1 from app.class_teachers where class_id = @classId and member_id = @memberId)",
            new { classId, memberId = m.MemberId }, tx);

    /// <summary>Admin, oppure insegnante assegnato alla classe.</summary>
    public static async Task EnsureCanManageClass(IDbConnection c, IDbTransaction tx, Member m, Guid classId)
    {
        if (m.IsAdmin) return;
        if (m.IsTeacher && await TeachesClass(c, tx, m, classId)) return;
        throw ApiException.Forbidden("Puoi gestire solo le classi che ti sono assegnate.");
    }

    /// <summary>
    /// L'utente può agire per conto di questa persona? Sé stesso, oppure genitore
    /// con il permesso richiesto, oppure admin.
    /// </summary>
    public static async Task EnsureCanActFor(IDbConnection c, IDbTransaction tx, Member m, Guid memberId, string permission)
    {
        if (m.MemberId == memberId || m.IsAdmin) return;
        var ok = await c.ExecuteScalarAsync<bool>(
            @"select exists(select 1 from app.guardianships
               where guardian_member_id = @guardian and child_member_id = @child and @permission = any(permissions))",
            new { guardian = m.MemberId, child = memberId, permission }, tx);
        if (!ok) throw ApiException.Forbidden("Puoi agire solo per te o per i figli collegati al tuo account.");
    }

    public static Task<Guid[]> ChildrenOf(IDbConnection c, IDbTransaction tx, Member m) =>
        c.QueryAsync<Guid>("select child_member_id from app.guardianships where guardian_member_id = @id", new { id = m.MemberId }, tx)
         .ContinueWith(t => t.Result.ToArray());
}

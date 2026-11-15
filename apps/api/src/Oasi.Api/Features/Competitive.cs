using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;

namespace Oasi.Api.Features;

/// <summary>
/// Agonismo. Il certificato agonistico non è richiesto ai non agonisti; diventa
/// obbligatorio quando lo prevede la classificazione della persona o della
/// classe. L'obbligo è verificato qui, lato server: nascondere un campo
/// nell'interfaccia non basta.
/// </summary>
public static class Competitive
{
    /// <summary>Tipologie obbligatorie per gli agonisti di cui la persona non ha un documento approvato e in corso di validità.</summary>
    public static Task<IEnumerable<string>> MissingCertificates(IDbConnection c, IDbTransaction tx, Guid memberId) =>
        c.QueryAsync<string>(@"
            select t.name from app.document_types t
            where t.is_active and t.required_for_competitive and app.document_type_applies(@memberId, t.audience)
              and not exists (select 1 from app.documents d where d.member_id = @memberId and d.type_id = t.id and d.is_current
                and d.status = 'approved' and (d.expires_on is null or d.expires_on >= app.tenant_today()))
            order by t.name", new { memberId }, tx);

    /// <summary>Blocca l'ingresso in una classe agonistica o preagonistica senza certificato valido (se la struttura lo prevede).</summary>
    public static async Task EnsureCertificateForClass(IDbConnection c, IDbTransaction tx, Guid memberId, string classCompetitiveLevel)
    {
        var s = await TenantSettings.Load(c, tx);
        if (!s.Competitive.BlockEnrollmentWithoutCertificate || !s.Competitive.CertificateRequiredFor.Contains(classCompetitiveLevel)) return;
        var missing = (await MissingCertificates(c, tx, memberId)).ToList();
        if (missing.Count > 0)
            throw ApiException.Conflict("certificate_required", $"Per questa classe serve un documento approvato e valido: {string.Join(", ", missing)}.");
    }
}

using System.Security.Cryptography;
using System.Text;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Security;
using Oasi.Api.Tenancy;

namespace Oasi.Api.Features;

/// <summary>
/// Inviti: l'amministratore invita una persona per email. Se la persona ha già
/// un account (anche in un'altra palestra) lo stesso account viene collegato:
/// nessuna identità duplicata.
/// </summary>
public static class InvitationEndpoints
{
    public sealed record InviteInput(string Email, string FirstName, string LastName, string[] Roles);
    public sealed record AcceptInput(string Token);

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static void Map(WebApplication app)
    {
        app.MapPost("/v1/invitations", async (HttpContext ctx, Db db, IEmailSender email, IWebHostEnvironment env, InviteInput input) =>
        {
            var m = ctx.Member();
            var address = input.Email.Trim().ToLowerInvariant();
            if (!address.Contains('@')) throw ApiException.Invalid("Email non valida.");
            if (input.Roles is not { Length: > 0 } || input.Roles.Except([Roles.Admin, Roles.Teacher, Roles.Student, Roles.Guardian]).Any())
                throw ApiException.Invalid("Ruoli non validi.");
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
            var host = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var memberId = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.members (tenant_id, first_name, last_name, email) values (app.current_tenant(), @FirstName, @LastName, @address) returning id",
                    new { input.FirstName, input.LastName, address }, tx);
                await c.ExecuteAsync(@"insert into app.invitations (tenant_id, email, member_id, roles, token_hash, invited_by, expires_at)
                    values (app.current_tenant(), @address, @memberId, @Roles, @hash, @user, now() + interval '14 days')",
                    new { address, memberId, input.Roles, hash = Hash(token), user = m.UserId }, tx);
                return await c.ExecuteScalarAsync<string>("select hostname from platform.domains where tenant_id = app.current_tenant() order by is_primary desc limit 1", transaction: tx);
            });
            var link = $"https://{host}/invito?token={token}";
            await email.SendAsync(address, "Il tuo invito", $"<p>Ciao {System.Net.WebUtility.HtmlEncode(input.FirstName)},</p><p>sei stata invitata a entrare nell'app della palestra.</p><p><a href=\"{link}\">Accetta l'invito</a></p>");
            // In sviluppo il link viene restituito per poter provare il flusso senza email
            string? devLink = env.IsDevelopment() ? link : null;
            return Results.Created("/v1/invitations", new { sent = true, devLink });
        }).RequireAuthorization().RequireMember(Roles.Admin);

        // Accettazione: l'utente autenticato (nuovo o già esistente) viene collegato alla palestra
        app.MapPost("/v1/invitations/accept", async (HttpContext ctx, Db db, AcceptInput input) =>
        {
            var userId = ctx.RequireUserId();
            var hash = Hash(input.Token);
            var found = await db.Platform((c, tx) => c.QuerySingleOrDefaultAsync<(Guid TenantId, Guid InvitationId)?>(
                "select tenant_id, invitation_id from platform.find_invitation(@hash)", new { hash }, tx))
                ?? throw ApiException.NotFound("Invito valido");
            var tenantId = found.TenantId;
            await db.InTenant(tenantId, userId, async (c, tx) =>
            {
                var inv = await c.QuerySingleAsync<MembershipRow>(
                    "select member_id, roles from app.invitations where id = @id for update", new { id = found.InvitationId }, tx);
                var existing = await c.QuerySingleOrDefaultAsync<MembershipRow>(
                    "select tenant_id, member_id, roles from app.memberships where user_id = @userId and tenant_id = app.current_tenant()", new { userId }, tx);
                if (existing is not null)
                {
                    await c.ExecuteAsync("update app.memberships set roles = (select array_agg(distinct r) from unnest(roles || @add) r), status = 'active' where user_id = @userId",
                        new { userId, add = inv.Roles }, tx);
                }
                else
                {
                    await c.ExecuteAsync("update app.members set user_id = @userId where id = @memberId", new { userId, inv.MemberId }, tx);
                    await c.ExecuteAsync("insert into app.memberships (tenant_id, user_id, member_id, roles) values (app.current_tenant(), @userId, @MemberId, @Roles)",
                        new { userId, inv.MemberId, inv.Roles }, tx);
                }
                await c.ExecuteAsync("update app.invitations set accepted_at = now(), accepted_by = @userId where id = @id", new { userId, id = found.InvitationId }, tx);
            });
            return Results.Ok(new { tenantId });
        }).RequireAuthorization();

        // Revoca dell'accesso alla palestra (senza toccare le altre palestre dell'utente)
        app.MapPost("/v1/memberships/{userId:guid}/revoke", async (HttpContext ctx, Db db, Guid userId) =>
        {
            var m = ctx.Member();
            if (userId == m.UserId) throw ApiException.Conflict("self_revoke", "Non puoi revocare il tuo stesso accesso.");
            var n = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var count = await c.ExecuteAsync("update app.memberships set status = 'revoked' where user_id = @userId and tenant_id = app.current_tenant()", new { userId }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "membership.revoke", userId.ToString());
                return count;
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization().RequireMember(Roles.Admin);
    }
}

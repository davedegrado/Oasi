using System.Text.Json;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features.Platform;

/// <summary>
/// Pannello Super Admin. Gestisce tenant, piani, moduli e domini senza leggere
/// i dati delle palestre. L'accesso ai dati per assistenza passa solo da un
/// support grant approvato dall'amministratore della palestra.
/// </summary>
public static class PlatformEndpoints
{
    public sealed record TenantRow(Guid Id, string Slug, string DisplayName, string LegalName, string Status, bool IsDemo, DateTime CreatedAt,
        string? PlanCode, string? SubscriptionStatus, DateTime? TrialEndsOn, string? PrimaryHost);

    public sealed record OnboardingInput(string Slug, string DisplayName, string LegalName, string PlanCode, string BillingCycle,
        string Hostname, string AppName, string ShortName, Dictionary<string, string>? Colors, string[]? Disciplines);

    public sealed record StatusInput(string Status, string Reason);
    public sealed record ModuleInput(bool Enabled);
    public sealed record DomainInput(string Hostname, bool IsPrimary);
    public sealed record GrantInput(Guid TenantId, string Reason, int Hours);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/v1/platform").RequireAuthorization();

        g.MapGet("/tenants", async (Db db) => await db.Platform((c, tx) => c.QueryAsync<TenantRow>(@"
            select t.id, t.slug, t.display_name, t.legal_name, t.status, t.is_demo, t.created_at,
                   p.code as plan_code, s.status as subscription_status, s.trial_ends_on::timestamp as trial_ends_on,
                   (select hostname from platform.domains d where d.tenant_id = t.id order by is_primary desc limit 1) as primary_host
            from platform.tenants t
            left join platform.subscriptions s on s.tenant_id = t.id and s.status in ('trialing', 'active', 'past_due', 'free')
            left join platform.plans p on p.id = s.plan_id
            order by t.created_at", transaction: tx))).RequireStaff("tenants.read");

        // Statistiche aggregate (solo conteggi, nessun dato personale)
        g.MapGet("/usage", async (Db db) => await db.Platform((c, tx) => c.QueryAsync(
            "select * from platform.tenant_usage()", transaction: tx))).RequireStaff("tenants.read");

        g.MapGet("/plans", async (Db db) => await db.Platform(async (c, tx) =>
        {
            var plans = await c.QueryAsync<(Guid Id, string Code, string Name, int? PriceMonthCents, int? PriceYearCents, string Limits)>(
                "select id, code, name, price_month_cents, price_year_cents, limits::text from platform.plans order by code", transaction: tx);
            var modules = (await c.QueryAsync<(Guid PlanId, string ModuleKey)>("select plan_id, module_key from platform.plan_modules", transaction: tx)).ToLookup(x => x.PlanId);
            return plans.Select(p => new { p.Id, p.Code, p.Name, p.PriceMonthCents, p.PriceYearCents, limits = JsonDocument.Parse(p.Limits).RootElement, modules = modules[p.Id].Select(x => x.ModuleKey) });
        })).RequireStaff("tenants.read");

        g.MapGet("/modules", async (Db db) => await db.Platform((c, tx) =>
            c.QueryAsync<(string Key, string Name, string Description, bool IsCore)>("select key, name, description, is_core from platform.modules order by key", transaction: tx)
             .ContinueWith(t => t.Result.Select(m => new { m.Key, m.Name, m.Description, m.IsCore })))).RequireStaff("tenants.read");

        // Onboarding guidato: un nuovo tenant senza modifiche al codice
        g.MapPost("/tenants", async (HttpContext ctx, Db db, OnboardingInput input) =>
        {
            ValidateOnboarding(input);
            var staff = ctx.Staff();
            var id = await db.Platform(async (c, tx) =>
            {
                var tenantId = await c.ExecuteScalarAsync<Guid>(@"insert into platform.tenants (slug, legal_name, display_name, status)
                    values (@Slug, @LegalName, @DisplayName, 'trial') returning id", input, tx);
                await c.ExecuteAsync(@"insert into platform.domains (tenant_id, hostname, kind, is_primary) values (@tenantId, @host, 'platform_subdomain', true)",
                    new { tenantId, host = input.Hostname.ToLowerInvariant() }, tx);
                await c.ExecuteAsync(@"insert into platform.branding (tenant_id, app_name, short_name, colors) values (@tenantId, @AppName, @ShortName, @colors::jsonb)",
                    new { tenantId, input.AppName, input.ShortName, colors = JsonSerializer.Serialize(input.Colors ?? new()) }, tx);
                var planId = await c.ExecuteScalarAsync<Guid?>("select id from platform.plans where code = @PlanCode and is_active", input, tx)
                    ?? throw ApiException.Invalid("Piano inesistente.");
                await c.ExecuteAsync(@"insert into platform.subscriptions (tenant_id, plan_id, billing_cycle, status, trial_ends_on)
                    values (@tenantId, @planId, @BillingCycle, 'trialing', current_date + 30)", new { tenantId, planId, input.BillingCycle }, tx);
                await c.ExecuteAsync(@"insert into platform.tenant_modules (tenant_id, module_key, enabled, source)
                    select @tenantId, module_key, true, 'plan' from platform.plan_modules where plan_id = @planId", new { tenantId, planId }, tx);
                await c.ExecuteAsync("select set_config('app.tenant_id', @t, true)", new { t = tenantId.ToString() }, tx);
                var pos = 0;
                foreach (var d in input.Disciplines ?? [])
                    await c.ExecuteAsync("insert into app.disciplines (tenant_id, slug, name, position) values (@tenantId, @slug, @d, @pos)",
                        new { tenantId, slug = Slugify(d), d, pos = ++pos }, tx);
                await c.ExecuteAsync("insert into app.levels (tenant_id, name, rank) values (@tenantId, 'Base', 1), (@tenantId, 'Intermedio', 2), (@tenantId, 'Avanzato', 3)", new { tenantId }, tx);
                await Audit.Log(c, tx, staff.UserId, tenantId, "tenant.create", input.Slug, new { input.PlanCode, input.Hostname });
                return tenantId;
            });
            return Results.Created($"/v1/platform/tenants/{id}", new { id });
        }).RequireStaff("tenants.write");

        // Attivazione, sospensione, riattivazione, archiviazione, avvio eliminazione
        g.MapPatch("/tenants/{id:guid}/status", async (HttpContext ctx, Db db, Guid id, StatusInput input) =>
        {
            if (input.Status is not ("trial" or "active" or "suspended" or "archived" or "deleting")) throw ApiException.Invalid("Stato non valido.");
            if (string.IsNullOrWhiteSpace(input.Reason)) throw ApiException.Invalid("Indica il motivo.");
            var staff = ctx.Staff();
            var n = await db.Platform(async (c, tx) =>
            {
                var count = await c.ExecuteAsync("update platform.tenants set status = @Status, updated_at = now() where id = @id", new { id, input.Status }, tx);
                await Audit.Log(c, tx, staff.UserId, id, "tenant.status", input.Status, new { input.Reason });
                return count;
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireStaff("tenants.write");

        // Moduli per tenant (override rispetto al piano)
        g.MapPut("/tenants/{id:guid}/modules/{key}", async (HttpContext ctx, Db db, Guid id, string key, ModuleInput input) =>
        {
            var staff = ctx.Staff();
            await db.Platform(async (c, tx) =>
            {
                await c.ExecuteAsync(@"insert into platform.tenant_modules (tenant_id, module_key, enabled, source) values (@id, @key, @Enabled, 'override')
                    on conflict (tenant_id, module_key) do update set enabled = excluded.enabled, source = 'override', updated_at = now()",
                    new { id, key, input.Enabled }, tx);
                await Audit.Log(c, tx, staff.UserId, id, "tenant.module", key, new { input.Enabled });
                return 0;
            });
            ModuleCatalog.Invalidate(ctx.RequestServices, id);
            return Results.NoContent();
        }).RequireStaff("modules.write");

        // Domini (verifica DNS e SSL gestite da Cloudflare: qui lo stato parte da "pending")
        g.MapPost("/tenants/{id:guid}/domains", async (HttpContext ctx, Db db, Guid id, DomainInput input) =>
        {
            var host = input.Hostname.Trim().ToLowerInvariant();
            if (Uri.CheckHostName(host) != UriHostNameType.Dns || !host.Contains('.')) throw ApiException.Invalid("Dominio non valido.");
            var staff = ctx.Staff();
            await db.Platform(async (c, tx) =>
            {
                if (input.IsPrimary) await c.ExecuteAsync("update platform.domains set is_primary = false where tenant_id = @id", new { id }, tx);
                await c.ExecuteAsync("insert into platform.domains (tenant_id, hostname, kind, is_primary) values (@id, @host, 'custom', @IsPrimary)", new { id, host, input.IsPrimary }, tx);
                await Audit.Log(c, tx, staff.UserId, id, "tenant.domain.add", host);
                return 0;
            });
            return Results.Created($"/v1/platform/tenants/{id}/domains", new { hostname = host, verification = "pending" });
        }).RequireStaff("domains");

        // Richiesta di accesso per assistenza: diventa attiva solo dopo l'approvazione della palestra
        g.MapPost("/support-grants", async (HttpContext ctx, Db db, GrantInput input) =>
        {
            if (input.Hours is < 1 or > 72) throw ApiException.Invalid("Durata tra 1 e 72 ore.");
            var staff = ctx.Staff();
            var grantId = await db.Platform(async (c, tx) =>
            {
                var gid = await c.ExecuteScalarAsync<Guid>(@"insert into platform.support_grants (tenant_id, staff_user_id, reason, expires_at)
                    values (@TenantId, @user, @Reason, now() + make_interval(hours => @Hours)) returning id", new { input.TenantId, user = staff.UserId, input.Reason, input.Hours }, tx);
                await Audit.Log(c, tx, staff.UserId, input.TenantId, "support.request", gid.ToString(), new { input.Reason, input.Hours });
                return gid;
            });
            return Results.Created($"/v1/platform/support-grants/{grantId}", new { id = grantId, status = "pending_approval" });
        }).RequireStaff("support");

        g.MapGet("/audit", async (Db db, Guid? tenantId) => await db.Platform((c, tx) => c.QueryAsync(
            "select id, at, actor_user, tenant_id, action, target, details::text as details from platform.audit_log where @tenantId::uuid is null or tenant_id = @tenantId order by at desc limit 200",
            new { tenantId }, tx))).RequireStaff("tenants.read");

        // Lato palestra: l'amministratore vede e approva le richieste di assistenza
        app.MapGet("/v1/support-grants", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.Platform((c, tx) => c.QueryAsync(
                "select id, reason, starts_at, expires_at, approved_by is not null as approved, revoked_at from platform.support_grants where tenant_id = @t order by starts_at desc",
                new { t = m.TenantId }, tx));
        }).RequireAuthorization().RequireMember(Roles.Admin);

        app.MapPost("/v1/support-grants/{id:guid}/approve", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            var n = await db.Platform(async (c, tx) =>
            {
                var count = await c.ExecuteAsync("update platform.support_grants set approved_by = @user where id = @id and tenant_id = @t and revoked_at is null",
                    new { id, t = m.TenantId, user = m.UserId }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "support.approve", id.ToString());
                return count;
            });
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization().RequireMember(Roles.Admin);
    }

    private static void ValidateOnboarding(OnboardingInput i)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(i.Slug, "^[a-z0-9][a-z0-9-]{1,62}$")) throw ApiException.Invalid("Slug non valido.");
        if (string.IsNullOrWhiteSpace(i.DisplayName) || string.IsNullOrWhiteSpace(i.LegalName)) throw ApiException.Invalid("Nome obbligatorio.");
        if (i.BillingCycle is not ("monthly" or "yearly")) throw ApiException.Invalid("Ciclo di fatturazione non valido.");
        if (string.IsNullOrWhiteSpace(i.ShortName) || i.ShortName.Length > 12) throw ApiException.Invalid("Nome breve obbligatorio (massimo 12 caratteri).");
    }

    private static string Slugify(string s) =>
        System.Text.RegularExpressions.Regex.Replace(s.ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD), "[^a-z0-9]+", "-").Trim('-');
}

using System.Data;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Piani, quote e pagamenti. Il motore è generico: annuali, mensili, periodici,
/// rate, pacchetti a ingressi, lezioni singole e semiprivate sono combinazioni
/// degli stessi campi configurati dalla struttura. I pagamenti avvengono fuori
/// dall'app: qui l'amministrazione li registra soltanto (nessun gateway, nessun
/// dato bancario o di carta).
/// </summary>
public static class PlanEndpoints
{
    public static readonly string[] Kinds = ["membership_fee", "subscription", "package", "single_lesson", "semi_private", "workshop", "stage", "other"];
    public static readonly string[] Billings = ["one_off", "annual", "monthly", "periodic"];

    public sealed record InstallmentInput(int AmountCents, string? DueOn, Guid? PeriodId, string? CoversFrom, string? CoversUntil);
    public sealed record PlanInput(string Name, string Kind, int AmountCents, Guid? SeasonId, string? Category, string? Description, string? Billing,
        int? WeeklyFrequency, int? Entries, int? ValidityWeeks, string? ValidFrom, string? ValidUntil, short[]? LessonMinutes, bool? BookingRequired,
        int? BookingOpensHoursBefore, int? BookingClosesHoursBefore, int? AgeMinMonths, int? AgeMaxMonths, int? Participants, int? MaxParticipants, string? CompetitiveLevel,
        bool? GrantsMakeups, bool? IsActive, int? Position, InstallmentInput[]? Installments, string[]? ClassCategories = null);
    public sealed record MemberPlanInput(Guid MemberId, Guid PlanId, string? PaymentMode, string? ValidFrom, string? ValidUntil, Guid? PeriodId, Guid[]? ClassIds, string? Note);
    public sealed record ChargeInput(Guid MemberId, string Description, int AmountCents, string DueOn, string? Kind, string? PeriodLabel, string? Note);
    public sealed record PaymentInput(int AmountCents, string PaidOn, string Method, string? Note);

    public sealed class PlanRow
    {
        public Guid Id { get; init; }
        public string Name { get; init; } = "";
        public string Kind { get; init; } = "";
        public int AmountCents { get; init; }
        public bool IsActive { get; init; }
        public Guid? SeasonId { get; init; }
        public string Category { get; init; } = "";
        public string Description { get; init; } = "";
        public string Billing { get; init; } = "";
        public short? WeeklyFrequency { get; init; }
        public short? Entries { get; init; }
        public short? ValidityWeeks { get; init; }
        public string? ValidFrom { get; init; }
        public string? ValidUntil { get; init; }
        public short[]? LessonMinutes { get; init; }
        public bool BookingRequired { get; init; }
        /// <summary>La prenotazione si apre N ore prima (null: lezione singola = valore della struttura, altri piani = sempre aperta)</summary>
        public short? BookingOpensHoursBefore { get; init; }
        /// <summary>La prenotazione si chiude N ore prima (es. Circo Baby: 24)</summary>
        public short? BookingClosesHoursBefore { get; init; }
        /// <summary>Categorie di classe coerenti con il piano (vuoto = tutte)</summary>
        public string[] ClassCategories { get; init; } = [];
        public short? AgeMinMonths { get; init; }
        public short? AgeMaxMonths { get; init; }
        public short Participants { get; init; }
        public short? MaxParticipants { get; init; }
        public string CompetitiveLevel { get; init; } = "none";
        public bool GrantsMakeups { get; init; }
        public int Position { get; init; }
        public List<InstallmentRow> Installments { get; set; } = [];
    }

    public sealed class InstallmentRow
    {
        public Guid PlanId { get; init; }
        public short Position { get; init; }
        public int AmountCents { get; init; }
        public string? DueOn { get; init; }
        public Guid? PeriodId { get; init; }
        public string? CoversFrom { get; init; }
        public string? CoversUntil { get; init; }
    }

    public sealed class ChargeRow
    {
        public Guid Id { get; init; }
        public Guid MemberId { get; init; }
        public string MemberName { get; init; } = "";
        public string Description { get; init; } = "";
        public string Kind { get; init; } = "";
        public Guid? MemberPlanId { get; init; }
        public string? PlanName { get; init; }
        public short? InstallmentNo { get; init; }
        public string? PeriodLabel { get; init; }
        public int AmountCents { get; init; }
        public int PaidCents { get; init; }
        public string DueOn { get; init; } = "";
        public string Status { get; init; } = "";
        /// <summary>paid · partial · overdue · open · cancelled (calcolato)</summary>
        public string State { get; init; } = "";
        public string Note { get; init; } = "";
    }

    private const string SelectPlans = @"
        select id, name, kind, amount_cents, is_active, season_id, category, description, billing, weekly_frequency, entries, validity_weeks,
               to_char(valid_from, 'YYYY-MM-DD') as valid_from, to_char(valid_until, 'YYYY-MM-DD') as valid_until, lesson_minutes, booking_required,
               booking_opens_hours_before, booking_closes_hours_before, class_categories, age_min_months, age_max_months, participants, max_participants, competitive_level, grants_makeups, position
        from app.fee_plans";

    private const string SelectCharges = @"
        select ch.id, ch.member_id, mb.first_name || ' ' || mb.last_name as member_name, ch.description, ch.kind, ch.member_plan_id, p.name as plan_name,
               ch.installment_no, ch.period_label, ch.amount_cents, coalesce(pay.paid, 0)::int as paid_cents, to_char(ch.due_on, 'YYYY-MM-DD') as due_on, ch.status,
               case when ch.status = 'cancelled' then 'cancelled'
                    when ch.status = 'paid' or coalesce(pay.paid, 0) >= ch.amount_cents then 'paid'
                    when ch.due_on < app.tenant_today() then 'overdue'
                    when coalesce(pay.paid, 0) > 0 then 'partial' else 'open' end as state,
               ch.note
        from app.member_charges ch
        join app.members mb on mb.id = ch.member_id
        left join app.member_plans mp on mp.id = ch.member_plan_id left join app.fee_plans p on p.id = coalesce(mp.plan_id, ch.fee_plan_id)
        left join lateral (select sum(amount_cents) as paid from app.member_payments x where x.charge_id = ch.id) pay on true";

    public static void Map(WebApplication app)
    {
        var plans = app.MapGroup("/v1/plans").RequireAuthorization().RequireModule("payments");

        // Listino: i piani attivi sono visibili a tutti i membri; quelli disattivati solo all'amministrazione
        plans.MapGet("/", async (HttpContext ctx, Db db, Guid? seasonId, bool? includeInactive) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => LoadPlans(c, tx, seasonId, includeInactive == true && m.IsAdmin));
        }).RequireMember();

        plans.MapPost("/", async (HttpContext ctx, Db db, PlanInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var newId = await c.ExecuteScalarAsync<Guid>(@"insert into app.fee_plans (tenant_id, name, kind, amount_cents) values (app.current_tenant(), @Name, @Kind, @AmountCents) returning id", input, tx);
                await SavePlan(c, tx, newId, input);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "plan.create", newId.ToString(), new { input.Name, input.AmountCents });
                return newId;
            });
            return Results.Created($"/v1/plans/{id}", new { id });
        }).RequireMember(Roles.Admin);

        plans.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, PlanInput input) =>
        {
            Validate(input);
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (!await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.fee_plans where id = @id)", new { id }, tx)) throw ApiException.NotFound("Piano");
                await SavePlan(c, tx, id, input);
                // Le modifiche non toccano i piani già acquistati né le quote già generate (storico)
                await Audit.Log(c, tx, m.UserId, m.TenantId, "plan.update", id.ToString(), new { input.Name, input.AmountCents });
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        var mp = app.MapGroup("/v1/member-plans").RequireAuthorization().RequireModule("payments");

        mp.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var subject = memberId ?? (m.IsAdmin ? (Guid?)null : m.MemberId);
                if (subject is { } s && s != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, s, "view");
                await ExpirePlans(c, tx);
                return (await c.QueryAsync(@"
                    select mp.id, mp.member_id, mb.first_name || ' ' || mb.last_name as member_name, mp.plan_id, p.name as plan_name, p.kind, p.category,
                           mp.payment_mode, mp.status, to_char(mp.valid_from, 'YYYY-MM-DD') as valid_from, to_char(mp.valid_until, 'YYYY-MM-DD') as valid_until,
                           mp.weekly_frequency, mp.entries_total, mp.entries_used,
                           (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_reserved,
                           mp.entries_total - mp.entries_used - (select count(*)::int from app.lesson_bookings b where b.member_plan_id = mp.id and b.status = 'booked' and not b.entry_consumed and b.consumed_by is distinct from 'refunded') as entries_left, mp.note,
                           coalesce((select array_agg(e.class_id) from app.enrollments e where e.member_plan_id = mp.id and e.status = 'approved'), '{}') as class_ids
                    from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id join app.members mb on mb.id = mp.member_id
                    where (@subject::uuid is null or mp.member_id = @subject) order by mp.valid_until desc limit 500", new { subject }, tx)).Camel();
            });
        }).RequireMember();

        // Assegna un piano a una persona: calcola la validità, genera le quote (unica soluzione o rate) e collega le classi
        mp.MapPost("/", async (HttpContext ctx, Db db, MemberPlanInput input) =>
        {
            var m = ctx.Member();
            var mode = input.PaymentMode ?? "single";
            if (mode is not ("single" or "installments")) throw ApiException.Invalid("Modalità di pagamento non valida.");
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var plan = (await LoadPlans(c, tx, null, true, input.PlanId)).SingleOrDefault() ?? throw ApiException.NotFound("Piano");
                if (!plan.IsActive) throw ApiException.Conflict("plan_inactive", "Il piano è disattivato.");
                if (!await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.members where id = @MemberId)", input, tx)) throw ApiException.NotFound("Persona");
                await BookingEndpoints.EnsureAgeMonths(c, tx, input.MemberId, plan.AgeMinMonths, plan.AgeMaxMonths);
                var (from, until, periodLabel) = await ResolveValidity(c, tx, plan, input);
                if (mode == "installments" && plan.Installments.Count == 0) throw ApiException.Conflict("no_installments", "Questo piano non prevede il pagamento a rate.");
                var classIds = (input.ClassIds ?? []).Distinct().ToArray();
                if (plan.WeeklyFrequency is { } freq && classIds.Length > freq)
                    throw ApiException.Conflict("too_many_classes", $"Il piano prevede {freq} frequenze settimanali.");

                var id = await c.ExecuteScalarAsync<Guid>(@"
                    insert into app.member_plans (tenant_id, member_id, plan_id, season_id, period_id, payment_mode, valid_from, valid_until, weekly_frequency, entries_total, note, created_by)
                    values (app.current_tenant(), @MemberId, @PlanId, @season, @PeriodId, @mode, @from::date, @until::date, @freq, @entries, coalesce(@Note, ''), @user) returning id",
                    new { input.MemberId, input.PlanId, season = plan.SeasonId, input.PeriodId, mode, from, until, freq = plan.WeeklyFrequency, entries = plan.Entries, input.Note, user = m.UserId }, tx);

                // Quote: le rate sono un modo di pagare lo stesso piano
                if (mode == "installments")
                    foreach (var i in plan.Installments)
                        await c.ExecuteAsync(@"insert into app.member_charges (tenant_id, member_id, fee_plan_id, member_plan_id, description, amount_cents, due_on, installment_no, period_label, kind)
                            values (app.current_tenant(), @MemberId, @PlanId, @id, @description, @amount, coalesce(@due::date, @from::date), @no, @label, @kind)",
                            new { input.MemberId, input.PlanId, id, description = $"{plan.Name} · rata {i.Position} di {plan.Installments.Count}", amount = i.AmountCents,
                                  due = i.DueOn ?? i.CoversFrom, from, no = i.Position,
                                  label = i.CoversFrom is not null && i.CoversUntil is not null ? $"{i.CoversFrom} – {i.CoversUntil}" : null, kind = ChargeKind(plan) }, tx);
                else
                    await c.ExecuteAsync(@"insert into app.member_charges (tenant_id, member_id, fee_plan_id, member_plan_id, description, amount_cents, due_on, period_label, kind)
                        values (app.current_tenant(), @MemberId, @PlanId, @id, @description, @amount, @from::date, @label, @kind)",
                        new { input.MemberId, input.PlanId, id, description = plan.Name, amount = plan.AmountCents, from, label = periodLabel ?? $"{from} – {until}", kind = ChargeKind(plan) }, tx);

                // Diritto di frequenza: collega (o crea) l'iscrizione alle classi, rispettando la capienza
                foreach (var classId in classIds)
                {
                    var cls = await c.QuerySingleOrDefaultAsync<(int Capacity, bool IsActive, string CompetitiveLevel, string? Category, string Name)?>(
                        "select capacity::int, is_active, competitive_level, category, name from app.classes where id = @classId for update", new { classId }, tx) ?? throw ApiException.NotFound("Classe");
                    // Coerenza piano ↔ classe: categoria (es. Bambini/Ragazzi) e classificazione agonistica
                    if (plan.ClassCategories.Length > 0 && (cls.Category is null || !plan.ClassCategories.Contains(cls.Category)))
                        throw ApiException.Conflict("plan_class_mismatch", $"Il piano «{plan.Name}» non è previsto per la classe «{cls.Name}» ({cls.Category ?? "senza categoria"}).");
                    if (plan.CompetitiveLevel != "none" && cls.CompetitiveLevel != plan.CompetitiveLevel)
                        throw ApiException.Conflict("plan_class_mismatch", $"Il piano «{plan.Name}» è per classi {(plan.CompetitiveLevel == "competitive" ? "agonistiche" : "preagonistiche")}: «{cls.Name}» non lo è.");
                    var existing = await c.ExecuteScalarAsync<Guid?>("select id from app.enrollments where class_id = @classId and member_id = @MemberId and status = 'approved'", new { classId, input.MemberId }, tx);
                    if (existing is { } eid) { await c.ExecuteAsync("update app.enrollments set member_plan_id = @id where id = @eid", new { id, eid }, tx); continue; }
                    if (!cls.IsActive) throw ApiException.Conflict("class_inactive", "La classe non accetta iscrizioni.");
                    var enrolled = await c.ExecuteScalarAsync<int>("select count(*) from app.enrollments where class_id = @classId and status = 'approved'", new { classId }, tx);
                    if (enrolled >= cls.Capacity) throw ApiException.Conflict("class_full", "La classe ha raggiunto la capienza massima.");
                    await Competitive.EnsureCertificateForClass(c, tx, input.MemberId, cls.CompetitiveLevel);
                    await c.ExecuteAsync("update app.enrollments set status = 'withdrawn' where class_id = @classId and member_id = @MemberId and status = 'requested'", new { classId, input.MemberId }, tx);
                    await c.ExecuteAsync(@"insert into app.enrollments (tenant_id, class_id, member_id, status, requested_by, decided_by, decided_at, member_plan_id)
                        values (app.current_tenant(), @classId, @MemberId, 'approved', @user, @user, now(), @id)", new { classId, input.MemberId, user = m.UserId, id }, tx);
                }
                await Audit.Log(c, tx, m.UserId, m.TenantId, "member_plan.create", id.ToString(), new { input.MemberId, input.PlanId, mode });
                return new { id, validFrom = from, validUntil = until };
            });
            return Results.Created($"/v1/member-plans/{result.id}", result);
        }).RequireMember(Roles.Admin);

        mp.MapPost("/{id:guid}/cancel", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var n = await c.ExecuteAsync("update app.member_plans set status = 'cancelled' where id = @id and status = 'active'", new { id }, tx);
                if (n == 0) throw ApiException.Conflict("not_active", "Il piano non è attivo.");
                // Le quote non ancora pagate vengono annullate; quelle con pagamenti restano nello storico
                await c.ExecuteAsync(@"update app.member_charges ch set status = 'cancelled' where ch.member_plan_id = @id and ch.status = 'open'
                    and not exists (select 1 from app.member_payments p where p.charge_id = ch.id)", new { id }, tx);
                await c.ExecuteAsync("update app.makeup_credits set status = 'cancelled' where member_plan_id = @id and status = 'available'", new { id }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "member_plan.cancel", id.ToString());
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        var charges = app.MapGroup("/v1/charges").RequireAuthorization().RequireModule("payments");

        charges.MapGet("/", async (HttpContext ctx, Db db, Guid? memberId, string? state) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var subject = memberId ?? (m.IsAdmin ? (Guid?)null : m.MemberId);
                if (subject is { } s && s != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, s, "view");
                var rows = await c.QueryAsync<ChargeRow>(SelectCharges + " where (@subject::uuid is null or ch.member_id = @subject) order by ch.due_on desc limit 1000", new { subject }, tx);
                return state is null ? rows : rows.Where(r => r.State == state);
            });
        }).RequireMember();

        // Quota manuale: tessera associativa, quota gara, altro (separate da rette e pacchetti)
        charges.MapPost("/", async (HttpContext ctx, Db db, ChargeInput input) =>
        {
            if (string.IsNullOrWhiteSpace(input.Description)) throw ApiException.Invalid("Inserisci la causale.");
            if (input.AmountCents < 0) throw ApiException.Invalid("Importo non valido.");
            if (!DateOnly.TryParse(input.DueOn, out _)) throw ApiException.Invalid("Scadenza non valida.");
            if (input.Kind is not (null or "plan" or "membership_fee" or "competition_fee" or "other")) throw ApiException.Invalid("Tipo di quota non valido.");
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<Guid>(@"
                insert into app.member_charges (tenant_id, member_id, description, amount_cents, due_on, kind, period_label, note)
                values (app.current_tenant(), @MemberId, @Description, @AmountCents, @DueOn::date, coalesce(@Kind, 'other'), @PeriodLabel, coalesce(@Note, '')) returning id", input, tx));
            return Results.Created($"/v1/charges/{id}", new { id });
        }).RequireMember(Roles.Admin);

        charges.MapPost("/{id:guid}/cancel", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var paid = await c.ExecuteScalarAsync<int>("select coalesce(sum(amount_cents), 0) from app.member_payments where charge_id = @id", new { id }, tx);
                if (paid > 0) throw ApiException.Conflict("has_payments", "La quota ha pagamenti registrati: elimina prima i pagamenti.");
                if (await c.ExecuteAsync("update app.member_charges set status = 'cancelled' where id = @id and status = 'open'", new { id }, tx) == 0) throw ApiException.NotFound("Quota");
                await Audit.Log(c, tx, m.UserId, m.TenantId, "charge.cancel", id.ToString());
            });
            return Results.NoContent();
        }).RequireMember(Roles.Admin);

        charges.MapGet("/{id:guid}/payments", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var owner = await c.ExecuteScalarAsync<Guid?>("select member_id from app.member_charges where id = @id", new { id }, tx) ?? throw ApiException.NotFound("Quota");
                if (owner != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, owner, "view");
                return (await c.QueryAsync("select id, amount_cents, to_char(paid_on, 'YYYY-MM-DD') as paid_on, method, note, recorded_at from app.member_payments where charge_id = @id order by paid_on", new { id }, tx)).Camel();
            });
        }).RequireMember();

        // Registra un pagamento ricevuto fuori dall'app (anche parziale)
        charges.MapPost("/{id:guid}/payments", async (HttpContext ctx, Db db, Guid id, PaymentInput input) =>
        {
            if (input.AmountCents <= 0) throw ApiException.Invalid("Importo non valido.");
            if (!DateOnly.TryParse(input.PaidOn, out _)) throw ApiException.Invalid("Data non valida.");
            var m = ctx.Member();
            var result = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                // Metodi accettati dalla struttura (Oasi: bonifico e contanti); altri si possono abilitare dalle impostazioni
                var accepted = (await TenantSettings.Load(c, tx)).Payments.Methods;
                if (!accepted.Contains(input.Method)) throw ApiException.Invalid($"Metodo di pagamento non accettato. Metodi attivi: {string.Join(", ", accepted)}.");
                var ch = await c.QuerySingleOrDefaultAsync<(int AmountCents, string Status)?>("select amount_cents, status from app.member_charges where id = @id for update", new { id }, tx)
                    ?? throw ApiException.NotFound("Quota");
                if (ch.Status == "cancelled") throw ApiException.Conflict("charge_cancelled", "La quota è annullata.");
                var paid = await c.ExecuteScalarAsync<int>("select coalesce(sum(amount_cents), 0) from app.member_payments where charge_id = @id", new { id }, tx);
                if (paid + input.AmountCents > ch.AmountCents) throw ApiException.Conflict("overpayment", $"Residuo da pagare: {(ch.AmountCents - paid) / 100m:0.00} €.");
                var paymentId = await c.ExecuteScalarAsync<Guid>(@"insert into app.member_payments (tenant_id, charge_id, amount_cents, paid_on, method, note, recorded_by)
                    values (app.current_tenant(), @id, @AmountCents, @PaidOn::date, @Method, coalesce(@Note, ''), @user) returning id",
                    new { id, input.AmountCents, input.PaidOn, input.Method, input.Note, user = m.UserId }, tx);
                var full = paid + input.AmountCents == ch.AmountCents;
                await c.ExecuteAsync("update app.member_charges set status = @s where id = @id", new { id, s = full ? "paid" : "open" }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "payment.record", paymentId.ToString(), new { charge = id, input.AmountCents, input.Method });
                return new { id = paymentId, chargeState = full ? "paid" : "partial", residualCents = ch.AmountCents - paid - input.AmountCents };
            });
            return Results.Created($"/v1/charges/{id}/payments/{result.id}", result);
        }).RequireMember(Roles.Admin);

        // Correzione di un pagamento registrato per errore (resta traccia nell'audit)
        app.MapDelete("/v1/payments/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var p = await c.QuerySingleOrDefaultAsync<(Guid ChargeId, int AmountCents)?>("delete from app.member_payments where id = @id returning charge_id, amount_cents", new { id }, tx)
                    ?? throw ApiException.NotFound("Pagamento");
                await c.ExecuteAsync("update app.member_charges set status = 'open' where id = @id and status = 'paid'", new { id = p.ChargeId }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "payment.delete", id.ToString(), new { charge = p.ChargeId, p.AmountCents });
            });
            return Results.NoContent();
        }).RequireAuthorization().RequireModule("payments").RequireMember(Roles.Admin);

        // Riepilogo generale: scadenze, insoluti, pagamenti registrati, documenti mancanti
        app.MapGet("/v1/reports/overview", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var rows = (await c.QueryAsync<ChargeRow>(SelectCharges + " where ch.status <> 'cancelled'", transaction: tx)).ToList();
                var missingDocs = (await c.QueryAsync(@"
                    select mb.id as member_id, mb.first_name || ' ' || mb.last_name as member_name, t.id as type_id, t.name as type_name
                    from app.members mb
                    join app.document_types t on t.is_active and app.document_required(mb.id, t.audience, t.is_required, t.required_for_competitive)
                    where not app.document_satisfied(mb.id, t.id)
                    order by member_name, type_name limit 500", transaction: tx)).Camel();
                var season = DynamicRows.Camel((object?)await c.QuerySingleOrDefaultAsync("select id, name, to_char(end_date, 'YYYY-MM-DD') as end_date, (end_date - app.tenant_today()) as days_left from app.seasons where status = 'active'", transaction: tx));
                var nextSeason = await c.ExecuteScalarAsync<bool>("select exists(select 1 from app.seasons s where s.status = 'draft' and s.start_date > app.tenant_today())", transaction: tx);
                return new
                {
                    totals = new
                    {
                        dueCents = rows.Sum(r => r.AmountCents),
                        paidCents = rows.Sum(r => r.PaidCents),
                        overdueCents = rows.Where(r => r.State == "overdue").Sum(r => r.AmountCents - r.PaidCents),
                        overdueCount = rows.Count(r => r.State == "overdue"),
                    },
                    overdue = rows.Where(r => r.State == "overdue").OrderBy(r => r.DueOn),
                    upcoming = rows.Where(r => r.State is "open" or "partial").OrderBy(r => r.DueOn).Take(100),
                    missingDocuments = missingDocs,
                    season,
                    // Promemoria annuale: la stagione attiva sta per finire (o manca) e la prossima non è ancora configurata
                    seasonSetupNeeded = !nextSeason && (season is null || Convert.ToInt32(season["daysLeft"]) <= 90),
                };
            });
        }).RequireAuthorization().RequireModule("payments").RequireMember(Roles.Admin);

        // Riepilogo economico di una persona
        app.MapGet("/v1/members/{memberId:guid}/account", async (HttpContext ctx, Db db, Guid memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                if (memberId != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, memberId, "view");
                var rows = (await c.QueryAsync<ChargeRow>(SelectCharges + " where ch.member_id = @memberId order by ch.due_on", new { memberId }, tx)).ToList();
                var payments = (await c.QueryAsync(@"select p.id, p.charge_id, p.amount_cents, to_char(p.paid_on, 'YYYY-MM-DD') as paid_on, p.method, p.note
                    from app.member_payments p join app.member_charges ch on ch.id = p.charge_id where ch.member_id = @memberId order by p.paid_on desc", new { memberId }, tx)).Camel();
                var active = rows.Where(r => r.State != "cancelled").ToList();
                return new
                {
                    dueCents = active.Sum(r => r.AmountCents),
                    paidCents = active.Sum(r => r.PaidCents),
                    overdueCents = active.Where(r => r.State == "overdue").Sum(r => r.AmountCents - r.PaidCents),
                    charges = rows,
                    payments,
                };
            });
        }).RequireAuthorization().RequireModule("payments").RequireMember();
    }

    private static string ChargeKind(PlanRow p) => p.Kind == "membership_fee" ? "membership_fee" : "plan";

    internal static async Task<List<PlanRow>> LoadPlans(IDbConnection c, IDbTransaction tx, Guid? seasonId, bool includeInactive, Guid? id = null)
    {
        var plans = (await c.QueryAsync<PlanRow>(SelectPlans + @" where (@id::uuid is null or id = @id) and (@seasonId::uuid is null or season_id = @seasonId) and (is_active or @includeInactive)
            order by position, category, name", new { id, seasonId, includeInactive }, tx)).ToList();
        var installments = (await c.QueryAsync<InstallmentRow>(@"select plan_id, position, amount_cents, to_char(due_on, 'YYYY-MM-DD') as due_on, period_id,
            to_char(covers_from, 'YYYY-MM-DD') as covers_from, to_char(covers_until, 'YYYY-MM-DD') as covers_until
            from app.plan_installments where plan_id = any(@ids) order by position", new { ids = plans.Select(p => p.Id).ToArray() }, tx)).ToLookup(i => i.PlanId);
        foreach (var p in plans) p.Installments = installments[p.Id].ToList();
        return plans;
    }

    private static async Task SavePlan(IDbConnection c, IDbTransaction tx, Guid id, PlanInput i)
    {
        await c.ExecuteAsync(@"
            update app.fee_plans set name = @Name, kind = @Kind, amount_cents = @AmountCents, season_id = @SeasonId, category = coalesce(@Category, ''),
              description = coalesce(@Description, ''), billing = coalesce(@Billing, 'one_off'), weekly_frequency = @WeeklyFrequency, entries = @Entries,
              validity_weeks = @ValidityWeeks, valid_from = @ValidFrom::date, valid_until = @ValidUntil::date, lesson_minutes = @LessonMinutes,
              booking_required = coalesce(@BookingRequired, false), booking_opens_hours_before = @BookingOpensHoursBefore, booking_closes_hours_before = @BookingClosesHoursBefore,
              class_categories = coalesce(@ClassCategories, class_categories), age_min_months = @AgeMinMonths,
              age_max_months = @AgeMaxMonths, participants = coalesce(@Participants, 1), max_participants = @MaxParticipants,
              competitive_level = coalesce(@CompetitiveLevel, 'none'), grants_makeups = coalesce(@GrantsMakeups, true), is_active = coalesce(@IsActive, true),
              position = coalesce(@Position, 0)
            where id = @id",
            new
            {
                id, i.Name, i.Kind, i.AmountCents, i.SeasonId, i.Category, i.Description, i.Billing, i.WeeklyFrequency, i.Entries, i.ValidityWeeks, i.ValidFrom, i.ValidUntil,
                i.LessonMinutes, i.BookingRequired, i.BookingOpensHoursBefore, i.BookingClosesHoursBefore, i.ClassCategories, i.AgeMinMonths, i.AgeMaxMonths, i.Participants, i.MaxParticipants, i.CompetitiveLevel,
                i.GrantsMakeups, i.IsActive, i.Position,
            }, tx);
        if (i.Installments is null) return;
        await c.ExecuteAsync("delete from app.plan_installments where plan_id = @id", new { id }, tx);
        for (var n = 0; n < i.Installments.Length; n++)
        {
            var x = i.Installments[n];
            await c.ExecuteAsync(@"insert into app.plan_installments (tenant_id, plan_id, position, amount_cents, due_on, period_id, covers_from, covers_until)
                values (app.current_tenant(), @id, @pos, @AmountCents, @DueOn::date, @PeriodId, @CoversFrom::date, @CoversUntil::date)",
                new { id, pos = (short)(n + 1), x.AmountCents, x.DueOn, x.PeriodId, x.CoversFrom, x.CoversUntil }, tx);
        }
    }

    /// <summary>Validità: date indicate → periodo scelto → settimane dalla data d'inizio → date del piano → stagione.</summary>
    private static async Task<(string From, string Until, string? PeriodLabel)> ResolveValidity(IDbConnection c, IDbTransaction tx, PlanRow plan, MemberPlanInput input)
    {
        static string F(DateTime d) => d.ToString("yyyy-MM-dd");
        if (input.ValidFrom is not null && input.ValidUntil is not null)
        {
            if (!DateOnly.TryParse(input.ValidFrom, out var a) || !DateOnly.TryParse(input.ValidUntil, out var b) || b < a) throw ApiException.Invalid("Date di validità non valide.");
            return (input.ValidFrom, input.ValidUntil, null);
        }
        if (input.PeriodId is { } periodId)
        {
            var p = await c.QuerySingleOrDefaultAsync<(string Name, DateTime Start, DateTime End)?>(
                "select name, start_date::timestamp, end_date::timestamp from app.season_periods where id = @periodId", new { periodId }, tx) ?? throw ApiException.Invalid("Periodo inesistente.");
            return (F(p.Start), F(p.End), p.Name);
        }
        if (plan.ValidityWeeks is { } weeks)
        {
            if (!DateOnly.TryParse(input.ValidFrom, out var start)) throw ApiException.Invalid("Indica la data di inizio: il piano vale per settimane consecutive.");
            return (input.ValidFrom!, start.AddDays(weeks * 7 - 1).ToString("yyyy-MM-dd"), null);
        }
        if (plan.Billing == "periodic") throw ApiException.Invalid("Scegli il periodo: il piano è periodico.");
        if (plan.ValidFrom is not null && plan.ValidUntil is not null) return (input.ValidFrom ?? plan.ValidFrom, plan.ValidUntil, null);
        if (plan.SeasonId is { } seasonId)
        {
            var s = await c.QuerySingleAsync<(DateTime Start, DateTime End)>("select start_date::timestamp, end_date::timestamp from app.seasons where id = @seasonId", new { seasonId }, tx);
            return (input.ValidFrom ?? F(s.Start), F(s.End), null);
        }
        throw ApiException.Invalid("Indica le date di validità: il piano non ha una stagione né date proprie.");
    }

    internal static Task ExpirePlans(IDbConnection c, IDbTransaction tx) =>
        c.ExecuteAsync("update app.member_plans set status = 'expired' where status = 'active' and valid_until < app.tenant_today()", transaction: tx);

    private static void Validate(PlanInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome del piano.");
        if (!Kinds.Contains(i.Kind)) throw ApiException.Invalid("Tipo di piano non valido.");
        if (i.Billing is not null && !Billings.Contains(i.Billing)) throw ApiException.Invalid("Cadenza non valida.");
        if (i.AmountCents < 0) throw ApiException.Invalid("Importo non valido.");
        if (i.CompetitiveLevel is not (null or "none" or "pre_competitive" or "competitive")) throw ApiException.Invalid("Classificazione non valida.");
        if (i.Kind == "package" && i.Entries is null or <= 0) throw ApiException.Invalid("Un pacchetto deve avere un numero di ingressi.");
        if (i.ValidFrom is not null && !DateOnly.TryParse(i.ValidFrom, out _) || i.ValidUntil is not null && !DateOnly.TryParse(i.ValidUntil, out _)) throw ApiException.Invalid("Date di validità non valide.");
        foreach (var x in i.Installments ?? [])
        {
            if (x.AmountCents < 0) throw ApiException.Invalid("Importo della rata non valido.");
            if ((x.DueOn is not null && !DateOnly.TryParse(x.DueOn, out _)) || (x.CoversFrom is not null && !DateOnly.TryParse(x.CoversFrom, out _)) || (x.CoversUntil is not null && !DateOnly.TryParse(x.CoversUntil, out _)))
                throw ApiException.Invalid("Date della rata non valide.");
        }
    }
}

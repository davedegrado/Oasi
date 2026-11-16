using System.Data;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Security;

namespace Oasi.Api.Features;

/// <summary>
/// Archivio documentale. Ogni documento appartiene a un solo profilo: la
/// sezione Documenti del profilo e l'Archivio generale leggono le stesse righe.
/// I file non hanno URL pubblici: si scaricano solo tramite l'API dopo il
/// controllo dei permessi. I documenti sanitari sono visibili solo
/// all'interessata (o al genitore) e all'amministrazione.
/// </summary>
public static class DocumentEndpoints
{
    public const long MaxBytes = 10 * 1024 * 1024;
    public static readonly string[] AllowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
    public static readonly string[] Categories = ["personal", "enrollment", "waiver", "consent", "medical", "other"];

    public sealed class DocumentTypeDto
    {
        public Guid Id { get; init; }
        public string Name { get; init; } = "";
        public string Category { get; init; } = "";
        public string Description { get; init; } = "";
        public bool IsRequired { get; init; }
        public string SignatureMode { get; init; } = "none";
        public short? ValidityMonths { get; init; }
        public bool IsSensitive { get; init; }
        public bool IsActive { get; init; }
        /// <summary>students · teachers · all</summary>
        public string Audience { get; init; } = "students";
        /// <summary>Obbligatorio solo per agonisti o iscritti a classi agonistiche/preagonistiche.</summary>
        public bool RequiredForCompetitive { get; init; }
        /// <summary>Chi carica deve indicare la data di scadenza.</summary>
        public bool ExpiryRequired { get; init; }
        /// <summary>none · monthly · every_n_days: documento da caricare a ogni periodo (es. ogni mese)</summary>
        public string Recurrence { get; init; } = "none";
        public short? RecurrenceDays { get; init; }
        /// <summary>Giorno del mese entro cui caricarlo (null = ultimo giorno del mese)</summary>
        public short? DueDayOfMonth { get; init; }
        /// <summary>Periodo corrente e sua scadenza (solo per le tipologie ricorrenti)</summary>
        public string? CurrentPeriod { get; init; }
        public string? CurrentDue { get; init; }
    }

    public sealed class DocumentDto
    {
        public Guid Id { get; init; }
        public Guid MemberId { get; init; }
        public string MemberName { get; init; } = "";
        public Guid TypeId { get; init; }
        public string TypeName { get; init; } = "";
        public string Category { get; init; } = "";
        public short Version { get; init; }
        public Guid? ReplacesDocumentId { get; init; }
        public string Status { get; init; } = "";
        /// <summary>Stato per l'interfaccia: pending (in attesa) · approved · to_fix (da correggere) · expired (scaduto)</summary>
        public string State { get; init; } = "";
        public bool FileAvailable { get; init; }
        public DateTime? PurgeAfter { get; init; }
        public string? FileName { get; init; }
        public string? ContentType { get; init; }
        public long? Bytes { get; init; }
        public string? SignatureMethod { get; init; }
        public DateTime UploadedAt { get; init; }
        public string? ExpiresOn { get; init; }
        public bool IsExpired { get; init; }
        public bool ExpiresSoon { get; init; }
        public string? ReviewNote { get; init; }
        public DateTime? ReviewedAt { get; init; }
    }

    public sealed record TypeInput(string Name, string Category, string? Description, bool? IsRequired, string? SignatureMode, short? ValidityMonths, bool? IsSensitive, bool? IsActive,
        string? Audience = null, bool? RequiredForCompetitive = null, bool? ExpiryRequired = null,
        string? Recurrence = null, short? RecurrenceDays = null, short? DueDayOfMonth = null);

    /// <summary>Colonne della tipologia più periodo corrente e scadenza (per le ricorrenti)</summary>
    internal const string TypeColumns = @"t.*, app.period_key(t.recurrence, t.recurrence_days, app.tenant_today()) as current_period,
        to_char(app.period_due(t.recurrence, t.recurrence_days, t.due_day_of_month, app.tenant_today()), 'YYYY-MM-DD') as current_due";
    public sealed record ExpiryInput(string? ExpiresOn);
    public sealed record RequestInput(Guid MemberId, Guid TypeId, string? DueOn, string? Note);
    public sealed record ReviewInput(string Action, string? Note);

    private const string SelectDocuments = @"
        select d.id, d.member_id, m.first_name || ' ' || m.last_name as member_name, d.type_id, t.name as type_name, t.category,
               d.version, d.replaces_document_id, d.status,
               case when d.expires_on < app.tenant_today() then 'expired'
                    when d.status = 'approved' then 'approved'
                    when d.status = 'pending_review' then 'pending' else 'to_fix' end as state,
               d.file_path is not null as file_available, d.purge_after,
               d.file_name, d.content_type, d.bytes, d.signature_method,
               d.uploaded_at, to_char(d.expires_on, 'YYYY-MM-DD') as expires_on,
               coalesce(d.expires_on < app.tenant_today(), false) as is_expired,
               coalesce(d.expires_on between app.tenant_today() and app.tenant_today() + coalesce((app.settings() -> 'documents' ->> 'expiryReminderDays')::int, 30), false) as expires_soon,
               d.review_note, d.reviewed_at
        from app.documents d join app.members m on m.id = d.member_id join app.document_types t on t.id = d.type_id";

    public static void Map(WebApplication app)
    {
        var types = app.MapGroup("/v1/document-types").RequireAuthorization().RequireModule("documents");

        types.MapGet("/", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<DocumentTypeDto>(
                @"select " + TypeColumns + @" from app.document_types t
                  where (@admin or (t.is_active and app.document_type_applies(@me, t.audience))) order by category, name", new { admin = m.IsAdmin, me = m.MemberId }, tx));
        }).RequireMember();

        types.MapPost("/", async (HttpContext ctx, Db db, TypeInput input) =>
        {
            ValidateType(input);
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<Guid>(@"
                insert into app.document_types (tenant_id, name, category, description, is_required, signature_mode, validity_months, is_sensitive,
                                                audience, required_for_competitive, expiry_required, recurrence, recurrence_days, due_day_of_month)
                values (app.current_tenant(), @Name, @Category, coalesce(@Description, ''), coalesce(@IsRequired, false), coalesce(@SignatureMode, 'none'),
                        @ValidityMonths, coalesce(@IsSensitive, @Category = 'medical'),
                        coalesce(@Audience, 'students'), coalesce(@RequiredForCompetitive, false), coalesce(@ExpiryRequired, false),
                        coalesce(@Recurrence, 'none'), @RecurrenceDays, @DueDayOfMonth) returning id", input, tx));
            return Results.Created($"/v1/document-types/{id}", new { id });
        }).RequireMember(Roles.Admin);

        types.MapPut("/{id:guid}", async (HttpContext ctx, Db db, Guid id, TypeInput input) =>
        {
            ValidateType(input);
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync(@"
                update app.document_types set name = @Name, category = @Category, description = coalesce(@Description, ''), is_required = coalesce(@IsRequired, false),
                  signature_mode = coalesce(@SignatureMode, 'none'), validity_months = @ValidityMonths,
                  is_sensitive = coalesce(@IsSensitive, @Category = 'medical'), is_active = coalesce(@IsActive, true),
                  audience = coalesce(@Audience, audience), required_for_competitive = coalesce(@RequiredForCompetitive, required_for_competitive),
                  expiry_required = coalesce(@ExpiryRequired, expiry_required),
                  recurrence = coalesce(@Recurrence, recurrence), recurrence_days = coalesce(@RecurrenceDays, recurrence_days), due_day_of_month = @DueDayOfMonth
                where id = @id", new { id, input.Name, input.Category, input.Description, input.IsRequired, input.SignatureMode, input.ValidityMonths, input.IsSensitive, input.IsActive,
                                       input.Audience, input.RequiredForCompetitive, input.ExpiryRequired, input.Recurrence, input.RecurrenceDays, input.DueDayOfMonth }, tx));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        var docs = app.MapGroup("/v1").RequireAuthorization().RequireModule("documents");

        // Area documentale del profilo: documenti attuali, mancanti, in scadenza
        docs.MapGet("/members/{memberId:guid}/documents", async (HttpContext ctx, Db db, Guid memberId) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await EnsureCanSeeMemberDocuments(c, tx, m, memberId);
                var current = (await c.QueryAsync<DocumentDto>(SelectDocuments + " where d.member_id = @memberId and d.is_current order by t.category, t.name", new { memberId }, tx)).ToList();
                var history = (await c.QueryAsync<DocumentDto>(SelectDocuments + " where d.member_id = @memberId and not d.is_current order by d.uploaded_at desc", new { memberId }, tx)).ToList();
                var missing = (await c.QueryAsync<DocumentTypeDto>(@"
                    select " + TypeColumns + @" from app.document_types t
                    where t.is_active and app.document_required(@memberId, t.audience, t.is_required, t.required_for_competitive)
                      and not app.document_satisfied(@memberId, t.id)
                    order by t.name", new { memberId }, tx)).ToList();
                var requests = (await c.QueryAsync(@"
                    select r.id, r.type_id, t.name as type_name, to_char(r.due_on, 'YYYY-MM-DD') as due_on, r.note, r.requested_at
                    from app.document_requests r join app.document_types t on t.id = r.type_id
                    where r.member_id = @memberId and r.status = 'open' order by r.due_on nulls last", new { memberId }, tx)).Camel();
                return new
                {
                    documents = current,
                    missing,
                    requests,
                    expiring = current.Where(d => d.IsExpired || d.ExpiresSoon).ToList(),
                    history,
                };
            });
        }).RequireMember();

        // Archivio generale: tutti i documenti della palestra, con filtri (solo amministrazione)
        docs.MapGet("/documents", async (HttpContext ctx, Db db, string? q, Guid? typeId, string? category, string? status,
            string? uploadedFrom, string? uploadedTo, string? expiresBefore, bool? includeHistory) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync<DocumentDto>(SelectDocuments + @"
                where (@includeHistory or d.is_current)
                  and (@q::text is null or (m.first_name || ' ' || m.last_name) ilike '%' || @q || '%')
                  and (@typeId::uuid is null or d.type_id = @typeId)
                  and (@category::text is null or t.category = @category)
                  and (@status::text is null or d.status = @status or (@status = 'expired' and d.expires_on < app.tenant_today()))
                  and (@uploadedFrom::date is null or d.uploaded_at >= @uploadedFrom::date)
                  and (@uploadedTo::date is null or d.uploaded_at < @uploadedTo::date + 1)
                  and (@expiresBefore::date is null or d.expires_on <= @expiresBefore::date)
                order by d.uploaded_at desc limit 500",
                new { q, typeId, category, status, uploadedFrom, uploadedTo, expiresBefore, includeHistory = includeHistory ?? false }, tx));
        }).RequireMember(Roles.Admin);

        // Caricamento (o sostituzione) di un documento: l'interessata, il genitore o l'amministrazione
        docs.MapPost("/documents", async (HttpContext ctx, Db db, IFileStorage storage) =>
        {
            var m = ctx.Member();
            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file") ?? throw ApiException.Invalid("Allega il file del documento.");
            if (file.Length == 0 || file.Length > MaxBytes) throw ApiException.Invalid("Il file deve pesare al massimo 10 MB.");
            if (!AllowedTypes.Contains(file.ContentType)) throw ApiException.Invalid("Formato non ammesso: usa PDF, JPG, PNG, WEBP o HEIC.");
            if (!Guid.TryParse(form["typeId"], out var typeId)) throw ApiException.Invalid("Indica la tipologia del documento.");
            var memberId = Guid.TryParse(form["memberId"], out var mid) ? mid : m.MemberId;
            var signedUpload = form["signed"] == "true";
            DateOnly? expires = DateOnly.TryParse(form["expiresOn"], out var e) ? e : null;

            await using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            var sha = Convert.ToHexString(SHA256.HashData(buffer.ToArray())).ToLowerInvariant();
            var safeName = SafeFileName(file.FileName);
            var path = $"tenants/{m.TenantId}/documents/{memberId}/{Guid.NewGuid():N}-{safeName}";

            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                await Relations.EnsureCanActFor(c, tx, m, memberId, "consents");
                var type = await c.QuerySingleOrDefaultAsync<DocumentTypeDto>("select * from app.document_types where id = @typeId and is_active", new { typeId }, tx)
                    ?? throw ApiException.Invalid("Tipologia di documento non disponibile.");
                if (!m.IsAdmin && !await c.ExecuteScalarAsync<bool>("select app.document_type_applies(@memberId, @audience)", new { memberId, audience = type.Audience }, tx))
                    throw ApiException.Invalid("Questa tipologia di documento non riguarda questo profilo.");
                if (expires is null && type.ExpiryRequired) throw ApiException.Invalid("Indica la data di scadenza del documento.");
                if (expires is null && type.ValidityMonths is { } months)
                    expires = DateOnly.FromDateTime(await c.ExecuteScalarAsync<DateTime>("select app.tenant_today()::timestamp", transaction: tx)).AddMonths(months);
                buffer.Position = 0;
                await storage.PutAsync(path, buffer, file.ContentType);
                return await InsertVersion(c, tx, m, memberId, typeId, new
                {
                    file_path = path, file_name = safeName, content_type = file.ContentType, bytes = file.Length, sha,
                    signature_method = signedUpload || type.SignatureMode == "upload_signed" ? "upload_signed" : null,
                    expires = expires?.ToString("yyyy-MM-dd"),
                }, "uploaded", status: "pending_review");
            });
            return Results.Created($"/v1/documents/{id}", new { id, status = "pending_review" });
        }).RequireMember();

        // Dettaglio con storico delle verifiche e delle modifiche
        docs.MapGet("/documents/{id:guid}", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var d = await c.QuerySingleOrDefaultAsync<DocumentDto>(SelectDocuments + " where d.id = @id", new { id }, tx) ?? throw ApiException.NotFound("Documento");
                await EnsureCanSeeMemberDocuments(c, tx, m, d.MemberId);
                var events = await c.QueryAsync(@"
                    select e.action, e.at, e.note, coalesce(mb.first_name || ' ' || mb.last_name, 'Sistema') as actor
                    from app.document_events e
                    left join app.members mb on mb.user_id = e.actor_user
                    where e.document_id in (select x.id from app.documents x where x.member_id = @member and x.type_id = @type)
                    order by e.at desc", new { member = d.MemberId, type = d.TypeId }, tx);
                return new { document = d, events };
            });
        }).RequireMember();

        // Scaricamento del file: sempre attraverso l'API, mai URL pubblici
        docs.MapGet("/documents/{id:guid}/file", async (HttpContext ctx, Db db, IFileStorage storage, Guid id) =>
        {
            var m = ctx.Member();
            var row = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var r = await c.QuerySingleOrDefaultAsync<(Guid MemberId, string? Path, string? Name, string? Type)?>(
                    "select member_id, file_path, file_name, content_type from app.documents where id = @id", new { id }, tx) ?? throw ApiException.NotFound("Documento");
                await EnsureCanSeeMemberDocuments(c, tx, m, r.MemberId);
                if (r.Path is null) throw new ApiException(410, "file_deleted", "Il file di questa versione è stato eliminato dopo la sostituzione.");
                await c.ExecuteAsync("insert into app.document_events (tenant_id, document_id, action, actor_user) values (app.current_tenant(), @id, 'downloaded', @user)", new { id, user = m.UserId }, tx);
                return r;
            });
            var stream = await storage.GetAsync(row.Path!) ?? throw ApiException.NotFound("File");
            return Results.File(stream, row.Type ?? "application/octet-stream", row.Name);
        }).RequireMember();

        // Verifica dell'amministrazione: approva, rifiuta o richiede la sostituzione
        docs.MapPost("/documents/{id:guid}/review", async (HttpContext ctx, Db db, Guid id, ReviewInput input) =>
        {
            var next = input.Action switch
            {
                "approve" => "approved",
                "reject" => "rejected",
                "request_replacement" => "replacement_requested",
                _ => throw ApiException.Invalid("Azione non valida: approve, reject o request_replacement."),
            };
            if (next != "approved" && string.IsNullOrWhiteSpace(input.Note)) throw ApiException.Invalid("Spiega all'allieva cosa correggere.");
            var m = ctx.Member();
            await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var d = await c.QuerySingleOrDefaultAsync<(Guid MemberId, string TypeName, bool IsCurrent)?>(
                    "select d.member_id, t.name, d.is_current from app.documents d join app.document_types t on t.id = d.type_id where d.id = @id for update of d", new { id }, tx)
                    ?? throw ApiException.NotFound("Documento");
                if (!d.IsCurrent) throw ApiException.Conflict("not_current", "È una versione precedente: verifica quella attuale.");
                await c.ExecuteAsync("update app.documents set status = @next, reviewed_by = @user, reviewed_at = now(), review_note = @Note where id = @id",
                    new { id, next, user = m.UserId, input.Note }, tx);
                await c.ExecuteAsync("insert into app.document_events (tenant_id, document_id, action, actor_user, note) values (app.current_tenant(), @id, @action, @user, @Note)",
                    new { id, action = next, user = m.UserId, input.Note }, tx);
                var title = next switch
                {
                    "approved" => $"Documento approvato: {d.TypeName}",
                    "rejected" => $"Documento non accettato: {d.TypeName}",
                    _ => $"Sostituisci il documento: {d.TypeName}",
                };
                await Notifier.ToUsers(c, tx, await Notifier.UsersOfMember(c, tx, d.MemberId), "documents", title, input.Note ?? "Lo trovi nella sezione Documenti del tuo profilo.", m.UserId, link: "/documenti");
            });
            return Results.Ok(new { id, status = next });
        }).RequireMember(Roles.Admin);

        // Correzione della data di scadenza: chi ha caricato il documento (torna in verifica) o l'amministrazione
        docs.MapPut("/documents/{id:guid}/expiry", async (HttpContext ctx, Db db, Guid id, ExpiryInput input) =>
        {
            DateOnly? expires = null;
            if (input.ExpiresOn is not null) expires = DateOnly.TryParse(input.ExpiresOn, out var e) ? e : throw ApiException.Invalid("Data di scadenza non valida.");
            var m = ctx.Member();
            var status = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var d = await c.QuerySingleOrDefaultAsync<(Guid MemberId, bool IsCurrent, string Status, bool ExpiryRequired)?>(@"
                    select d.member_id, d.is_current, d.status, t.expiry_required from app.documents d join app.document_types t on t.id = d.type_id
                    where d.id = @id for update of d", new { id }, tx) ?? throw ApiException.NotFound("Documento");
                if (!m.IsAdmin) await Relations.EnsureCanActFor(c, tx, m, d.MemberId, "consents");
                if (!d.IsCurrent) throw ApiException.Conflict("not_current", "È una versione precedente: correggi quella attuale.");
                if (expires is null && d.ExpiryRequired) throw ApiException.Invalid("Per questa tipologia la scadenza è obbligatoria.");
                // Se la corregge l'interessato, un documento già approvato torna in verifica
                var next = m.IsAdmin || d.Status != "approved" ? d.Status : "pending_review";
                await c.ExecuteAsync("update app.documents set expires_on = @expires::date, status = @next where id = @id", new { id, expires = expires?.ToString("yyyy-MM-dd"), next }, tx);
                await c.ExecuteAsync("insert into app.document_events (tenant_id, document_id, action, actor_user, note) values (app.current_tenant(), @id, 'expiry_corrected', @user, @note)",
                    new { id, user = m.UserId, note = expires is null ? "Scadenza rimossa" : $"Nuova scadenza: {expires:dd/MM/yyyy}" }, tx);
                if (!m.IsAdmin)
                    await Notifier.ToUsers(c, tx, await Notifier.UsersWithRoles(c, tx, Roles.Admin), "documents", "Scadenza di un documento corretta", "Verifica la nuova data.", m.UserId, link: $"/archivio/{id}");
                return next;
            });
            return Results.Ok(new { id, status, expiresOn = expires?.ToString("yyyy-MM-dd") });
        }).RequireMember();

        // Richieste puntuali di un documento a una persona (es. a un insegnante): numero e cadenza li decide l'amministrazione
        docs.MapGet("/document-requests", async (HttpContext ctx, Db db, Guid? memberId, string? status) =>
        {
            var m = ctx.Member();
            return await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var subject = memberId ?? (m.IsAdmin ? (Guid?)null : m.MemberId);
                if (subject is { } s && s != m.MemberId) await Relations.EnsureCanActFor(c, tx, m, s, "view");
                return (await c.QueryAsync(@"
                    select r.id, r.member_id, mb.first_name || ' ' || mb.last_name as member_name, r.type_id, t.name as type_name,
                           to_char(r.due_on, 'YYYY-MM-DD') as due_on, r.note, r.status, r.document_id, r.requested_at,
                           (r.status = 'open' and r.due_on < app.tenant_today()) as is_overdue
                    from app.document_requests r join app.document_types t on t.id = r.type_id join app.members mb on mb.id = r.member_id
                    where (@subject::uuid is null or r.member_id = @subject) and (@status::text is null or r.status = @status)
                    order by r.status, r.due_on nulls last limit 500", new { subject, status }, tx)).Camel();
            });
        }).RequireMember();

        docs.MapPost("/document-requests", async (HttpContext ctx, Db db, RequestInput input) =>
        {
            if (input.DueOn is not null && !DateOnly.TryParse(input.DueOn, out _)) throw ApiException.Invalid("Scadenza non valida.");
            var m = ctx.Member();
            var id = await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var typeName = await c.ExecuteScalarAsync<string?>("select name from app.document_types where id = @TypeId and is_active", input, tx) ?? throw ApiException.Invalid("Tipologia non disponibile.");
                // Una sola richiesta aperta per persona e tipologia: nessun duplicato
                var existing = await c.ExecuteScalarAsync<Guid?>("select id from app.document_requests where member_id = @MemberId and type_id = @TypeId and status = 'open'", input, tx);
                if (existing is { } open)
                {
                    await c.ExecuteAsync("update app.document_requests set due_on = @DueOn::date, note = coalesce(@Note, note) where id = @open", new { open, input.DueOn, input.Note }, tx);
                    return open;
                }
                var newId = await c.ExecuteScalarAsync<Guid>(@"insert into app.document_requests (tenant_id, member_id, type_id, due_on, note, requested_by)
                    values (app.current_tenant(), @MemberId, @TypeId, @DueOn::date, coalesce(@Note, ''), @user) returning id",
                    new { input.MemberId, input.TypeId, input.DueOn, input.Note, user = m.UserId }, tx);
                await Notifier.ToUsers(c, tx, await Notifier.UsersOfMember(c, tx, input.MemberId), "documents", $"Documento richiesto: {typeName}",
                    string.IsNullOrWhiteSpace(input.Note) ? "Caricalo dalla sezione Documenti." : input.Note!, m.UserId, link: "/documenti");
                return newId;
            });
            return Results.Created($"/v1/document-requests/{id}", new { id });
        }).RequireMember(Roles.Admin);

        docs.MapPost("/document-requests/{id:guid}/cancel", async (HttpContext ctx, Db db, Guid id) =>
        {
            var m = ctx.Member();
            var n = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteAsync("update app.document_requests set status = 'cancelled' where id = @id and status = 'open'", new { id }, tx));
            return n == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireMember(Roles.Admin);

        // Download di gruppo: tutti i documenti di una persona o un gruppo filtrato per tipologia, stato o scadenza
        docs.MapGet("/documents/export", async (HttpContext ctx, Db db, IFileStorage storage, Guid? memberId, Guid? typeId, string? category, string? status, string? expiresBefore) =>
        {
            var m = ctx.Member();
            var rows = (await db.InTenant(m.TenantId, m.UserId, async (c, tx) =>
            {
                var list = (await c.QueryAsync<(Guid Id, string Path, string Name, string Member, string TypeName)>(@"
                    select d.id, d.file_path, d.file_name, mb.last_name || '_' || mb.first_name, t.name
                    from app.documents d join app.members mb on mb.id = d.member_id join app.document_types t on t.id = d.type_id
                    where d.is_current and d.file_path is not null
                      and (@memberId::uuid is null or d.member_id = @memberId) and (@typeId::uuid is null or d.type_id = @typeId)
                      and (@category::text is null or t.category = @category)
                      and (@status::text is null or d.status = @status or (@status = 'expired' and d.expires_on < app.tenant_today()))
                      and (@expiresBefore::date is null or d.expires_on <= @expiresBefore::date)
                    order by mb.last_name, mb.first_name, t.name limit 300", new { memberId, typeId, category, status, expiresBefore }, tx)).ToList();
                if (list.Count == 0) throw ApiException.NotFound("Nessun documento corrisponde ai filtri: archivio");
                // Operazione rilevante: resta nello storico di ogni documento e nell'audit
                await c.ExecuteAsync(@"insert into app.document_events (tenant_id, document_id, action, actor_user, note)
                    select app.current_tenant(), unnest(@ids::uuid[]), 'downloaded', @user, 'Download di gruppo'", new { ids = list.Select(r => r.Id).ToArray(), user = m.UserId }, tx);
                await Audit.Log(c, tx, m.UserId, m.TenantId, "documents.export", null, new { count = list.Count, memberId, typeId, category, status, expiresBefore });
                return list;
            })).ToList();

            var zip = new MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(zip, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
            {
                var used = new HashSet<string>();
                foreach (var r in rows)
                {
                    await using var file = await storage.GetAsync(r.Path);
                    if (file is null) continue;
                    var name = $"{SafeFileName(r.Member)}/{SafeFileName(r.TypeName)}-{r.Name}";
                    while (!used.Add(name)) name = $"{SafeFileName(r.Member)}/{Guid.NewGuid():N}-{r.Name}";
                    await using var entry = archive.CreateEntry(name).Open();
                    await file.CopyToAsync(entry);
                }
            }
            zip.Position = 0;
            return Results.File(zip, "application/zip", "documenti.zip");
        }).RequireMember(Roles.Admin);

        // Documenti messi a disposizione dalla palestra (regolamento, modulistica)
        docs.MapGet("/shared-documents", async (HttpContext ctx, Db db) =>
        {
            var m = ctx.Member();
            var audience = m.IsAdmin ? new[] { "all", "students", "teachers" } : m.IsTeacher ? new[] { "all", "teachers" } : new[] { "all", "students" };
            return await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QueryAsync(
                "select id, title, description, file_name, content_type, bytes, audience, uploaded_at from app.shared_documents where audience = any(@audience) order by uploaded_at desc",
                new { audience }, tx));
        }).RequireMember();

        docs.MapPost("/shared-documents", async (HttpContext ctx, Db db, IFileStorage storage) =>
        {
            var m = ctx.Member();
            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file") ?? throw ApiException.Invalid("Allega il file.");
            if (file.Length == 0 || file.Length > MaxBytes || !AllowedTypes.Contains(file.ContentType)) throw ApiException.Invalid("File non valido (PDF o immagine, massimo 10 MB).");
            var title = form["title"].ToString();
            if (string.IsNullOrWhiteSpace(title)) throw ApiException.Invalid("Inserisci un titolo.");
            var audience = form["audience"].ToString() is "students" or "teachers" ? form["audience"].ToString() : "all";
            var safeName = SafeFileName(file.FileName);
            var path = $"tenants/{m.TenantId}/shared/{Guid.NewGuid():N}-{safeName}";
            await using (var s = file.OpenReadStream()) await storage.PutAsync(path, s, file.ContentType);
            var id = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.ExecuteScalarAsync<Guid>(@"
                insert into app.shared_documents (tenant_id, title, description, file_path, file_name, content_type, bytes, audience, uploaded_by)
                values (app.current_tenant(), @title, @description, @path, @safeName, @ct, @bytes, @audience, @user) returning id",
                new { title, description = form["description"].ToString(), path, safeName, ct = file.ContentType, bytes = file.Length, audience, user = m.UserId }, tx));
            return Results.Created($"/v1/shared-documents/{id}", new { id });
        }).RequireMember(Roles.Admin);

        docs.MapGet("/shared-documents/{id:guid}/file", async (HttpContext ctx, Db db, IFileStorage storage, Guid id) =>
        {
            var m = ctx.Member();
            var audience = m.IsAdmin ? new[] { "all", "students", "teachers" } : m.IsTeacher ? new[] { "all", "teachers" } : new[] { "all", "students" };
            var r = await db.InTenant(m.TenantId, m.UserId, (c, tx) => c.QuerySingleOrDefaultAsync<(string Path, string Name, string Type)?>(
                "select file_path, file_name, content_type from app.shared_documents where id = @id and audience = any(@audience)", new { id, audience }, tx))
                ?? throw ApiException.NotFound("Documento");
            var stream = await storage.GetAsync(r.Path) ?? throw ApiException.NotFound("File");
            return Results.File(stream, r.Type, r.Name);
        }).RequireMember();
    }

    /// <summary>
    /// Inserisce la nuova versione: la precedente resta nello storico (non corrente)
    /// e viene collegata, così il documento aggiornato resta sullo stesso profilo.
    /// </summary>
    private static async Task<Guid> InsertVersion(IDbConnection c, IDbTransaction tx, Member actor, Guid memberId, Guid typeId, dynamic f,
        string action, string status)
    {
        // Tipologie ricorrenti (es. documenti mensili): il documento appartiene al periodo corrente
        var periodKey = await c.ExecuteScalarAsync<string?>(
            "select app.period_key(recurrence, recurrence_days, app.tenant_today()) from app.document_types where id = @typeId", new { typeId }, tx);
        var previous = await c.QuerySingleOrDefaultAsync<(Guid Id, short Version, string? PeriodKey)?>(
            "select id, version, period_key from app.documents where member_id = @memberId and type_id = @typeId and is_current for update", new { memberId, typeId }, tx);
        if (previous is { } p)
        {
            if (p.PeriodKey is not null && p.PeriodKey != periodKey)
            {
                // Documento ricorrente di un periodo precedente: resta nello storico, non è una sostituzione
                await c.ExecuteAsync("update app.documents set is_current = false where id = @id", new { id = p.Id }, tx);
            }
            else
            {
                // Sostituzione. Il file precedente si conserva, salvo che la struttura abbia impostato
                // un periodo di conservazione: allora viene eliminato dallo storage dopo quei giorni.
                var days = (await TenantSettings.Load(c, tx)).Documents.ReplacedRetentionDays;
                await c.ExecuteAsync(@"update app.documents set is_current = false, replaced_at = now(),
                    purge_after = case when @days::int is null then null else now() + make_interval(days => @days::int) end where id = @id", new { id = p.Id, days }, tx);
                await c.ExecuteAsync("insert into app.document_events (tenant_id, document_id, action, actor_user) values (app.current_tenant(), @id, 'replaced', @user)", new { id = p.Id, user = actor.UserId }, tx);
            }
        }
        var id = await c.ExecuteScalarAsync<Guid>(@"
            insert into app.documents (tenant_id, member_id, type_id, version, replaces_document_id, status, file_path, file_name, content_type, bytes, file_sha256,
                                       signature_method, uploaded_by, expires_on, period_key)
            values (app.current_tenant(), @memberId, @typeId, @version, @replaces, @status, @file_path, @file_name, @content_type, @bytes, @sha,
                    @signature_method, @user, @expires::date, @periodKey) returning id",
            new
            {
                memberId, typeId, periodKey, version = (short)((previous?.Version ?? 0) + 1),
                replaces = previous is { } prev && (prev.PeriodKey == periodKey || prev.PeriodKey is null) ? prev.Id : (Guid?)null, status,
                file_path = (string?)f.file_path, file_name = (string?)f.file_name, content_type = (string?)f.content_type, bytes = (long?)f.bytes, sha = (string)f.sha,
                signature_method = (string?)f.signature_method,
                user = actor.UserId, expires = (string?)f.expires,
            }, tx);
        await c.ExecuteAsync("insert into app.document_events (tenant_id, document_id, action, actor_user) values (app.current_tenant(), @id, @action, @user)", new { id, action, user = actor.UserId }, tx);
        // Il caricamento soddisfa l'eventuale richiesta aperta dell'amministrazione
        await c.ExecuteAsync(@"update app.document_requests set status = 'fulfilled', document_id = @id
            where member_id = @memberId and type_id = @typeId and status = 'open' and (period_key is null or period_key = @periodKey)", new { id, memberId, typeId, periodKey }, tx);
        if (status == "pending_review")
        {
            var admins = await Notifier.UsersWithRoles(c, tx, Roles.Admin);
            var who = await c.ExecuteScalarAsync<string>("select first_name || ' ' || last_name from app.members where id = @memberId", new { memberId }, tx);
            await Notifier.ToUsers(c, tx, admins.Where(a => a != actor.UserId), "documents", "Nuovo documento da verificare", $"{who} ha caricato un documento.", actor.UserId, link: $"/archivio/{id}");
        }
        return id;
    }

    /// <summary>
    /// Interessata, genitore collegato o amministrazione. Le insegnanti non accedono ai
    /// documenti delle allieve (dati personali e sanitari).
    /// </summary>
    private static async Task EnsureCanSeeMemberDocuments(IDbConnection c, IDbTransaction tx, Member m, Guid memberId)
    {
        if (m.IsAdmin || m.MemberId == memberId) return;
        if (m.Roles.Contains("support")) throw ApiException.Forbidden("I documenti personali non sono accessibili in assistenza.");
        await Relations.EnsureCanActFor(c, tx, m, memberId, "view");
    }

    private static void ValidateType(TypeInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw ApiException.Invalid("Inserisci il nome della tipologia.");
        if (!Categories.Contains(i.Category)) throw ApiException.Invalid("Categoria non valida.");
        // Nessuna firma nella piattaforma: "upload_signed" indica un modulo da caricare già firmato a mano
        if (i.SignatureMode is not (null or "none" or "upload_signed")) throw ApiException.Invalid("Modalità non valida: i documenti si caricano già firmati a mano.");
        if (i.Audience is not (null or "students" or "teachers" or "all")) throw ApiException.Invalid("Destinatari non validi.");
        if (i.Recurrence is not (null or "none" or "monthly" or "every_n_days")) throw ApiException.Invalid("Cadenza non valida: none, monthly o every_n_days.");
        if (i.Recurrence == "every_n_days" && i.RecurrenceDays is null or <= 0) throw ApiException.Invalid("Indica ogni quanti giorni va caricato il documento.");
        if (i.DueDayOfMonth is < 1 or > 31) throw ApiException.Invalid("Giorno di scadenza non valido.");
    }

    private static string SafeFileName(string name)
    {
        var n = Path.GetFileName(name);
        n = System.Text.RegularExpressions.Regex.Replace(n, "[^A-Za-z0-9._-]+", "_");
        return n.Length > 80 ? n[^80..] : n.Length == 0 ? "documento" : n;
    }

}

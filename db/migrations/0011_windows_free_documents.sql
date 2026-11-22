-- ════════════════════════════════════════════════════════════════════
-- 0011 · Finestre configurabili per i recuperi e documenti senza tipologia
--   · recuperi: l'amministrazione imposta entro quale intervallo prima della
--     lezione si può chiedere un recupero (massimo e minimo di ore);
--   · documenti: si possono caricare documenti con un titolo libero, senza
--     una tipologia definita prima, con la loro data di scadenza;
--   · una tipologia ricorrente può chiedere più documenti per periodo
--     (es. insegnanti: due documenti al mese, con il titolo che preferiscono).
-- ════════════════════════════════════════════════════════════════════

create or replace function app.default_settings() returns jsonb
  language sql immutable
as $$ select '{
  "timezone": "Europe/Rome",
  "booking": { "opensHoursBefore": null, "closesHoursBefore": 0, "cancelHoursBefore": 0, "lateCancelConsumesEntry": true, "noShowConsumesEntry": true },
  "packages": { "consumeOn": "attendance" },
  "makeups": { "creditOn": "declared_in_time", "allowLowerLevel": true, "sameDisciplineOnly": false, "maxPerPlan": null,
               "requestOpensHoursBefore": null, "requestClosesHoursBefore": 0 },
  "competitive": { "certificateRequiredFor": ["competitive", "pre_competitive"], "blockEnrollmentWithoutCertificate": true },
  "documents": { "replacedRetentionDays": null, "expiryReminderDays": 30, "requestReminderDays": 3 },
  "classes": { "categories": [], "maxDisciplines": null },
  "payments": { "methods": ["cash", "bank_transfer"] }
}'::jsonb $$;

-- ── Tipologie che chiedono più documenti per periodo ────────────────
alter table app.document_types add column required_count smallint not null default 1 check (required_count between 1 and 20);

-- ── Documenti con titolo libero ─────────────────────────────────────
alter table app.documents
  add column title text check (title is null or char_length(title) between 1 and 120),
  -- Chiave della versione: stesso documento = stessa tipologia e stesso "posto" (titolo, se la tipologia ne ammette più d'uno)
  add column slot text not null default '';
alter table app.documents alter column type_id drop not null;
alter table app.documents add constraint documents_type_or_title check (type_id is not null or title is not null);

drop index if exists app.documents_one_current;
create unique index documents_one_current on app.documents (tenant_id, member_id, coalesce(type_id::text, ''), slot) where is_current;

-- Documento richiesto soddisfatto: per le ricorrenti contano i documenti (in attesa o approvati) del periodo corrente
create or replace function app.document_satisfied(p_member uuid, p_type uuid) returns boolean
  language sql stable
as $$
  select case when t.recurrence = 'none' then exists (
           select 1 from app.documents d
           where d.member_id = p_member and d.type_id = p_type and d.is_current and d.status in ('pending_review', 'approved')
             and (d.expires_on is null or d.expires_on >= app.tenant_today()))
         else (select count(*) from app.documents d
               where d.member_id = p_member and d.type_id = p_type and d.is_current and d.status in ('pending_review', 'approved')
                 and d.period_key = app.period_key(t.recurrence, t.recurrence_days, app.tenant_today())) >= t.required_count
         end
  from app.document_types t where t.id = p_type
$$;

-- ════════════════════════════════════════════════════════════════════
-- 0010 · Allineamento al prompt DY DYNAMITE
--   · lezioni singole: la prenotazione SI APRE N ore prima (finestra), la
--     disdetta è libera fino a N ore prima;
--   · pacchetti: l'ingresso si scala alla partecipazione effettiva (regola configurabile);
--   · classi: categorie (es. bambini/ragazzi, adulti/ragazzi), numero massimo di discipline;
--   · coerenza piano ↔ classe;
--   · documenti periodici degli insegnanti (es. due documenti ogni mese, entro fine mese);
--   · sostituzioni degli insegnanti;
--   · eventi: partecipanti assegnati, musica delle performance (file o collegamento);
--   · metodi di pagamento configurabili per struttura;
--   · documenti sostituiti: nessuna eliminazione automatica se non configurata.
-- I valori di una singola struttura NON sono qui: stanno nelle sue impostazioni.
-- ════════════════════════════════════════════════════════════════════

-- ── Impostazioni predefinite della piattaforma (neutrali) ───────────
create or replace function app.default_settings() returns jsonb
  language sql immutable
as $$ select '{
  "timezone": "Europe/Rome",
  "booking": { "opensHoursBefore": null, "closesHoursBefore": 0, "cancelHoursBefore": 0, "lateCancelConsumesEntry": true, "noShowConsumesEntry": true },
  "packages": { "consumeOn": "attendance" },
  "makeups": { "creditOn": "declared_in_time", "allowLowerLevel": true, "sameDisciplineOnly": false, "maxPerPlan": null },
  "competitive": { "certificateRequiredFor": ["competitive", "pre_competitive"], "blockEnrollmentWithoutCertificate": true },
  "documents": { "replacedRetentionDays": null, "expiryReminderDays": 30, "requestReminderDays": 3 },
  "classes": { "categories": [], "maxDisciplines": null },
  "payments": { "methods": ["cash", "bank_transfer"] }
}'::jsonb $$;

-- La vecchia soglia "almeno N ore prima" aveva il significato opposto: non viene riportata
update app.tenant_settings set settings = settings #- '{booking,singleLessonBookHoursBefore}'
where settings -> 'booking' ? 'singleLessonBookHoursBefore';

-- ── Finestra di prenotazione dei piani ──────────────────────────────
alter table app.fee_plans rename column booking_hours_before to booking_closes_hours_before;
alter table app.fee_plans
  add column booking_opens_hours_before smallint check (booking_opens_hours_before > 0),  -- null: lezione singola = soglia della struttura, altri piani = nessuna apertura anticipata
  add column class_categories text[] not null default '{}';                                -- categorie di classe coerenti con il piano (vuoto = tutte)

-- ── Ingressi: consumati alla partecipazione effettiva ───────────────
alter table app.lesson_bookings add column consumed_by text check (consumed_by in ('booking', 'attendance', 'no_show', 'late_cancel'));
update app.lesson_bookings set consumed_by = 'booking' where entry_consumed;

-- ── Classi: categoria ───────────────────────────────────────────────
alter table app.classes add column category text;

-- ── Sostituzioni degli insegnanti ───────────────────────────────────
alter table app.lessons
  add column substitute_member_id uuid,
  add column substitution_note text,
  add foreign key (tenant_id, substitute_member_id) references app.members (tenant_id, id) on delete set null (substitute_member_id);

-- ── Documenti periodici ─────────────────────────────────────────────
alter table app.document_types
  add column recurrence text not null default 'none' check (recurrence in ('none', 'monthly', 'every_n_days')),
  add column recurrence_days smallint check (recurrence_days > 0),
  add column due_day_of_month smallint check (due_day_of_month between 1 and 31);   -- null con "monthly" = ultimo giorno del mese
alter table app.document_requests add column period_key text;                       -- es. "2026-11": una richiesta per persona, tipologia e periodo
drop index if exists app.document_requests_one_open;
create unique index document_requests_one_open on app.document_requests (tenant_id, member_id, type_id) where status = 'open' and period_key is null;
create unique index document_requests_one_per_period on app.document_requests (tenant_id, member_id, type_id, period_key) where period_key is not null;
alter table app.documents add column period_key text;

-- ── Eventi: partecipanti assegnati e musica delle performance ───────
alter table app.event_links drop constraint if exists event_links_kind_check;
alter table app.event_links add constraint event_links_kind_check check (kind in ('class', 'discipline', 'teacher', 'member'));
alter table app.event_tracks
  add column link_url text check (link_url is null or link_url ~ '^https://'),
  add column audio_path text,
  add column audio_content_type text,
  add column audio_bytes bigint check (audio_bytes >= 0),
  add constraint event_tracks_audio_path check (audio_path is null or audio_path like 'tenants/' || tenant_id::text || '/events/%');

-- ── Metodi di pagamento: elenco configurabile per struttura ─────────
alter table app.member_payments drop constraint if exists member_payments_method_check;
alter table app.member_payments add constraint member_payments_method_check check (method ~ '^[a-z_]{2,30}$');

-- ── Periodi dei documenti ricorrenti ────────────────────────────────
-- Chiave del periodo che contiene una data: "2026-11" (mensile) oppure "P<n>"
-- (ogni N giorni, a partire da lunedì 3 gennaio 2000).
create or replace function app.period_key(p_recurrence text, p_days smallint, p_date date) returns text
  language sql immutable
as $$
  select case p_recurrence
    when 'monthly' then to_char(p_date, 'YYYY-MM')
    when 'every_n_days' then 'P' || ((p_date - date '2000-01-03') / greatest(coalesce(p_days, 30), 1))::text
  end
$$;

-- Scadenza del periodo che contiene una data: giorno indicato del mese (o l'ultimo), oppure fine del blocco di N giorni.
create or replace function app.period_due(p_recurrence text, p_days smallint, p_due_day smallint, p_date date) returns date
  language sql immutable
as $$
  select case p_recurrence
    when 'monthly' then
      case when p_due_day is null then (date_trunc('month', p_date) + interval '1 month - 1 day')::date
           else make_date(extract(year from p_date)::int, extract(month from p_date)::int,
                          least(p_due_day::int, extract(day from date_trunc('month', p_date) + interval '1 month - 1 day')::int)) end
    when 'every_n_days' then
      date '2000-01-03' + ((p_date - date '2000-01-03') / greatest(coalesce(p_days, 30), 1) + 1) * greatest(coalesce(p_days, 30), 1) - 1
  end
$$;

grant execute on function app.period_key(text, smallint, date), app.period_due(text, smallint, smallint, date) to oasi_api;

-- Documento "valido" per la persona: quello del periodo corrente (ricorrenti) o in corso di validità (gli altri)
create or replace function app.document_satisfied(p_member uuid, p_type uuid) returns boolean
  language sql stable
as $$
  select exists (
    select 1 from app.documents d join app.document_types t on t.id = d.type_id
    where d.member_id = p_member and d.type_id = p_type and d.is_current and d.status in ('pending_review', 'approved')
      and (case when t.recurrence = 'none' then d.expires_on is null or d.expires_on >= app.tenant_today()
                else d.period_key = app.period_key(t.recurrence, t.recurrence_days, app.tenant_today()) end))
$$;
grant execute on function app.document_satisfied(uuid, uuid) to oasi_api;

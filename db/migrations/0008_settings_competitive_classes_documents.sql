-- ════════════════════════════════════════════════════════════════════
-- 0008 · Impostazioni per struttura (fuso orario, soglie), agonismo,
--        classi con più discipline, documenti per ruolo e sostituzioni.
-- Nessun valore di una singola struttura è scritto qui: i valori iniziali
-- stanno in app.tenant_settings e sono modificabili dall'amministrazione.
-- ════════════════════════════════════════════════════════════════════

-- ── Impostazioni: valori predefiniti della piattaforma ──────────────
-- Le impostazioni della struttura (app.tenant_settings.settings) sovrascrivono
-- queste chiavi. Le soglie sono in ore; il fuso orario è un nome IANA.
create or replace function app.default_settings() returns jsonb
  language sql immutable
as $$ select '{
  "timezone": "Europe/Rome",
  "booking": { "singleLessonBookHoursBefore": 48, "cancelHoursBefore": 6, "lateCancelConsumesEntry": true },
  "makeups": { "creditOn": "declared_in_time", "allowLowerLevel": true, "sameDisciplineOnly": false, "maxPerPlan": null },
  "competitive": { "certificateRequiredFor": ["competitive", "pre_competitive"], "blockEnrollmentWithoutCertificate": true },
  "documents": { "replacedRetentionDays": 7, "expiryReminderDays": 30 }
}'::jsonb $$;

-- Unione ricorsiva: le chiavi della struttura prevalgono, le altre restano quelle predefinite
create or replace function app.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
  language sql immutable
as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k, case
        when a ? k and b ? k then app.jsonb_deep_merge(a -> k, b -> k)
        when b ? k then b -> k else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b end
$$;

create or replace function app.settings() returns jsonb
  language sql stable
as $$
  select app.jsonb_deep_merge(app.default_settings(),
    coalesce((select s.settings from app.tenant_settings s where s.tenant_id = app.current_tenant()), '{}'::jsonb))
$$;

create or replace function app.tenant_timezone() returns text
  language sql stable
as $$ select coalesce(nullif(app.settings() ->> 'timezone', ''), 'Europe/Rome') $$;

-- Data e ora "di parete" della struttura (per confrontare con date e orari delle lezioni)
create or replace function app.tenant_today() returns date
  language sql stable
as $$ select (now() at time zone app.tenant_timezone())::date $$;

-- Istante assoluto di inizio di una lezione nel fuso della struttura (gestisce i cambi d'ora)
create or replace function app.local_instant(d date, t time) returns timestamptz
  language sql stable
as $$ select (d + t) at time zone app.tenant_timezone() $$;

grant execute on function app.default_settings(), app.jsonb_deep_merge(jsonb, jsonb), app.settings(), app.tenant_timezone(), app.tenant_today(), app.local_instant(date, time) to oasi_api;

-- ── Agonismo ────────────────────────────────────────────────────────
alter table app.members add column is_competitive boolean not null default false;
alter table app.classes add column competitive_level text not null default 'none'
  check (competitive_level in ('none', 'pre_competitive', 'competitive'));

-- ── Classi con una o più discipline (nessun archivio parallelo) ─────
-- app.classes.discipline_id resta la disciplina principale (compatibilità);
-- l'elenco completo sta qui.
create table app.class_disciplines (
  tenant_id     uuid not null,
  class_id      uuid not null,
  discipline_id uuid not null,
  primary key (tenant_id, class_id, discipline_id),
  foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete cascade,
  foreign key (tenant_id, discipline_id) references app.disciplines (tenant_id, id)
);
insert into app.class_disciplines (tenant_id, class_id, discipline_id)
select tenant_id, id, discipline_id from app.classes;

-- ── Documenti: destinatari, obbligo per agonisti, richieste, sostituzioni ──
alter table app.document_types
  add column audience text not null default 'students' check (audience in ('students', 'teachers', 'all')),
  add column required_for_competitive boolean not null default false,   -- obbligatorio solo per agonisti/classi agonistiche
  add column expiry_required boolean not null default false;            -- chi carica deve indicare la scadenza

-- Richieste puntuali dell'amministrazione a una persona (es. un documento a un insegnante):
-- nessun numero fisso e nessuna cadenza obbligatoria.
create table app.document_requests (
  tenant_id    uuid not null,
  id           uuid not null default gen_random_uuid(),
  member_id    uuid not null,
  type_id      uuid not null,
  due_on       date,
  note         text not null default '',
  status       text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  document_id  uuid,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, type_id) references app.document_types (tenant_id, id),
  foreign key (tenant_id, document_id) references app.documents (tenant_id, id) on delete set null (document_id)
);
create unique index document_requests_one_open on app.document_requests (tenant_id, member_id, type_id) where status = 'open';

-- Sostituzione: il file precedente resta disponibile al massimo N giorni (N ≤ 7),
-- poi viene eliminato dallo storage; resta la riga con l'evento di audit, senza contenuto.
alter table app.documents
  add column replaced_at timestamptz,
  add column purge_after timestamptz,
  add column file_deleted_at timestamptz;
alter table app.documents alter column file_path drop not null;
alter table app.documents add constraint documents_file_or_deleted check (file_path is not null or file_deleted_at is not null);
update app.documents set replaced_at = now(), purge_after = now() + interval '7 days' where not is_current;
create index documents_to_purge on app.documents (purge_after) where file_path is not null and purge_after is not null;

alter table app.document_events drop constraint if exists document_events_action_check;
alter table app.document_events add constraint document_events_action_check
  check (action in ('uploaded', 'approved', 'rejected', 'replacement_requested', 'replaced', 'viewed', 'downloaded', 'expiry_corrected', 'file_deleted'));

-- ── Promemoria già inviati (evita notifiche duplicate dei lavori pianificati) ──
create table app.reminder_log (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  key       text not null,
  sent_at   timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- Collegamento della notifica alla schermata o all'elemento interessato
alter table app.notifications add column link text;
alter table app.notifications drop constraint if exists notifications_category_check;
alter table app.notifications add constraint notifications_category_check
  check (category in ('lessons', 'schedule_changes', 'attendance', 'makeups', 'events', 'workshops', 'teaching', 'admin', 'documents', 'payments'));

-- Preferenze di notifica dell'utente: categorie disattivate
create table app.notification_preferences (
  tenant_id        uuid not null,
  user_id          uuid not null,
  muted_categories text[] not null default '{}',
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references app.memberships (tenant_id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['class_disciplines', 'document_requests', 'reminder_log', 'notification_preferences'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant())', t);
    execute format('grant select, insert, update, delete on app.%I to oasi_api', t);
  end loop;
end $$;

-- ── Regole sui documenti richiesti (usate dall'API e dai riepiloghi) ──
-- Agonista: lo è la persona, oppure è iscritta a una classe la cui classificazione
-- richiede il certificato agonistico (elenco configurabile dalla struttura).
create or replace function app.needs_competitive_certificate(p_member uuid) returns boolean
  language sql stable
as $$
  select coalesce((select is_competitive from app.members where id = p_member), false)
      or exists (select 1 from app.enrollments e join app.classes c on c.id = e.class_id
                 where e.member_id = p_member and e.status = 'approved'
                   and c.competitive_level in (select jsonb_array_elements_text(app.settings() -> 'competitive' -> 'certificateRequiredFor')))
$$;

-- La tipologia riguarda questa persona? (allievi: anche i minori senza account)
create or replace function app.document_type_applies(p_member uuid, p_audience text) returns boolean
  language sql stable
as $$
  select case p_audience
    when 'all' then true
    when 'teachers' then exists (select 1 from app.memberships ms where ms.member_id = p_member and ms.status = 'active' and 'teacher' = any(ms.roles))
    else not exists (select 1 from app.memberships ms where ms.member_id = p_member and ms.status = 'active')
         or exists (select 1 from app.memberships ms where ms.member_id = p_member and ms.status = 'active' and 'student' = any(ms.roles))
  end
$$;

-- Il documento è obbligatorio per questa persona?
create or replace function app.document_required(p_member uuid, p_audience text, p_required boolean, p_competitive boolean) returns boolean
  language sql stable
as $$
  select app.document_type_applies(p_member, p_audience)
     and (p_required or (p_competitive and app.needs_competitive_certificate(p_member)))
$$;

grant execute on function app.needs_competitive_certificate(uuid), app.document_type_applies(uuid, text), app.document_required(uuid, text, boolean, boolean) to oasi_api;

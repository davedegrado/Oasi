-- ════════════════════════════════════════════════════════════════════
-- 0006 · Archivio documentale, discipline attivabili, chiusure
-- ════════════════════════════════════════════════════════════════════

-- ── Discipline: dati configurabili, attivabili e disattivabili ──────
-- Disattivare una disciplina non tocca classi, iscrizioni e storico:
-- impedisce solo di usarla per nuove classi.
alter table app.disciplines
  add column is_active boolean not null default true,
  add column description text not null default '';

-- ── Chiusure: festività, scioperi, chiusure della sede ──────────────
create table app.closures (
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  kind             text not null check (kind in ('holiday', 'strike', 'closure')),
  title            text not null,
  start_date       date not null,
  end_date         date not null,
  note             text not null default '',
  reminder_sent_at timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  check (end_date >= start_date)
);
create index closures_range on app.closures (tenant_id, start_date, end_date);

-- La lezione annullata da una chiusura ricorda quale chiusura l'ha annullata,
-- così eliminando la chiusura si ripristina solo ciò che essa aveva cambiato.
alter table app.lessons add column closure_id uuid;
alter table app.lessons add foreign key (tenant_id, closure_id) references app.closures (tenant_id, id) on delete set null (closure_id);

-- ── Archivio documentale ────────────────────────────────────────────
-- Tipologie definite dalla palestra (modulo iscrizione, liberatoria, ...)
create table app.document_types (
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  name             text not null,
  category         text not null check (category in ('personal', 'enrollment', 'waiver', 'consent', 'medical', 'other')),
  description      text not null default '',
  is_required      boolean not null default false,       -- richiesto a ogni allieva
  signature_mode   text not null default 'none' check (signature_mode in ('none', 'upload_signed', 'electronic')),
  template_text    text,                                  -- testo da firmare elettronicamente
  validity_months  smallint check (validity_months > 0),  -- es. 12 per il certificato medico
  is_sensitive     boolean not null default false,        -- dati sanitari: solo amministrazione e interessata
  is_active        boolean not null default true,
  primary key (tenant_id, id),
  unique (tenant_id, name)
);

-- Ogni documento appartiene a UN solo profilo: profilo e archivio generale
-- leggono la stessa riga (nessuna copia). Le sostituzioni creano una nuova
-- versione collegata alla precedente.
create table app.documents (
  tenant_id            uuid not null,
  id                   uuid not null default gen_random_uuid(),
  member_id            uuid not null,
  type_id              uuid not null,
  version              smallint not null default 1,
  replaces_document_id uuid,
  is_current           boolean not null default true,
  status               text not null default 'pending_review'
                       check (status in ('pending_review', 'approved', 'rejected', 'replacement_requested')),
  file_path            text,                              -- tenants/{tenant}/documents/{member}/...
  file_name            text,
  content_type         text,
  bytes                bigint check (bytes >= 0),
  file_sha256          text,
  signature_method     text check (signature_method in ('upload_signed', 'electronic')),
  signed_at            timestamptz,
  signed_by            uuid,
  signer_name          text,
  uploaded_by          uuid,
  uploaded_at          timestamptz not null default now(),
  expires_on           date,
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  review_note          text,
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, type_id) references app.document_types (tenant_id, id),
  foreign key (tenant_id, replaces_document_id) references app.documents (tenant_id, id),
  check (file_path is null or file_path like 'tenants/' || tenant_id::text || '/documents/%'),
  check (file_path is not null or signature_method = 'electronic')
);
-- Una sola versione corrente per persona e tipologia
create unique index documents_one_current on app.documents (tenant_id, member_id, type_id) where is_current;
create index documents_archive on app.documents (tenant_id, status, uploaded_at desc);

-- Documenti messi a disposizione dalla palestra (regolamento, modulistica)
create table app.shared_documents (
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  file_path    text not null,
  file_name    text not null,
  content_type text not null,
  bytes        bigint not null,
  audience     text not null default 'all' check (audience in ('all', 'students', 'teachers')),
  uploaded_by  uuid,
  uploaded_at  timestamptz not null default now(),
  primary key (tenant_id, id),
  check (file_path like 'tenants/' || tenant_id::text || '/shared/%')
);

-- Storico delle verifiche e modifiche (append-only per l'API)
create table app.document_events (
  tenant_id   uuid not null,
  id          bigint generated always as identity,
  document_id uuid not null,
  action      text not null check (action in ('uploaded', 'signed', 'approved', 'rejected', 'replacement_requested', 'replaced', 'viewed', 'downloaded')),
  actor_user  uuid,
  note        text,
  at          timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, document_id) references app.documents (tenant_id, id) on delete cascade
);

-- ── RLS sulle nuove tabelle (stesso schema delle altre) ────────────
do $$
declare t text;
begin
  foreach t in array array['closures', 'document_types', 'documents', 'shared_documents', 'document_events'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant())', t);
    execute format('grant select, insert, update, delete on app.%I to oasi_api', t);
  end loop;
end $$;
-- Lo storico non si modifica né si cancella dall'API
revoke update, delete on app.document_events from oasi_api;

-- ── Modulo "documents" nel catalogo, incluso nei piani Studio e Premium ─
insert into platform.modules (key, name, description) values
  ('documents', 'Archivio documentale', 'Documenti delle allieve: caricamento, verifica, scadenze e firma')
on conflict (key) do nothing;
insert into platform.plan_modules (plan_id, module_key)
select id, 'documents' from platform.plans where code in ('studio', 'premium')
on conflict do nothing;
-- Abilita il modulo ai tenant che hanno già un piano che lo include
insert into platform.tenant_modules (tenant_id, module_key, enabled, source)
select s.tenant_id, 'documents', true, 'plan'
from platform.subscriptions s join platform.plans p on p.id = s.plan_id
where p.code in ('studio', 'premium') and s.status in ('trialing', 'active', 'past_due', 'free')
on conflict do nothing;

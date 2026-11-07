-- ════════════════════════════════════════════════════════════════════
-- 0005 · Inviti utente e statistiche aggregate per il Super Admin
-- ════════════════════════════════════════════════════════════════════
create table app.invitations (
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  id          uuid not null default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  member_id   uuid not null,
  roles       text[] not null check (roles <@ array['admin', 'teacher', 'student', 'guardian']::text[] and cardinality(roles) > 0),
  token_hash  text not null unique,             -- sha256 del token inviato via email
  invited_by  uuid,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid,
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);
alter table app.invitations enable row level security;
alter table app.invitations force row level security;
create policy tenant_isolation on app.invitations for all
  using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant());

-- Ricerca di un invito per token (prima di conoscere il tenant).
-- Restituisce solo l'identificativo: nessun dato personale.
create or replace function platform.find_invitation(p_token_hash text)
  returns table (tenant_id uuid, invitation_id uuid)
  language sql stable security definer set search_path = ''
as $$
  select i.tenant_id, i.id from app.invitations i
  where i.token_hash = p_token_hash and i.accepted_at is null and i.expires_at > now()
$$;

-- Statistiche aggregate per tenant: solo conteggi, nessun dato personale.
-- security definer: il proprietario (ruolo di migrazione) deve poter
-- leggere tutte le righe; su Supabase il ruolo postgres ha BYPASSRLS.
create or replace function platform.tenant_usage()
  returns table (tenant_id uuid, members bigint, active_memberships bigint, classes bigint, lessons_last_30d bigint, figures bigint, media_bytes bigint)
  language sql stable security definer set search_path = ''
as $$
  select t.id,
    (select count(*) from app.members m where m.tenant_id = t.id),
    (select count(*) from app.memberships x where x.tenant_id = t.id and x.status = 'active'),
    (select count(*) from app.classes c where c.tenant_id = t.id and c.is_active),
    (select count(*) from app.lessons l where l.tenant_id = t.id and l.date between current_date - 30 and current_date),
    (select count(*) from app.figures f where f.tenant_id = t.id),
    (select coalesce(sum(o.bytes), 0)::bigint from app.media_objects o where o.tenant_id = t.id)
  from platform.tenants t
$$;

revoke all on function platform.tenant_usage(), platform.find_invitation(text) from public;
grant execute on function platform.tenant_usage(), platform.find_invitation(text) to oasi_api;
grant select, insert, update, delete on app.invitations to oasi_api;

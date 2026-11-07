-- ════════════════════════════════════════════════════════════════════
-- 0003 · Ruolo dell'API e Row Level Security
--
-- L'API si collega con il ruolo "oasi_api" (senza BYPASSRLS). Per ogni
-- richiesta apre una transazione e imposta:
--   set_config('app.tenant_id', '<uuid>', true)
--   set_config('app.user_id',   '<uuid>', true)
-- Le policy leggono questi valori. Se non sono impostati la query non
-- vede nessuna riga (fail-closed).
-- La password del ruolo NON è nel repository: va impostata a mano
--   alter role oasi_api password '…';
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oasi_api') then
    create role oasi_api login nobypassrls noinherit;
  end if;
end $$;

create or replace function app.current_tenant() returns uuid
  language sql stable
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app.current_user_id() returns uuid
  language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Isolamento per tenant su tutte le tabelle dello schema app
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relkind = 'r'
  loop
    execute format('alter table app.%I enable row level security', t.relname);
    execute format('alter table app.%I force row level security', t.relname);
    execute format('drop policy if exists tenant_isolation on app.%I', t.relname);
    execute format(
      'create policy tenant_isolation on app.%I for all
         using (tenant_id = app.current_tenant())
         with check (tenant_id = app.current_tenant())', t.relname);
  end loop;
end $$;

-- Un utente può leggere le PROPRIE appartenenze in tutte le palestre
-- (serve per la scelta dell'organizzazione dopo il login). Solo lettura.
create policy own_memberships_read on app.memberships for select
  using (user_id = app.current_user_id());

-- Permessi del ruolo API
grant usage on schema app, platform to oasi_api;
grant select, insert, update, delete on all tables in schema app to oasi_api;
grant select, insert, update, delete on all tables in schema platform to oasi_api;
grant usage, select on all sequences in schema platform, app to oasi_api;
grant execute on function app.current_tenant(), app.current_user_id() to oasi_api;
alter default privileges in schema app grant select, insert, update, delete on tables to oasi_api;
alter default privileges in schema platform grant select, insert, update, delete on tables to oasi_api;

-- Su Supabase i ruoli anon/authenticated non devono vedere questi schemi
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema app, platform from %I', r);
      execute format('revoke all on all tables in schema app, platform from %I', r);
    end if;
  end loop;
end $$;

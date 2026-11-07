-- ════════════════════════════════════════════════════════════════════
-- Test di isolamento multi-tenant a livello database.
-- Eseguire come superuser su un database con le migrazioni applicate:
--   psql -v ON_ERROR_STOP=1 -f db/tests/isolation.sql
-- Tutto avviene in una transazione annullata alla fine.
-- ════════════════════════════════════════════════════════════════════
\set QUIET on
begin;

-- Dati di prova: due palestre, ciascuna con una disciplina, una classe e un'allieva
insert into platform.tenants (id, slug, legal_name, display_name, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'test-a', 'Palestra A', 'A', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-b', 'Palestra B', 'B', 'active');

set local app.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into app.disciplines (tenant_id, id, slug, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000001', 'cerchio', 'Cerchio');
insert into app.classes (tenant_id, id, name, discipline_id, capacity, weekday, start_time, end_time)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', 'Classe A', 'aaaaaaaa-0000-0000-0001-000000000001', 8, 1, '18:00', '19:30');
insert into app.members (tenant_id, id, first_name, last_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0003-000000000001', 'Anna', 'A');

set local app.tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into app.disciplines (tenant_id, id, slug, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0001-000000000002', 'pole', 'Pole');
insert into app.classes (tenant_id, id, name, discipline_id, capacity, weekday, start_time, end_time)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0002-000000000002', 'Classe B', 'bbbbbbbb-0000-0000-0001-000000000002', 8, 2, '18:00', '19:30');
insert into app.members (tenant_id, id, user_id, first_name, last_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0003-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'Bea', 'B');
insert into app.memberships (tenant_id, user_id, member_id, roles) values ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0003-000000000002', '{student}');

create temporary table results (name text, ok boolean, detail text) on commit drop;
grant insert, select on results to oasi_api;

-- ── Da qui si agisce come l'API ──────────────────────────────────────
set local role oasi_api;

-- 1. Senza tenant impostato non si vede nulla (fail-closed)
set local app.tenant_id = '';
insert into results select '1. nessun tenant: zero classi visibili', count(*) = 0, count(*)::text from app.classes;

-- 2. Con il tenant A si vedono solo i dati di A
set local app.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into results select '2. tenant A vede solo le proprie classi', count(*) = 1 and bool_and(name = 'Classe A'), string_agg(name, ',') from app.classes;
insert into results select '3. tenant A non vede allieve di B', count(*) = 0, count(*)::text from app.members where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- 4. Scrivere una riga di B mentre si è in A viene rifiutato
do $$ begin
  insert into app.classes (tenant_id, name, discipline_id, capacity, weekday, start_time, end_time)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'Intrusa', 'bbbbbbbb-0000-0000-0001-000000000002', 5, 3, '10:00', '11:00');
  insert into results values ('4. scrittura in un altro tenant rifiutata', false, 'inserita!');
exception when insufficient_privilege or check_violation then
  insert into results values ('4. scrittura in un altro tenant rifiutata', true, sqlerrm);
end $$;

-- 5. Modificare o cancellare righe di B da A non ha effetto
with u as (update app.classes set name = 'Hack' where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1)
insert into results select '5. update su altro tenant: 0 righe', count(*) = 0, count(*)::text from u;
with d as (delete from app.members where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1)
insert into results select '6. delete su altro tenant: 0 righe', count(*) = 0, count(*)::text from d;

-- 7. Collegare una classe di A a un'allieva di B è impossibile (chiave esterna composta)
do $$ begin
  insert into app.enrollments (tenant_id, class_id, member_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', 'bbbbbbbb-0000-0000-0003-000000000002', 'requested');
  insert into results values ('7. iscrizione tra tenant diversi rifiutata', false, 'inserita!');
exception when foreign_key_violation then
  insert into results values ('7. iscrizione tra tenant diversi rifiutata', true, 'foreign_key_violation');
end $$;

-- 8. Un utente vede le proprie appartenenze anche fuori dal tenant corrente, ma non quelle altrui
set local app.user_id = 'cccccccc-0000-0000-0000-000000000003';
insert into results select '8. appartenenze proprie visibili da altro tenant', count(*) = 1, count(*)::text from app.memberships;
set local app.user_id = 'dddddddd-0000-0000-0000-000000000004';
insert into results select '9. appartenenze altrui non visibili', count(*) = 0, count(*)::text from app.memberships;

-- 10. Le appartenenze di un altro tenant non sono modificabili
with u as (update app.memberships set roles = '{admin}' returning 1)
insert into results select '10. escalation di ruolo in altro tenant: 0 righe', count(*) = 0, count(*)::text from u;

-- 11. Il ruolo API non può disattivare la RLS
do $$ begin
  execute 'alter table app.classes disable row level security';
  insert into results values ('11. il ruolo API non può disattivare la RLS', false, 'disattivata!');
exception when insufficient_privilege then
  insert into results values ('11. il ruolo API non può disattivare la RLS', true, 'insufficient_privilege');
end $$;

reset role;
\set QUIET off
\pset footer off
select case when ok then 'OK  ' else 'FAIL' end as esito, name as test, detail from results order by name;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception 'Test di isolamento falliti'; end if;
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════
-- 0016 · Gruppi degli eventi
-- Per ogni evento (tranne quelli sociali) gli insegnanti organizzano i gruppi
-- di partecipanti; ogni gruppo ha il titolo della sua canzone (solo il titolo:
-- nessun file audio). Un partecipante può stare in più gruppi dello stesso evento.
-- Sostituisce i "brani" (event_tracks), che prevedevano anche file e collegamenti:
-- i titoli esistenti diventano gruppi; i file audio già caricati restano nello
-- storage e vanno rimossi a mano (percorsi tenants/<tenant>/events/...).
-- ════════════════════════════════════════════════════════════════════
create table app.event_groups (
  tenant_id   uuid not null,
  id          uuid not null default gen_random_uuid(),
  event_id    uuid not null,
  position    smallint not null default 0,
  name        text not null check (length(btrim(name)) between 1 and 80),
  song_title  text not null default '' check (length(song_title) <= 160),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, event_id) references app.events (tenant_id, id) on delete cascade
);
create index event_groups_event on app.event_groups (tenant_id, event_id, position);

create table app.event_group_members (
  tenant_id uuid not null,
  group_id  uuid not null,
  member_id uuid not null,
  primary key (tenant_id, group_id, member_id),
  foreign key (tenant_id, group_id) references app.event_groups (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);
create index event_group_members_member on app.event_group_members (tenant_id, member_id);

do $$
declare t text;
begin
  foreach t in array array['event_groups', 'event_group_members'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant())', t);
    execute format('grant select, insert, update, delete on app.%I to oasi_api', t);
  end loop;
end $$;

-- Brani esistenti → gruppi (nome del gruppo, o della classe, o del brano); membri: atleti della classe collegata
insert into app.event_groups (tenant_id, id, event_id, position, name, song_title, created_by, created_at)
select t.tenant_id, t.id, t.event_id, t.position,
       left(coalesce(nullif(btrim(t.group_label), ''), cl.name, t.title), 80),
       left(t.title || case when t.artist <> '' then ' · ' || t.artist else '' end, 160),
       t.added_by, t.created_at
from app.event_tracks t left join app.classes cl on cl.tenant_id = t.tenant_id and cl.id = t.class_id;

insert into app.event_group_members (tenant_id, group_id, member_id)
select t.tenant_id, t.id, e.member_id
from app.event_tracks t join app.enrollments e on e.tenant_id = t.tenant_id and e.class_id = t.class_id and e.status = 'approved'
on conflict do nothing;

drop table app.event_tracks;

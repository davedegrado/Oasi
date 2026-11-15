-- ════════════════════════════════════════════════════════════════════
-- 0009 · Stagioni e periodi, motore dei piani, quote e pagamenti
--        registrati (incassati fuori dall'app), diritti di recupero,
--        prenotazioni di lezioni singole e pacchetti a ingressi.
-- Tutto è configurazione della struttura: nessuna formula commerciale
-- (es. "Circo Baby") ha codice dedicato.
-- ════════════════════════════════════════════════════════════════════

-- ── Stagioni e periodi ──────────────────────────────────────────────
create table app.seasons (
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, name),
  check (end_date > start_date)
);
create unique index seasons_one_active on app.seasons (tenant_id) where status = 'active';

create table app.season_periods (
  tenant_id  uuid not null,
  id         uuid not null default gen_random_uuid(),
  season_id  uuid not null,
  name       text not null,
  position   smallint not null,
  start_date date not null,
  end_date   date not null,
  primary key (tenant_id, id),
  unique (tenant_id, season_id, position),
  check (end_date >= start_date),
  foreign key (tenant_id, season_id) references app.seasons (tenant_id, id) on delete cascade
);

-- Le chiusure possono appartenere a una stagione (per lo storico); restano valide per data
alter table app.closures add column season_id uuid;
alter table app.closures add foreign key (tenant_id, season_id) references app.seasons (tenant_id, id) on delete set null (season_id);

-- ── Piani configurabili ─────────────────────────────────────────────
-- kind: cosa si acquista        billing: come si paga lo STESSO piano
alter table app.fee_plans drop constraint if exists fee_plans_kind_check;
alter table app.fee_plans
  add constraint fee_plans_kind_check check (kind in ('membership_fee', 'subscription', 'package', 'single_lesson', 'semi_private', 'workshop', 'stage', 'other')),
  add column season_id uuid,
  add column category text not null default '',                 -- etichetta libera: "Baby/Teen", "Adulti"…
  add column description text not null default '',
  add column billing text not null default 'one_off'
    check (billing in ('one_off', 'annual', 'monthly', 'periodic')),
  add column weekly_frequency smallint check (weekly_frequency > 0),
  add column entries smallint check (entries > 0),              -- pacchetti: numero di ingressi
  add column validity_weeks smallint check (validity_weeks > 0),-- es. mensile = 4 settimane consecutive
  add column valid_from date,
  add column valid_until date,
  add column lesson_minutes smallint[],                          -- durate ammesse (es. {60,75})
  add column booking_required boolean not null default false,
  add column booking_hours_before smallint check (booking_hours_before >= 0),  -- null = soglia della struttura
  add column age_min_months smallint check (age_min_months >= 0),
  add column age_max_months smallint,
  add column participants smallint not null default 1 check (participants > 0),      -- es. 2 = quota a coppia
  add column max_participants smallint check (max_participants > 0),                 -- es. semiprivate: fino a 3
  add column competitive_level text not null default 'none' check (competitive_level in ('none', 'pre_competitive', 'competitive')),
  add column grants_makeups boolean not null default true,
  add column position integer not null default 0,
  add foreign key (tenant_id, season_id) references app.seasons (tenant_id, id),
  add constraint fee_plans_validity check (valid_until is null or valid_from is null or valid_until >= valid_from),
  add constraint fee_plans_age check (age_max_months is null or age_min_months is null or age_max_months >= age_min_months);

-- Rateizzazione: le rate sono un modo di pagare lo stesso piano, non piani separati
create table app.plan_installments (
  tenant_id    uuid not null,
  plan_id      uuid not null,
  position     smallint not null check (position > 0),
  amount_cents integer not null check (amount_cents >= 0),
  due_on       date,
  period_id    uuid,
  covers_from  date,
  covers_until date,
  primary key (tenant_id, plan_id, position),
  foreign key (tenant_id, plan_id) references app.fee_plans (tenant_id, id) on delete cascade,
  foreign key (tenant_id, period_id) references app.season_periods (tenant_id, id) on delete set null (period_id)
);

-- ── Piano acquistato da una persona ─────────────────────────────────
create table app.member_plans (
  tenant_id        uuid not null,
  id               uuid not null default gen_random_uuid(),
  member_id        uuid not null,
  plan_id          uuid not null,
  season_id        uuid,
  period_id        uuid,
  payment_mode     text not null default 'single' check (payment_mode in ('single', 'installments')),
  status           text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  valid_from       date not null,
  valid_until      date not null,
  weekly_frequency smallint,
  entries_total    smallint,
  entries_used     smallint not null default 0,
  note             text not null default '',
  created_by       uuid,
  created_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  check (valid_until >= valid_from),
  check (entries_total is null or entries_used between 0 and entries_total),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, plan_id) references app.fee_plans (tenant_id, id),
  foreign key (tenant_id, season_id) references app.seasons (tenant_id, id),
  foreign key (tenant_id, period_id) references app.season_periods (tenant_id, id)
);
create index member_plans_member on app.member_plans (tenant_id, member_id, status);

-- Il piano dà diritto di frequenza a una o più classi
alter table app.enrollments add column member_plan_id uuid;
alter table app.enrollments add foreign key (tenant_id, member_plan_id) references app.member_plans (tenant_id, id) on delete set null (member_plan_id);

-- ── Quote dovute e pagamenti registrati (incassati fuori dall'app) ──
alter table app.member_charges
  add column member_plan_id uuid,
  add column installment_no smallint,
  add column period_label text,
  add column kind text not null default 'plan' check (kind in ('plan', 'membership_fee', 'competition_fee', 'other')),
  add column note text not null default '',
  add column created_at timestamptz not null default now(),
  add foreign key (tenant_id, member_plan_id) references app.member_plans (tenant_id, id) on delete set null (member_plan_id);
create index member_charges_due on app.member_charges (tenant_id, status, due_on);

-- Nessun incasso online: solo modalità con cui la struttura ha ricevuto il pagamento.
-- Non si memorizzano dati bancari o di carta.
alter table app.member_payments drop column if exists gateway_ref;
alter table app.member_payments drop constraint if exists member_payments_method_check;
alter table app.member_payments
  add constraint member_payments_method_check check (method in ('cash', 'bank_transfer', 'pos', 'other')),
  add column note text not null default '',
  add column recorded_at timestamptz not null default now();

-- ── Diritti di recupero ─────────────────────────────────────────────
-- Un diritto nasce da un'assenza valida a una lezione propria e scade con il piano.
create table app.makeup_credits (
  tenant_id        uuid not null,
  id               uuid not null default gen_random_uuid(),
  member_id        uuid not null,
  source_lesson_id uuid not null,
  member_plan_id   uuid,
  status           text not null default 'available' check (status in ('available', 'reserved', 'used', 'expired', 'cancelled')),
  expires_on       date not null,
  created_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, member_id, source_lesson_id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_lesson_id) references app.lessons (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_plan_id) references app.member_plans (tenant_id, id) on delete set null (member_plan_id)
);
alter table app.makeup_requests add column credit_id uuid;
alter table app.makeup_requests add foreign key (tenant_id, credit_id) references app.makeup_credits (tenant_id, id) on delete set null (credit_id);

-- ── Prenotazioni di lezioni singole / ingressi di un pacchetto ──────
create table app.lesson_bookings (
  tenant_id      uuid not null,
  id             uuid not null default gen_random_uuid(),
  lesson_id      uuid not null,
  member_id      uuid not null,
  member_plan_id uuid,                                  -- pacchetto da cui scala l'ingresso (null = lezione singola)
  charge_id      uuid,                                  -- quota generata per la lezione singola
  status         text not null default 'booked' check (status in ('booked', 'cancelled', 'late_cancelled')),
  entry_consumed boolean not null default false,
  booked_by      uuid,
  booked_at      timestamptz not null default now(),
  cancelled_at   timestamptz,
  note           text not null default '',
  primary key (tenant_id, id),
  foreign key (tenant_id, lesson_id) references app.lessons (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_plan_id) references app.member_plans (tenant_id, id),
  foreign key (tenant_id, charge_id) references app.member_charges (tenant_id, id) on delete set null (charge_id)
);
create unique index lesson_bookings_one_active on app.lesson_bookings (tenant_id, lesson_id, member_id) where status = 'booked';

-- Posti occupati in una lezione: iscritti + recuperi (richiesti o approvati) + prenotazioni attive.
-- Va chiamata dopo aver bloccato la riga della classe (select … for update) così
-- due richieste simultanee non superano la capienza.
create or replace function app.lesson_taken(p_lesson uuid) returns integer
  language sql stable
as $$
  select (select count(*) from app.enrollments e join app.lessons l on l.class_id = e.class_id
           where l.id = p_lesson and e.status = 'approved')::int
       + (select count(*) from app.makeup_requests r where r.target_lesson_id = p_lesson and r.status in ('requested', 'approved'))::int
       + (select count(*) from app.lesson_bookings b where b.lesson_id = p_lesson and b.status = 'booked')::int
$$;
grant execute on function app.lesson_taken(uuid) to oasi_api;

-- ── Eventi: pubblicazione, collegamenti e brani delle performance ───
alter table app.events
  add column is_published boolean not null default true,
  add column is_featured boolean not null default false,          -- "evento principale" in home
  add column created_by uuid,
  add column updated_at timestamptz not null default now();

create table app.event_links (                                     -- classi, discipline, insegnanti collegati
  tenant_id     uuid not null,
  event_id      uuid not null,
  kind          text not null check (kind in ('class', 'discipline', 'teacher')),
  target_id     uuid not null,
  primary key (tenant_id, event_id, kind, target_id),
  foreign key (tenant_id, event_id) references app.events (tenant_id, id) on delete cascade
);

-- Solo i nomi dei brani: nessun file audio viene caricato o riprodotto.
create table app.event_tracks (
  tenant_id   uuid not null,
  id          uuid not null default gen_random_uuid(),
  event_id    uuid not null,
  position    smallint not null default 0,
  title       text not null,
  artist      text not null default '',
  group_label text not null default '',                  -- gruppo o performance a cui è associato
  class_id    uuid,
  added_by    uuid,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, event_id) references app.events (tenant_id, id) on delete cascade,
  foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete set null (class_id)
);

do $$
declare t text;
begin
  foreach t in array array['seasons', 'season_periods', 'plan_installments', 'member_plans', 'makeup_credits', 'lesson_bookings', 'event_links', 'event_tracks'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
    execute format(
      'create policy tenant_isolation on app.%I for all using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant())', t);
    execute format('grant select, insert, update, delete on app.%I to oasi_api', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 0002 · Dati delle palestre (schema "app", non esposto dall'API REST
--        automatica di Supabase).
-- Regole:
--   * ogni tabella ha tenant_id e chiave primaria composta (tenant_id, …);
--   * ogni riferimento a un'altra tabella del tenant è una chiave esterna
--     composta che include tenant_id: il database rifiuta collegamenti
--     tra righe di palestre diverse, anche se l'API sbagliasse.
-- ════════════════════════════════════════════════════════════════════
create schema if not exists app;

-- ── Persone ─────────────────────────────────────────────────────────
create table app.members (
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  user_id       uuid,                          -- auth.users.id; null per i minori senza account
  first_name    text not null,
  last_name     text not null,
  birth_date    date,
  email         text,
  phone         text,
  avatar_path   text,
  level_id      uuid,
  main_discipline_id uuid,
  bio           text,
  goals         text[] not null default '{}',
  joined_on     date not null default current_date,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id)
);
create unique index members_one_per_user on app.members (tenant_id, user_id) where user_id is not null;

create table app.memberships (
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  user_id    uuid not null,                    -- auth.users.id
  member_id  uuid not null,
  roles      text[] not null check (roles <@ array['admin', 'teacher', 'student', 'guardian']::text[] and cardinality(roles) > 0),
  status     text not null default 'active' check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);
create index memberships_user on app.memberships (user_id);

create table app.guardianships (
  tenant_id          uuid not null,
  guardian_member_id uuid not null,
  child_member_id    uuid not null,
  permissions        text[] not null default array['view', 'enroll', 'attendance', 'consents']::text[],
  primary key (tenant_id, guardian_member_id, child_member_id),
  check (guardian_member_id <> child_member_id),
  foreign key (tenant_id, guardian_member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, child_member_id) references app.members (tenant_id, id) on delete cascade
);

create table app.member_admin (               -- dati amministrativi: visibili ad admin e all'interessato
  tenant_id                   uuid not null,
  member_id                   uuid not null,
  membership_status           text not null default 'active'
                              check (membership_status in ('active', 'expiring', 'suspended', 'trial')),
  card_number                 text,
  card_expires_on             date,
  medical_certificate_expires date,
  fee_plan_label              text,
  fee_paid_until              date,
  primary key (tenant_id, member_id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);

-- ── Configurazione didattica ────────────────────────────────────────
create table app.disciplines (
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  id                 uuid not null default gen_random_uuid(),
  slug               text not null,
  name               text not null,
  color              text not null default '#D66A9B',
  icon               text not null default 'circle',
  apparatus          text[] not null default '{}',
  has_figure_archive boolean not null default false,
  position           integer not null default 0,
  primary key (tenant_id, id),
  unique (tenant_id, slug)
);

create table app.levels (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  id        uuid not null default gen_random_uuid(),
  name      text not null,
  rank      integer not null,
  primary key (tenant_id, id),
  unique (tenant_id, rank)
);

alter table app.members
  add foreign key (tenant_id, level_id) references app.levels (tenant_id, id),
  add foreign key (tenant_id, main_discipline_id) references app.disciplines (tenant_id, id);

create table app.rooms (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  id        uuid not null default gen_random_uuid(),
  name      text not null,
  primary key (tenant_id, id),
  unique (tenant_id, name)
);

-- ── Classi, iscrizioni, lezioni ─────────────────────────────────────
create table app.classes (
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  name          text not null,
  discipline_id uuid not null,
  level_id      uuid,
  room_id       uuid,
  age_min       smallint,
  age_max       smallint,
  capacity      smallint not null check (capacity > 0),
  weekday       smallint not null check (weekday between 1 and 7),   -- 1 = lunedì
  start_time    time not null,
  end_time      time not null,
  description   text not null default '',
  is_active     boolean not null default true,
  primary key (tenant_id, id),
  check (end_time > start_time),
  check (age_max is null or age_min is null or age_max >= age_min),
  foreign key (tenant_id, discipline_id) references app.disciplines (tenant_id, id),
  foreign key (tenant_id, level_id) references app.levels (tenant_id, id),
  foreign key (tenant_id, room_id) references app.rooms (tenant_id, id)
);

create table app.class_teachers (
  tenant_id uuid not null,
  class_id  uuid not null,
  member_id uuid not null,
  primary key (tenant_id, class_id, member_id),
  foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);

create table app.enrollments (
  tenant_id       uuid not null,
  id              uuid not null default gen_random_uuid(),
  class_id        uuid not null,
  member_id       uuid not null,
  status          text not null check (status in ('requested', 'approved', 'rejected', 'withdrawn')),
  requested_by    uuid,                        -- auth.users.id (allieva o genitore)
  requested_at    timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz,
  note            text,
  primary key (tenant_id, id),
  foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);
create unique index enrollments_one_open on app.enrollments (tenant_id, class_id, member_id)
  where status in ('requested', 'approved');

create table app.lessons (
  tenant_id           uuid not null,
  id                  uuid not null default gen_random_uuid(),
  class_id            uuid not null,
  date                date not null,
  start_time          time not null,
  end_time            time not null,
  status              text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'rescheduled')),
  original_start_time time,
  original_end_time   time,
  note                text,
  primary key (tenant_id, id),
  unique (tenant_id, class_id, date),
  check (end_time > start_time),
  foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete cascade
);
create index lessons_by_date on app.lessons (tenant_id, date);

create table app.attendance (
  tenant_id   uuid not null,
  lesson_id   uuid not null,
  member_id   uuid not null,
  declared    text check (declared in ('present', 'absent')),   -- dichiarata dall'allieva / genitore
  declared_at timestamptz,
  actual      text check (actual in ('present', 'absent')),     -- registrata dall'insegnante
  recorded_by uuid,
  recorded_at timestamptz,
  primary key (tenant_id, lesson_id, member_id),
  foreign key (tenant_id, lesson_id) references app.lessons (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);

create table app.makeup_requests (
  tenant_id        uuid not null,
  id               uuid not null default gen_random_uuid(),
  member_id        uuid not null,
  missed_lesson_id uuid,
  target_lesson_id uuid not null,
  status           text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  requested_by     uuid,
  requested_at     timestamptz not null default now(),
  decided_by       uuid,
  decided_at       timestamptz,
  note             text,
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, missed_lesson_id) references app.lessons (tenant_id, id),
  foreign key (tenant_id, target_lesson_id) references app.lessons (tenant_id, id)
);

-- ── Eventi ──────────────────────────────────────────────────────────
create table app.events (
  tenant_id       uuid not null references platform.tenants(id) on delete cascade,
  id              uuid not null default gen_random_uuid(),
  type            text not null check (type in ('workshop', 'stage', 'competition', 'recital', 'show', 'exhibition', 'special', 'social')),
  title           text not null,
  description     text not null default '',
  date            date not null,
  start_time      time not null,
  end_time        time not null,
  location        text not null default '',
  image_path      text,
  capacity        integer not null check (capacity > 0),
  signup_deadline timestamptz,
  is_demo         boolean not null default false,
  primary key (tenant_id, id)
);

create table app.event_signups (
  tenant_id  uuid not null,
  event_id   uuid not null,
  member_id  uuid not null,
  status     text not null default 'confirmed' check (status in ('confirmed', 'waitlist', 'cancelled')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, event_id, member_id),
  foreign key (tenant_id, event_id) references app.events (tenant_id, id) on delete cascade,
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);

-- ── Archivio didattico e progressi ──────────────────────────────────
create table app.figures (
  tenant_id        uuid not null,
  id               uuid not null default gen_random_uuid(),
  discipline_id    uuid not null,
  apparatus        text,
  name             text not null,
  level_id         uuid,
  difficulty       smallint not null check (difficulty between 1 and 5),
  description      text not null default '',
  attention_points text[] not null default '{}',
  prerequisites    text[] not null default '{}',
  teacher_notes    text not null default '',
  cover_path       text,
  video_path       text,
  author_member_id uuid,
  created_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, discipline_id) references app.disciplines (tenant_id, id),
  foreign key (tenant_id, level_id) references app.levels (tenant_id, id),
  foreign key (tenant_id, author_member_id) references app.members (tenant_id, id) on delete set null (author_member_id)
);

create table app.figure_steps (
  tenant_id  uuid not null,
  id         uuid not null default gen_random_uuid(),
  figure_id  uuid not null,
  position   smallint not null,
  image_path text not null,
  caption    text not null default '',
  primary key (tenant_id, id),
  unique (tenant_id, figure_id, position) deferrable initially deferred,
  foreign key (tenant_id, figure_id) references app.figures (tenant_id, id) on delete cascade
);

create table app.figure_progress (
  tenant_id    uuid not null,
  member_id    uuid not null,
  figure_id    uuid not null,
  status       text not null check (status in ('to_learn', 'planned', 'achieved')),  -- Da imparare · In progetto · Riuscita
  student_note text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, member_id, figure_id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, figure_id) references app.figures (tenant_id, id) on delete cascade
);

create table app.feedback (
  tenant_id          uuid not null,
  id                 uuid not null default gen_random_uuid(),
  member_id          uuid not null,
  figure_id          uuid,
  author_member_id   uuid not null,
  body               text not null,
  visible_to_student boolean not null default true,
  created_at         timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, figure_id) references app.figures (tenant_id, id) on delete cascade,
  foreign key (tenant_id, author_member_id) references app.members (tenant_id, id)
);

-- ── Comunicazioni e notifiche ───────────────────────────────────────
create table app.announcements (
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  title        text not null,
  body         text not null,
  priority     text not null default 'normal' check (priority in ('normal', 'important')),
  audience     text not null default 'all' check (audience in ('all', 'students', 'teachers', 'guardians')),
  published_at timestamptz not null default now(),
  is_demo      boolean not null default false,
  primary key (tenant_id, id)
);

create table app.notifications (
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  category   text not null check (category in ('lessons', 'schedule_changes', 'attendance', 'makeups', 'events', 'workshops', 'teaching', 'admin')),
  title      text not null,
  body       text not null,
  audience   jsonb not null,                   -- { roles: [...], classIds: [...], memberIds: [...] }
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table app.notification_deliveries (
  tenant_id       uuid not null,
  notification_id uuid not null,
  user_id         uuid not null,
  channel         text not null check (channel in ('in_app', 'push', 'web_push', 'email')),
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'read')),
  read_at         timestamptz,
  primary key (tenant_id, notification_id, user_id, channel),
  foreign key (tenant_id, notification_id) references app.notifications (tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references app.memberships (tenant_id, user_id) on delete cascade
);

create table app.device_tokens (
  tenant_id     uuid not null,
  user_id       uuid not null,
  native_app_id uuid references platform.native_apps(id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android', 'web')),
  token         text not null,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, token),
  foreign key (tenant_id, user_id) references app.memberships (tenant_id, user_id) on delete cascade
);

-- ── Pagamenti delle allieve (separati dall'abbonamento SaaS) ────────
create table app.fee_plans (
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  name         text not null,
  kind         text not null check (kind in ('membership_fee', 'subscription', 'package', 'workshop', 'stage', 'other')),
  amount_cents integer not null check (amount_cents >= 0),
  is_active    boolean not null default true,
  primary key (tenant_id, id)
);

create table app.member_charges (
  tenant_id    uuid not null,
  id           uuid not null default gen_random_uuid(),
  member_id    uuid not null,
  fee_plan_id  uuid,
  description  text not null,
  amount_cents integer not null check (amount_cents >= 0),
  due_on       date not null,
  status       text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, fee_plan_id) references app.fee_plans (tenant_id, id)
);

create table app.member_payments (
  tenant_id    uuid not null,
  id           uuid not null default gen_random_uuid(),
  charge_id    uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on      date not null,
  method       text not null check (method in ('cash', 'bank_transfer', 'card', 'online', 'other')),
  gateway_ref  text,
  recorded_by  uuid,
  primary key (tenant_id, id),
  foreign key (tenant_id, charge_id) references app.member_charges (tenant_id, id) on delete cascade
);

-- ── Privacy, file, impostazioni ─────────────────────────────────────
create table app.consents (
  tenant_id      uuid not null,
  id             uuid not null default gen_random_uuid(),
  member_id      uuid not null,
  kind           text not null check (kind in ('privacy', 'images', 'videos', 'marketing', 'medical_data')),
  granted        boolean not null,
  given_by_user  uuid,                         -- l'interessato o il genitore
  policy_version text not null,
  at             timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, member_id) references app.members (tenant_id, id) on delete cascade
);
create index consents_latest on app.consents (tenant_id, member_id, kind, at desc);

create table app.media_objects (
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  path             text not null,
  content_type     text not null,
  bytes            bigint not null check (bytes >= 0),
  owner_member_id  uuid,
  subject_member_ids uuid[] not null default '{}',   -- persone ritratte (per i consensi)
  created_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, path),
  check (path like 'tenants/' || tenant_id::text || '/%')
);

create table app.tenant_settings (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  settings  jsonb not null default '{}'::jsonb
);

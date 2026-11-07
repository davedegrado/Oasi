-- ════════════════════════════════════════════════════════════════════
-- 0001 · Schema piattaforma: tenant, domini, branding, moduli, piani,
--        abbonamenti SaaS, staff, accessi di assistenza, app native, audit.
-- Queste tabelle NON appartengono a un tenant: le gestisce lo staff
-- della piattaforma tramite l'API (che verifica i permessi).
-- ════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;
create schema if not exists platform;

create table platform.tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name       text not null,
  display_name     text not null,
  status           text not null default 'trial'
                   check (status in ('trial', 'active', 'suspended', 'archived', 'deleting')),
  is_demo          boolean not null default false,
  data_region      text not null default 'eu',
  dedicated_db_ref text,                       -- null = database condiviso
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table platform.domains (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  hostname            text not null check (hostname = lower(hostname)),
  kind                text not null check (kind in ('platform_subdomain', 'custom')),
  is_primary          boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'failed')),
  ssl_status          text not null default 'pending' check (ssl_status in ('pending', 'active', 'failed')),
  redirect_to         text,
  created_at          timestamptz not null default now(),
  constraint domains_hostname_unique unique (hostname)          -- un dominio, un solo tenant
);
create unique index domains_one_primary on platform.domains (tenant_id) where is_primary;

create table platform.branding (
  tenant_id     uuid primary key references platform.tenants(id) on delete cascade,
  app_name      text not null,
  short_name    text not null check (char_length(short_name) <= 12),
  logo_path     text,
  icon_path     text,
  favicon_path  text,
  cover_path    text,
  colors        jsonb not null default '{}'::jsonb,   -- { primary, primarySoft, primaryStrong, background, ink, ... }
  fonts         jsonb not null default '{}'::jsonb,   -- { heading, body }
  texts         jsonb not null default '{}'::jsonb,   -- testi personalizzati per chiave
  contacts      jsonb not null default '{}'::jsonb,   -- { email, phone, address, website, legalForm, affiliation }
  updated_at    timestamptz not null default now()
);

create table platform.modules (
  key         text primary key check (key ~ '^[a-z_]+$'),
  name        text not null,
  description text not null default '',
  is_core     boolean not null default false           -- sempre attivo (es. utenti)
);

create table platform.plans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  price_month_cents integer check (price_month_cents >= 0),
  price_year_cents  integer check (price_year_cents >= 0),
  limits            jsonb not null default '{}'::jsonb,  -- { maxMembers, storageGb, videoMinutes, ... }
  is_active         boolean not null default true
);

create table platform.plan_modules (
  plan_id    uuid not null references platform.plans(id) on delete cascade,
  module_key text not null references platform.modules(key),
  primary key (plan_id, module_key)
);

create table platform.tenant_modules (
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  module_key text not null references platform.modules(key),
  enabled    boolean not null,
  limits     jsonb,
  source     text not null default 'plan' check (source in ('plan', 'override')),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

create table platform.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  plan_id            uuid not null references platform.plans(id),
  billing_cycle      text not null check (billing_cycle in ('monthly', 'yearly')),
  status             text not null check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'free')),
  trial_ends_on      date,
  current_period_end date,
  external_ref       text,                      -- es. id Stripe
  created_at         timestamptz not null default now()
);
create unique index subscriptions_one_open on platform.subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due', 'free');

create table platform.saas_invoices (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references platform.subscriptions(id),
  amount_cents    integer not null check (amount_cents >= 0),
  currency        text not null default 'EUR',
  status          text not null check (status in ('draft', 'issued', 'paid', 'void')),
  issued_on       date,
  paid_on         date,
  external_ref    text
);

create table platform.staff (
  user_id     uuid primary key,                -- auth.users.id
  role        text not null check (role in ('owner', 'collaborator')),
  permissions text[] not null default '{}',    -- es. {tenants.read, tenants.write, support, domains}
  created_at  timestamptz not null default now()
);

create table platform.support_grants (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  staff_user_id uuid not null references platform.staff(user_id),
  reason        text not null check (char_length(reason) >= 10),
  approved_by   uuid,                          -- utente admin della palestra
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  check (expires_at > starts_at)
);

create table platform.native_apps (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  platform            text not null check (platform in ('ios', 'android')),
  bundle_id           text not null unique,
  store_account_owner text,
  firebase_project_id text,
  version             text,
  build_number        integer not null default 0,
  status              text not null default 'draft'
                      check (status in ('draft', 'building', 'in_testing', 'in_review', 'published', 'rejected', 'retired')),
  updated_at          timestamptz not null default now()
);

create table platform.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor_user uuid,
  tenant_id  uuid,
  action     text not null,
  target     text,
  details    jsonb not null default '{}'::jsonb
);
create index audit_log_tenant_at on platform.audit_log (tenant_id, at desc);

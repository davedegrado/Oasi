-- ════════════════════════════════════════════════════════════════════
-- 0017 · Piani scelti dall'atleta, nessuna gestione dei soldi
--
-- - Il piano lo sceglie l'atleta quando chiede l'iscrizione a una classe
--   (enrollments.plan_id); diventa un piano sottoscritto quando l'iscrizione
--   viene accettata (member_plans.class_id).
-- - Un piano ha: prezzo di listino (solo informativo), numero di lezioni
--   (entries, vuoto = senza limite), frequenza settimanale, validità in mesi
--   dalla sottoscrizione oppure un periodo preciso, partecipazione automatica.
-- - Senza partecipazione automatica l'atleta dice "ci sarò" a ogni lezione:
--   è una prenotazione (lesson_bookings) sul proprio piano.
-- - Tolti quote, rate, pagamenti, stagioni e periodi: l'app non calcola né
--   registra denaro. I dati di quelle tabelle vengono ELIMINATI.
-- ════════════════════════════════════════════════════════════════════

-- ── Piani: validità e partecipazione ─────────────────────────────────
alter table app.fee_plans
  add column validity_mode text not null default 'months' check (validity_mode in ('months', 'period')),
  add column validity_months smallint check (validity_months > 0),
  add column auto_attendance boolean not null default true;

update app.fee_plans set
  validity_mode = case when valid_from is not null and valid_until is not null then 'period' else 'months' end,
  validity_months = case when valid_from is not null and valid_until is not null then null
                         else greatest(1, ceil(coalesce(validity_weeks, 4) / 4.0))::smallint end,
  auto_attendance = not (booking_required or kind in ('package', 'single_lesson', 'semi_private'));

-- La tessera associativa non è un piano per frequentare le classi
update app.fee_plans set is_active = false where kind = 'membership_fee';

alter table app.fee_plans
  add constraint fee_plans_validity_rule check (
    (validity_mode = 'months' and validity_months is not null)
    or (validity_mode = 'period' and valid_from is not null and valid_until is not null));

-- ── Piano sottoscritto per una classe; piano richiesto con l'iscrizione ──
alter table app.member_plans add column class_id uuid;
alter table app.member_plans add foreign key (tenant_id, class_id) references app.classes (tenant_id, id) on delete set null (class_id);
create index member_plans_class on app.member_plans (tenant_id, member_id, class_id, valid_until);

alter table app.enrollments add column plan_id uuid;
alter table app.enrollments add foreign key (tenant_id, plan_id) references app.fee_plans (tenant_id, id) on delete set null (plan_id);

-- ── Via quote, rate, pagamenti, stagioni ─────────────────────────────
alter table app.lesson_bookings drop column charge_id;
drop table app.member_payments;
drop table app.member_charges;
drop table app.plan_installments;
alter table app.member_plans drop column season_id, drop column period_id, drop column payment_mode;
alter table app.fee_plans drop column season_id, drop column billing, drop column validity_weeks, drop column booking_required;
alter table app.closures drop column season_id;
drop table app.season_periods;
drop table app.seasons;

-- ── Accesso di un iscritto a una lezione secondo il piano che copre quella data ──
--    'auto': partecipazione automatica · 'confirm': serve "ci sarò" · 'none': nessun piano valido
create or replace function app.plan_access(p_member uuid, p_class uuid, p_date date) returns text
  language sql stable
as $$
  select coalesce((
    select case when p.auto_attendance then 'auto' else 'confirm' end
    from app.member_plans mp join app.fee_plans p on p.id = mp.plan_id
    where mp.member_id = p_member and (mp.class_id is null or mp.class_id = p_class) and mp.status <> 'cancelled'
      and p_date between mp.valid_from and mp.valid_until
    order by mp.created_at desc, mp.valid_until desc limit 1), 'none')
$$;
grant execute on function app.plan_access(uuid, uuid, date) to oasi_api;

-- ── Posti occupati: iscritti con partecipazione automatica valida quel giorno,
--    prenotazioni ("ci sarò") e recuperi ──
create or replace function app.lesson_taken(p_lesson uuid) returns integer
  language sql stable
as $$
  select (select count(*) from app.enrollments e join app.lessons l on l.class_id = e.class_id
           where l.id = p_lesson and e.status = 'approved' and app.plan_access(e.member_id, e.class_id, l.date) = 'auto')::int
       + (select count(*) from app.makeup_requests r where r.target_lesson_id = p_lesson and r.status in ('requested', 'approved'))::int
       + (select count(*) from app.lesson_bookings b where b.lesson_id = p_lesson and b.status = 'booked')::int
$$;

-- ── Impostazioni: niente metodi di pagamento; la scadenza dei documenti la decide la tipologia ──
create or replace function app.default_settings() returns jsonb
  language sql immutable
as $$ select '{
  "timezone": "Europe/Rome",
  "booking": { "opensHoursBefore": null, "closesHoursBefore": 0, "cancelHoursBefore": 0, "lateCancelConsumesEntry": true, "noShowConsumesEntry": true },
  "packages": { "consumeOn": "attendance" },
  "makeups": { "creditOn": "declared_in_time", "allowLowerLevel": true, "sameDisciplineOnly": false, "maxPerPlan": null,
               "requestOpensDaysBefore": null, "requestClosesDaysBefore": 0 },
  "competitive": { "certificateRequiredFor": ["competitive", "pre_competitive"], "blockEnrollmentWithoutCertificate": true },
  "documents": { "replacedRetentionDays": null, "expiryReminderDays": 30, "requestReminderDays": 3 },
  "classes": { "categories": [], "maxDisciplines": null }
}'::jsonb $$;

update app.tenant_settings set settings = settings - 'payments' #- '{documents,expiryRequired}' #- '{competitive,competitionFeeRangeCents}';

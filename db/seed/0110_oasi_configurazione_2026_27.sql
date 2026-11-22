-- ════════════════════════════════════════════════════════════════════
-- Configurazione iniziale del tenant Oasi Metropolitana · 2026/2027
--
-- Sono DATI di questa struttura, non regole della piattaforma: ogni valore
-- è modificabile dall'amministrazione (Gestione → Piani e listino,
-- Impostazioni). Scritto a mano (non generato). Si applica al tenant con
-- slug 'oasi-metropolitana': in produzione va eseguito dopo l'onboarding.
--
-- Piani: li sceglie l'atleta quando chiede l'iscrizione a una classe. Il
-- prezzo è solo informativo (listino): l'app non calcola né registra
-- pagamenti. Validità in mesi dalla sottoscrizione oppure periodo preciso;
-- senza partecipazione automatica l'atleta dice "ci sarò" a ogni lezione.
--
-- Punti da confermare con la struttura (NON corretti qui):
--  1. Lezione singola e pacchetto 5 lezioni: validità di un mese e di tre
--     mesi dalla sottoscrizione (prima valevano per tutta la stagione).
--  2. Circo Baby: un piano per ciascuno dei due periodi (15/09–24/01 e
--     25/01–30/05).
--  3. Periodico Adulti/Teen: un piano per il periodo in corso (9/11–24/01);
--     gli altri periodi si aggiungono dal listino.
--  4. Il pacchetto 5 lezioni copre lezioni da 60 o 75 minuti.
--  5. I due documenti mensili degli insegnanti non sono nominati nel prompt:
--     una tipologia ne chiede due al mese e l'insegnante li intitola liberamente.
--  6. Aree dei piani: Baby/Teen, Circo Baby e Preagonismo Baby → classi
--     Bambini/Ragazzi; Adulti/Teen e semiprivate → Adulti/Ragazzi;
--     Genitori & Figli e Agonismo Teen per tutte le classi.
-- ════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  t uuid;
  r record;
begin
  select id into t from platform.tenants where slug = 'oasi-metropolitana';
  if t is null then raise notice 'Tenant oasi-metropolitana assente: nessuna configurazione applicata'; return; end if;
  perform set_config('app.tenant_id', t::text, true);

  -- ── Impostazioni: fuso orario e soglie richieste da Oasi (modificabili) ──
  insert into app.tenant_settings (tenant_id, settings) values (t, '{}'::jsonb) on conflict do nothing;
  update app.tenant_settings set settings = app.jsonb_deep_merge(settings, '{
    "timezone": "Europe/Rome",
    "booking": { "opensHoursBefore": 48, "closesHoursBefore": 0, "cancelHoursBefore": 6 },
    "makeups": { "requestOpensDaysBefore": null, "requestClosesDaysBefore": 0 },
    "packages": { "consumeOn": "attendance" },
    "classes": { "categories": ["Bambini/Ragazzi", "Adulti/Ragazzi"], "maxDisciplines": 2 }
  }'::jsonb) where tenant_id = t;

  -- ── Chiusure generali: non generano lezioni, presenze o recuperi ──
  insert into app.closures (tenant_id, kind, title, start_date, end_date) values
    (t, 'holiday', 'Chiusura 2 novembre', '2026-11-02', '2026-11-02'),
    (t, 'holiday', 'Immacolata', '2026-12-08', '2026-12-08'),
    (t, 'holiday', 'Festività natalizie', '2026-12-23', '2027-01-06'),
    (t, 'holiday', 'Chiusura di primavera', '2027-03-24', '2027-03-30');
  update app.lessons l set status = 'cancelled', closure_id = x.id, note = x.title
  from app.closures x
  where l.tenant_id = t and x.tenant_id = t and l.date between x.start_date and x.end_date and l.status <> 'cancelled';

  -- ── Baby/Teen: annuale, 1–3 volte a settimana ──
  for r in select * from (values (1, 34000), (2, 60000), (3, 90000)) as v(freq, annual)
  loop
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, weekly_frequency, validity_mode, valid_from, valid_until, auto_attendance, position, class_categories)
    values (t, 'Baby/Teen · ' || r.freq || case when r.freq = 1 then ' volta' else ' volte' end || ' a settimana', 'subscription', r.annual, 'Baby/Teen', r.freq,
            'period', '2026-09-15', '2027-05-30', true, 100 + r.freq, '{Bambini/Ragazzi}');
  end loop;

  -- ── Circo Baby (12–36 mesi): 8 lezioni per periodo, con "ci sarò" almeno 24 ore prima ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, entries, validity_mode, valid_from, valid_until, auto_attendance,
                             booking_closes_hours_before, age_min_months, age_max_months, grants_makeups, position, class_categories) values
    (t, 'Circo Baby · 8 lezioni (1° periodo)', 'package', 8000, 'Circo Baby', 8, 'period', '2026-09-15', '2027-01-24', false, 24, 12, 36, false, 201, '{Bambini/Ragazzi}'),
    (t, 'Circo Baby · 8 lezioni (2° periodo)', 'package', 8000, 'Circo Baby', 8, 'period', '2027-01-25', '2027-05-30', false, 24, 12, 36, false, 202, '{Bambini/Ragazzi}');

  -- ── Genitori & Figli: prezzo a coppia ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, weekly_frequency, validity_mode, valid_from, valid_until, auto_attendance, participants, description, position)
  values (t, 'Genitori & Figli (a coppia)', 'subscription', 55000, 'Genitori & Figli', 1, 'period', '2026-09-15', '2027-05-30', true, 2, 'Prezzo a coppia', 210);

  -- ── Adulti/Teen: mensile, periodico (periodo in corso), annuale ──
  for r in select * from (values
      (1, 5500, 9500, 34000), (2, 9500, 16500, 60000), (3, 13500, 23500, 90000), (4, 18000, 31000, 116000)
    ) as v(freq, monthly, periodic, annual)
  loop
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, weekly_frequency, validity_mode, validity_months, valid_from, valid_until, auto_attendance, position, class_categories) values
      (t, 'Adulti/Teen · ' || r.freq || 'x · mensile', 'subscription', r.monthly, 'Adulti/Teen', r.freq, 'months', 1, null, null, true, 300 + r.freq * 10 + 1, '{Adulti/Ragazzi}'),
      (t, 'Adulti/Teen · ' || r.freq || 'x · periodico (9 nov – 24 gen)', 'subscription', r.periodic, 'Adulti/Teen', r.freq, 'period', null, '2026-11-09', '2027-01-24', true, 300 + r.freq * 10 + 2, '{Adulti/Ragazzi}'),
      (t, 'Adulti/Teen · ' || r.freq || 'x · annuale', 'subscription', r.annual, 'Adulti/Teen', r.freq, 'period', null, '2026-09-15', '2027-05-30', true, 300 + r.freq * 10 + 3, '{Adulti/Ragazzi}');
  end loop;

  -- ── Lezione singola e pacchetto 5 lezioni: "ci sarò" a partire da 48 ore prima ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, entries, validity_mode, validity_months, auto_attendance, grants_makeups, position) values
    (t, 'Lezione singola', 'single_lesson', 1500, 'Lezioni singole', 1, 'months', 1, false, false, 401);
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, entries, validity_mode, validity_months, lesson_minutes, booking_opens_hours_before, auto_attendance, grants_makeups, position) values
    (t, 'Pacchetto 5 lezioni', 'package', 7000, 'Lezioni singole', 5, 'months', 3, '{60,75}', 48, false, false, 402);

  -- ── Preagonismo e agonismo: certificato agonistico secondo classificazione ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, validity_mode, valid_from, valid_until, auto_attendance, competitive_level, position, class_categories) values
    (t, 'Preagonismo Baby', 'subscription', 74000, 'Agonismo', 'period', '2026-09-15', '2027-05-30', true, 'pre_competitive', 501, '{Bambini/Ragazzi}'),
    (t, 'Agonismo Teen', 'subscription', 90000, 'Agonismo', 'period', '2026-09-15', '2027-05-30', true, 'competitive', 502, '{}');

  -- ── Adulti semiprivate: a lezione, fino a 3 partecipanti ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, category, entries, validity_mode, validity_months, auto_attendance, max_participants, grants_makeups, description, position, class_categories) values
    (t, 'Adulti semiprivata (a lezione)', 'semi_private', 3000, 'Semiprivate', 1, 'months', 1, false, 3, false, 'Da dividere tra massimo 3 partecipanti', 601, '{Adulti/Ragazzi}');

  -- ── Dati dimostrativi: ogni iscrizione già approvata ha un piano annuale valido oggi
  --    (Adulti/Teen o Baby/Teen secondo l'area della classe), così le lezioni restano disponibili ──
  insert into app.member_plans (tenant_id, member_id, plan_id, class_id, valid_from, valid_until, weekly_frequency)
  select t, e.member_id, p.id, e.class_id, current_date - 120, current_date + 240, p.weekly_frequency
  from app.enrollments e join app.classes cl on cl.id = e.class_id
  join app.fee_plans p on p.tenant_id = t and p.name = case when cl.category = 'Bambini/Ragazzi' then 'Baby/Teen · 1 volta a settimana' else 'Adulti/Teen · 1x · annuale' end
  where e.tenant_id = t and e.status = 'approved'
    and not exists (select 1 from app.member_plans x where x.member_id = e.member_id and x.class_id = e.class_id);
  update app.enrollments e set member_plan_id = mp.id from app.member_plans mp
  where e.tenant_id = t and mp.member_id = e.member_id and mp.class_id = e.class_id and e.status = 'approved';

  -- ── Documenti: per Oasi ogni tipologia chiede la data di scadenza ──
  update app.document_types set expiry_required = true where tenant_id = t;

  -- ── Certificato agonistico: richiesto solo a chi è agonista o in una classe agonistica/preagonistica ──
  insert into app.document_types (tenant_id, name, category, description, is_required, signature_mode, validity_months, is_sensitive, audience, required_for_competitive, expiry_required)
  values (t, 'Certificato medico agonistico', 'medical', 'Certificato di idoneità all’attività sportiva agonistica. Richiesto agli agonisti e agli iscritti a classi agonistiche o preagonistiche.',
          false, 'none', 12, true, 'students', true, true)
  on conflict (tenant_id, name) do nothing;

  -- ── Insegnanti: due documenti amministrativi ogni mese, entro l'ultimo giorno del mese ──
  -- Il prompt non dice quali documenti siano: una sola tipologia che ne chiede due al mese,
  -- e l'insegnante dà a ciascuno il titolo che vuole (con la scadenza, se serve).
  insert into app.document_types (tenant_id, name, category, description, is_required, signature_mode, is_sensitive, audience, recurrence, required_count, expiry_required)
  values (t, 'Documenti mensili insegnanti', 'other', 'Due documenti da caricare ogni mese, entro la fine del mese, per pagamenti e adempimenti. Indica tu il titolo di ciascuno.',
          true, 'none', false, 'teachers', 'monthly', 2, true)
  on conflict (tenant_id, name) do nothing;

  -- ── Classi esistenti: categoria (dati dimostrativi: sono tutte classi per adulti) ──
  update app.classes set category = 'Adulti/Ragazzi' where tenant_id = t and category is null;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════
-- Identità visiva di Oasi Metropolitana: bianco, nero, verde salvia e oro.
-- È la palette richiesta da QUESTO tenant e vale solo come sua configurazione
-- iniziale (modificabile dal pannello): non è il tema della piattaforma né
-- quello delle altre strutture.
-- ════════════════════════════════════════════════════════════════════
begin;
update platform.branding b set colors = '{
    "primary": "#667C5F", "primaryMid": "#A9B8A0", "primarySoft": "#E6ECE1", "primaryStrong": "#4E6048",
    "background": "#FFFFFF", "ink": "#111111", "themeColor": "#FFFFFF", "accent": "#B8963E"
  }'::jsonb, updated_at = now()
from platform.tenants t where t.id = b.tenant_id and t.slug = 'oasi-metropolitana';
-- Colori delle discipline (dati del tenant) coerenti con la palette
update app.disciplines d set color = case d.slug when 'cerchio' then '#667C5F' when 'tessuti' then '#B8963E' else d.color end
from platform.tenants t where t.id = d.tenant_id and t.slug = 'oasi-metropolitana' and d.slug in ('cerchio', 'tessuti');
commit;

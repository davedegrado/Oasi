-- ════════════════════════════════════════════════════════════════════
-- Configurazione iniziale del tenant Oasi Metropolitana · stagione 2026/2027
--
-- Sono DATI di questa struttura, non regole della piattaforma: ogni valore
-- è modificabile dall'amministrazione (Gestione → Stagioni, Piani,
-- Impostazioni) e resta nello storico quando si passa alla stagione dopo.
-- Scritto a mano (non generato). Si applica al tenant con slug
-- 'oasi-metropolitana': in produzione va eseguito dopo l'onboarding.
--
-- Prima dell'attivazione: GET /v1/seasons/{id}/check elenca le incongruenze.
-- Punti da confermare con la struttura (NON corretti qui):
--  1. Lezione singola e pacchetto 5 lezioni valgono dal 14/09/2026, ma la
--     stagione e i periodi iniziano il 15/09/2026.
--  2. Le date delle due rate sono indicate solo per Baby/Teen 1 frequenza:
--     qui sono usate anche per 2 e 3 frequenze e per Genitori & Figli.
--  3. "Circo Baby: validi in uno dei due periodi stagionali": i due periodi
--     sono intesi come quelli delle due rate (15/09–24/01 e 25/01–30/05).
--  4. Il pacchetto 5 lezioni copre lezioni da 60 o 75 minuti.
--  5. "Lezioni singole prenotabili a partire da 48 ore prima": la finestra di
--     48 ore è applicata alla lezione singola e al pacchetto 5 lezioni; Circo
--     Baby ha solo il termine "almeno 24 ore prima".
--  6. I due documenti mensili degli insegnanti non sono nominati nel prompt:
--     una tipologia ne chiede due al mese e l'insegnante li intitola liberamente.
--  7. Categorie di piano: Baby/Teen, Circo Baby e Preagonismo Baby → classi
--     Bambini/Ragazzi; Adulti/Teen → Adulti/Ragazzi; Genitori & Figli e
--     Agonismo Teen senza vincolo di categoria.
-- ════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  t uuid;
  s uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  plan uuid;
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
    "competitive": { "competitionFeeRangeCents": [5000, 15000] },
    "classes": { "categories": ["Bambini/Ragazzi", "Adulti/Ragazzi"], "maxDisciplines": 2 },
    "payments": { "methods": ["bank_transfer", "cash"] }
  }'::jsonb) where tenant_id = t;

  -- ── Stagione e periodi ──
  insert into app.seasons (tenant_id, name, start_date, end_date, status)
  values (t, '2026/2027', '2026-09-15', '2027-05-30', 'active') returning id into s;
  insert into app.season_periods (tenant_id, season_id, name, position, start_date, end_date) values
    (t, s, 'Periodico 1', 1, '2026-09-15', '2026-11-08') returning id into p1;
  insert into app.season_periods (tenant_id, season_id, name, position, start_date, end_date) values
    (t, s, 'Periodico 2', 2, '2026-11-09', '2027-01-24') returning id into p2;
  insert into app.season_periods (tenant_id, season_id, name, position, start_date, end_date) values
    (t, s, 'Periodico 3', 3, '2027-01-25', '2027-04-04') returning id into p3;
  insert into app.season_periods (tenant_id, season_id, name, position, start_date, end_date) values
    (t, s, 'Periodico 4', 4, '2027-04-05', '2027-05-30') returning id into p4;

  -- ── Chiusure generali: non generano lezioni, presenze o recuperi ──
  insert into app.closures (tenant_id, kind, title, start_date, end_date, season_id) values
    (t, 'holiday', 'Chiusura 2 novembre', '2026-11-02', '2026-11-02', s),
    (t, 'holiday', 'Immacolata', '2026-12-08', '2026-12-08', s),
    (t, 'holiday', 'Festività natalizie', '2026-12-23', '2027-01-06', s),
    (t, 'holiday', 'Chiusura di primavera', '2027-03-24', '2027-03-30', s);
  update app.lessons l set status = 'cancelled', closure_id = x.id, note = x.title
  from app.closures x
  where l.tenant_id = t and x.tenant_id = t and l.date between x.start_date and x.end_date and l.status <> 'cancelled';

  -- ── Baby/Teen: annuale oppure 2 rate (le rate sono un modo di pagare lo stesso piano) ──
  for r in select * from (values
      (1, 34000, 19000), (2, 60000, 33000), (3, 90000, 47000)
    ) as v(freq, annual, installment)
  loop
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, weekly_frequency, position, class_categories)
    values (t, 'Baby/Teen · ' || r.freq || case when r.freq = 1 then ' frequenza' else ' frequenze' end, 'subscription', r.annual, s, 'Baby/Teen', 'annual', r.freq, 100 + r.freq, '{Bambini/Ragazzi}')
    returning id into plan;
    insert into app.plan_installments (tenant_id, plan_id, position, amount_cents, due_on, covers_from, covers_until) values
      (t, plan, 1, r.installment, '2026-09-15', '2026-09-15', '2027-01-24'),
      (t, plan, 2, r.installment, '2027-01-25', '2027-01-25', '2027-05-30');
  end loop;

  -- ── Circo Baby (12–36 mesi): pacchetto configurabile, non una funzione dedicata ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, entries, valid_from, valid_until,
                             booking_required, booking_closes_hours_before, age_min_months, age_max_months, grants_makeups, position, class_categories) values
    (t, 'Circo Baby · 8 ingressi (1° periodo)', 'package', 8000, s, 'Pacchetti', 'one_off', 8, '2026-09-15', '2027-01-24', true, 24, 12, 36, false, 201, '{Bambini/Ragazzi}'),
    (t, 'Circo Baby · 8 ingressi (2° periodo)', 'package', 8000, s, 'Pacchetti', 'one_off', 8, '2027-01-25', '2027-05-30', true, 24, 12, 36, false, 202, '{Bambini/Ragazzi}');

  -- ── Genitori & Figli: quota a coppia ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, participants, position)
  values (t, 'Genitori & Figli (a coppia)', 'subscription', 55000, s, 'Genitori & Figli', 'annual', 2, 210) returning id into plan;
  insert into app.plan_installments (tenant_id, plan_id, position, amount_cents, due_on, covers_from, covers_until) values
    (t, plan, 1, 30000, '2026-09-15', '2026-09-15', '2027-01-24'),
    (t, plan, 2, 30000, '2027-01-25', '2027-01-25', '2027-05-30');

  -- ── Adulti/Teen: mensile (4 settimane consecutive), periodico, annuale ──
  for r in select * from (values
      (1, 5500, 9500, 34000), (2, 9500, 16500, 60000), (3, 13500, 23500, 90000), (4, 18000, 31000, 116000)
    ) as v(freq, monthly, periodic, annual)
  loop
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, weekly_frequency, validity_weeks, position, class_categories) values
      (t, 'Adulti/Teen · ' || r.freq || 'x · mensile', 'subscription', r.monthly, s, 'Adulti/Teen', 'monthly', r.freq, 4, 300 + r.freq * 10 + 1, '{Adulti/Ragazzi}');
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, weekly_frequency, position, class_categories) values
      (t, 'Adulti/Teen · ' || r.freq || 'x · periodico', 'subscription', r.periodic, s, 'Adulti/Teen', 'periodic', r.freq, 300 + r.freq * 10 + 2, '{Adulti/Ragazzi}'),
      (t, 'Adulti/Teen · ' || r.freq || 'x · annuale', 'subscription', r.annual, s, 'Adulti/Teen', 'annual', r.freq, 300 + r.freq * 10 + 3, '{Adulti/Ragazzi}');
  end loop;

  -- ── Lezione singola e pacchetto 5 lezioni ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, valid_from, valid_until, booking_required, grants_makeups, position) values
    (t, 'Lezione singola', 'single_lesson', 1500, s, 'Lezioni singole', 'one_off', '2026-09-14', '2027-05-30', true, false, 401);
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, entries, valid_from, valid_until, lesson_minutes, booking_required, booking_opens_hours_before, grants_makeups, position) values
    (t, 'Pacchetto 5 lezioni', 'package', 7000, s, 'Lezioni singole', 'one_off', 5, '2026-09-14', '2027-05-30', '{60,75}', true, 48, false, 402);

  -- ── Preagonismo e agonismo: 4 rate, una per periodo; certificato agonistico secondo classificazione ──
  for r in select * from (values
      ('Preagonismo Baby', 74000, 18500, 'pre_competitive', 501), ('Agonismo Teen', 90000, 22500, 'competitive', 502)
    ) as v(name, annual, installment, level, pos)
  loop
    insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, competitive_level, position, class_categories)
    values (t, r.name, 'subscription', r.annual, s, 'Agonismo', 'annual', r.level, r.pos,
            case when r.level = 'pre_competitive' then '{Bambini/Ragazzi}'::text[] else '{}'::text[] end) returning id into plan;
    insert into app.plan_installments (tenant_id, plan_id, position, amount_cents, due_on, period_id, covers_from, covers_until) values
      (t, plan, 1, r.installment, '2026-09-15', p1, '2026-09-15', '2026-11-08'),
      (t, plan, 2, r.installment, '2026-11-09', p2, '2026-11-09', '2027-01-24'),
      (t, plan, 3, r.installment, '2027-01-25', p3, '2027-01-25', '2027-04-04'),
      (t, plan, 4, r.installment, '2027-04-05', p4, '2027-04-05', '2027-05-30');
  end loop;

  -- ── Adulti semiprivate: quota per lezione da dividere tra i partecipanti (massimo 3) ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, max_participants, grants_makeups, position) values
    (t, 'Adulti semiprivata (a lezione)', 'semi_private', 3000, s, 'Semiprivate', 'one_off', 3, false, 601);

  -- ── Tessera associativa: separata da rette e pacchetti; importo per età ──
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, age_max_months, grants_makeups, position) values
    (t, 'Tessera associativa · fino a 15 anni', 'membership_fee', 2200, s, 'Tessera', 'annual', 191, false, 701);
  insert into app.fee_plans (tenant_id, name, kind, amount_cents, season_id, category, billing, age_min_months, grants_makeups, position) values
    (t, 'Tessera associativa · dai 16 anni', 'membership_fee', 2700, s, 'Tessera', 'annual', 192, false, 702);

  -- ── Certificato agonistico: richiesto solo a chi è agonista o in una classe agonistica/preagonistica ──
  insert into app.document_types (tenant_id, name, category, description, is_required, signature_mode, validity_months, is_sensitive, audience, required_for_competitive, expiry_required)
  values (t, 'Certificato medico agonistico', 'medical', 'Certificato di idoneità all’attività sportiva agonistica. Richiesto agli agonisti e agli iscritti a classi agonistiche o preagonistiche.',
          false, 'none', 12, true, 'students', true, true)
  on conflict (tenant_id, name) do nothing;

  -- ── Insegnanti: due documenti amministrativi ogni mese, entro l'ultimo giorno del mese ──
  -- Il prompt non dice quali documenti siano: una sola tipologia che ne chiede due al mese,
  -- e l'insegnante dà a ciascuno il titolo che vuole (con la scadenza, se serve).
  insert into app.document_types (tenant_id, name, category, description, is_required, signature_mode, is_sensitive, audience, recurrence, required_count)
  values (t, 'Documenti mensili insegnanti', 'other', 'Due documenti da caricare ogni mese, entro la fine del mese, per pagamenti e adempimenti. Indica tu il titolo di ciascuno.',
          true, 'none', false, 'teachers', 'monthly', 2)
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

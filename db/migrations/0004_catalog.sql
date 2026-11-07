-- ════════════════════════════════════════════════════════════════════
-- 0004 · Catalogo moduli e piani commerciali iniziali
-- ════════════════════════════════════════════════════════════════════
insert into platform.modules (key, name, description, is_core) values
  ('users',          'Gestione utenti',          'Account, inviti e ruoli', true),
  ('students',       'Gestione allieve',         'Schede allieve e percorso', true),
  ('guardians',      'Gestione genitori',        'Account genitore/tutore e figli', false),
  ('teachers',       'Gestione insegnanti',      'Insegnanti e assegnazione classi', true),
  ('classes',        'Corsi e classi',           'Classi, livelli, discipline, capienza', true),
  ('calendar',       'Calendario',               'Viste giorno, settimana e mese', true),
  ('bookings',       'Prenotazioni',             'Richieste di iscrizione e prenotazioni', false),
  ('attendance',     'Presenze e assenze',       'Presenza dichiarata ed effettiva', false),
  ('makeups',        'Recuperi',                 'Richieste di recupero con approvazione', false),
  ('payments',       'Tariffe e pagamenti',      'Quote, abbonamenti e pagamenti delle allieve', false),
  ('events',         'Eventi e workshop',        'Workshop, stage, saggi, spettacoli', false),
  ('communications', 'Comunicazioni',            'Avvisi e comunicazioni della palestra', false),
  ('notifications',  'Centro notifiche',         'Push, email e notifiche interne', false),
  ('figure_archive', 'Archivio didattico',       'Figure con sequenze fotografiche', false),
  ('progress',       'Progressi individuali',    'Stati delle figure, note e feedback', false),
  ('media',          'Foto e video',             'Caricamento di foto e video', false),
  ('reports',        'Reportistica',             'Report e statistiche', false),
  ('administration', 'Gestione amministrativa',  'Tessere, certificati, dati amministrativi', false)
on conflict (key) do nothing;

insert into platform.plans (code, name, price_month_cents, price_year_cents, limits) values
  ('essential', 'Essential', null, null, '{"maxMembers": 80, "storageGb": 5, "videoMinutes": 0}'),
  ('studio',    'Studio',    null, null, '{"maxMembers": 250, "storageGb": 25, "videoMinutes": 120}'),
  ('premium',   'Premium',   null, null, '{"maxMembers": 1000, "storageGb": 100, "videoMinutes": 600}')
on conflict (code) do nothing;
-- I prezzi restano null finché non vengono decisi commercialmente.

insert into platform.plan_modules (plan_id, module_key)
select p.id, m.key from platform.plans p cross join platform.modules m
where p.code = 'premium'
   or (p.code = 'studio' and m.key not in ('reports', 'media'))
   or (p.code = 'essential' and (m.is_core or m.key in ('attendance', 'events', 'communications')))
on conflict do nothing;

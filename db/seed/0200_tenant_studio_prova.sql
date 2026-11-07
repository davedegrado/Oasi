-- Generato da apps/web/scripts/export-demo-seed.ts. Non modificare a mano.
-- Tenant 2: "Studio Prova" — palestra fittizia per test di isolamento e white-label
begin;
insert into platform.tenants (id, slug, legal_name, display_name, status, is_demo) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'studio-prova', 'Studio Prova ASD', 'Studio Prova', 'trial', true);
insert into platform.domains (tenant_id, hostname, kind, is_primary, verification_status, ssl_status) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'prova.localhost', 'platform_subdomain', true, 'verified', 'active');
insert into platform.branding (tenant_id, app_name, short_name, colors, fonts, texts, contacts) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'Studio Prova', 'Prova',
  '{"primary":"#2F7D74","primarySoft":"#D7EFEA","primaryMid":"#8CC7BD","primaryStrong":"#1F5C55","background":"#F6FBFA","ink":"#1E2524","themeColor":"#2F7D74"}'::jsonb,
  '{"heading":"Nunito","body":"Inter"}'::jsonb,
  '{"welcomeTitle":"Benvenuta allo Studio Prova","welcomeEyebrow":"Pole dance · Demo"}'::jsonb,
  '{"email":"info@studio-prova.example","address":"Via di Prova 1, Bologna"}'::jsonb);
insert into platform.subscriptions (tenant_id, plan_id, billing_cycle, status, trial_ends_on) select '12c2e24b-e305-57f6-9665-05f6de5195ed', id, 'monthly', 'trialing', current_date + 30 from platform.plans where code = 'essential';
insert into platform.tenant_modules (tenant_id, module_key, enabled, source) select '12c2e24b-e305-57f6-9665-05f6de5195ed', module_key, true, 'plan' from platform.plan_modules pm join platform.plans p on p.id = pm.plan_id where p.code = 'essential';
set local app.tenant_id = '12c2e24b-e305-57f6-9665-05f6de5195ed';
insert into app.disciplines (tenant_id, id, slug, name, color, icon, apparatus, has_figure_archive) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', '9fa6e61c-c6e5-5438-b731-b331760cda51', 'pole', 'Pole dance', '#2F7D74', 'circle', array['Palo statico', 'Palo spinning']::text[], true);
insert into app.levels (tenant_id, id, name, rank) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'ee312e72-a586-5bf3-b4ea-b97871bd3470', 'Principianti', 1);
insert into app.members (tenant_id, id, user_id, first_name, last_name, is_demo) values
  ('12c2e24b-e305-57f6-9665-05f6de5195ed', '558cc837-f398-5fc0-98c5-9afa7e297c64', '6dc5ff5c-3344-56ae-8858-e47777110447', 'Marta', 'Prova', true),
  ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'b59f6d04-7985-5561-86bd-3453c1174cdb', '96566281-de4e-537d-9c3f-510f8154898f', 'Laura', 'Esempio', true),
  ('12c2e24b-e305-57f6-9665-05f6de5195ed', '92156629-b127-56db-a4fe-c93a2c3f9137', null, 'Chiara', 'Minore', true);
insert into app.memberships (tenant_id, user_id, member_id, roles) values
  ('12c2e24b-e305-57f6-9665-05f6de5195ed', '6dc5ff5c-3344-56ae-8858-e47777110447', '558cc837-f398-5fc0-98c5-9afa7e297c64', '{teacher,admin}'),
  ('12c2e24b-e305-57f6-9665-05f6de5195ed', '96566281-de4e-537d-9c3f-510f8154898f', 'b59f6d04-7985-5561-86bd-3453c1174cdb', '{student,guardian}');
insert into app.guardianships (tenant_id, guardian_member_id, child_member_id) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'b59f6d04-7985-5561-86bd-3453c1174cdb', '92156629-b127-56db-a4fe-c93a2c3f9137');
insert into app.classes (tenant_id, id, name, discipline_id, level_id, capacity, weekday, start_time, end_time) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'e4727316-e848-5e2b-be10-85c3b32f35a3', 'Pole Principianti', '9fa6e61c-c6e5-5438-b731-b331760cda51', 'ee312e72-a586-5bf3-b4ea-b97871bd3470', 10, 2, '20:00', '21:00');
insert into app.class_teachers (tenant_id, class_id, member_id) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'e4727316-e848-5e2b-be10-85c3b32f35a3', '558cc837-f398-5fc0-98c5-9afa7e297c64');
insert into app.enrollments (tenant_id, class_id, member_id, status) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'e4727316-e848-5e2b-be10-85c3b32f35a3', 'b59f6d04-7985-5561-86bd-3453c1174cdb', 'approved'), ('12c2e24b-e305-57f6-9665-05f6de5195ed', 'e4727316-e848-5e2b-be10-85c3b32f35a3', '92156629-b127-56db-a4fe-c93a2c3f9137', 'approved');
insert into app.lessons (tenant_id, class_id, date, start_time, end_time) select '12c2e24b-e305-57f6-9665-05f6de5195ed', 'e4727316-e848-5e2b-be10-85c3b32f35a3', d::date, '20:00', '21:00' from generate_series(current_date - 14, current_date + 21, interval '7 days') d;
insert into app.figures (tenant_id, id, discipline_id, apparatus, name, level_id, difficulty, description, author_member_id) values ('12c2e24b-e305-57f6-9665-05f6de5195ed', '3e05dbfe-f9e0-5322-8c46-d83462e3c288', '9fa6e61c-c6e5-5438-b731-b331760cda51', 'Palo statico', 'Fireman spin', 'ee312e72-a586-5bf3-b4ea-b97871bd3470', 1, 'Prima rotazione attorno al palo.', '558cc837-f398-5fc0-98c5-9afa7e297c64');
commit;

/**
 * Genera db/seed/*.sql a partire dai dati dimostrativi del frontend,
 * così la demo e il tenant "Oasi Metropolitana" restano allineati.
 *
 *   npm run seed:export
 *
 * Le date sono espresse relative al giorno in cui il seed viene caricato
 * (current_date + N), quindi il calendario resta sempre attuale.
 * Tutti i record sono marcati is_demo = true dove la tabella lo prevede.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSeedDatabase } from '../src/data/seed'
import type { LearningStatus, OasiDatabase } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../../db/seed')

/** UUID deterministico (stile v5) da una chiave testuale */
function uuid(key: string): string {
  const h = createHash('sha1').update(`oasi-aerial:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

const q = (v: string | null | undefined) => (v === null || v === undefined ? 'null' : `'${v.replace(/'/g, "''")}'`)
const arr = (items: string[]) => `array[${items.map(q).join(', ')}]::text[]`
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`

const todayIso = new Date().toISOString().slice(0, 10)
const dayOffset = (iso: string) => Math.round((Date.parse(iso) - Date.parse(todayIso)) / 86400000)
const rel = (iso: string) => `(current_date + ${dayOffset(iso)})`

const STATUS_MAP: Record<LearningStatus, string> = {
  da_imparare: 'to_learn',
  in_apprendimento: 'planned', // stato eliminato: confluisce in "In progetto"
  in_progetto: 'planned',
  riuscita: 'achieved',
}

const MEMBERSHIP_MAP = { attiva: 'active', in_scadenza: 'expiring', sospesa: 'suspended', prova: 'trial' } as const
const EVENT_TYPE_MAP = { spettacolo: 'show', workshop: 'workshop', stage: 'stage', sociale: 'social' } as const

function oasiSeed(db: OasiDatabase): string {
  const T = uuid('tenant:oasi-metropolitana')
  const out: string[] = []
  const push = (s: string) => out.push(s)
  const disciplineId = (d: string) => uuid(`oasi:discipline:${d}`)
  const levelId = (l: string) => uuid(`oasi:level:${l}`)
  const roomId = (r: string) => uuid(`oasi:room:${r}`)
  const memberId = (id: string) => uuid(`oasi:member:${id}`)
  const userId = (id: string) => uuid(`user:${id}`)

  push(`-- Generato da apps/web/scripts/export-demo-seed.ts il ${todayIso}. Non modificare a mano.`)
  push(`-- Tenant 1: Oasi Metropolitana (dati DIMOSTRATIVI, is_demo = true)`)
  push('begin;')
  push(`insert into platform.tenants (id, slug, legal_name, display_name, status, is_demo) values (${q(T)}, 'oasi-metropolitana', ${q(`${db.association.name} ${db.association.legalForm}`)}, ${q(db.association.name)}, 'active', true);`)
  push(`insert into platform.domains (tenant_id, hostname, kind, is_primary, verification_status, ssl_status) values
  (${q(T)}, 'oasi.localhost', 'platform_subdomain', true, 'verified', 'active');`)
  push(`insert into platform.branding (tenant_id, app_name, short_name, logo_path, icon_path, colors, fonts, texts, contacts) values (${q(T)}, 'Oasi Metropolitana', 'Oasi', null, null,
  ${json({ primary: '#D66A9B', primarySoft: '#F7DCE8', primaryMid: '#E9A4C0', primaryStrong: '#B8507F', background: '#FFF7FA', ink: '#242124', themeColor: '#E9A4C0' })},
  ${json({ heading: 'Nunito', body: 'Inter' })},
  ${json({ welcomeTitle: 'Benvenuta nella tua Oasi', welcomeEyebrow: 'Danza aerea · Modena' })},
  ${json({ email: db.association.email, phone: db.association.phone, address: db.association.address, website: db.association.website, legalForm: db.association.legalForm, affiliation: db.association.affiliation, season: db.association.season })});`)
  push(`insert into platform.subscriptions (tenant_id, plan_id, billing_cycle, status) select ${q(T)}, id, 'yearly', 'free' from platform.plans where code = 'premium';`)
  push(`insert into platform.tenant_modules (tenant_id, module_key, enabled, source) select ${q(T)}, module_key, true, 'plan' from platform.plan_modules pm join platform.plans p on p.id = pm.plan_id where p.code = 'premium';`)
  push(`set local app.tenant_id = ${q(T)};`)
  push(`insert into app.tenant_settings (tenant_id, settings) values (${q(T)}, ${json(db.association.settings)});`)

  // Configurazione didattica
  push(`insert into app.disciplines (tenant_id, id, slug, name, color, icon, apparatus, has_figure_archive, position) values
  (${q(T)}, ${q(disciplineId('cerchio'))}, 'cerchio', 'Cerchio aereo', '#D66A9B', 'circle', ${arr(['Cerchio'])}, true, 1),
  (${q(T)}, ${q(disciplineId('tessuti'))}, 'tessuti', 'Tessuti aerei', '#8A7BB8', 'wind', ${arr(['Tessuti'])}, true, 2);`)
  push(`insert into app.levels (tenant_id, id, name, rank) values
  (${q(T)}, ${q(levelId('base'))}, 'Base', 1), (${q(T)}, ${q(levelId('intermedio'))}, 'Intermedio', 2), (${q(T)}, ${q(levelId('avanzato'))}, 'Avanzato', 3);`)
  push(`insert into app.rooms (tenant_id, id, name) values ${db.association.rooms.map((r) => `(${q(T)}, ${q(roomId(r))}, ${q(r)})`).join(', ')};`)

  // Persone: insegnanti, allieve, segreteria
  const memberRows: string[] = []
  const membershipRows: string[] = []
  for (const t of db.teachers) {
    memberRows.push(`(${q(T)}, ${q(memberId(t.id))}, ${q(userId(t.id))}, ${q(t.firstName)}, ${q(t.lastName)}, null, ${q(t.email)}, ${q(t.phone)}, null, ${q(disciplineId(t.disciplines[0]))}, ${q(t.bio)}, '{}', ${q(`${t.since}-09-01`)}, true)`)
    membershipRows.push(`(${q(T)}, ${q(userId(t.id))}, ${q(memberId(t.id))}, '{teacher}', 'active')`)
  }
  for (const s of db.students) {
    memberRows.push(`(${q(T)}, ${q(memberId(s.id))}, ${q(userId(s.id))}, ${q(s.firstName)}, ${q(s.lastName)}, ${q(s.birthDate)}, ${q(s.email)}, ${q(s.phone)}, ${q(levelId(s.level))}, ${q(disciplineId(s.mainDiscipline))}, null, ${arr(s.goals)}, ${rel(s.joinedAt)}, true)`)
    membershipRows.push(`(${q(T)}, ${q(userId(s.id))}, ${q(memberId(s.id))}, '{student}', 'active')`)
  }
  memberRows.push(`(${q(T)}, ${q(memberId('admin'))}, ${q(userId('oasi-admin'))}, 'Segreteria', 'Oasi', null, ${q(db.association.email)}, null, null, null, null, '{}', current_date, true)`)
  membershipRows.push(`(${q(T)}, ${q(userId('oasi-admin'))}, ${q(memberId('admin'))}, '{admin}', 'active')`)
  push(`insert into app.members (tenant_id, id, user_id, first_name, last_name, birth_date, email, phone, level_id, main_discipline_id, bio, goals, joined_on, is_demo) values\n  ${memberRows.join(',\n  ')};`)
  push(`insert into app.memberships (tenant_id, user_id, member_id, roles, status) values\n  ${membershipRows.join(',\n  ')};`)
  push(`insert into app.member_admin (tenant_id, member_id, membership_status, card_number, card_expires_on, medical_certificate_expires, fee_plan_label, fee_paid_until) values\n  ${db.students
    .map((s) => `(${q(T)}, ${q(memberId(s.id))}, ${q(MEMBERSHIP_MAP[s.membership.status])}, ${q(s.membership.cardNumber)}, ${rel(s.membership.expiresAt)}, ${rel(s.membership.medicalCertificateExpiresAt)}, ${q(s.membership.feePlan)}, ${rel(s.membership.feePaidUntil)})`)
    .join(',\n  ')};`)

  // Classi, insegnanti, iscrizioni
  const classId = (id: string) => uuid(`oasi:class:${id}`)
  push(`insert into app.classes (tenant_id, id, name, discipline_id, level_id, room_id, capacity, weekday, start_time, end_time, description) values\n  ${db.classes
    .map((c) => `(${q(T)}, ${q(classId(c.id))}, ${q(c.name)}, ${q(disciplineId(c.discipline))}, ${q(levelId(c.level))}, ${q(roomId(c.room))}, ${c.capacity}, ${c.weekday}, ${q(c.startTime)}, ${q(c.endTime)}, ${q(c.description)})`)
    .join(',\n  ')};`)
  push(`insert into app.class_teachers (tenant_id, class_id, member_id) values ${db.classes.map((c) => `(${q(T)}, ${q(classId(c.id))}, ${q(memberId(c.teacherId))})`).join(', ')};`)
  push(`insert into app.enrollments (tenant_id, class_id, member_id, status, decided_at) values\n  ${db.classes
    .flatMap((c) => c.studentIds.map((sid) => `(${q(T)}, ${q(classId(c.id))}, ${q(memberId(sid))}, 'approved', now())`))
    .join(',\n  ')};`)

  // Lezioni e presenze effettive
  const lessonId = (id: string) => uuid(`oasi:lesson:${id}`)
  const statusMap = { regolare: 'scheduled', annullata: 'cancelled', variata: 'rescheduled' } as const
  push(`insert into app.lessons (tenant_id, id, class_id, date, start_time, end_time, status, original_start_time, original_end_time, note) values\n  ${db.lessons
    .map((l) => `(${q(T)}, ${q(lessonId(l.id))}, ${q(classId(l.classId))}, ${rel(l.date)}, ${q(l.startTime)}, ${q(l.endTime)}, ${q(statusMap[l.status])}, ${q(l.originalStartTime)}, ${q(l.originalEndTime)}, ${q(l.note)})`)
    .join(',\n  ')};`)
  const att = db.lessons.flatMap((l) =>
    Object.entries(l.attendance).map(([sid, mark]) => `(${q(T)}, ${q(lessonId(l.id))}, ${q(memberId(sid))}, ${q(mark === 'presente' ? 'present' : 'absent')}, now())`),
  )
  if (att.length) push(`insert into app.attendance (tenant_id, lesson_id, member_id, actual, recorded_at) values\n  ${att.join(',\n  ')};`)

  // Archivio figure e progressi (4 stati → 3)
  const figureId = (id: string) => uuid(`oasi:figure:${id}`)
  push(`insert into app.figures (tenant_id, id, discipline_id, apparatus, name, level_id, difficulty, description, attention_points, prerequisites, cover_path, author_member_id, created_at) values\n  ${db.figures
    .map((f) => `(${q(T)}, ${q(figureId(f.id))}, ${q(disciplineId(f.discipline))}, ${q(f.discipline === 'cerchio' ? 'Cerchio' : 'Tessuti')}, ${q(f.name)}, ${q(levelId(f.level))}, ${f.difficulty}, ${q(f.description)}, ${arr(f.attentionPoints)}, ${arr(f.prerequisites)}, ${q(f.cover)}, ${q(memberId(f.teacherId))}, ${rel(f.createdAt)})`)
    .join(',\n  ')};`)
  push(`insert into app.figure_steps (tenant_id, figure_id, position, image_path, caption) values\n  ${db.figures
    .flatMap((f) => f.steps.map((s, i) => `(${q(T)}, ${q(figureId(f.id))}, ${i + 1}, ${q(s.image)}, ${q(s.caption)})`))
    .join(',\n  ')};`)
  const progressRows = Object.entries(db.progress).flatMap(([sid, entries]) =>
    Object.entries(entries).map(([fid, p]) => `(${q(T)}, ${q(memberId(sid))}, ${q(figureId(fid))}, ${q(STATUS_MAP[p.status])}, ${q(p.note)}, ${rel(p.updatedAt)})`),
  )
  push(`insert into app.figure_progress (tenant_id, member_id, figure_id, status, student_note, updated_at) values\n  ${progressRows.join(',\n  ')};`)

  // Eventi, adesioni, comunicazioni
  const eventId = (id: string) => uuid(`oasi:event:${id}`)
  push(`insert into app.events (tenant_id, id, type, title, description, date, start_time, end_time, location, image_path, capacity, signup_deadline, is_demo) values\n  ${db.events
    .map((e) => `(${q(T)}, ${q(eventId(e.id))}, ${q(EVENT_TYPE_MAP[e.type])}, ${q(e.title)}, ${q(e.description)}, ${rel(e.date)}, ${q(e.startTime)}, ${q(e.endTime)}, ${q(e.location)}, ${q(e.image)}, ${e.capacity}, ${rel(e.date)} - 2, true)`)
    .join(',\n  ')};`)
  push(`insert into app.event_signups (tenant_id, event_id, member_id) values\n  ${db.events
    .flatMap((e) => e.participantIds.map((sid) => `(${q(T)}, ${q(eventId(e.id))}, ${q(memberId(sid))})`))
    .join(',\n  ')};`)
  const audience = { tutti: 'all', allieve: 'students', insegnanti: 'teachers' } as const
  push(`insert into app.announcements (tenant_id, title, body, priority, audience, published_at, is_demo) values\n  ${db.announcements
    .map((a) => `(${q(T)}, ${q(a.title)}, ${q(a.body)}, ${q(a.priority === 'importante' ? 'important' : 'normal')}, ${q(audience[a.audience])}, ${rel(a.date)}, true)`)
    .join(',\n  ')};`)
  push('commit;')
  return out.join('\n\n') + '\n'
}

/** Secondo tenant di prova: identità e disciplina diverse, usato nei test di isolamento */
function testTenantSeed(): string {
  const T = uuid('tenant:studio-prova')
  const d = uuid('prova:discipline:pole')
  const l = uuid('prova:level:base')
  const c = uuid('prova:class:pole-base')
  const teacher = uuid('prova:member:teacher')
  const s1 = uuid('prova:member:s1')
  const s2 = uuid('prova:member:s2')
  const f1 = uuid('prova:figure:fireman')
  return `-- Generato da apps/web/scripts/export-demo-seed.ts. Non modificare a mano.
-- Tenant 2: "Studio Prova" — palestra fittizia per test di isolamento e white-label
begin;
insert into platform.tenants (id, slug, legal_name, display_name, status, is_demo) values (${q(T)}, 'studio-prova', 'Studio Prova ASD', 'Studio Prova', 'trial', true);
insert into platform.domains (tenant_id, hostname, kind, is_primary, verification_status, ssl_status) values (${q(T)}, 'prova.localhost', 'platform_subdomain', true, 'verified', 'active');
insert into platform.branding (tenant_id, app_name, short_name, colors, fonts, texts, contacts) values (${q(T)}, 'Studio Prova', 'Prova',
  ${json({ primary: '#2F7D74', primarySoft: '#D7EFEA', primaryMid: '#8CC7BD', primaryStrong: '#1F5C55', background: '#F6FBFA', ink: '#1E2524', themeColor: '#2F7D74' })},
  ${json({ heading: 'Nunito', body: 'Inter' })},
  ${json({ welcomeTitle: 'Benvenuta allo Studio Prova', welcomeEyebrow: 'Pole dance · Demo' })},
  ${json({ email: 'info@studio-prova.example', address: 'Via di Prova 1, Bologna' })});
insert into platform.subscriptions (tenant_id, plan_id, billing_cycle, status, trial_ends_on) select ${q(T)}, id, 'monthly', 'trialing', current_date + 30 from platform.plans where code = 'essential';
insert into platform.tenant_modules (tenant_id, module_key, enabled, source) select ${q(T)}, module_key, true, 'plan' from platform.plan_modules pm join platform.plans p on p.id = pm.plan_id where p.code = 'essential';
set local app.tenant_id = ${q(T)};
insert into app.disciplines (tenant_id, id, slug, name, color, icon, apparatus, has_figure_archive) values (${q(T)}, ${q(d)}, 'pole', 'Pole dance', '#2F7D74', 'circle', ${arr(['Palo statico', 'Palo spinning'])}, true);
insert into app.levels (tenant_id, id, name, rank) values (${q(T)}, ${q(l)}, 'Principianti', 1);
insert into app.members (tenant_id, id, user_id, first_name, last_name, is_demo) values
  (${q(T)}, ${q(teacher)}, ${q(uuid('user:prova-teacher'))}, 'Marta', 'Prova', true),
  (${q(T)}, ${q(s1)}, ${q(uuid('user:prova-student'))}, 'Laura', 'Esempio', true),
  (${q(T)}, ${q(s2)}, null, 'Chiara', 'Minore', true);
insert into app.memberships (tenant_id, user_id, member_id, roles) values
  (${q(T)}, ${q(uuid('user:prova-teacher'))}, ${q(teacher)}, '{teacher,admin}'),
  (${q(T)}, ${q(uuid('user:prova-student'))}, ${q(s1)}, '{student,guardian}');
insert into app.guardianships (tenant_id, guardian_member_id, child_member_id) values (${q(T)}, ${q(s1)}, ${q(s2)});
insert into app.classes (tenant_id, id, name, discipline_id, level_id, capacity, weekday, start_time, end_time) values (${q(T)}, ${q(c)}, 'Pole Principianti', ${q(d)}, ${q(l)}, 10, 2, '20:00', '21:00');
insert into app.class_teachers (tenant_id, class_id, member_id) values (${q(T)}, ${q(c)}, ${q(teacher)});
insert into app.enrollments (tenant_id, class_id, member_id, status) values (${q(T)}, ${q(c)}, ${q(s1)}, 'approved'), (${q(T)}, ${q(c)}, ${q(s2)}, 'approved');
insert into app.lessons (tenant_id, class_id, date, start_time, end_time) select ${q(T)}, ${q(c)}, d::date, '20:00', '21:00' from generate_series(current_date - 14, current_date + 21, interval '7 days') d;
insert into app.figures (tenant_id, id, discipline_id, apparatus, name, level_id, difficulty, description, author_member_id) values (${q(T)}, ${q(f1)}, ${q(d)}, 'Palo statico', 'Fireman spin', ${q(l)}, 1, 'Prima rotazione attorno al palo.', ${q(teacher)});
commit;
`
}

/** Utenti di accesso per lo sviluppo locale (lo stub di auth.users non esiste su Supabase) */
function localUsers(db: OasiDatabase): string {
  const rows = [
    ...db.teachers.map((t) => [uuid(`user:${t.id}`), t.email]),
    ...db.students.map((s) => [uuid(`user:${s.id}`), s.email]),
    [uuid('user:oasi-admin'), 'segreteria@oasi-demo.it'],
    [uuid('user:prova-teacher'), 'marta@studio-prova.example'],
    [uuid('user:prova-student'), 'laura@studio-prova.example'],
  ]
  return `-- Solo sviluppo locale: corrisponde agli utenti dei seed demo.\ninsert into auth.users (id, email) values\n  ${rows.map(([id, e]) => `(${q(id)}, ${q(e)})`).join(',\n  ')}\non conflict do nothing;\n`
}

mkdirSync(outDir, { recursive: true })
const db = createSeedDatabase(todayIso)
writeFileSync(resolve(outDir, '0100_tenant_oasi_metropolitana.sql'), oasiSeed(db))
writeFileSync(resolve(outDir, '0200_tenant_studio_prova.sql'), testTenantSeed())
writeFileSync(resolve(here, '../../../db/local/demo_users.sql'), localUsers(db))
console.log(`Seed scritti in ${outDir}`)

import type { Charge, FeePlan, MemberPlan, PlanInstallment, Season, Student } from '@/types'

/**
 * Configurazione iniziale di Oasi Metropolitana per la stagione 2026/2027.
 * Sono DATI di questa palestra (gli stessi di db/seed/0110_oasi_stagione_2026_27.sql),
 * modificabili da Gestione: non sono regole dell'applicazione.
 */
export const demoSeason: Season = {
  id: 'season-2026-27',
  name: '2026/2027',
  startDate: '2026-09-15',
  endDate: '2027-05-30',
  periods: [
    { id: 'per-1', name: 'Periodico 1', startDate: '2026-09-15', endDate: '2026-11-08' },
    { id: 'per-2', name: 'Periodico 2', startDate: '2026-11-09', endDate: '2027-01-24' },
    { id: 'per-3', name: 'Periodico 3', startDate: '2027-01-25', endDate: '2027-04-04' },
    { id: 'per-4', name: 'Periodico 4', startDate: '2027-04-05', endDate: '2027-05-30' },
  ],
}

const twoInstallments = (amountCents: number): PlanInstallment[] => [
  { amountCents, dueOn: '2026-09-15', coversFrom: '2026-09-15', coversUntil: '2027-01-24' },
  { amountCents, dueOn: '2027-01-25', coversFrom: '2027-01-25', coversUntil: '2027-05-30' },
]
const fourInstallments = (amountCents: number): PlanInstallment[] =>
  demoSeason.periods.map((p) => ({ amountCents, dueOn: p.startDate, coversFrom: p.startDate, coversUntil: p.endDate }))

const season = { validFrom: demoSeason.startDate, validUntil: demoSeason.endDate }
const eur = (n: number) => Math.round(n * 100)

export const demoPlans: FeePlan[] = [
  // Baby/Teen: annuale oppure 2 rate
  ...[
    { freq: 1, annual: 340, rate: 190 },
    { freq: 2, annual: 600, rate: 330 },
    { freq: 3, annual: 900, rate: 470 },
  ].map(({ freq, annual, rate }): FeePlan => ({
    id: `plan-babyteen-${freq}`, name: `Baby/Teen · ${freq} ${freq === 1 ? 'frequenza' : 'frequenze'}`, category: 'Baby/Teen', kind: 'abbonamento', billing: 'annuale',
    amountCents: eur(annual), installments: twoInstallments(eur(rate)), weeklyFrequency: freq, ...season, active: true,
  })),
  // Circo Baby: un normale pacchetto configurabile
  { id: 'plan-circo-1', name: 'Circo Baby · 8 ingressi (1° periodo)', category: 'Pacchetti', kind: 'pacchetto', billing: 'una_tantum', amountCents: eur(80), entries: 8, validFrom: '2026-09-15', validUntil: '2027-01-24', bookingHoursBefore: 24, note: 'Da 12 a 36 mesi', active: true },
  { id: 'plan-circo-2', name: 'Circo Baby · 8 ingressi (2° periodo)', category: 'Pacchetti', kind: 'pacchetto', billing: 'una_tantum', amountCents: eur(80), entries: 8, validFrom: '2027-01-25', validUntil: '2027-05-30', bookingHoursBefore: 24, note: 'Da 12 a 36 mesi', active: true },
  { id: 'plan-genitori-figli', name: 'Genitori & Figli (a coppia)', category: 'Genitori & Figli', kind: 'abbonamento', billing: 'annuale', amountCents: eur(550), installments: twoInstallments(eur(300)), ...season, note: 'Quota a coppia', active: true },
  // Adulti/Teen: mensile (4 settimane consecutive), periodico, annuale
  ...[
    { freq: 1, monthly: 55, periodic: 95, annual: 340 },
    { freq: 2, monthly: 95, periodic: 165, annual: 600 },
    { freq: 3, monthly: 135, periodic: 235, annual: 900 },
    { freq: 4, monthly: 180, periodic: 310, annual: 1160 },
  ].flatMap(({ freq, monthly, periodic, annual }): FeePlan[] => [
    { id: `plan-adulti-${freq}-m`, name: `Adulti/Teen · ${freq}x · mensile`, category: 'Adulti/Teen', kind: 'abbonamento', billing: 'mensile', amountCents: eur(monthly), weeklyFrequency: freq, validityWeeks: 4, active: true },
    { id: `plan-adulti-${freq}-p`, name: `Adulti/Teen · ${freq}x · periodico`, category: 'Adulti/Teen', kind: 'abbonamento', billing: 'periodico', amountCents: eur(periodic), weeklyFrequency: freq, active: true },
    { id: `plan-adulti-${freq}-a`, name: `Adulti/Teen · ${freq}x · annuale`, category: 'Adulti/Teen', kind: 'abbonamento', billing: 'annuale', amountCents: eur(annual), weeklyFrequency: freq, ...season, active: true },
  ]),
  { id: 'plan-singola', name: 'Lezione singola', category: 'Lezioni singole', kind: 'lezione_singola', billing: 'una_tantum', amountCents: eur(15), validFrom: '2026-09-14', validUntil: '2027-05-30', note: 'Con prenotazione', active: true },
  { id: 'plan-pack5', name: 'Pacchetto 5 lezioni', category: 'Lezioni singole', kind: 'pacchetto', billing: 'una_tantum', amountCents: eur(70), entries: 5, validFrom: '2026-09-14', validUntil: '2027-05-30', note: 'Lezioni da 1 ora o 1 ora e un quarto, con prenotazione', active: true },
  { id: 'plan-preagonismo', name: 'Preagonismo Baby', category: 'Agonismo', kind: 'abbonamento', billing: 'annuale', amountCents: eur(740), installments: fourInstallments(eur(185)), ...season, note: 'Certificato agonistico secondo classificazione; quote gara a parte', active: true },
  { id: 'plan-agonismo', name: 'Agonismo Teen', category: 'Agonismo', kind: 'abbonamento', billing: 'annuale', amountCents: eur(900), installments: fourInstallments(eur(225)), ...season, note: 'Certificato agonistico obbligatorio; quote gara a parte', active: true },
  { id: 'plan-semiprivata', name: 'Adulti semiprivata (a lezione)', category: 'Semiprivate', kind: 'semiprivata', billing: 'una_tantum', amountCents: eur(30), note: 'Da dividere tra massimo 3 partecipanti', active: true },
  { id: 'plan-tessera-15', name: 'Tessera associativa · fino a 15 anni', category: 'Tessera', kind: 'tessera', billing: 'annuale', amountCents: eur(22), ...season, active: true },
  { id: 'plan-tessera-16', name: 'Tessera associativa · dai 16 anni', category: 'Tessera', kind: 'tessera', billing: 'annuale', amountCents: eur(27), ...season, active: true },
]

/** Dati dimostrativi: a ogni atleta un piano Adulti/Teen annuale secondo le classi frequentate, più la tessera */
export function buildDemoAccounts(students: Student[], today: string): { memberPlans: MemberPlan[]; charges: Charge[] } {
  const memberPlans: MemberPlan[] = []
  const charges: Charge[] = []
  students.forEach((s, i) => {
    const freq = Math.min(Math.max(s.classIds.length, 1), 4)
    const plan = demoPlans.find((p) => p.id === `plan-adulti-${freq}-a`)!
    const mpId = `mp-${s.id}`
    memberPlans.push({ id: mpId, studentId: s.id, planId: plan.id, paymentMode: 'unica', validFrom: demoSeason.startDate, validUntil: demoSeason.endDate, createdAt: demoSeason.startDate })
    // Qualche situazione diversa per la demo: saldato, acconto, da pagare
    const paid = i % 4 === 0 ? 0 : i % 4 === 1 ? Math.round(plan.amountCents / 2) : plan.amountCents
    charges.push({
      id: `chg-${s.id}-plan`, studentId: s.id, memberPlanId: mpId, description: plan.name, kind: 'piano', periodLabel: 'Stagione 2026/2027', amountCents: plan.amountCents,
      dueOn: i % 4 === 0 ? '2026-10-15' : '2026-09-30',
      payments: paid > 0 ? [{ id: `pay-${s.id}-1`, amountCents: paid, paidOn: '2026-09-28', method: i % 2 ? 'bonifico' : 'contanti', note: paid < plan.amountCents ? 'Acconto' : '' }] : [],
    })
    charges.push({
      id: `chg-${s.id}-card`, studentId: s.id, description: 'Tessera associativa · dai 16 anni', kind: 'tessera', periodLabel: 'Stagione 2026/2027', amountCents: 2700, dueOn: '2026-09-30',
      payments: s.membership.status === 'sospesa' ? [] : [{ id: `pay-${s.id}-card`, amountCents: 2700, paidOn: today < '2026-09-20' ? today : '2026-09-20', method: 'contanti', note: '' }],
    })
  })
  return { memberPlans, charges }
}

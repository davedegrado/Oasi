import type { FeePlan, MemberPlan, Student } from '@/types'
import { addDays, addMonths } from '@/lib/dates'

/**
 * Listino iniziale di Oasi Metropolitana per la stagione 2026/2027.
 * Sono DATI di questa palestra (gli stessi di db/seed/0110_oasi_stagione_2026_27.sql),
 * modificabili da Gestione → Piani: non sono regole dell'applicazione.
 * L'atleta sceglie il piano quando chiede l'iscrizione a una classe.
 */
const eur = (n: number) => Math.round(n * 100)
const season = { validity: 'periodo' as const, validFrom: '2026-09-15', validUntil: '2027-05-30' }
const BAMBINI = ['Bambini/Ragazzi']
const ADULTI = ['Adulti/Ragazzi']

export const demoPlans: FeePlan[] = [
  // Baby/Teen: annuale, una, due o tre volte a settimana
  ...[
    { freq: 1, annual: 340 },
    { freq: 2, annual: 600 },
    { freq: 3, annual: 900 },
  ].map(({ freq, annual }): FeePlan => ({
    id: `plan-babyteen-${freq}`, name: `Baby/Teen · ${freq} ${freq === 1 ? 'volta' : 'volte'} a settimana`, priceCents: eur(annual), weeklyFrequency: freq,
    ...season, autoAttendance: true, areas: BAMBINI, active: true,
  })),
  // Circo Baby: 8 lezioni per periodo, con "ci sarò"
  { id: 'plan-circo-1', name: 'Circo Baby · 8 lezioni (1° periodo)', priceCents: eur(80), lessons: 8, validity: 'periodo', validFrom: '2026-09-15', validUntil: '2027-01-24', autoAttendance: false, areas: BAMBINI, note: 'Da 12 a 36 mesi', active: true },
  { id: 'plan-circo-2', name: 'Circo Baby · 8 lezioni (2° periodo)', priceCents: eur(80), lessons: 8, validity: 'periodo', validFrom: '2027-01-25', validUntil: '2027-05-30', autoAttendance: false, areas: BAMBINI, note: 'Da 12 a 36 mesi', active: true },
  { id: 'plan-genitori-figli', name: 'Genitori & Figli (a coppia)', priceCents: eur(550), weeklyFrequency: 1, ...season, autoAttendance: true, note: 'Prezzo a coppia', active: true },
  // Adulti/Teen: mensile, periodico (periodo in corso) e annuale
  ...[
    { freq: 1, monthly: 55, periodic: 95, annual: 340 },
    { freq: 2, monthly: 95, periodic: 165, annual: 600 },
    { freq: 3, monthly: 135, periodic: 235, annual: 900 },
    { freq: 4, monthly: 180, periodic: 310, annual: 1160 },
  ].flatMap(({ freq, monthly, periodic, annual }): FeePlan[] => [
    { id: `plan-adulti-${freq}-m`, name: `Adulti/Teen · ${freq}x · mensile`, priceCents: eur(monthly), weeklyFrequency: freq, validity: 'mesi', months: 1, autoAttendance: true, areas: ADULTI, active: true },
    { id: `plan-adulti-${freq}-p`, name: `Adulti/Teen · ${freq}x · periodico (9 nov – 24 gen)`, priceCents: eur(periodic), weeklyFrequency: freq, validity: 'periodo', validFrom: '2026-11-09', validUntil: '2027-01-24', autoAttendance: true, areas: ADULTI, active: true },
    { id: `plan-adulti-${freq}-a`, name: `Adulti/Teen · ${freq}x · annuale`, priceCents: eur(annual), weeklyFrequency: freq, ...season, autoAttendance: true, areas: ADULTI, active: true },
  ]),
  { id: 'plan-singola', name: 'Lezione singola', priceCents: eur(15), lessons: 1, validity: 'mesi', months: 1, autoAttendance: false, note: 'Con "ci sarò" sulla lezione scelta', active: true },
  { id: 'plan-pack5', name: 'Pacchetto 5 lezioni', priceCents: eur(70), lessons: 5, validity: 'mesi', months: 3, autoAttendance: false, note: 'Lezioni da 1 ora o 1 ora e un quarto', active: true },
  { id: 'plan-preagonismo', name: 'Preagonismo Baby', priceCents: eur(740), ...season, autoAttendance: true, areas: BAMBINI, note: 'Certificato agonistico secondo classificazione', active: true },
  { id: 'plan-agonismo', name: 'Agonismo Teen', priceCents: eur(900), ...season, autoAttendance: true, note: 'Certificato agonistico obbligatorio', active: true },
  { id: 'plan-semiprivata', name: 'Adulti semiprivata (a lezione)', priceCents: eur(30), lessons: 1, validity: 'mesi', months: 1, autoAttendance: false, areas: ADULTI, note: 'Da dividere tra massimo 3 partecipanti', active: true },
]

/** Validità di un piano sottoscritto oggi (o alla data indicata) */
export function planValidity(plan: FeePlan, from: string): { validFrom: string; validUntil: string } {
  if (plan.validity === 'periodo') return { validFrom: plan.validFrom ?? from, validUntil: plan.validUntil ?? from }
  return { validFrom: from, validUntil: addDays(addMonths(from, plan.months ?? 1), -1) }
}

/**
 * Dati dimostrativi: a ogni atleta, per ogni classe, un piano Adulti/Teen annuale (valido oggi).
 * Qualche caso diverso per vedere le regole: Francesca ha un pacchetto da 5 lezioni (serve "ci sarò"),
 * Beatrice un mensile scaduto (nessuna lezione disponibile finché non rinnova).
 */
export function buildDemoAccounts(students: Student[], today: string): { memberPlans: MemberPlan[] } {
  const memberPlans: MemberPlan[] = []
  for (const s of students) {
    s.classIds.forEach((classId, n) => {
      const id = `mp-${s.id}-${n}`
      if (s.id === 'stu-francesca')
        memberPlans.push({ id, studentId: s.id, planId: 'plan-pack5', classId, validFrom: addDays(today, -20), validUntil: addDays(addMonths(addDays(today, -20), 3), -1), lessons: 5, createdAt: addDays(today, -20) })
      else if (s.id === 'stu-beatrice')
        memberPlans.push({ id, studentId: s.id, planId: 'plan-adulti-1-m', classId, validFrom: addDays(today, -45), validUntil: addDays(today, -15), createdAt: addDays(today, -45) })
      else {
        const plan = `plan-adulti-${Math.min(Math.max(s.classIds.length, 1), 4)}-a`
        // Annuale della stagione; se la demo è aperta fuori stagione, la validità segue la data di oggi
        const inSeason = today >= season.validFrom && today <= season.validUntil
        memberPlans.push({
          id, studentId: s.id, planId: plan, classId,
          validFrom: inSeason ? season.validFrom : addDays(today, -60), validUntil: inSeason ? season.validUntil : addDays(today, 200), createdAt: inSeason ? season.validFrom : addDays(today, -60),
        })
      }
    })
  }
  return { memberPlans }
}

import { Link } from 'react-router-dom'
import { Ticket, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { findClass, planUsage } from '@/services/selectors'
import { formatDate, todayISO } from '@/lib/dates'

/**
 * Piani dell'atleta: quale piano ha scelto per ogni classe, fino a quando vale e
 * quante lezioni restano. `asAdmin`: la segreteria può restituire a mano una lezione scalata.
 */
export function AccountCard({ studentId, asAdmin = false }: { studentId: string; asAdmin?: boolean }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const today = todayISO()
  const plans = db.memberPlans.filter((p) => p.studentId === studentId).sort((a, b) => b.validUntil.localeCompare(a.validUntil))
  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <Ticket className="size-4 text-rosa-intenso" /> {asAdmin ? 'Piani' : 'I tuoi piani'}
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          {asAdmin ? 'Scelti dall’atleta all’iscrizione alle classi.' : 'Le lezioni sono disponibili finché il piano è valido e, nei pacchetti, finché restano lezioni.'}
        </p>
        {plans.length === 0 && <p className="rounded-2xl bg-cipria-50 p-3 text-sm text-ink-muted">Nessun piano scelto.</p>}
        <ul className="space-y-2">
          {plans.map((mp) => {
            const plan = db.plans.find((x) => x.id === mp.planId)
            const usage = planUsage(db, mp)
            const expired = mp.validUntil < today
            const finished = usage.remaining === 0
            return (
              <li key={mp.id} className="rounded-2xl bg-cipria-50 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{plan?.name ?? 'Piano'}</p>
                    <p className="text-xs text-ink-muted">
                      {mp.classId ? `${findClass(db, mp.classId)?.name ?? ''} · ` : ''}
                      {formatDate(mp.validFrom)} – {formatDate(mp.validUntil, { year: true })}
                      {mp.lessons !== undefined ? ` · ${usage.remaining} di ${mp.lessons} lezioni residue` : ''}
                      {plan && !plan.autoAttendance ? ' · con “ci sarò”' : ''}
                    </p>
                  </div>
                  {expired ? <Badge tone="danger">Scaduto</Badge> : finished ? <Badge tone="warn">Lezioni finite</Badge> : <Badge tone="ok">Valido</Badge>}
                </div>
                {asAdmin && mp.lessons !== undefined && usage.used > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 -ml-2"
                    onClick={async () => {
                      const note = window.prompt('Motivo della restituzione (facoltativo, es. assenza per malattia):') ?? null
                      if (note === null) return
                      await repo.refundEntry(mp.id, note)
                      toast('Lezione restituita: l’atleta è avvisato')
                    }}
                  >
                    <Undo2 /> Restituisci una lezione
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {!asAdmin && (
          <Link to="/allieva/classi" className="mt-3 inline-block text-sm font-semibold text-rosa-scuro">
            Scegli o rinnova un piano →
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

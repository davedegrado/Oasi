import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, GraduationCap, LogOut, RotateCcw, Shield, UserRound } from 'lucide-react'
import type { Role } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, Label } from '@/components/ui/input'
import { useDemo } from '@/hooks/useDemo'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { ROLE_HOME } from '@/context/demo-context'
import { useTenant } from '@/hooks/useTenant'
import { DEMO_TENANTS } from '@/data/tenants'
import { DATA_SOURCE } from '@/tenant/config'
import { ROLE_LABEL } from '@/lib/labels'
import { cn, fullName } from '@/lib/utils'

const ROLE_META: Record<Role, { icon: typeof UserRound; description: string }> = {
  allieva: { icon: UserRound, description: 'Calendario, archivio figure e progressi personali' },
  insegnante: { icon: GraduationCap, description: 'Lezioni, presenze, allieve e gestione figure' },
  admin: { icon: Shield, description: 'Utenti, classi, eventi e configurazione' },
}

export function RoleSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { persona, selectRole, setUserId, exit } = useDemo()
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const { config, previewBrand } = useTenant()

  const choose = (role: Role) => {
    selectRole(role)
    onOpenChange(false)
    navigate(ROLE_HOME[role])
    toast(`Modalità ${ROLE_LABEL[role]} attiva`, 'info')
  }

  const people =
    persona?.role === 'allieva'
      ? db.students.map((s) => ({ id: s.id, name: fullName(s) }))
      : persona?.role === 'insegnante'
        ? db.teachers.map((t) => ({ id: t.id, name: fullName(t) }))
        : []

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setConfirmReset(false) }} title="Modalità demo" description="Cambia ruolo per esplorare l’app da un altro punto di vista. Nessun accesso reale: i dati sono simulati.">
      <div className="grid gap-2.5">
        {(Object.keys(ROLE_META) as Role[]).map((role) => {
          const Icon = ROLE_META[role].icon
          const active = persona?.role === role
          return (
            <button
              key={role}
              type="button"
              onClick={() => choose(role)}
              className={cn(
                'flex items-center gap-3.5 rounded-3xl border p-3.5 text-left transition',
                active ? 'border-rosa bg-cipria-50' : 'border-line hover:border-rosa/60 hover:bg-cipria-50',
              )}
            >
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', active ? 'bg-rosa-intenso text-white' : 'bg-cipria text-rosa-scuro')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold text-ink">{ROLE_LABEL[role]}</span>
                <span className="block text-sm text-ink-muted">{ROLE_META[role].description}</span>
              </span>
              {active && <Check className="size-5 text-rosa-intenso" />}
            </button>
          )
        })}
      </div>

      {people.length > 0 && persona?.userId && (
        <div className="mt-5">
          <Label htmlFor="persona-select">{persona.role === 'allieva' ? 'Visualizza come allieva' : 'Visualizza come insegnante'}</Label>
          <Select
            id="persona-select"
            value={persona.userId}
            onChange={(e) => {
              setUserId(e.target.value)
              toast('Profilo demo aggiornato', 'info')
            }}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {DATA_SOURCE === 'demo' && (
        <div className="mt-5">
          <Label htmlFor="brand-select">Anteprima marchio (white-label)</Label>
          <Select
            id="brand-select"
            value={config.slug}
            onChange={(e) => {
              previewBrand(e.target.value)
              toast('Marchio applicato: stessi dati, identità diversa', 'info')
            }}
          >
            {DEMO_TENANTS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.appName}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-ink-muted">Mostra come la stessa piattaforma appare con il marchio di un’altra palestra.</p>
        </div>
      )}

      <div className="mt-6 grid gap-2 border-t border-line pt-5 sm:grid-cols-2">
        {confirmReset ? (
          <div className="rounded-3xl bg-danger-soft p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-danger">Ripristinare tutti i dati dimostrativi?</p>
            <p className="mt-1 text-sm text-ink-soft">Presenze, progressi, figure ed eventi modificati torneranno allo stato iniziale.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Annulla</Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await repo.reset()
                  setConfirmReset(false)
                  toast('Dati demo ripristinati')
                }}
              >
                Ripristina
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Ripristina dati demo
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            exit()
            onOpenChange(false)
            navigate('/')
          }}
        >
          <LogOut /> Schermata iniziale
        </Button>
      </div>
    </Dialog>
  )
}

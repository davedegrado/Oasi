import { useState } from 'react'
import { Pencil, Target } from 'lucide-react'
import type { Student } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ListEditor } from '@/components/common/ListEditor'
import { useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'

export function GoalsCard({ student, editable }: { student: Student; editable?: boolean }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [goals, setGoals] = useState(student.goals)

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Target className="size-4 text-rosa-intenso" /> Obiettivi personali
          </h2>
          {editable && !editing && (
            <Button size="sm" variant="ghost" onClick={() => { setGoals(student.goals); setEditing(true) }}>
              <Pencil /> Modifica
            </Button>
          )}
        </div>
        {editing ? (
          <div>
            <ListEditor id="goals" items={goals} onChange={setGoals} placeholder="Nuovo obiettivo…" />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await repo.updateStudent(student.id, { goals })
                  setEditing(false)
                  toast('Obiettivi aggiornati')
                }}
              >
                Salva
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {student.goals.map((g, i) => (
              <li key={g} className="flex gap-3 text-[15px] text-ink-soft">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cipria font-display text-xs font-bold text-rosa-scuro">{i + 1}</span>
                {g}
              </li>
            ))}
            {student.goals.length === 0 && <li className="text-sm text-ink-muted">Nessun obiettivo impostato.</li>}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/ui/segmented'
import { WeekCalendar } from '@/components/calendar/WeekCalendar'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { lessonsForStudent, sortLessons } from '@/services/selectors'

export function StudentCalendar() {
  const db = useDatabase()
  const student = useCurrentStudent()
  const [scope, setScope] = useState<'mie' | 'tutte'>('mie')
  const lessons = scope === 'mie' ? lessonsForStudent(db, student.id) : sortLessons(db.lessons)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Calendario"
        title="Le tue lezioni"
        description="Orari, insegnanti e variazioni sempre aggiornati."
        actions={
          <Segmented
            value={scope}
            onChange={setScope}
            size="sm"
            options={[
              { value: 'mie', label: 'Le mie classi' },
              { value: 'tutte', label: 'Tutta la palestra' },
            ]}
          />
        }
      />
      <WeekCalendar lessons={lessons} />
    </div>
  )
}

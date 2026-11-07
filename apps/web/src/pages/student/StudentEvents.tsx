import { useState } from 'react'
import type { EventType } from '@/types'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/common/EmptyState'
import { EventCard } from '@/components/events/EventCard'
import { EventSignupButton } from '@/components/events/EventSignupButton'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { pastEvents, upcomingEvents } from '@/services/selectors'
import { EVENT_TYPE_LABEL } from '@/lib/labels'

type Filter = 'tutti' | 'miei' | EventType

/** Sezione Eventi: workshop, stage, gare, saggi e spettacoli */
export function StudentEvents() {
  const db = useDatabase()
  const student = useCurrentStudent()
  const [filter, setFilter] = useState<Filter>('tutti')
  const upcoming = upcomingEvents(db)
  const shown = upcoming.filter((e) => (filter === 'tutti' ? true : filter === 'miei' ? e.participantIds.includes(student.id) : e.type === filter))
  const types = (Object.keys(EVENT_TYPE_LABEL) as EventType[]).filter((t) => upcoming.some((e) => e.type === t))
  const past = pastEvents(db).filter((e) => e.participantIds.includes(student.id))

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader eyebrow="Eventi" title="Workshop, gare e saggi" description="Aderisci entro la scadenza: i posti sono limitati." className="mb-0" />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        size="sm"
        options={[
          { value: 'tutti', label: 'Tutti', count: upcoming.length },
          { value: 'miei', label: 'I miei', count: upcoming.filter((e) => e.participantIds.includes(student.id)).length },
          ...types.map((t) => ({ value: t as Filter, label: EVENT_TYPE_LABEL[t] })),
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title="Nessun evento" description="Non ci sono eventi per questo filtro." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <EventCard key={e.id} event={e} footer={<EventSignupButton event={e} studentId={student.id} />} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <section>
          <SectionTitle title="A cui hai partecipato" />
          <div className="grid gap-3 md:grid-cols-2">
            {past.map((e) => (
              <EventCard key={e.id} event={e} variant="horizontal" className="opacity-80" />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

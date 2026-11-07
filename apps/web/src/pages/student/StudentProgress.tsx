import { BookOpen, CircleDashed, Sparkles, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { FiguresByStatus, ProgressOverview } from '@/components/students/ProgressOverview'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { progressSummary } from '@/services/selectors'

export function StudentProgress() {
  const db = useDatabase()
  const student = useCurrentStudent()
  const { counts, total, completion } = progressSummary(db, student.id)

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader eyebrow="Progressi" title="Il tuo percorso" description="Ogni figura conquistata è un piccolo volo in più. Aggiorna lo stato dalle schede dell’archivio." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Riuscite" value={counts.riuscita} hint={`su ${total} figure`} icon={<Trophy />} tone="ok" />
        <StatCard label="In progetto" value={counts.in_progetto} hint="in lavorazione o obiettivo" icon={<Sparkles />} tone="tessuti" />
        <StatCard label="Da imparare" value={counts.da_imparare} hint="ancora da scoprire" icon={<CircleDashed />} tone="neutral" />
        <StatCard label="Completamento" value={`${completion}%`} hint="dell'archivio" icon={<BookOpen />} tone="warn" />
      </div>
      <ProgressOverview studentId={student.id} />
      <div className="grid gap-5 md:grid-cols-2">
        <FiguresByStatus studentId={student.id} status="in_progetto" linkBase="/allieva/figure" empty="Segna come “In progetto” le figure su cui lavori o che sogni di imparare." />
        <FiguresByStatus studentId={student.id} status="riuscita" linkBase="/allieva/figure" />
      </div>
    </div>
  )
}

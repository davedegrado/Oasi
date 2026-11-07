import { PageHeader } from '@/components/common/PageHeader'
import { FigureArchive } from '@/components/figures/FigureArchive'
import { useCurrentStudent } from '@/hooks/useDemo'
import { useDatabase } from '@/hooks/useDatabase'
import { progressSummary } from '@/services/selectors'

export function StudentFigures() {
  const student = useCurrentStudent()
  const db = useDatabase()
  const { counts } = progressSummary(db, student.id)
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Archivio figure"
        title="Il tuo catalogo"
        description={`Ogni figura con la sua sequenza fotografica. Hai ${counts.riuscita} figure riuscite e ${counts.in_progetto} in progetto.`}
      />
      <FigureArchive basePath="/allieva/figure" studentId={student.id} />
    </div>
  )
}

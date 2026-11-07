import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { FigureDetailView } from '@/components/figures/FigureDetailView'
import { ProgressPanel } from '@/components/figures/ProgressPanel'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { findFigure } from '@/services/selectors'

export function StudentFigureDetail() {
  const { id } = useParams()
  const db = useDatabase()
  const student = useCurrentStudent()
  const figure = findFigure(db, id)
  if (!figure) return <EmptyState title="Figura non trovata" action={<Link className="font-semibold text-rosa-intenso" to="/allieva/figure">Torna all’archivio</Link>} />
  return <FigureDetailView figure={figure} backTo="/allieva/figure" linkBase="/allieva/figure" panel={<ProgressPanel key={`${student.id}-${figure.id}`} studentId={student.id} figureId={figure.id} />} />
}

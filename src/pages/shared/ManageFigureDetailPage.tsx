import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { FigureDetailView } from '@/components/figures/FigureDetailView'
import { FigureClassStats } from '@/components/figures/FigureClassStats'
import { buttonVariants } from '@/components/ui/button-variants'
import { useDatabase } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { findFigure, studentsOfTeacher } from '@/services/selectors'

export function ManageFigureDetailPage({ basePath, studentBase }: { basePath: string; studentBase: string }) {
  const { id } = useParams()
  const db = useDatabase()
  const { persona } = useDemo()
  const figure = findFigure(db, id)
  if (!figure) return <EmptyState title="Figura non trovata" action={<Link to={basePath}>Torna all’archivio</Link>} />
  const isTeacher = persona?.role === 'insegnante'
  const students = (isTeacher && persona?.userId ? studentsOfTeacher(db, persona.userId) : db.students).filter((s) => s.membership.status !== 'sospesa')

  return (
    <FigureDetailView
      figure={figure}
      backTo={basePath}
      linkBase={basePath}
      actions={
        <Link to={`${basePath}/${figure.id}/modifica`} className={buttonVariants({ size: 'sm', variant: 'dark' })}>
          <Pencil /> Modifica
        </Link>
      }
      panel={<FigureClassStats figureId={figure.id} students={students} studentLinkBase={studentBase} title={isTeacher ? 'Le tue allieve su questa figura' : 'Tutte le allieve su questa figura'} />}
    />
  )
}

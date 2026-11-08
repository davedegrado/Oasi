import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { BackButton } from '@/components/common/BackButton'
import { FigureArchive } from '@/components/figures/FigureArchive'
import { buttonVariants } from '@/components/ui/button-variants'
import { useDatabase } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { studentsOfTeacher } from '@/services/selectors'

/** Archivio in modalità gestione (insegnante e amministratore) */
export function ManageFiguresPage({ basePath }: { basePath: string }) {
  const db = useDatabase()
  const { persona } = useDemo()
  const isTeacher = persona?.role === 'insegnante'
  const students = isTeacher && persona?.userId ? studentsOfTeacher(db, persona.userId) : db.students
  return (
    <div className="animate-fade-up">
      {!isTeacher && <BackButton fallback="/admin/gestione?sezione=didattica" />}
      <PageHeader
        eyebrow={isTeacher ? 'Figure' : 'Gestione · Didattica'}
        title="Archivio figure"
        description={`${db.figures.length} figure in archivio. Inserisci nuove figure, modifica descrizioni e sequenze fotografiche.`}
        actions={
          <Link to={`${basePath}/nuova`} className={buttonVariants()}>
            <Plus /> Nuova figura
          </Link>
        }
      />
      <FigureArchive basePath={basePath} studentIdsForStats={students.map((s) => s.id)} />
    </div>
  )
}

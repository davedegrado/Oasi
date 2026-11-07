import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
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
      <PageHeader
        eyebrow={isTeacher ? 'Figure' : 'Archivio figure'}
        title={isTeacher ? 'Archivio figure' : 'Gestione archivio'}
        description={`${db.figures.length} figure tra cerchio e tessuti. Inserisci nuove figure, modifica descrizioni e sequenze fotografiche.`}
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

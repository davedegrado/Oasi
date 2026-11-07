import { Link, useParams } from 'react-router-dom'
import { BackButton } from '@/components/common/BackButton'
import { EmptyState } from '@/components/common/EmptyState'
import { StudentHeader } from '@/components/students/StudentHeader'
import { FiguresByStatus, ProgressOverview } from '@/components/students/ProgressOverview'
import { AttendanceHistory } from '@/components/students/AttendanceHistory'
import { GoalsCard } from '@/components/students/GoalsCard'
import { AdminInfoCard } from '@/components/students/AdminInfoCard'
import { useDatabase } from '@/hooks/useDatabase'
import { findStudent } from '@/services/selectors'

/** Percorso di un'allieva visto da insegnante o amministrazione */
export function StudentJourneyPage({ backTo, backLabel, figureBase, showAdmin }: { backTo: string; backLabel: string; figureBase: string; showAdmin?: boolean }) {
  const { id } = useParams()
  const db = useDatabase()
  const student = findStudent(db, id)
  if (!student) return <EmptyState title="Allieva non trovata" action={<Link to={backTo}>{backLabel}</Link>} />

  return (
    <div className="animate-fade-up space-y-5">
      <BackButton fallback={backTo} className="mb-0" />
      <StudentHeader student={student} />
      <ProgressOverview studentId={student.id} />
      <div className="grid gap-5 md:grid-cols-2">
        <FiguresByStatus studentId={student.id} status="in_progetto" linkBase={figureBase} />
        <FiguresByStatus studentId={student.id} status="da_imparare" linkBase={figureBase} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <GoalsCard student={student} />
          <FiguresByStatus studentId={student.id} status="riuscita" linkBase={figureBase} />
          {showAdmin && <AdminInfoCard student={student} />}
        </div>
        <AttendanceHistory studentId={student.id} />
      </div>
    </div>
  )
}

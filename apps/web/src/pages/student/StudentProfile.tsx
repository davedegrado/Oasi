import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Ring } from '@/components/common/Charts'
import { StudentHeader } from '@/components/students/StudentHeader'
import { GoalsCard } from '@/components/students/GoalsCard'
import { AttendanceHistory } from '@/components/students/AttendanceHistory'
import { AdminInfoCard } from '@/components/students/AdminInfoCard'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { progressSummary } from '@/services/selectors'

export function StudentProfile() {
  const db = useDatabase()
  const student = useCurrentStudent()
  const summary = progressSummary(db, student.id)

  return (
    <div className="animate-fade-up space-y-5">
      <StudentHeader student={student} classesLink="/allieva/classi" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <GoalsCard key={student.id} student={student} editable />
          <Card>
            <CardContent className="flex items-center gap-4">
              <Ring value={summary.completion} size={72} thickness={8}>
                <span className="font-display text-base font-extrabold">{summary.completion}%</span>
              </Ring>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold">Progressi</h2>
                <p className="text-sm text-ink-muted">
                  {summary.counts.riuscita} riuscite · {summary.counts.in_progetto} in progetto · {summary.counts.da_imparare} da imparare
                </p>
              </div>
              <Link to="/allieva/progressi" className="grid size-10 shrink-0 place-items-center rounded-full bg-cipria text-rosa-scuro" aria-label="Vai ai progressi">
                <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
          <AdminInfoCard student={student} />
        </div>
        <AttendanceHistory studentId={student.id} />
      </div>
    </div>
  )
}

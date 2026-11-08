import { Link } from 'react-router-dom'
import { ArrowRight, FileText } from 'lucide-react'
import { DocumentStateBadge } from '@/components/documents/DocumentBits'
import { documentSummary, memberDocuments } from '@/services/documents'
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
  const docRows = memberDocuments(db, student.id)
  const docs = documentSummary(docRows)

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
          <Card>
            <CardContent>
              <Link to="/allieva/documenti" className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cipria text-rosa-intenso">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold">Documenti</h2>
                  <p className="text-sm text-ink-muted">
                    {docs.complete && !docs.toFix.length ? 'Documentazione in regola' : `${docs.missing.length} mancanti · ${docs.toFix.length} da correggere · ${docs.pending.length} in verifica`}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-rosa-scuro" />
              </Link>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {docRows.filter((r) => r.type.required).map((r) => (
                  <span key={r.type.id} className="flex items-center gap-1.5 rounded-full bg-cipria-50 py-0.5 pr-1 pl-2.5 text-xs text-ink-soft">
                    {r.type.name} <DocumentStateBadge state={r.state} />
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
          <AdminInfoCard student={student} />
        </div>
        <AttendanceHistory studentId={student.id} />
      </div>
    </div>
  )
}

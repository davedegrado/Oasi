import { BackButton } from '@/components/common/BackButton'
import { PageHeader } from '@/components/common/PageHeader'
import { MemberDocumentsPanel } from '@/components/documents/MemberDocumentsPanel'
import { SharedDocumentsCard } from '@/components/documents/SharedDocumentsCard'
import { useCurrentStudent } from '@/hooks/useDemo'

export function StudentDocuments() {
  const student = useCurrentStudent()
  return (
    <div className="animate-fade-up space-y-5">
      <BackButton fallback="/allieva/profilo" />
      <PageHeader eyebrow="Profilo" title="I miei documenti" description="Carica i documenti richiesti (i moduli già firmati a mano) e controlla scadenze e verifiche." />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <MemberDocumentsPanel memberId={student.id} mode="allieva" />
        <SharedDocumentsCard audience="allieve" />
      </div>
    </div>
  )
}

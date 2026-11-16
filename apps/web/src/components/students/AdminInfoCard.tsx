import { CreditCard, FileHeart, IdCard, Mail, Phone, Wallet } from 'lucide-react'
import type { Student } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { MembershipBadge } from '@/components/common/badges'
import { formatDate, todayISO, addDays } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { isCompetitive, isCompetitiveClass } from '@/services/selectors'
import { memberDocuments } from '@/services/documents'

/** Informazioni amministrative dimostrative (tessera, certificato, quota) */
export function AdminInfoCard({ student, editable = false }: { student: Student; editable?: boolean }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const byClass = db.classes.some((c) => isCompetitiveClass(c) && c.studentIds.includes(student.id))
  const competitive = isCompetitive(db, student.id)
  const certificate = memberDocuments(db, student.id).find((r) => r.type.requiredForCompetitive)
  const certificateOk = certificate?.state === 'approvato' || certificate?.state === 'in_scadenza'
  const m = student.membership
  const today = todayISO()
  const certMissing = !m.medicalCertificateExpiresAt
  const certExpired = !certMissing && m.medicalCertificateExpiresAt < today
  const certSoon = !certExpired && m.medicalCertificateExpiresAt < addDays(today, 30)
  const feeExpired = m.feePaidUntil < today

  const rows = [
    { icon: IdCard, label: 'Tessera associativa', value: m.cardNumber },
    { icon: CreditCard, label: 'Validità tessera', value: `fino al ${formatDate(m.expiresAt, { year: true })}` },
    {
      icon: FileHeart,
      label: 'Certificato medico',
      value: certMissing ? 'da consegnare' : `${certExpired ? 'scaduto il' : 'valido fino al'} ${formatDate(m.medicalCertificateExpiresAt, { year: true })}`,
      tone: certMissing || certExpired ? 'text-danger' : certSoon ? 'text-warn' : undefined,
    },
    { icon: Wallet, label: 'Quota', value: `${m.feePlan} · ${feeExpired ? 'da rinnovare' : `saldata fino al ${formatDate(m.feePaidUntil)}`}`, tone: feeExpired ? 'text-danger' : undefined },
    { icon: Mail, label: 'Email', value: student.email },
    { icon: Phone, label: 'Telefono', value: student.phone },
  ]

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">Area amministrativa</h2>
          <MembershipBadge status={m.status} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3 rounded-2xl bg-cipria-50 p-3">
              <r.icon className="mt-0.5 size-4 shrink-0 text-rosa-intenso" />
              <div className="min-w-0">
                <dt className="text-xs text-ink-muted">{r.label}</dt>
                <dd className={cn('text-sm font-semibold break-words text-ink', r.tone)}>{r.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-2xl bg-cipria-50 p-3">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-rosa-intenso)]"
              checked={competitive}
              disabled={byClass || !editable}
              onChange={async (e) => {
                await repo.updateStudent(student.id, { competitive: e.target.checked })
                toast(e.target.checked ? 'Impostata come agonista' : 'Impostata come non agonista')
              }}
            />
            Agonista
          </label>
          <p className={cn('mt-1.5 text-xs', competitive && !certificateOk ? 'font-semibold text-danger' : 'text-ink-muted')}>
            {byClass
              ? 'È iscritta a una classe agonistica o preagonistica. '
              : ''}
            {!competitive
              ? 'Il certificato agonistico non è richiesto ai non agonisti.'
              : certificateOk
                ? 'Certificato agonistico approvato e valido.'
                : 'Certificato agonistico obbligatorio: mancante, scaduto o non ancora approvato.'}
          </p>
        </div>
        <p className="mt-4 text-xs text-ink-muted">Dati amministrativi dimostrativi: nessun pagamento reale è gestito dall’app.</p>
      </CardContent>
    </Card>
  )
}

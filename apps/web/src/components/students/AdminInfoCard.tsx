import { CreditCard, FileHeart, IdCard, Mail, Phone, Wallet } from 'lucide-react'
import type { Student } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { MembershipBadge } from '@/components/common/badges'
import { formatDate, todayISO, addDays } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Informazioni amministrative dimostrative (tessera, certificato, quota) */
export function AdminInfoCard({ student }: { student: Student }) {
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
        <p className="mt-4 text-xs text-ink-muted">Dati amministrativi dimostrativi: nessun pagamento reale è gestito dall’app.</p>
      </CardContent>
    </Card>
  )
}

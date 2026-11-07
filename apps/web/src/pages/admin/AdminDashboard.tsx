import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, GraduationCap, Percent, Sparkles, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { StatCard } from '@/components/common/StatCard'
import { SectionTitle } from '@/components/common/PageHeader'
import { Donut, Legend, MiniBars } from '@/components/common/Charts'
import { MembershipBadge } from '@/components/common/badges'
import { STATUS_COLOR } from '@/lib/statusStyle'
import { EventCard } from '@/components/events/EventCard'
import { useDatabase } from '@/hooks/useDatabase'
import { useTenant } from '@/hooks/useTenant'
import { classOccupancy, figureStatus, recentAttendance, sortLessons, upcomingEvents } from '@/services/selectors'
import { formatDate, formatDateShort, todayISO } from '@/lib/dates'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { fullName, percent } from '@/lib/utils'

export function AdminDashboard() {
  const db = useDatabase()
  const { config } = useTenant()
  const activeStudents = db.students.filter((s) => s.membership.status !== 'sospesa')
  const recent = recentAttendance(db, sortLessons(db.lessons), 8).reverse()
  const recentPresent = recent.reduce((s, r) => s + r.present, 0)
  const recentTotal = recent.reduce((s, r) => s + r.total, 0)

  const statusTotals = STATUS_ORDER.map((st) => ({
    label: STATUS_LABEL[st],
    color: STATUS_COLOR[st],
    value: activeStudents.reduce((sum, s) => sum + db.figures.filter((f) => figureStatus(db, s.id, f.id) === st).length, 0),
  })).reverse()
  const avgCompletion = percent(statusTotals.find((s) => s.label === STATUS_LABEL.riuscita)?.value ?? 0, activeStudents.length * db.figures.length)

  const topFigures = db.figures
    .map((f) => ({ figure: f, working: activeStudents.filter((s) => figureStatus(db, s.id, f.id) === 'in_progetto').length }))
    .sort((a, b) => b.working - a.working)
    .slice(0, 4)

  const alerts = db.students.filter((s) => s.membership.status !== 'attiva' || s.membership.medicalCertificateExpiresAt < todayISO())
  const events = upcomingEvents(db).slice(0, 3)

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <p className="text-sm font-medium text-ink-muted capitalize">{formatDate(todayISO(), { weekday: true })}</p>
        <h1 className="mt-1 text-[30px] leading-tight font-extrabold sm:text-4xl">
          Panoramica <span className="text-rosa-intenso">{config.shortName}</span>
        </h1>
        <p className="mt-1 text-ink-soft">Stagione {db.association.season} · {db.association.affiliation}</p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Allieve" value={db.students.length} hint={`${activeStudents.length} attive`} icon={<Users />} />
        <StatCard label="Insegnanti" value={db.teachers.length} hint="danza aerea" icon={<Sparkles />} tone="tessuti" />
        <StatCard label="Corsi attivi" value={db.classes.length} hint={`${db.classes.reduce((s, c) => s + classOccupancy(c).free, 0)} posti liberi`} icon={<GraduationCap />} tone="ok" />
        <StatCard label="Presenze recenti" value={`${percent(recentPresent, recentTotal)}%`} hint="ultime 8 lezioni" icon={<Percent />} tone="warn" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="text-base font-bold">Presenze ultime lezioni</h2>
            <p className="text-sm text-ink-muted">Allieve presenti per lezione</p>
            <MiniBars className="mt-5" data={recent.map((r) => ({ label: `${formatDateShort(r.lesson.date)}`, value: r.present }))} max={Math.max(...recent.map((r) => r.total), 1)} />
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              {recent.slice(-4).map((r) => (
                <span key={r.lesson.id}>
                  {formatDateShort(r.lesson.date)}: {r.cls?.name} ({r.present}/{r.total})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h2 className="text-base font-bold">Panoramica progressi</h2>
            <p className="text-sm text-ink-muted">Stato delle figure di tutte le allieve attive</p>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
              <Donut segments={statusTotals} size={150} thickness={16}>
                <div>
                  <p className="font-display text-3xl font-extrabold">{avgCompletion}%</p>
                  <p className="text-[11px] text-ink-muted">riuscite</p>
                </div>
              </Donut>
              <div className="w-full flex-1">
                <Legend items={statusTotals.map((s) => ({ ...s, value: s.value }))} />
                <p className="mt-4 mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">Più lavorate ora</p>
                <ul className="space-y-1.5">
                  {topFigures.map(({ figure, working }) => (
                    <li key={figure.id} className="flex items-center justify-between text-sm">
                      <Link to={`/admin/figure/${figure.id}`} className="truncate font-semibold hover:text-rosa-intenso">
                        {figure.name}
                      </Link>
                      <span className="text-ink-muted">{working} allieve</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <SectionTitle
            title="Prossimi eventi"
            action={
              <Link to="/admin/eventi" className="inline-flex items-center gap-1 text-sm font-semibold text-rosa-intenso">
                Gestisci <ArrowRight className="size-4" />
              </Link>
            }
          />
          <div className="space-y-3">
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                variant="horizontal"
                footer={
                  <div className="shrink-0 text-center">
                    <p className="font-display text-xl font-extrabold">{e.participantIds.length}</p>
                    <p className="text-[10px] text-ink-muted">adesioni</p>
                  </div>
                }
              />
            ))}
          </div>
        </section>
        <section>
          <SectionTitle title="Iscrizioni da verificare" />
          <Card>
            <CardContent className="p-3 sm:p-4">
              {alerts.length === 0 && <p className="p-2 text-sm text-ink-muted">Tutto in ordine ✨</p>}
              <ul className="divide-y divide-line/70">
                {alerts.map((s) => {
                  const certExpired = s.membership.medicalCertificateExpiresAt < todayISO()
                  return (
                    <li key={s.id}>
                      <Link to={`/admin/utenti/${s.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                        <Avatar person={s} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{fullName(s)}</p>
                          {certExpired && (
                            <p className="flex items-center gap-1 text-xs text-danger">
                              <AlertTriangle className="size-3" /> Certificato scaduto
                            </p>
                          )}
                        </div>
                        <MembershipBadge status={s.membership.status} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

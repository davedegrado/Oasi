import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck, ClipboardCheck, Megaphone, Percent, Plus, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { AvatarStack } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button-variants'
import { StatCard } from '@/components/common/StatCard'
import { SectionTitle } from '@/components/common/PageHeader'
import { DisciplineBadge, LevelBadge } from '@/components/common/badges'
import { LessonCard } from '@/components/lessons/LessonCard'
import { RequestsPanel } from '@/components/requests/RequestsPanel'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentTeacher } from '@/hooks/useDemo'
import {
  expectedAttendance,
  isLessonPast,
  lessonsForTeacher,
  studentsOfTeacher,
  studentsWorkingOnFigures,
  upcomingLessons,
} from '@/services/selectors'
import { addDays, formatDate, greeting, relativeDayLabel, startOfWeek, todayISO } from '@/lib/dates'
import { percent } from '@/lib/utils'

export function TeacherDashboard() {
  const db = useDatabase()
  const teacher = useCurrentTeacher()
  const lessons = lessonsForTeacher(db, teacher.id)
  const students = studentsOfTeacher(db, teacher.id)
  const upcoming = upcomingLessons(lessons).slice(0, 4)
  const monday = startOfWeek(todayISO())
  const thisWeek = lessons.filter((l) => l.date >= monday && l.date <= addDays(monday, 6) && l.status !== 'annullata')
  const past = lessons.filter((l) => isLessonPast(l) && l.status !== 'annullata')
  const marks = past.flatMap((l) => Object.values(l.attendance))
  const avgRate = percent(marks.filter((m) => m === 'presente').length, marks.length)
  const toFill = past.filter((l) => Object.keys(l.attendance).length === 0)
  const expectedNext = upcoming.find((l) => l.status !== 'annullata')
  const recentFigures = [...db.figures].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const working = studentsWorkingOnFigures(db, students).slice(0, 5)
  const notices = db.announcements.filter((a) => a.audience !== 'allieve').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2)

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <p className="text-sm font-medium text-ink-muted first-letter:uppercase">{formatDate(todayISO(), { weekday: true })}</p>
        <h1 className="mt-1 text-[30px] leading-tight font-extrabold sm:text-4xl">
          {greeting()}, <span className="text-rosa-intenso">{teacher.firstName}</span>
        </h1>
        <p className="mt-1 text-ink-soft">Ecco le tue classi e il lavoro delle tue allieve.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Allieve" value={students.length} hint={`in ${db.classes.filter((c) => c.teacherId === teacher.id).length} classi`} icon={<Users />} />
        <StatCard label="Lezioni settimana" value={thisWeek.length} hint="programmate" icon={<CalendarCheck />} tone="tessuti" />
        <StatCard label="Presenze previste" value={expectedNext ? expectedAttendance(db, expectedNext) : 0} hint={expectedNext ? `prossima: ${relativeDayLabel(expectedNext.date).toLowerCase()}` : '—'} icon={<ClipboardCheck />} tone="ok" />
        <StatCard label="Media presenze" value={`${avgRate}%`} hint="ultime 5 settimane" icon={<Percent />} tone="warn" />
      </div>

      <RequestsPanel teacherId={teacher.id} decidedBy={teacher.id} hideWhenEmpty />

      {toFill.length > 0 && (
        <Link to={`/insegnante/lezioni/${toFill[toFill.length - 1].id}`} className="flex items-center gap-3 rounded-3xl bg-warn-soft p-4 transition hover:brightness-[0.98]">
          <ClipboardCheck className="size-5 shrink-0 text-warn" />
          <p className="flex-1 text-sm font-semibold text-ink">
            {toFill.length} {toFill.length === 1 ? 'lezione ha' : 'lezioni hanno'} il registro presenze da compilare
          </p>
          <ArrowRight className="size-4 text-warn" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionTitle
            title="Prossime lezioni"
            action={
              <Link to="/insegnante/lezioni" className="text-sm font-semibold text-rosa-intenso">
                Tutte
              </Link>
            }
          />
          <div className="space-y-3">
            {upcoming.map((l) => (
              <Link key={l.id} to={`/insegnante/lezioni/${l.id}`} className="block">
                <LessonCard
                  lesson={l}
                  showDate
                  className="hover:border-rosa/70"
                  aside={
                    l.status !== 'annullata' ? (
                      <div className="text-center">
                        <p className="font-display text-xl font-extrabold text-ink">{expectedAttendance(db, l)}</p>
                        <p className="text-[10px] text-ink-muted">previste</p>
                      </div>
                    ) : undefined
                  }
                />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Allieve al lavoro" />
          <Card>
            <CardContent className="space-y-1 p-3 sm:p-4">
              {working.length === 0 && <p className="p-3 text-sm text-ink-muted">Nessuna figura in progetto.</p>}
              {working.map(({ figure, students: list }) => (
                <Link key={figure.id} to={`/insegnante/figure/${figure.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-cipria-50">
                  <img src={figure.cover} alt="" className="size-12 rounded-xl object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{figure.name}</p>
                    <p className="truncate text-xs text-ink-muted">{list.map((s) => s.firstName).join(', ')}</p>
                  </div>
                  <AvatarStack people={list} max={3} />
                </Link>
              ))}
            </CardContent>
          </Card>
          {notices.map((n) => (
            <div key={n.id} className="mt-3 flex gap-3 rounded-3xl border border-line/70 bg-white p-4">
              <Megaphone className="mt-0.5 size-5 shrink-0 text-rosa-intenso" />
              <div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
              </div>
            </div>
          ))}
        </section>
      </div>

      <section>
        <SectionTitle
          title="Figure inserite di recente"
          action={
            <Link to="/insegnante/figure/nuova" className={buttonVariants({ size: 'sm', variant: 'soft' })}>
              <Plus /> Nuova figura
            </Link>
          }
        />
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
          {recentFigures.map((f) => (
            <Link key={f.id} to={`/insegnante/figure/${f.id}`} className="group relative w-36 shrink-0 snap-start overflow-hidden rounded-3xl shadow-soft lg:w-auto">
              <img src={f.cover} alt="" className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                <p className="font-display leading-tight font-bold">{f.name}</p>
                <p className="mt-0.5 text-[11px] text-white/80">{relativeDayLabel(f.createdAt)}</p>
              </div>
              <div className="absolute top-2 left-2 flex gap-1">
                <DisciplineBadge discipline={f.discipline} className="bg-white/90" />
              </div>
              <LevelBadge level={f.level} className="absolute top-2 right-2 hidden bg-white/90 sm:inline-flex" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

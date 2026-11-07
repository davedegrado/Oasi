import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, CalendarClock, ChevronRight, Clock, MapPin, Megaphone, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { HoopArc, SilkLines } from '@/components/common/Decor'
import { SectionTitle } from '@/components/common/PageHeader'
import { Ring } from '@/components/common/Charts'
import { DisciplineIcon, StatusBadge } from '@/components/common/badges'
import { EventCard } from '@/components/events/EventCard'
import { EventSignupButton } from '@/components/events/EventSignupButton'
import { DeclarationToggle } from '@/components/lessons/DeclarationToggle'
import { buttonVariants } from '@/components/ui/button-variants'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { findClass, findTeacher, lessonsForStudent, nextLesson, progressSummary, recentProgress, upcomingEvents } from '@/services/selectors'
import { formatDate, greeting, relativeDayLabel, todayISO } from '@/lib/dates'
import { DISCIPLINE_LABEL } from '@/lib/labels'
import { cn, fullName } from '@/lib/utils'

export function StudentHome() {
  const db = useDatabase()
  const student = useCurrentStudent()
  const lessons = lessonsForStudent(db, student.id)
  const next = nextLesson(lessons)
  const nextCls = findClass(db, next?.classId)
  const nextTeacher = findTeacher(db, nextCls?.teacherId)
  const changes = lessons.filter((l) => l.status !== 'regolare' && l.date >= todayISO()).slice(0, 2)
  const announcements = db.announcements.filter((a) => a.audience !== 'insegnanti').sort((a, b) => b.date.localeCompare(a.date))
  const events = upcomingEvents(db).slice(0, 3)
  const summary = progressSummary(db, student.id)
  const recent = recentProgress(db, student.id, 4)
  const working = db.figures.filter((f) => db.progress[student.id]?.[f.id]?.status === 'in_progetto')

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <p className="text-sm font-medium text-ink-muted first-letter:uppercase">{formatDate(todayISO(), { weekday: true })}</p>
        <h1 className="mt-1 text-[30px] leading-tight font-extrabold sm:text-4xl">
          {greeting()}, <span className="text-rosa-intenso">{student.firstName}</span>
        </h1>
        <p className="mt-1 text-ink-soft">Pronta a volare? Ecco cosa ti aspetta questa settimana.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
        {/* Prossima lezione */}
        {next && nextCls ? (
          <Link
            to="/allieva/calendario"
            className="group relative block animate-fade-up overflow-hidden rounded-4xl bg-gradient-to-br from-rosa-intenso via-rosa-intenso to-rosa p-6 text-white shadow-float sm:p-7"
          >
            <HoopArc className="absolute -top-10 -right-10 size-56 text-white/30" strokeWidth={2} />
            <SilkLines className="absolute inset-x-0 bottom-0 h-24 w-full text-white/25" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                <CalendarClock className="size-3.5" /> Prossima lezione · {relativeDayLabel(next.date)}
              </span>
              <div className="mt-5 flex items-end gap-4">
                <p className="font-display text-5xl leading-none font-extrabold sm:text-6xl">{next.startTime}</p>
                <p className="pb-1 text-sm text-white/85">fino alle {next.endTime}</p>
              </div>
              <p className="mt-4 font-display text-2xl font-bold">{nextCls.name}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90">
                <span className="inline-flex items-center gap-1.5">
                  <DisciplineIcon discipline={nextCls.discipline} className="size-4" /> {DISCIPLINE_LABEL[nextCls.discipline]}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" /> {nextCls.room}
                </span>
                <span className="first-letter:uppercase">{formatDate(next.date, { weekday: true })}</span>
              </div>
              {nextTeacher && (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-3xl bg-white/15 p-3 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <Avatar person={nextTeacher} size="sm" className="ring-2 ring-white/60" />
                    <div>
                      <p className="text-xs text-white/75">Insegnante</p>
                      <p className="font-semibold">{fullName(nextTeacher)}</p>
                    </div>
                  </div>
                  <ChevronRight className="size-5 transition group-hover:translate-x-1" />
                </div>
              )}
              {next.status === 'variata' && (
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-white/90 p-3 text-sm text-warn">
                  <Clock className="mt-0.5 size-4 shrink-0" /> Orario variato (era {next.originalStartTime}). {next.note}
                </p>
              )}
            </div>
          </Link>
        ) : (
          <Card>
            <CardContent>Nessuna lezione in programma.</CardContent>
          </Card>
        )}
          {next && (
            <Card>
              <CardContent className="p-4">
                <DeclarationToggle lesson={next} studentId={student.id} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Progresso sintetico */}
        <Card className="animate-fade-up [animation-delay:80ms]">
          <CardContent className="flex h-full flex-col">
            <div className="flex items-center gap-5">
              <Ring value={summary.completion} size={96} thickness={10}>
                <span className="font-display text-2xl font-extrabold">{summary.completion}%</span>
              </Ring>
              <div>
                <p className="text-sm text-ink-muted">Figure riuscite</p>
                <p className="font-display text-3xl font-extrabold">
                  {summary.counts.riuscita}
                  <span className="text-lg text-ink-muted">/{summary.total}</span>
                </p>
                <p className="text-sm text-ink-soft">{summary.counts.in_progetto} in progetto</p>
              </div>
            </div>
            <div className="mt-5 flex-1">
              <p className="mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">Ultimi progressi</p>
              <ul className="space-y-2.5">
                {recent.map(({ figure, progress }) => (
                  <li key={figure.id}>
                    <Link to={`/allieva/figure/${figure.id}`} className="flex items-center gap-3 rounded-2xl transition hover:bg-cipria-50">
                      <img src={figure.cover} alt="" className="size-11 rounded-xl object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{figure.name}</p>
                        <p className="text-xs text-ink-muted">{relativeDayLabel(progress.updatedAt)}</p>
                      </div>
                      <StatusBadge status={progress.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/allieva/progressi" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-rosa-intenso">
              Tutti i progressi <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Comunicazioni */}
      <section>
        <SectionTitle title="Comunicazioni" />
        <div className="grid gap-3 md:grid-cols-2">
          {changes.map((l) => {
            const cls = findClass(db, l.classId)
            return (
              <div key={l.id} className={cn('flex gap-3 rounded-3xl p-4', l.status === 'annullata' ? 'bg-danger-soft' : 'bg-warn-soft')}>
                <BellRing className={cn('mt-0.5 size-5 shrink-0', l.status === 'annullata' ? 'text-danger' : 'text-warn')} />
                <div>
                  <p className="font-semibold text-ink">
                    {cls?.name}: {l.status === 'annullata' ? 'lezione annullata' : `nuovo orario ${l.startTime}–${l.endTime}`}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <span className="first-letter:uppercase">{formatDate(l.date, { weekday: true })}</span>. {l.note}
                  </p>
                </div>
              </div>
            )
          })}
          {announcements.map((a) => (
            <div key={a.id} className={cn('flex gap-3 rounded-3xl border p-4', a.priority === 'importante' ? 'border-rosa/60 bg-cipria-50' : 'border-line/70 bg-white')}>
              <Megaphone className="mt-0.5 size-5 shrink-0 text-rosa-intenso" />
              <div>
                <p className="font-semibold text-ink">
                  {a.title}
                  {a.priority === 'importante' && <span className="ml-2 rounded-full bg-rosa-intenso px-2 py-0.5 align-middle text-[10px] font-bold text-white uppercase">Importante</span>}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{a.body}</p>
                <p className="mt-1.5 text-xs text-ink-muted">{relativeDayLabel(a.date)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Accesso rapido */}
      <section className="grid grid-cols-2 gap-3">
        <Link to="/allieva/classi" className="rounded-3xl border border-line/70 bg-white p-4 shadow-soft transition hover:border-rosa">
          <p className="font-display font-bold">Corsi</p>
          <p className="text-xs text-ink-muted">Iscriviti a una nuova classe</p>
        </Link>
        <Link to="/allieva/calendario" className="rounded-3xl border border-line/70 bg-white p-4 shadow-soft transition hover:border-rosa">
          <p className="font-display font-bold">Recuperi</p>
          <p className="text-xs text-ink-muted">Scegli una lezione in “Tutta la palestra”</p>
        </Link>
      </section>

      {/* Archivio figure */}
      <section>
        <Link to="/allieva/figure" className="group relative flex items-center gap-4 overflow-hidden rounded-4xl bg-ink p-5 text-white shadow-float sm:p-6">
          <div className="flex shrink-0 -space-x-10 sm:-space-x-6">
            {db.figures.slice(0, 3).map((f, i) => (
              <img key={f.id} src={f.cover} alt="" className="size-14 rounded-2xl border-2 border-ink object-cover sm:size-20" style={{ transform: `rotate(${(i - 1) * 6}deg)` }} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-rosa uppercase">
              <Sparkles className="size-3.5" /> Archivio figure
            </p>
            <p className="font-display text-xl font-bold">{db.figures.length} figure da esplorare</p>
            {working.length > 0 && <p className="mt-0.5 truncate text-sm text-white/70">Stai lavorando su: {working.map((f) => f.name).join(', ')}</p>}
          </div>
          <ArrowRight className="size-6 shrink-0 text-rosa transition group-hover:translate-x-1" />
          <HoopArc className="absolute -right-12 -bottom-16 size-44 text-white/10" />
        </Link>
      </section>

      {/* Eventi */}
      <section>
        <SectionTitle
          title="Eventi in arrivo"
          action={
            <Link to="/allieva/eventi" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Tutti gli eventi
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => {
            return <EventCard key={e.id} event={e} footer={<EventSignupButton event={e} studentId={student.id} />} />
          })}
        </div>
      </section>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Clock, Mail, MapPin, Phone, Sparkles, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { HoopArc } from '@/components/common/Decor'
import { DisciplineBadge, LevelBadge } from '@/components/common/badges'
import { StatCard } from '@/components/common/StatCard'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentTeacher } from '@/hooks/useDemo'
import { classOccupancy, studentsOfTeacher } from '@/services/selectors'
import { weekdayName } from '@/lib/dates'
import { fullName } from '@/lib/utils'

export function TeacherProfile() {
  const db = useDatabase()
  const teacher = useCurrentTeacher()
  const classes = db.classes.filter((c) => c.teacherId === teacher.id).sort((a, b) => a.weekday - b.weekday)
  const figures = db.figures.filter((f) => f.teacherId === teacher.id)
  const students = studentsOfTeacher(db, teacher.id)

  return (
    <div className="animate-fade-up space-y-5">
      <div className="relative overflow-hidden rounded-4xl bg-white p-6 shadow-soft sm:p-8">
        <HoopArc className="absolute -top-16 -right-16 size-60 text-rosa/30" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar person={teacher} size="xl" ring className="shadow-float" />
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              {teacher.disciplines.map((d) => (
                <DisciplineBadge key={d} discipline={d} />
              ))}
            </div>
            <h1 className="mt-2 text-3xl font-extrabold">{fullName(teacher)}</h1>
            <p className="text-sm text-ink-muted">Insegnante di danza aerea dal {teacher.since}</p>
          </div>
        </div>
        <p className="relative mt-5 max-w-2xl leading-relaxed text-ink-soft">{teacher.bio}</p>
        <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          <span className="flex items-center gap-2">
            <Mail className="size-4 text-rosa-intenso" /> {teacher.email}
          </span>
          <span className="flex items-center gap-2">
            <Phone className="size-4 text-rosa-intenso" /> {teacher.phone}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Classi" value={classes.length} />
        <StatCard label="Allieve" value={students.length} icon={<Users />} />
        <StatCard label="Figure" value={figures.length} icon={<Sparkles />} tone="tessuti" />
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-4 text-base font-bold">Le mie classi</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {classes.map((c) => {
              const occ = classOccupancy(c)
              return (
                <div key={c.id} className="rounded-3xl bg-cipria-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold">{c.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted capitalize">
                        <Clock className="size-3.5" /> {weekdayName(c.weekday)} {c.startTime}–{c.endTime}
                      </p>
                      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                        <MapPin className="size-3.5" /> {c.room}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <DisciplineBadge discipline={c.discipline} />
                      <LevelBadge level={c.level} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-ink-soft">
                    {occ.enrolled}/{c.capacity} iscritte · {occ.free} posti liberi
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-4 text-base font-bold">Figure che ho inserito</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {figures.map((f) => (
              <Link key={f.id} to={`/insegnante/figure/${f.id}`} className="group relative overflow-hidden rounded-2xl">
                <img src={f.cover} alt="" className="aspect-square w-full object-cover transition group-hover:scale-105" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/70 p-1.5 pt-4 text-[11px] font-semibold text-white">{f.name}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

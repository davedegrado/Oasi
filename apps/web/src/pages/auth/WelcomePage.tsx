import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EnterDialog } from '@/components/layout/EnterDialog'
import { ArrowRight, GraduationCap, MapPin, Shield, UserRound } from 'lucide-react'
import type { Role } from '@/types'
import { Logo } from '@/components/common/Logo'
import { HoopArc, SilkLines } from '@/components/common/Decor'
import { useDemo } from '@/hooks/useDemo'
import { useTenant } from '@/hooks/useTenant'
import { ROLE_HOME } from '@/context/demo-context'
import { cn } from '@/lib/utils'
import { photo } from '@/lib/assets'

const ROLES: { role: Role; title: string; subtitle: string; icon: typeof UserRound; accent: string }[] = [
  {
    role: 'allieva',
    title: 'Sono un’allieva',
    subtitle: 'Lezioni, archivio figure e i tuoi progressi',
    icon: UserRound,
    accent: 'bg-rosa-intenso text-white',
  },
  {
    role: 'insegnante',
    title: 'Sono un’insegnante',
    subtitle: 'Presenze, allieve e gestione delle figure',
    icon: GraduationCap,
    accent: 'bg-cipria text-rosa-scuro',
  },
  {
    role: 'admin',
    title: 'Amministrazione',
    subtitle: 'Utenti, classi, eventi e configurazione',
    icon: Shield,
    accent: 'bg-ink text-white',
  },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const { selectRole } = useDemo()
  const { config } = useTenant()
  const words = config.texts.welcomeTitle.split(' ')
  const lastWord = words.pop()

  const [choosing, setChoosing] = useState<Role | null>(null)
  const enter = (role: Role) => {
    if (role === 'admin') {
      selectRole(role)
      navigate(ROLE_HOME[role])
    } else setChoosing(role)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-cipria-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Immagine */}
      <div className="relative h-[52dvh] min-h-[340px] overflow-hidden lg:sticky lg:top-0 lg:h-dvh">
        <img
          src={config.coverUrl ?? photo('cerchio-12')}
          alt="Allieva in sospensione durante una lezione"
          className="absolute inset-0 size-full object-cover object-[50%_30%]"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/35 via-rosa-intenso/10 to-cipria-50 lg:bg-gradient-to-r lg:from-ink/30 lg:via-transparent lg:to-transparent" />
        <div className="absolute inset-0 bg-rosa/15 mix-blend-multiply" />
        <HoopArc className="absolute -right-24 -bottom-24 size-[26rem] animate-spin-slow text-white/50 lg:-right-32" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-8">
          <Logo light />
          <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-rosa-scuro backdrop-blur">Versione demo</span>
        </div>
        <p className="absolute bottom-8 left-8 hidden max-w-xs font-display text-lg leading-snug font-semibold text-white drop-shadow lg:block">
          “Sospese, ma con i piedi ben piantati nella nostra comunità.”
        </p>
      </div>

      {/* Contenuto */}
      <div className="relative -mt-16 px-4 pb-10 sm:px-8 lg:mt-0 lg:flex lg:items-center lg:px-14 xl:px-20">
        <SilkLines className="absolute -top-6 right-0 left-0 h-32 w-full text-rosa/50 lg:top-10" />
        <div className="relative mx-auto w-full max-w-md animate-fade-up rounded-[2rem] bg-white/95 p-6 shadow-float backdrop-blur sm:p-8 lg:max-w-lg lg:bg-transparent lg:p-0 lg:shadow-none">
          <p className="text-xs font-semibold tracking-[0.2em] text-rosa-intenso uppercase">{config.texts.welcomeEyebrow}</p>
          <h1 className="mt-2 text-[34px] leading-[1.05] font-extrabold text-ink sm:text-5xl">
            {words.join(' ')} <span className="text-rosa-intenso">{lastWord}</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{config.texts.welcomeBody}</p>

          <div className="mt-7 grid gap-3">
            <p className="text-sm font-semibold text-ink">Scegli come esplorare la demo</p>
            {ROLES.map(({ role, title, subtitle, icon: Icon, accent }, i) => (
              <button
                key={role}
                type="button"
                onClick={() => enter(role)}
                style={{ animationDelay: `${120 + i * 80}ms` }}
                className="group flex animate-fade-up items-center gap-4 rounded-3xl border border-line bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-rosa hover:shadow-float active:scale-[0.99]"
              >
                <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', accent)}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-bold text-ink">{title}</span>
                  <span className="block text-sm text-ink-muted">{subtitle}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-rosa transition group-hover:translate-x-1 group-hover:text-rosa-intenso" />
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-1.5 border-t border-line pt-5 text-xs text-ink-muted">
            {config.contacts.address && (
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-rosa-intenso" /> {config.contacts.address}
              </p>
            )}
            {config.contacts.legalForm && (
              <p>
                {config.contacts.legalForm}
                {config.contacts.affiliation ? ` · ${config.contacts.affiliation}` : ''}
              </p>
            )}
            <p className="mt-1">Demo dimostrativa: nessun accesso reale, dati simulati e salvati solo su questo dispositivo.</p>
          </div>
        </div>
      </div>
      {choosing && <EnterDialog role={choosing} onClose={() => setChoosing(null)} />}
    </div>
  )
}

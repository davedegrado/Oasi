import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FigureStep } from '@/types'
import { cn } from '@/lib/utils'

/**
 * Sequenza fotografica della figura: scorrimento con swipe (scroll-snap),
 * frecce, indicatori e miniature cliccabili.
 */
export function StepGallery({ steps, name }: { steps: FigureStep[]; name: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onScroll = () => {
      const i = Math.round(track.scrollLeft / track.clientWidth)
      setIndex(Math.max(0, Math.min(steps.length - 1, i)))
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => track.removeEventListener('scroll', onScroll)
  }, [steps.length])

  const go = (i: number) => {
    const track = trackRef.current
    if (!track) return
    const next = Math.max(0, Math.min(steps.length - 1, i))
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' })
    setIndex(next)
  }

  if (steps.length === 0) {
    return <div className="grid aspect-[4/5] place-items-center rounded-4xl bg-cipria-100 text-sm text-ink-muted">Nessuna immagine nella sequenza</div>
  }

  return (
    <div
      className="select-none"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1)
        if (e.key === 'ArrowLeft') go(index - 1)
      }}
    >
      <div className="relative overflow-hidden rounded-4xl bg-ink shadow-float">
        <div ref={trackRef} tabIndex={0} aria-label={`Sequenza fotografica di ${name}`} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none outline-none">
          {steps.map((step, i) => (
            <figure key={step.id} className="relative aspect-[4/5] w-full shrink-0 snap-center sm:aspect-[5/6]">
              <img src={step.image} alt={`${name} – passaggio ${i + 1}: ${step.caption}`} className="size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink/80 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-5 pb-12 text-white">
                <span className="mb-1.5 inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                  Passaggio {i + 1} di {steps.length}
                </span>
                <p className="font-display text-lg leading-snug font-semibold">{step.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        {steps.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Passaggio precedente"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-soft backdrop-blur transition hover:bg-white disabled:opacity-0"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Passaggio successivo"
              onClick={() => go(index + 1)}
              disabled={index === steps.length - 1}
              className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-soft backdrop-blur transition hover:bg-white disabled:opacity-0"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Vai al passaggio ${i + 1}`}
                  onClick={() => go(i)}
                  className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50')}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {steps.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-cipria-50 transition',
                i === index ? 'ring-rosa-intenso' : 'opacity-70 ring-transparent hover:opacity-100',
              )}
              aria-label={`Miniatura passaggio ${i + 1}`}
            >
              <img src={s.image} alt="" className="size-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-ink">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

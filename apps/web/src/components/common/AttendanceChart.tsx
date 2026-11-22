import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface AttendancePoint {
  key: string
  /** Etichetta breve sull'asse X (es. "12 nov") */
  label: string
  /** Dettaglio per tooltip e tabella (es. nome della classe) */
  detail: string
  present: number
  total: number
}

const H = 240
const PAD = { top: 20, right: 52, bottom: 30, left: 40 }
const TICKS = [0, 25, 50, 75, 100]

/**
 * Presenze delle ultime lezioni: grafico cartesiano a linea.
 * X = lezioni in ordine di data, Y = percentuale di presenti sulle attese (0–100%).
 * Linea 2px nel colore principale della palestra, area leggera, linea della media,
 * valore solo sull'ultimo punto; il resto è nel tooltip (mirino) e nella tabella.
 */
export function AttendanceChart({ points, className }: { points: AttendancePoint[]; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const [active, setActive] = useState<number | null>(null)
  const gradientId = useId()

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (points.length === 0) return <p className={cn('text-sm text-ink-muted', className)}>Nessuna presenza registrata nelle ultime lezioni.</p>

  const pct = (p: AttendancePoint) => (p.total ? Math.round((p.present / p.total) * 100) : 0)
  const values = points.map(pct)
  const average = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
  const plotW = width - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - (v / 100) * plotH
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(values.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const last = values.length - 1
  // Etichette dell'asse X: sempre la prima e l'ultima, le altre solo se distano almeno 64px
  const labelled = new Set<number>([0, last])
  let prev = x(0)
  for (let i = 1; i < last; i++) {
    if (x(i) - prev >= 64 && x(last) - x(i) >= 64) {
      labelled.add(i)
      prev = x(i)
    }
  }
  const showLabel = (i: number) => labelled.has(i)
  const a = active !== null ? points[active] : null

  // Il puntatore trova il punto più vicino sull'asse X
  const onMove = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect()
    if (!rect) return
    const px = clientX - rect.left
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setActive(best)
  }

  return (
    <div className={className}>
      <div
        ref={wrap}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={width} height={H} role="img" aria-label={`Presenze delle ultime ${points.length} lezioni: media ${average}%, ultima ${values[last]}%`} className="block max-w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-rosa-intenso)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--color-rosa-intenso)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Griglia orizzontale e asse Y (recessivi) */}
          {TICKS.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px]">
                {t}%
              </text>
            </g>
          ))}

          {/* Media del periodo */}
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(average)} y2={y(average)} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={PAD.left + plotW + 6} y={y(average)} dy="0.32em" className="fill-ink-soft text-[11px] font-semibold">
            media {average}%
          </text>

          {/* Area e linea */}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--color-rosa-intenso)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Mirino */}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-ink-muted)" strokeWidth={1} opacity={0.5} />}

          {/* Punti con anello del colore di fondo */}
          {values.map((v, i) => (
            <circle
              key={points[i].key}
              cx={x(i)}
              cy={y(v)}
              r={active === i ? 6 : 4}
              fill="var(--color-rosa-intenso)"
              stroke="white"
              strokeWidth={2}
              tabIndex={0}
              aria-label={`${points[i].label}, ${points[i].detail}: ${points[i].present} su ${points[i].total} presenti (${v}%)`}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none transition-[r] duration-150"
            />
          ))}

          {/* Valore solo sull'ultimo punto */}
          <text x={x(last)} y={y(values[last]) - 12} textAnchor="middle" className="fill-ink text-[12px] font-bold">
            {values[last]}%
          </text>

          {/* Asse X: date delle lezioni */}
          {points.map((p, i) =>
            showLabel(i) ? (
              <text key={p.key} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-ink-muted text-[11px]">
                {p.label}
              </text>
            ) : null,
          )}
        </svg>

        {/* Tooltip: valore prima, etichetta dopo */}
        {a && active !== null && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-56 rounded-2xl bg-white px-3 py-2 text-sm shadow-float ring-1 ring-line"
            style={{
              left: Math.min(Math.max(x(active) - 80, 0), width - 170),
              top: Math.max(y(values[active]) - 78, 0),
            }}
          >
            <p className="font-display text-lg leading-tight font-extrabold text-ink">
              {values[active]}% <span className="text-sm font-semibold text-ink-soft">· {a.present} su {a.total}</span>
            </p>
            <p className="text-xs text-ink-muted">
              {a.label} · {a.detail}
            </p>
          </div>
        )}
      </div>

      {/* Tabella: ogni valore raggiungibile anche senza passare sul grafico */}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">Vedi come tabella</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 font-semibold">Lezione</th>
              <th className="py-1 font-semibold">Classe</th>
              <th className="py-1 text-right font-semibold">Presenti</th>
              <th className="py-1 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {points.map((p, i) => (
              <tr key={p.key}>
                <td className="py-1">{p.label}</td>
                <td className="py-1">{p.detail}</td>
                <td className="py-1 text-right">
                  {p.present}/{p.total}
                </td>
                <td className="py-1 text-right font-semibold">{values[i]}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

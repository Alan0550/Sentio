import { formatPeriod } from './PeriodSelector'

export default function AspectEvolution({ comparison }) {
  if (!comparison) return (
    <p className="text-sm text-slate-400 text-center py-6">
      Seleccioná dos períodos para comparar la evolución de aspectos.
    </p>
  )

  const { period_a, period_b, aspects_comparison = [] } = comparison
  const relevant = aspects_comparison
    .filter(a => a.direction !== "stable")
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

  if (!relevant.length) return (
    <p className="text-sm text-slate-400 text-center py-6">
      Sin cambios significativos entre {formatPeriod(period_a)} y {formatPeriod(period_b)}.
    </p>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-400 pb-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-slate-300 inline-block" /> {formatPeriod(period_a)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-indigo-400 inline-block" /> {formatPeriod(period_b)}
        </span>
      </div>

      {relevant.map((a, i) => {
        const improved  = a.direction === "improved"
        const badgeColor = improved ? '#10B981' : '#EF4444'
        const barColor   = improved ? '#10B981' : '#EF4444'
        const sign       = a.change > 0 ? '+' : ''
        const arrow      = improved ? '▼' : '▲'

        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 capitalize">{a.aspect}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ color: badgeColor, backgroundColor: `${badgeColor}15` }}>
                {arrow} {sign}{a.change}%
              </span>
            </div>
            <div className="space-y-1">
              {/* Barra período A */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16 text-right shrink-0">
                  {a.period_a_negative_pct}%
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-slate-300"
                    style={{ width: `${a.period_a_negative_pct}%` }} />
                </div>
              </div>
              {/* Barra período B */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold w-16 text-right shrink-0"
                  style={{ color: barColor }}>
                  {a.period_b_negative_pct}%
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${a.period_b_negative_pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatPeriod } from './PeriodSelector'

function npsSign(v) { return v > 0 ? `+${v}` : `${v}` }
function npsColor(v) {
  if (v === null || v === undefined) return '#94A3B8'
  return v > 0 ? '#10B981' : '#EF4444'
}
function deltaColor(v) {
  if (v === null || v === undefined) return '#94A3B8'
  return v >= 0 ? '#10B981' : '#EF4444'
}

function TrendIcon({ trend }) {
  if (trend === 'subiendo' || trend === 'recuperando')
    return <TrendingUp  size={13} style={{ color: '#10B981' }} />
  if (trend === 'bajando')
    return <TrendingDown size={13} style={{ color: '#EF4444' }} />
  return <Minus size={13} style={{ color: '#94A3B8' }} />
}

export default function BenchmarkCard({ benchmark, compact = false }) {
  if (!benchmark || benchmark.total_periods_with_data === 0) return null

  const { best_period, worst_period, average_nps, current_nps,
          vs_average, vs_best, general_trend, trend_description } = benchmark

  if (compact) {
    return (
      <div className="text-xs text-slate-500 flex flex-wrap gap-4 px-1">
        <span>Promedio histórico: <strong style={{ color: '#6366F1' }}>{npsSign(average_nps ?? 0)}</strong></span>
        <span>Actual: <strong style={{ color: npsColor(current_nps) }}>{npsSign(current_nps ?? 0)}</strong></span>
        {vs_average !== null && (
          <span style={{ color: deltaColor(vs_average) }}>
            ({vs_average >= 0 ? '+' : ''}{vs_average} vs promedio)
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
      <h3 className="text-sm font-semibold text-slate-700">Benchmark histórico</h3>

      {/* Métricas: mejor / promedio / peor */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Mejor mes', value: best_period?.nps_score,  period: best_period?.period,  color: '#10B981' },
          { label: 'Promedio',  value: average_nps,              period: null,                  color: '#6366F1' },
          { label: 'Peor mes',  value: worst_period?.nps_score, period: worst_period?.period, color: '#EF4444' },
        ].map(m => (
          <div key={m.label} className="text-center space-y-1">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <p className="text-2xl font-black" style={{ color: m.color }}>
              {m.value !== null && m.value !== undefined ? npsSign(m.value) : '—'}
            </p>
            {m.period && (
              <p className="text-xs text-slate-400">{formatPeriod(m.period)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Comparación con actual */}
      <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">NPS actual:</span>
          <strong style={{ color: npsColor(current_nps) }}>{npsSign(current_nps ?? 0)}</strong>
        </div>
        {vs_average !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">vs promedio:</span>
            <span style={{ color: deltaColor(vs_average) }}>
              {vs_average >= 0 ? '▲' : '▼'} {Math.abs(vs_average)} puntos {vs_average >= 0 ? 'por encima' : 'por debajo'}
            </span>
          </div>
        )}
        {vs_best !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">vs mejor mes:</span>
            <span style={{ color: deltaColor(vs_best) }}>
              {vs_best >= 0 ? '▲' : '▼'} {Math.abs(vs_best)} puntos {vs_best >= 0 ? 'por encima' : 'por debajo'}
            </span>
          </div>
        )}
      </div>

      {/* Tendencia */}
      {general_trend && general_trend !== 'sin_datos' && (
        <div className="border-t border-slate-100 pt-3 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Tendencia:</span>
          <span className="flex items-center gap-1 font-medium capitalize"
            style={{ color: general_trend === 'bajando' ? '#EF4444' : general_trend === 'subiendo' || general_trend === 'recuperando' ? '#10B981' : '#94A3B8' }}>
            <TrendIcon trend={general_trend} />
            {general_trend.replace('_', ' ')}
          </span>
          {trend_description && <span className="text-slate-400">— {trend_description}</span>}
        </div>
      )}
    </div>
  )
}

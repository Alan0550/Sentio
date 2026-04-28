import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle, TrendingDown, Users, BarChart2, GitCompare } from 'lucide-react'
import PeriodSelector, { formatPeriod } from './PeriodSelector'
import TrendChart from './TrendChart'
import AspectEvolution from './AspectEvolution'
import { getDashboard, comparePeriods, getChannelBreakdown, getUrgentMetrics,
         getBenchmark, getAlerts } from '../services/api'
import BenchmarkCard from './BenchmarkCard'
import ExportButton  from './ExportButton'

const CANALES = ['Todos', 'encuesta', 'chat', 'reseña', 'email', 'manual', 'csv_upload']

function npsScoreColor(s) {
  if (s === null || s === undefined) return '#94A3B8'
  if (s > 0)   return '#10B981'
  if (s < -10) return '#EF4444'
  return '#F59E0B'
}

function ChannelTable({ channels }) {
  if (!channels || channels.length < 2) return null
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">NPS por canal</h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100">
            <th className="px-5 py-2 text-left font-medium">Canal</th>
            <th className="px-3 py-2 text-center font-medium">Total</th>
            <th className="px-3 py-2 text-center font-medium">NPS</th>
            <th className="px-3 py-2 text-center font-medium">Promotores</th>
            <th className="px-3 py-2 text-center font-medium">Detractores</th>
            <th className="px-3 py-2 text-center font-medium">Urgentes</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-5 py-2.5 font-medium text-slate-700 capitalize">{c.canal}</td>
              <td className="px-3 py-2.5 text-center text-slate-600">{c.total}</td>
              <td className="px-3 py-2.5 text-center font-bold"
                style={{ color: npsScoreColor(c.nps_score) }}>
                {c.nps_score > 0 ? `+${c.nps_score}` : c.nps_score}
              </td>
              <td className="px-3 py-2.5 text-center" style={{ color: '#10B981' }}>{c.promoters_pct}%</td>
              <td className="px-3 py-2.5 text-center" style={{ color: '#EF4444' }}>{c.detractors_pct}%</td>
              <td className="px-3 py-2.5 text-center text-slate-600">{c.urgent_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLast6Months() {
  const months = []
  const now    = new Date()
  const seen   = new Set()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!seen.has(p)) { seen.add(p); months.push(p) }
  }
  return months
}

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function npsColor(score) {
  if (score === null || score === undefined) return '#94A3B8'
  return score >= 0 ? '#10B981' : '#EF4444'
}

function DeltaBadge({ change, invert = false }) {
  if (change === null || change === undefined) return <span className="text-xs text-slate-400">—</span>
  const positive = invert ? change < 0 : change > 0
  const color    = positive ? '#10B981' : change === 0 ? '#94A3B8' : '#EF4444'
  const arrow    = change > 0 ? '▲' : change < 0 ? '▼' : '●'
  const sign     = change > 0 ? '+' : ''
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {arrow} {sign}{change} vs mes ant.
    </span>
  )
}

function MetricCard({ label, value, color, delta, invertDelta, icon, note }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <div className="text-3xl font-black" style={{ color }}>
        {value !== null && value !== undefined ? value : '—'}
      </div>
      {note && <p className="text-xs text-slate-400">{note}</p>}
      <DeltaBadge change={delta} invert={invertDelta} />
    </div>
  )
}

function NpsBar({ label, count, pct, color }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium w-24 text-slate-600">{label}</span>
      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-20 text-right" style={{ color }}>
        {pct ?? 0}% ({count ?? 0})
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse">
      <div className="h-3 bg-slate-100 rounded w-1/2" />
      <div className="h-8 bg-slate-100 rounded w-1/3" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Dashboard({ onNavigateAlerts }) {
  const periods6          = getLast6Months()
  const [orgId, setOrgId]         = useState('default')
  const [selPeriod, setSelPeriod] = useState(currentPeriod())
  const [selCanal, setSelCanal]   = useState('Todos')
  const [trendData, setTrendData] = useState([])
  const [breakdown, setBreakdown]       = useState(null)
  const [resMetrics, setResMetrics]     = useState(null)
  const [benchmark, setBenchmark]       = useState(null)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  // Comparación
  const [cmpA, setCmpA]             = useState(periods6[periods6.length - 2] || periods6[0])
  const [cmpB, setCmpB]             = useState(currentPeriod())
  const [cmpResult, setCmpResult]   = useState(null)
  const [cmpLoading, setCmpLoading] = useState(false)
  const [cmpError, setCmpError]     = useState(null)

  const canal = selCanal === 'Todos' ? null : selCanal

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [trendRes, bdRes, rmRes, bmRes, alertRes] = await Promise.all([
        getDashboard(orgId, null, periods6, canal),
        getChannelBreakdown(orgId, currentPeriod()),
        getUrgentMetrics(orgId, currentPeriod()),
        getBenchmark(orgId),
        getAlerts(orgId, true),
      ])
      setTrendData(trendRes.data || [])
      setBreakdown(bdRes)
      setResMetrics(rmRes)
      setBenchmark(bmRes)
      setUnreadAlerts(alertRes.unread_count || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [orgId, selCanal])

  useEffect(() => { load() }, [load])

  // Datos del período seleccionado
  const dataByPeriod = Object.fromEntries(trendData.map(d => [d.period, d]))
  const current      = dataByPeriod[selPeriod]
  const prevPeriod   = periods6[periods6.indexOf(selPeriod) - 1]
  const prev         = prevPeriod ? dataByPeriod[prevPeriod] : null

  const npsDelta    = current && prev && current.nps_score !== null && prev.nps_score !== null
    ? current.nps_score - prev.nps_score : null
  const totalDelta  = current && prev ? (current.total_analyzed || 0) - (prev.total_analyzed || 0) : null
  const urgDelta    = current && prev ? (current.urgent_count   || 0) - (prev.urgent_count   || 0) : null
  const churnDelta  = current && prev ? (current.high_churn_count || 0) - (prev.high_churn_count || 0) : null

  async function handleCompare() {
    setCmpLoading(true); setCmpError(null); setCmpResult(null)
    try {
      const res = await comparePeriods(orgId, cmpA, cmpB)
      setCmpResult(res)
    } catch (e) {
      setCmpError(e.message)
    } finally {
      setCmpLoading(false)
    }
  }

  const bestMonth = trendData.filter(d => d.nps_score !== null)
    .sort((a, b) => b.nps_score - a.nps_score)[0]
  const worstMonth = trendData.filter(d => d.nps_score !== null)
    .sort((a, b) => a.nps_score - b.nps_score)[0]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Evolución de la experiencia del cliente</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={orgId} onChange={e => setOrgId(e.target.value)}
            placeholder="Organización"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-400 w-32"
          />
          {unreadAlerts > 0 && onNavigateAlerts && (
            <button onClick={onNavigateAlerts}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#EF4444' }}>
              🔴 {unreadAlerts} alertas
            </button>
          )}
          <ExportButton
            label="Exportar PDF"
            data={{ dashboard: current, benchmark, urgents: [], org_id: orgId, period: selPeriod }}
          />
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="text-xs text-red-500 underline">Reintentar</button>
        </div>
      )}

      {/* Selector de período + canal */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</p>
          <PeriodSelector
            selectedPeriod={selPeriod}
            onPeriodChange={setSelPeriod}
            availablePeriods={periods6}
            dataByPeriod={dataByPeriod}
          />
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Canal</p>
          <div className="flex flex-wrap gap-1">
            {CANALES.map(c => (
              <button key={c} onClick={() => setSelCanal(c)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                style={{
                  backgroundColor: selCanal === c ? '#6366F1' : '#F1F5F9',
                  color:           selCanal === c ? '#fff'    : '#475569',
                }}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Métricas del período seleccionado */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : current ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label="NPS del período"
            value={current.nps_score !== null ? (current.nps_score > 0 ? `+${current.nps_score}` : current.nps_score) : '—'}
            color={npsColor(current.nps_score)}
            delta={npsDelta}
            icon={<BarChart2 size={15} />}
            note={`${current.promoters_pct ?? 0}% prom. — ${current.detractors_pct ?? 0}% det.`}
          />
          <MetricCard
            label="Total analizados"
            value={current.total_analyzed ?? 0}
            color="#6366F1"
            delta={totalDelta}
            icon={<Users size={15} />}
          />
          <MetricCard
            label="Urgentes"
            value={current.urgent_count ?? 0}
            color="#EF4444"
            delta={urgDelta}
            invertDelta
            icon={<AlertTriangle size={15} />}
            note="requieren atención"
          />
          <MetricCard
            label="Churn alto"
            value={current.high_churn_count ?? 0}
            color="#F97316"
            delta={churnDelta}
            invertDelta
            icon={<TrendingDown size={15} />}
            note="riesgo de abandono"
          />
        </div>
      ) : !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 text-sm">Sin datos para {formatPeriod(selPeriod)}.</p>
          <p className="text-slate-400 text-xs mt-1">Subí un CSV o analizá comentarios para este período.</p>
        </div>
      )}

      {/* Gráfica de tendencia */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Evolución del NPS</h3>
          {bestMonth && worstMonth && bestMonth.period !== worstMonth.period && (
            <div className="flex gap-3 text-xs text-slate-400">
              <span>Mejor: <strong style={{ color: '#10B981' }}>{formatPeriod(bestMonth.period)} ({bestMonth.nps_score > 0 ? '+' : ''}{bestMonth.nps_score})</strong></span>
              <span>Peor: <strong style={{ color: '#EF4444' }}>{formatPeriod(worstMonth.period)} ({worstMonth.nps_score})</strong></span>
            </div>
          )}
        </div>
        {loading ? (
          <div className="h-48 bg-slate-50 rounded-xl animate-pulse" />
        ) : (
          <TrendChart data={trendData} />
        )}
      </div>

      {/* Distribución NPS del período */}
      {current && current.total_analyzed > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">
            Distribución NPS — {formatPeriod(selPeriod)}
          </h3>
          <div className="space-y-2.5">
            <NpsBar label="Promotores"  count={current.promoters}  pct={current.promoters_pct}  color="#10B981" />
            <NpsBar label="Pasivos"     count={current.passives}   pct={current.passives_pct}   color="#F59E0B" />
            <NpsBar label="Detractores" count={current.detractors} pct={current.detractors_pct} color="#EF4444" />
          </div>
        </div>
      )}

      {/* Benchmark histórico */}
      {!loading && benchmark && <BenchmarkCard benchmark={benchmark} />}

      {/* Desglose por canal */}
      {!loading && breakdown?.channels?.length >= 2 && selCanal === 'Todos' && (
        <ChannelTable channels={breakdown.channels} />
      )}

      {/* Top aspectos */}
      {current?.top_aspects?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              Aspectos más mencionados — {formatPeriod(selPeriod)}
            </h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 text-left font-medium">Aspecto</th>
                <th className="px-3 py-2 text-center font-medium">Menciones</th>
                <th className="px-3 py-2 text-center font-medium">% Negativo</th>
                <th className="px-3 py-2 text-center font-medium">% Positivo</th>
              </tr>
            </thead>
            <tbody>
              {current.top_aspects.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700 capitalize">{a.aspect}</td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{a.total_mentions}</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#EF4444' }}>{a.negative_pct}%</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#10B981' }}>{a.positive_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comparación de períodos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <GitCompare size={16} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Comparar períodos</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={cmpA} onChange={e => setCmpA(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400">
            {periods6.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
          </select>
          <span className="text-slate-400 text-sm">vs</span>
          <select value={cmpB} onChange={e => setCmpB(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400">
            {periods6.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
          </select>
          <button onClick={handleCompare} disabled={cmpLoading || cmpA === cmpB}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
            style={{ backgroundColor: cmpLoading || cmpA === cmpB ? '#E2E8F0' : '#6366F1', color: cmpLoading || cmpA === cmpB ? '#94A3B8' : '#fff' }}>
            {cmpLoading ? 'Comparando...' : 'Comparar'}
          </button>
        </div>

        {cmpError && <p className="text-sm text-red-500">{cmpError}</p>}

        {cmpResult && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            {/* Resumen */}
            <div className="rounded-xl px-4 py-3 text-sm text-indigo-800"
              style={{ backgroundColor: '#EFF6FF' }}>
              {cmpResult.summary}
            </div>
            {/* Delta NPS */}
            <div className="flex items-center gap-6 flex-wrap text-sm">
              {[
                { label: 'NPS', change: cmpResult.nps_change,    dir: cmpResult.nps_direction,    invert: false },
                { label: 'Total', change: cmpResult.total_change, dir: cmpResult.total_direction,  invert: false },
                { label: 'Urgentes', change: cmpResult.urgent_change, invert: true },
                { label: 'Churn alto', change: cmpResult.churn_change, invert: true },
              ].map(({ label, change, invert }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-slate-500">{label}:</span>
                  <DeltaBadge change={change} invert={invert} />
                </div>
              ))}
            </div>
            {/* Evolución de aspectos */}
            <AspectEvolution comparison={cmpResult} />
          </div>
        )}
      </div>

      {/* Métricas de resolución de urgentes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">
          Resolución de urgentes — {formatPeriod(selPeriod)}
        </h3>
        {!loading && resMetrics ? (
          resMetrics.total_urgent === 0 ? (
            <p className="text-sm text-slate-400">Sin urgentes en este período.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-32">Tasa de resolución</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${resMetrics.resolution_rate_pct}%`, backgroundColor: '#10B981' }} />
                </div>
                <span className="text-xs font-bold" style={{ color: '#10B981' }}>
                  {resMetrics.resolution_rate_pct}%
                </span>
              </div>
              <div className="flex flex-wrap gap-6 text-xs text-slate-600">
                <span>Resueltos: <strong>{resMetrics.resolved} / {resMetrics.total_urgent}</strong></span>
                {resMetrics.avg_resolution_hours !== null && (
                  <span>Tiempo promedio: <strong>{resMetrics.avg_resolution_hours} h</strong></span>
                )}
                {resMetrics.pending > 0 && (
                  <span style={{ color: '#EF4444' }}>Pendientes: <strong>{resMetrics.pending}</strong></span>
                )}
                {resMetrics.in_progress > 0 && (
                  <span style={{ color: '#F97316' }}>En gestión: <strong>{resMetrics.in_progress}</strong></span>
                )}
              </div>
            </div>
          )
        ) : !loading ? (
          <p className="text-sm text-slate-400">Sin casos resueltos en este período.</p>
        ) : (
          <div className="h-8 bg-slate-100 rounded animate-pulse" />
        )}
      </div>

    </div>
  )
}


import { useState, useEffect } from 'react'
import { Users, AlertTriangle, TrendingDown, BarChart2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { getHistory, computeDashboardMetrics } from '../services/api'

const NPS_BADGE = {
  promotor:  { color: '#10B981', bg: '#ECFDF5', label: 'Promotor' },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB', label: 'Pasivo'   },
  detractor: { color: '#EF4444', bg: '#FEF2F2', label: 'Detractor' },
}
const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }

function MetricCard({ icon, label, value, color, note }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </div>
  )
}

function NpsBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium w-20 text-slate-600">{label}</span>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold w-14 text-right" style={{ color }}>
        {count} ({pct}%)
      </span>
    </div>
  )
}

function HistoryItem({ item }) {
  const [expanded, setExpanded] = useState(false)
  const nps    = item.nps_classification || 'pasivo'
  const badge  = NPS_BADGE[nps] || NPS_BADGE.pasivo
  const churnC = CHURN_COLOR[item.churn_risk] || '#94A3B8'
  const ts     = item.timestamp
    ? new Date(item.timestamp).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={{ color: badge.color, backgroundColor: badge.bg }}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate text-sm text-slate-600">
          {item.input_preview || item.input || '(sin texto)'}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {item.urgency && (
            <AlertTriangle size={13} className="text-red-500" />
          )}
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color: churnC, backgroundColor: `${churnC}15` }}
          >
            {item.churn_risk}
          </span>
          <span className="text-xs text-slate-400">{ts}</span>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 mb-0.5">Score estimado</p>
              <p className="font-bold text-slate-700">{item.inferred_score}/10</p>
            </div>
            <div>
              <p className="text-slate-400 mb-0.5">Emoción</p>
              <p className="font-medium text-slate-700 capitalize">{(item.dominant_emotion || '').replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-0.5">Industria</p>
              <p className="font-medium text-slate-700 capitalize">{item.industry || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-0.5">Origen</p>
              <p className="font-medium text-slate-700 capitalize">{item.source || 'manual'}</p>
            </div>
          </div>
          {item.summary && (
            <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200 pt-3">
              {item.summary}
            </p>
          )}
          {item.recommended_action && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#EFF6FF' }}>
              <span className="font-semibold text-indigo-700">Acción: </span>
              <span className="text-indigo-800">{item.recommended_action}</span>
            </div>
          )}
          {Array.isArray(item.aspects) && item.aspects.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
              {item.aspects.map((a, i) => {
                const c = a.sentiment === 'positivo' ? '#10B981' : a.sentiment === 'negativo' ? '#EF4444' : '#94A3B8'
                return (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full border" style={{ color: c, borderColor: `${c}60`, backgroundColor: `${c}10` }}>
                    {a.aspect}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const FILTERS = {
  nps:     ['todos', 'promotor', 'pasivo', 'detractor'],
  churn:   ['todos', 'alto', 'medio', 'bajo'],
  urgency: ['todos', 'urgente', 'normal'],
  industry:['todos', 'telco', 'retail', 'general'],
}

export default function Dashboard() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [filters, setFilters]   = useState({ nps: 'todos', churn: 'todos', urgency: 'todos', industry: 'todos' })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistory()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const metrics = computeDashboardMetrics(items)

  const filtered = items.filter(item => {
    if (filters.nps !== 'todos' && item.nps_classification !== filters.nps) return false
    if (filters.churn !== 'todos' && item.churn_risk !== filters.churn) return false
    if (filters.urgency === 'urgente' && !item.urgency) return false
    if (filters.urgency === 'normal' && item.urgency) return false
    if (filters.industry !== 'todos' && item.industry !== filters.industry) return false
    return true
  })

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 border-4 rounded-full animate-spin"
           style={{ borderColor: '#E2E8F0', borderTopColor: '#6366F1' }} />
      <p className="text-slate-500 text-sm">Cargando historial...</p>
    </div>
  )

  if (error) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={load} className="text-indigo-600 text-sm underline">Reintentar</button>
    </div>
  )

  if (!items.length) return (
    <div className="text-center py-24 space-y-3">
      <BarChart2 size={40} className="mx-auto text-slate-300" />
      <p className="text-slate-500 text-sm">Todavía no hay análisis guardados.</p>
      <p className="text-slate-400 text-xs">Analizá el primer feedback desde la vista Analizador.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Dashboard</h2>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw size={13} />
          Actualizar
        </button>
      </div>

      {/* Métricas superiores */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            icon={<BarChart2 size={16} />}
            label="NPS del período"
            value={metrics.npsScore > 0 ? `+${metrics.npsScore}` : metrics.npsScore}
            color={metrics.npsScore >= 0 ? '#10B981' : '#EF4444'}
            note={`${metrics.total} análisis totales`}
          />
          <MetricCard
            icon={<Users size={16} />}
            label="Total analizados"
            value={metrics.total}
            color="#6366F1"
            note={`${metrics.promoters} promotores`}
          />
          <MetricCard
            icon={<AlertTriangle size={16} />}
            label="Requieren atención"
            value={metrics.urgentCount}
            color="#EF4444"
            note="con urgencia activa"
          />
          <MetricCard
            icon={<TrendingDown size={16} />}
            label="Churn alto"
            value={metrics.highChurn}
            color="#F97316"
            note="riesgo de abandono"
          />
        </div>
      )}

      {/* Distribución NPS */}
      {metrics && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Distribución NPS</h3>
          <div className="space-y-3">
            <NpsBar label="Promotores"  count={metrics.promoters}  total={metrics.total} color="#10B981" />
            <NpsBar label="Pasivos"     count={metrics.passives}   total={metrics.total} color="#F59E0B" />
            <NpsBar label="Detractores" count={metrics.detractors} total={metrics.total} color="#EF4444" />
          </div>
        </div>
      )}

      {/* Top aspectos */}
      {metrics?.topAspects?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Aspectos más mencionados</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 text-left font-medium">Aspecto</th>
                <th className="px-3 py-2 text-center font-medium">Menciones</th>
                <th className="px-3 py-2 text-center font-medium">% Positivo</th>
                <th className="px-3 py-2 text-center font-medium">% Negativo</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topAspects.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700 capitalize">{a.name}</td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{a.total}</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#10B981' }}>{a.pctPositive}%</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#EF4444' }}>{a.pctNegative}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">Filtros</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(FILTERS).map(([key, options]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 capitalize">{key === 'nps' ? 'NPS' : key === 'churn' ? 'Churn' : key === 'urgency' ? 'Urgencia' : 'Industria'}:</span>
              <select
                value={filters[key]}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-400 capitalize"
              >
                {options.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de análisis */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Análisis recientes ({filtered.length})
        </p>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Ningún análisis coincide con los filtros seleccionados.</p>
        ) : (
          filtered.map(item => <HistoryItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}

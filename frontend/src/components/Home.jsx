import { useState, useEffect } from 'react'
import { BarChart2, Upload, FlaskConical, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react'
import { getHomeSummary } from '../services/api'
import { formatPeriod } from './PeriodSelector'

const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }

function greeting() {
  const h = new Date().getHours()
  if (h >= 6  && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} días`
}

function npsSign(v) { return v > 0 ? `+${v}` : v }
function npsColor(v) {
  if (v === null || v === undefined) return '#94A3B8'
  return v > 0 ? '#10B981' : '#EF4444'
}

function DeltaBadge({ change, label, invert = false }) {
  if (change === null || change === undefined) return (
    <span className="text-xs text-slate-400">— sin datos ant.</span>
  )
  const good  = invert ? change <= 0 : change >= 0
  const color = change === 0 ? '#94A3B8' : good ? '#10B981' : '#EF4444'
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '●'
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {arrow} {change > 0 ? '+' : ''}{change} {label}
    </span>
  )
}

function UrgentList({ urgents, onNavigate }) {
  const freq = {}
  urgents.forEach(u => { if (u.customer_id) freq[u.customer_id] = (freq[u.customer_id] || 0) + 1 })
  return (
    <div className="divide-y divide-slate-100">
      {urgents.map((u, i) => (
        <div key={i} className="px-5 py-3 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700">{u.customer_id}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ color: CHURN_COLOR[u.churn_risk] || '#94A3B8', backgroundColor: `${CHURN_COLOR[u.churn_risk] || '#94A3B8'}15` }}>
              churn {u.churn_risk}
            </span>
            {u.customer_id && freq[u.customer_id] > 1 && (
              <span className="text-xs text-slate-400">{freq[u.customer_id]} interacciones previas</span>
            )}
            <span className="text-xs text-slate-400 ml-auto">{timeAgo(u.timestamp)}</span>
            <button onClick={() => onNavigate('urgents', { openUrgentId: u.id })}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>
              Gestionar →
            </button>
          </div>
          <p className="text-xs text-slate-600">{u.input_preview}</p>
          {u.urgency_reason && <p className="text-xs text-red-500 italic">{u.urgency_reason}</p>}
        </div>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
      <div className="h-3 bg-slate-100 rounded w-1/2" />
      <div className="h-8 bg-slate-100 rounded w-1/3" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
    </div>
  )
}

export default function Home({ onNavigate }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    getHomeSummary()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const cur = data?.current || {}
  const del = data?.deltas  || {}

  if (!loading && (!data?.has_data)) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 space-y-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ backgroundColor: '#EEF2FF' }}>
          <BarChart2 size={32} style={{ color: '#6366F1' }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Bienvenido a Sentio</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Todavía no hay datos para mostrar.<br />
            Empezá subiendo un CSV con el feedback de tus clientes.
          </p>
        </div>
        <button onClick={() => onNavigate('csv')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: '#6366F1' }}>
          <Upload size={16} /> Cargar mi primer CSV
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Sección 1 — Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{greeting()}</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Esto es lo que pasó en {data ? formatPeriod(data.current_period) : '…'}
        </p>
      </div>

      {/* Sección 2 — 4 métricas */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* NPS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <p className="text-xs font-medium text-slate-500">NPS del mes</p>
            <p className="text-3xl font-black" style={{ color: npsColor(cur.nps_score) }}>
              {cur.nps_score !== null && cur.nps_score !== undefined ? npsSign(cur.nps_score) : '—'}
            </p>
            <DeltaBadge change={del.nps_change} label="pts" />
          </div>
          {/* Total */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <p className="text-xs font-medium text-slate-500">Analizados</p>
            <p className="text-3xl font-black text-slate-800">{cur.total_analyzed ?? 0}</p>
            <DeltaBadge change={del.total_change} label="vs ant." />
          </div>
          {/* Urgentes */}
          <div className="bg-white rounded-2xl border border-red-100 p-5 space-y-2 cursor-pointer hover:border-red-300 transition-colors"
            onClick={() => document.getElementById('urgentes')?.scrollIntoView({ behavior: 'smooth' })}>
            <p className="text-xs font-medium text-slate-500">Urgentes</p>
            <p className="text-3xl font-black" style={{ color: '#EF4444' }}>{cur.urgent_count ?? 0}</p>
            <DeltaBadge change={del.urgent_change} label="vs ant." invert />
          </div>
          {/* Churn */}
          <div className="bg-white rounded-2xl border border-orange-100 p-5 space-y-2 cursor-pointer hover:border-orange-300 transition-colors"
            onClick={() => document.getElementById('urgentes')?.scrollIntoView({ behavior: 'smooth' })}>
            <p className="text-xs font-medium text-slate-500">Churn alto</p>
            <p className="text-3xl font-black" style={{ color: '#F97316' }}>{cur.high_churn_count ?? 0}</p>
            <DeltaBadge change={del.churn_change} label="vs ant." invert />
          </div>
        </div>
      )}

      {/* Métricas de resolución */}
      {!loading && data?.resolution && data.resolution.pending + data.resolution.in_progress + data.resolution.resolved > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
          <span>Resolución de urgentes:</span>
          <span className="font-semibold" style={{ color: '#10B981' }}>{data.resolution.resolution_rate_pct}% resueltos</span>
          {data.resolution.in_progress > 0 && <span>{data.resolution.in_progress} en gestión</span>}
          {data.resolution.pending > 0 && <span style={{ color: '#EF4444' }}>{data.resolution.pending} pendientes</span>}
        </div>
      )}

      {/* Sección 3 — Aspectos críticos */}
      {!loading && data?.critical_aspects?.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2"
            style={{ backgroundColor: '#FFFBEB' }}>
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-700">Aspectos críticos este mes</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {data.critical_aspects.map((a, i) => (
              <button key={i}
                onClick={() => onNavigate('dashboard')}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#EF4444' }} />
                <span className="flex-1 text-sm font-medium text-slate-700 capitalize">{a.aspect}</span>
                <span className="text-sm font-bold" style={{ color: '#EF4444' }}>{a.negative_pct}% neg.</span>
                <span className="text-xs text-slate-400">{a.total_mentions} menciones</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sección 4 — Urgentes */}
      <div id="urgentes">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
          </div>
        ) : cur.urgent_count > 0 && data?.top_urgent?.length > 0 ? (
          <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2"
              style={{ backgroundColor: '#FEF2F2' }}>
              <AlertTriangle size={15} className="text-red-500" />
              <h3 className="text-sm font-semibold text-red-700">
                Requieren atención inmediata ({cur.urgent_count})
              </h3>
            </div>
            <UrgentList urgents={data.top_urgent} onNavigate={onNavigate} />
            <div className="px-5 py-3 border-t border-slate-100">
              <button onClick={() => onNavigate('urgents')}
                className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
                Ver todos los urgentes →
              </button>
            </div>
          </div>
        ) : !loading && (
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-emerald-200 px-5 py-4">
            <CheckCircle size={18} className="text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">Sin urgentes pendientes este mes</p>
          </div>
        )}
      </div>

      {/* Sección 5 — Acciones rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Ver Dashboard', sub: 'Métricas completas', icon: <BarChart2 size={22} />, view: 'dashboard', color: '#6366F1' },
          { label: 'Cargar CSV',    sub: 'Analizar en volumen', icon: <Upload size={22} />,     view: 'csv',       color: '#0F172A' },
          { label: 'Demo',          sub: 'Probar el analizador', icon: <FlaskConical size={22} />, view: 'analyzer', color: '#475569' },
        ].map(({ label, sub, icon, view, color }) => (
          <button key={view} onClick={() => onNavigate(view)}
            className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-slate-300 hover:shadow-sm transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${color}12`, color }}>
              {icon}
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}

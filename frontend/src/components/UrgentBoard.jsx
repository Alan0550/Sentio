import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import UrgentBadge from './UrgentBadge'
import UrgentDrawer from './UrgentDrawer'
import ErrorBanner  from './ErrorBanner'
import { getUrgents, getUrgentMetrics } from '../services/api'

const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }
const NPS_BADGE   = {
  promotor:  { color: '#10B981', bg: '#ECFDF5' },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB' },
  detractor: { color: '#EF4444', bg: '#FEF2F2' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60)    return 'hace un momento'
  if (d < 3600)  return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  return `hace ${Math.floor(d / 86400)} días`
}

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

const FILTERS = [
  { key: null,         label: 'Todos'        },
  { key: 'pendiente',  label: 'Pendientes'   },
  { key: 'en_gestion', label: 'En gestión'   },
  { key: 'resuelto',   label: 'Resueltos'    },
]

export default function UrgentBoard({ initialOpenId = null, onPendingCountChange, onNavigateCustomer }) {
  const periods6 = getLast6Months()
  const [orgId, setOrgId]         = useState('default')
  const [period, setPeriod]       = useState(currentPeriod())
  const [filter, setFilter]       = useState(null)
  const [items, setItems]         = useState([])
  const [metrics, setMetrics]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [openUrgent, setOpenUrgent] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [urgRes, metRes] = await Promise.all([
        getUrgents(orgId, period),
        getUrgentMetrics(orgId, period),
      ])
      const list = urgRes.items || []
      setItems(list)
      setMetrics(metRes)
      const pending = list.filter(i => (i.urgent_status || 'pendiente') === 'pendiente').length
      onPendingCountChange?.(pending)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [orgId, period])

  // Abrir drawer si viene initialOpenId
  useEffect(() => {
    if (initialOpenId && items.length) {
      const target = items.find(i => i.id === initialOpenId)
      if (target) setOpenUrgent(target)
    }
  }, [initialOpenId, items])

  function handleUpdate(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    const pending = items
      .map(i => i.id === updated.id ? updated : i)
      .filter(i => (i.urgent_status || 'pendiente') === 'pendiente').length
    onPendingCountChange?.(pending)
    // Recargar métricas
    getUrgentMetrics(orgId, period).then(setMetrics).catch(() => {})
  }

  const filtered = filter
    ? items.filter(i => (i.urgent_status || 'pendiente') === filter)
    : items

  const pendingCount  = items.filter(i => (i.urgent_status || 'pendiente') === 'pendiente').length
  const inProgCount   = items.filter(i => i.urgent_status === 'en_gestion').length
  const resolvedCount = items.filter(i => i.urgent_status === 'resuelto').length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Bandeja de urgentes</h2>
          <p className="text-sm text-slate-500 mt-0.5">Casos que requieren atención inmediata</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={orgId} onChange={e => setOrgId(e.target.value)}
            placeholder="Organización"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none w-28" />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none">
            {periods6.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={load}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Métricas */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total',       value: items.length,  color: '#6366F1', icon: <AlertTriangle size={15}/> },
            { label: 'Pendientes',  value: pendingCount,  color: '#EF4444', icon: <AlertTriangle size={15}/> },
            { label: 'En gestión',  value: inProgCount,   color: '#F97316', icon: <Clock size={15}/> },
            { label: `Resueltos (${metrics?.resolution_rate_pct ?? 0}%)`,
              value: resolvedCount, color: '#10B981', icon: <CheckCircle size={15}/> },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{c.label}</span>
                <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${c.color}15`, color: c.color }}>
                  {c.icon}
                </div>
              </div>
              <p className="text-3xl font-black" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Métricas de tiempo */}
      {!loading && metrics?.avg_resolution_hours !== null && metrics?.avg_resolution_hours !== undefined && (
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex flex-wrap gap-6 text-sm text-slate-600">
          <span>Tiempo promedio de resolución: <strong>{metrics.avg_resolution_hours} h</strong></span>
          {metrics.fastest_resolution_hours !== null && (
            <span>Más rápido: <strong style={{color:'#10B981'}}>{metrics.fastest_resolution_hours} h</strong></span>
          )}
          {metrics.slowest_resolution_hours !== null && (
            <span>Más lento: <strong style={{color:'#EF4444'}}>{metrics.slowest_resolution_hours} h</strong></span>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const count = f.key === null ? items.length
            : items.filter(i => (i.urgent_status || 'pendiente') === f.key).length
          return (
            <button key={String(f.key)} onClick={() => setFilter(f.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: filter === f.key ? '#6366F1' : '#F1F5F9',
                color:           filter === f.key ? '#fff'    : '#475569',
              }}>
              {f.label} <span className="opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-slate-100 rounded w-1/4" />
              <div className="h-3 bg-slate-100 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <CheckCircle size={32} className="mx-auto text-emerald-300" />
          <p className="text-slate-500 text-sm font-medium">No hay casos en este estado</p>
          <p className="text-slate-400 text-xs">Todos los urgentes de este período están siendo atendidos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const nps  = item.nps_classification || 'detractor'
            const bAdge = NPS_BADGE[nps] || NPS_BADGE.detractor
            return (
              <div key={item.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-sm">
                      {item.customer_id || 'Sin ID'}
                    </span>
                    <UrgentBadge status={item.urgent_status || 'pendiente'} />
                    {item.urgent_assignee && (
                      <span className="text-xs text-slate-400">→ {item.urgent_assignee}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(item.timestamp)}</span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  "{(item.input_preview || '').slice(0, 150)}{item.input_preview?.length > 150 ? '…' : ''}"
                </p>

                {item.urgency_reason && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-500">{item.urgency_reason}</p>
                  </div>
                )}

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ color: CHURN_COLOR[item.churn_risk]||'#94A3B8',
                               backgroundColor:`${CHURN_COLOR[item.churn_risk]||'#94A3B8'}15`}}>
                      churn {item.churn_risk}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                      style={{ color: bAdge.color, backgroundColor: bAdge.bg }}>
                      {nps} ({item.inferred_score}/10)
                    </span>
                    {item.source && (
                      <span className="text-xs text-slate-400 capitalize">{item.source}</span>
                    )}
                    {item.resolution_time_hours !== null && item.resolution_time_hours !== undefined && (
                      <span className="text-xs text-emerald-600 font-medium">
                        ✓ Resuelto en {item.resolution_time_hours} h
                      </span>
                    )}
                  </div>
                  <button onClick={() => setOpenUrgent(item)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>
                    Gestionar →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Drawer */}
      {openUrgent && (
        <UrgentDrawer
          urgent={openUrgent}
          onClose={() => setOpenUrgent(null)}
          onUpdate={updated => { handleUpdate(updated); setOpenUrgent(null) }}
          onNavigateCustomer={onNavigateCustomer}
        />
      )}
    </div>
  )
}

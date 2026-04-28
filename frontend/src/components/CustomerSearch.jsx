import { useState, useEffect } from 'react'
import { Search, Users, AlertTriangle, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { getCustomers, getCustomerHistory } from '../services/api'
import ErrorBanner from './ErrorBanner'

const NPS_COLOR = {
  promotor:  { color: '#10B981', bg: '#ECFDF5' },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB' },
  detractor: { color: '#EF4444', bg: '#FEF2F2' },
}
const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }

const SORT_OPTIONS = [
  { value: 'interactions', label: 'Más interacciones' },
  { value: 'risk',         label: 'Mayor riesgo' },
  { value: 'score_asc',    label: 'Peor score' },
  { value: 'recent',       label: 'Más recientes' },
]

function TrendIcon({ trend }) {
  if (trend === 'mejorando')  return <TrendingUp  size={13} style={{ color: '#10B981' }} />
  if (trend === 'empeorando') return <TrendingDown size={13} style={{ color: '#EF4444' }} />
  if (trend === 'estable')    return <Minus        size={13} style={{ color: '#94A3B8' }} />
  return null
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60)    return 'hace un momento'
  if (d < 3600)  return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  return `hace ${Math.floor(d / 86400)} días`
}

export default function CustomerSearch({ onSelectCustomer }) {
  const [query, setQuery]       = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [sortBy, setSortBy]     = useState('interactions')
  const [filter, setFilter]     = useState('todos')

  useEffect(() => {
    loadList()
  }, [sortBy])

  async function loadList() {
    setLoading(true); setError(null)
    try {
      const res = await getCustomers('default', null, sortBy)
      setCustomers(res.customers || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true); setSearchError(null)
    try {
      const res = await getCustomerHistory(query.trim())
      if (!res.found) {
        setSearchError(`No se encontró el cliente "${query.trim()}". Verificá el ID.`)
      } else {
        onSelectCustomer(query.trim())
      }
    } catch (e) {
      setSearchError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const FILTERS = [
    { key: 'todos',     label: 'Todos' },
    { key: 'detractor', label: 'Detractores' },
    { key: 'riesgo',    label: 'Churn alto' },
    { key: 'urgentes',  label: 'Con urgentes' },
  ]

  const filtered = customers.filter(c => {
    if (filter === 'detractor') return c.last_classification === 'detractor'
    if (filter === 'riesgo')    return c.last_churn_risk === 'alto'
    if (filter === 'urgentes')  return c.has_pending_urgent
    return true
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Clientes</h2>
        <p className="text-sm text-slate-500 mt-0.5">Historial de interacciones por cliente identificado</p>
      </div>

      {/* Buscador */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchError(null) }}
            placeholder="Ingresá el ID del cliente (ej: C018)"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400"
          />
        </div>
        <button type="submit" disabled={!query.trim() || searching}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all text-white"
          style={{ backgroundColor: query.trim() && !searching ? '#6366F1' : '#E2E8F0',
                   color: query.trim() && !searching ? '#fff' : '#94A3B8' }}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Buscar
        </button>
      </form>
      {searchError && <p className="text-sm text-red-500 -mt-2">{searchError}</p>}

      {/* Lista */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: filter === f.key ? '#6366F1' : '#F1F5F9',
                  color:           filter === f.key ? '#fff'    : '#475569',
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0,1,2,3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="h-3 bg-slate-100 rounded w-1/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorBanner message={error} onRetry={loadList} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Users size={32} className="mx-auto text-slate-300" />
            <p className="text-slate-500 text-sm">No hay clientes con este filtro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">{filtered.length} clientes</p>
            {filtered.map(c => {
              const nps   = NPS_COLOR[c.last_classification] || NPS_COLOR.pasivo
              const churnC = CHURN_COLOR[c.last_churn_risk]  || '#94A3B8'
              return (
                <button key={c.customer_id}
                  onClick={() => onSelectCustomer(c.customer_id)}
                  className="w-full bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 hover:border-indigo-300 hover:shadow-sm transition-all text-left">

                  {/* ID + urgente pending */}
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    {c.has_pending_urgent && (
                      <span className="w-2 h-2 rounded-full animate-pulse shrink-0"
                        style={{ backgroundColor: '#EF4444' }} />
                    )}
                    <span className="font-bold text-slate-800 text-sm truncate">{c.customer_id}</span>
                  </div>

                  {/* Clasificación */}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                    style={{ color: nps.color, backgroundColor: nps.bg }}>
                    {c.last_classification}
                  </span>

                  {/* Score */}
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {c.last_score}/10
                  </span>

                  {/* Churn */}
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline"
                    style={{ color: churnC, backgroundColor: `${churnC}15` }}>
                    churn {c.last_churn_risk}
                  </span>

                  {/* Tendencia */}
                  <span className="flex items-center gap-1 text-xs text-slate-400 hidden md:flex">
                    <TrendIcon trend={c.trend} />
                    {c.trend !== 'sin_datos' && c.trend.replace('_', ' ')}
                  </span>

                  {/* Interacciones */}
                  <span className="text-xs text-slate-400 ml-auto hidden sm:inline whitespace-nowrap">
                    {c.total_interactions} interacciones
                  </span>

                  {/* Última vez */}
                  <span className="text-xs text-slate-400 whitespace-nowrap hidden md:inline">
                    {timeAgo(c.last_seen)}
                  </span>

                  <span className="text-slate-300 text-sm shrink-0">›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

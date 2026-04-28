import { useState, useEffect } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { getCustomerHistory } from '../services/api'
import { formatPeriod } from './PeriodSelector'

const NPS_COLOR = {
  promotor:  { color: '#10B981', bg: '#ECFDF5', label: 'Promotor'  },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB', label: 'Pasivo'    },
  detractor: { color: '#EF4444', bg: '#FEF2F2', label: 'Detractor' },
}
const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-BO', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
  } catch { return iso }
}

function TrendBadge({ trend }) {
  if (!trend || trend === 'sin_datos') return null
  const cfg = {
    mejorando:  { Icon: TrendingUp,   color: '#10B981', label: 'Mejorando'  },
    empeorando: { Icon: TrendingDown,  color: '#EF4444', label: 'Empeorando' },
    estable:    { Icon: Minus,         color: '#94A3B8', label: 'Estable'    },
  }[trend]
  if (!cfg) return null
  return (
    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}>
      <cfg.Icon size={11} /> {cfg.label}
    </span>
  )
}

// Línea de tiempo SVG del NPS
function NpsTimeline({ evolution }) {
  if (!evolution || evolution.length === 0) return null
  if (evolution.length === 1) {
    const e = evolution[0]
    const nps = NPS_COLOR[e.classification] || NPS_COLOR.pasivo
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm"
          style={{ borderColor: nps.color, color: nps.color, backgroundColor: nps.bg }}>
          {e.score}
        </div>
        <span className="text-xs text-slate-400">{formatPeriod(e.period)}</span>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-0 overflow-x-auto pb-1">
      {evolution.map((e, i) => {
        const nps = NPS_COLOR[e.classification] || NPS_COLOR.pasivo
        return (
          <div key={i} className="flex flex-col items-center" style={{ minWidth: '72px' }}>
            <div className="flex items-center w-full">
              {i > 0 && <div className="flex-1 h-0.5" style={{ backgroundColor: '#E2E8F0' }} />}
              <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-xs shrink-0 z-10 bg-white"
                style={{ borderColor: nps.color, color: nps.color }}>
                {e.score}
              </div>
              {i < evolution.length - 1 && <div className="flex-1 h-0.5" style={{ backgroundColor: '#E2E8F0' }} />}
            </div>
            <span className="text-xs text-slate-400 mt-1 whitespace-nowrap">{formatPeriod(e.period)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Card expandible de un análisis
function AnalysisCard({ analysis, onNavigateUrgent }) {
  const [expanded, setExpanded] = useState(false)
  const nps = NPS_COLOR[analysis.nps_classification] || NPS_COLOR.pasivo
  const churnC = CHURN_COLOR[analysis.churn_risk] || '#94A3B8'

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
        <div className="text-xs text-slate-400 w-28 shrink-0">
          {formatDate(analysis.timestamp)}
          <span className="block capitalize text-slate-300">{analysis.source}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{ color: nps.color, backgroundColor: nps.bg }}>
            {analysis.nps_classification} ({analysis.inferred_score}/10)
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color: churnC, backgroundColor: `${churnC}15` }}>
            churn {analysis.churn_risk}
          </span>
          {analysis.urgency && (
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ color: '#F97316', backgroundColor: '#FFF7ED' }}>
              <AlertTriangle size={11} />
              Urgente
              {analysis.urgent_status && ` · ${analysis.urgent_status.replace('_', ' ')}`}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {!expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 italic truncate">"{analysis.input_preview}"</p>
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50 space-y-4">
          {/* Feedback */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Feedback</p>
            <div className="rounded-lg px-3 py-2 text-sm text-slate-700 leading-relaxed"
              style={{ backgroundColor: '#F8FAFC', borderLeft: '3px solid #6366F1' }}>
              {analysis.input_preview}
            </div>
          </div>

          {/* Aspectos */}
          {analysis.aspects?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Aspectos</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.aspects.map((a, i) => {
                  const c = a.sentiment === 'positivo' ? '#10B981'
                    : a.sentiment === 'negativo' ? '#EF4444' : '#94A3B8'
                  return (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full border capitalize"
                      style={{ color: c, borderColor: `${c}60`, backgroundColor: `${c}10` }}>
                      {a.aspect}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Resumen */}
          {analysis.summary && (
            <p className="text-xs text-slate-600">{analysis.summary}</p>
          )}

          {/* Gestión urgente */}
          {analysis.urgency && (
            <div className="rounded-lg px-3 py-2 space-y-1 text-xs"
              style={{ backgroundColor: '#FFF7ED' }}>
              <p className="font-semibold text-orange-700">Gestión del urgente</p>
              {analysis.urgent_status && <p>Estado: <strong className="capitalize">{analysis.urgent_status.replace('_', ' ')}</strong></p>}
              {analysis.urgent_assignee && <p>Responsable: <strong>{analysis.urgent_assignee}</strong></p>}
              {analysis.urgent_note && <p className="text-slate-600">{analysis.urgent_note}</p>}
              <button onClick={() => onNavigateUrgent?.(analysis.id)}
                className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors mt-1">
                Ver gestión completa →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CustomerProfile({ customerId, orgId = 'default', onBack, onNavigate }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!customerId) return
    setLoading(true); setError(null)
    getCustomerHistory(customerId, orgId)
      .then(res => {
        if (!res.found) setError(`Cliente "${customerId}" no encontrado.`)
        else setData(res)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [customerId, orgId])

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
      <button onClick={onBack} className="text-indigo-600 text-sm underline">Volver</button>
    </div>
  )

  if (!data) return null

  const curNps  = NPS_COLOR[data.current_classification] || NPS_COLOR.pasivo
  const churnC  = CHURN_COLOR[data.current_churn_risk] || '#94A3B8'
  const scores  = data.analyses.map(a => a.inferred_score).filter(Boolean)
  const avgScore = scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : null

  // Frase automática de tendencia
  function trendPhrase() {
    const evo = data.nps_evolution
    if (!evo || evo.length === 0) return null
    const first = evo[0], last = evo[evo.length - 1]
    if (data.total_interactions === 1) return 'Primera interacción registrada.'
    if (data.trend === 'mejorando')  return `Este cliente mejoró de ${first.score} a ${last.score} puntos.`
    if (data.trend === 'empeorando') return `Este cliente empeoró de ${first.score} a ${last.score} puntos.`
    if (data.trend === 'estable' && avgScore) return `Este cliente se mantiene estable con un score promedio de ${avgScore}.`
    return null
  }
  const phrase = trendPhrase()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mt-1">
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="flex-1 space-y-2">
          <h2 className="text-xl font-bold text-slate-800">Cliente {data.customer_id}</h2>
          <p className="text-xs text-slate-400">
            {data.total_interactions} interacciones · Primera vez: {formatDate(data.first_seen)} · Última: {formatDate(data.last_seen)}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ color: curNps.color, backgroundColor: curNps.bg }}>
              {curNps.label}
            </span>
            <TrendBadge trend={data.trend} />
            <span className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ color: churnC, backgroundColor: `${churnC}15` }}>
              churn {data.current_churn_risk}
            </span>
          </div>
        </div>
      </div>

      {/* Evolución NPS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Evolución del NPS</h3>
        <NpsTimeline evolution={data.nps_evolution} />
        {phrase && <p className="text-xs text-slate-500 italic">{phrase}</p>}
        {data.total_interactions === 1 && (
          <p className="text-xs text-slate-400">
            ℹ El historial de evolución requiere al menos 2 interacciones.
          </p>
        )}
      </div>

      {/* 4 métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Análisis',         value: data.total_interactions, color: '#6366F1' },
          { label: 'Urgentes',         value: data.urgent_count,       color: '#EF4444',
            onClick: data.urgent_count > 0 ? () => onNavigate?.('urgents') : null },
          { label: 'Resueltos',        value: data.resolved_urgents,   color: '#10B981' },
          { label: 'Score actual',     value: data.analyses[0] ? `${data.analyses[0].inferred_score}/10` : '—',
            color: curNps.color },
        ].map(m => (
          <div key={m.label}
            onClick={m.onClick}
            className={`bg-white rounded-2xl border border-slate-200 p-4 space-y-1 ${m.onClick ? 'cursor-pointer hover:border-indigo-300' : ''}`}>
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <p className="text-2xl font-black" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Línea de tiempo de análisis */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Historial de interacciones ({data.analyses.length})
        </h3>
        {data.analyses.map((a, i) => (
          <AnalysisCard key={a.id || i} analysis={a}
            onNavigateUrgent={id => onNavigate?.('urgents', { openUrgentId: id })} />
        ))}
      </div>
    </div>
  )
}

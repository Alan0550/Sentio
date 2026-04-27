import { useState } from 'react'
import { AlertTriangle, TrendingDown, BarChart2, ChevronDown, ChevronUp, Download, RotateCcw } from 'lucide-react'
import AnalysisResult from './AnalysisResult'

const NPS_BADGE = {
  promotor:  { color: '#10B981', bg: '#ECFDF5', label: 'Promotor'  },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB', label: 'Pasivo'    },
  detractor: { color: '#EF4444', bg: '#FEF2F2', label: 'Detractor' },
}
const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }
const EMOTION_ICON = {
  'satisfacción':      '😊',
  'frustración':       '😤',
  'enojo':             '😠',
  'indiferencia':      '😐',
  'decepción':         '😞',
  'sorpresa_positiva': '😲',
}

function NpsBar({ label, count, total, pct, color }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium w-24 text-slate-600">{label}</span>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-20 text-right" style={{ color }}>
        {pct}% ({count})
      </span>
    </div>
  )
}

function ExpandableItem({ item, onGoToDashboard }) {
  const [expanded, setExpanded] = useState(false)
  const nps    = item.nps_classification || 'pasivo'
  const badge  = NPS_BADGE[nps] || NPS_BADGE.pasivo
  const churnC = CHURN_COLOR[item.churn_risk] || '#94A3B8'
  const preview = (item.input_preview || item.input || '').slice(0, 100)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-slate-400 w-8 shrink-0">
          {item.customer_id || `#${item.row_number}`}
        </span>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ color: badge.color, backgroundColor: badge.bg }}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate text-xs text-slate-600">{preview}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.urgency && <AlertTriangle size={13} className="text-red-500" />}
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ color: churnC, backgroundColor: `${churnC}15` }}>
            {item.churn_risk}
          </span>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50">
          <AnalysisResult
            result={item}
            inputText={item.input_preview || item.input}
            onReset={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  )
}

function exportCsv(results) {
  const headers = ['customer_id', 'nps_classification', 'inferred_score', 'churn_risk', 'urgency', 'summary']
  const rows = results
    .filter(r => !r.error)
    .map(r => headers.map(h => {
      const val = r[h] ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(','))
  const content = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `sentio_batch_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const PAGE_SIZE = 20

export default function BatchResult({ result, onReset, onGoToDashboard }) {
  const [showAll, setShowAll]     = useState(false)
  const [page, setPage]           = useState(0)

  if (!result) return null

  const { summary = {}, results = [], total, processed, failed, batch_id } = result

  const urgentItems    = results.filter(r => !r.error && r.urgency)
  const highChurnItems = results.filter(r => !r.error && r.churn_risk === 'alto' && !r.urgency)
  const validResults   = results.filter(r => !r.error)
  const totalPages     = Math.ceil(validResults.length / PAGE_SIZE)
  const pageItems      = validResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const npsColor = summary.nps_score > 0 ? '#10B981' : summary.nps_score < 0 ? '#EF4444' : '#94A3B8'
  const npsSign  = summary.nps_score > 0 ? '+' : ''
  const timestamp = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Card 1 — Header */}
      <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Análisis completado</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {processed} comentarios procesados · {failed} fallidos · {timestamp}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCsv(results)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Card 2 — NPS Score */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-start gap-6">
          <div className="text-center">
            <div className="text-6xl font-black tabular-nums" style={{ color: npsColor }}>
              {npsSign}{summary.nps_score}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Net Promoter Score</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {summary.promoters_pct}% promotores − {summary.detractors_pct}% detractores
            </p>
          </div>
          <div className="flex-1 space-y-2.5">
            <NpsBar label="Promotores"  count={summary.promoters}  total={processed} pct={summary.promoters_pct}  color="#10B981" />
            <NpsBar label="Pasivos"     count={summary.passives}   total={processed} pct={summary.passives_pct}   color="#F59E0B" />
            <NpsBar label="Detractores" count={summary.detractors} total={processed} pct={summary.detractors_pct} color="#EF4444" />
          </div>
        </div>

        {/* Alertas */}
        {(summary.urgent_count > 0 || summary.high_churn_count > 0) && (
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            {summary.urgent_count > 0 && (
              <a href="#urgentes"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ backgroundColor: '#FEF2F2', color: '#EF4444' }}>
                <AlertTriangle size={12} /> {summary.urgent_count} urgente{summary.urgent_count > 1 ? 's' : ''}
              </a>
            )}
            {summary.high_churn_count > 0 && (
              <a href="#churn"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ backgroundColor: '#FFF7ED', color: '#F97316' }}>
                <TrendingDown size={12} /> {summary.high_churn_count} churn alto
              </a>
            )}
          </div>
        )}
      </div>

      {/* Card 3 — Top problemas */}
      {summary.top_aspects?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Top aspectos mencionados</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 text-left font-medium">Aspecto</th>
                <th className="px-3 py-2 text-center font-medium">Menciones</th>
                <th className="px-3 py-2 text-center font-medium">Negativo</th>
                <th className="px-3 py-2 text-center font-medium">Positivo</th>
                <th className="px-5 py-2 text-left font-medium">Distribución</th>
              </tr>
            </thead>
            <tbody>
              {summary.top_aspects.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700 capitalize">{a.aspect}</td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{a.total_mentions}</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#EF4444' }}>{a.negative_pct}%</td>
                  <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#10B981' }}>{a.positive_pct}%</td>
                  <td className="px-5 py-2.5">
                    <div className="flex h-3 rounded-full overflow-hidden w-24 gap-0.5">
                      <div style={{ width: `${a.negative_pct}%`, backgroundColor: '#EF4444' }} />
                      <div style={{ width: `${a.positive_pct}%`, backgroundColor: '#10B981' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card 4 — Emociones */}
      {summary.dominant_emotions && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Distribución de emociones</h3>
          <div className="space-y-2">
            {Object.entries(summary.dominant_emotions)
              .sort(([,a],[,b]) => b - a)
              .map(([emotion, count]) => {
                const maxVal = Math.max(...Object.values(summary.dominant_emotions))
                const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0
                return (
                  <div key={emotion} className="flex items-center gap-3">
                    <span className="text-base w-6">{EMOTION_ICON[emotion] || '💬'}</span>
                    <span className="text-xs text-slate-600 w-32 capitalize">{emotion.replace('_', ' ')}</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#6366F1' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-600 w-6 text-right">{count}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Card 5 — Urgentes */}
      {urgentItems.length > 0 && (
        <div id="urgentes" className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2" style={{ backgroundColor: '#FEF2F2' }}>
            <AlertTriangle size={15} className="text-red-500" />
            <h3 className="text-sm font-semibold text-red-700">
              Requieren atención inmediata ({urgentItems.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {urgentItems.map((item, i) => (
              <div key={i} className="px-5 py-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700">{item.customer_id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: CHURN_COLOR[item.churn_risk] || '#94A3B8', backgroundColor: `${CHURN_COLOR[item.churn_risk] || '#94A3B8'}15` }}>
                    churn {item.churn_risk}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{(item.input_preview || item.input || '').slice(0, 100)}</p>
                {item.urgency_reason && (
                  <p className="text-xs text-red-600 italic">{item.urgency_reason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card 6 — Churn alto */}
      {highChurnItems.length > 0 && (
        <div id="churn" className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-orange-100 flex items-center gap-2" style={{ backgroundColor: '#FFF7ED' }}>
            <TrendingDown size={15} className="text-orange-500" />
            <h3 className="text-sm font-semibold text-orange-700">
              Riesgo de churn alto ({highChurnItems.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {highChurnItems.map((item, i) => (
              <div key={i} className="px-5 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">{item.customer_id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ color: NPS_BADGE[item.nps_classification]?.color || '#94A3B8', backgroundColor: NPS_BADGE[item.nps_classification]?.bg || '#F8FAFC' }}>
                    {NPS_BADGE[item.nps_classification]?.label || item.nps_classification}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{(item.input_preview || item.input || '').slice(0, 100)}</p>
                {item.recommended_action && (
                  <p className="text-xs text-orange-700 font-medium">{item.recommended_action.slice(0, 120)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card 7 — Todos los análisis (colapsable) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <span className="text-sm font-semibold text-slate-700">
            Todos los análisis ({validResults.length})
          </span>
          {showAll ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {showAll && (
          <div className="border-t border-slate-100">
            <div className="divide-y divide-slate-100">
              {pageItems.map((item, i) => (
                <ExpandableItem key={item.id || i} item={item} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs text-slate-500 disabled:opacity-30 hover:text-indigo-600 transition-colors"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-slate-400">
                  Página {page + 1} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="text-xs text-slate-500 disabled:opacity-30 hover:text-indigo-600 transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card 8 — Acciones */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors bg-white"
        >
          <RotateCcw size={14} /> Analizar otro CSV
        </button>
        <button
          onClick={onGoToDashboard}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#6366F1' }}
        >
          <BarChart2 size={14} /> Ver Dashboard
        </button>
      </div>
    </div>
  )
}

import { RotateCcw, AlertTriangle, CheckCircle, Minus, TrendingDown, TrendingUp, Activity } from 'lucide-react'

const NPS_COLORS = {
  promotor:  { bg: '#ECFDF5', border: '#10B981', text: '#065F46', badge: '#10B981' },
  pasivo:    { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', badge: '#F59E0B' },
  detractor: { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B', badge: '#EF4444' },
}

const CHURN_COLORS = {
  alto:  '#EF4444',
  medio: '#F97316',
  bajo:  '#10B981',
}

const EMOTION_ICONS = {
  'satisfacción':      '😊',
  'frustración':       '😤',
  'enojo':             '😠',
  'indiferencia':      '😐',
  'sorpresa_positiva': '😲',
  'decepción':         '😞',
}

function npsLabel(c) {
  return c === 'promotor' ? 'PROMOTOR' : c === 'pasivo' ? 'PASIVO' : 'DETRACTOR'
}

function SentimentBar({ breakdown }) {
  const { positive = 0, negative = 0, neutral = 0, mixed = 0 } = breakdown || {}
  const total = positive + negative + neutral + mixed || 100
  const segments = [
    { label: 'Positivo', value: positive, color: '#10B981' },
    { label: 'Negativo', value: negative, color: '#EF4444' },
    { label: 'Neutro',   value: neutral,  color: '#94A3B8' },
    { label: 'Mixto',    value: mixed,    color: '#F97316' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {segments.map(s => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[
          { label: 'Positivo', value: positive, color: '#10B981' },
          { label: 'Negativo', value: negative, color: '#EF4444' },
          { label: 'Neutro',   value: neutral,  color: '#94A3B8' },
          { label: 'Mixto',    value: mixed,    color: '#F97316' },
        ].map(s => (
          <span key={s.label} className="flex items-center gap-1 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} {s.value}%
          </span>
        ))}
      </div>
    </div>
  )
}

function AspectCard({ aspect }) {
  const sentColor = aspect.sentiment === 'positivo' ? '#10B981'
    : aspect.sentiment === 'negativo' ? '#EF4444' : '#94A3B8'
  const sentIcon  = aspect.sentiment === 'positivo' ? <TrendingUp size={14} />
    : aspect.sentiment === 'negativo' ? <TrendingDown size={14} /> : <Minus size={14} />
  const confPct   = Math.round((aspect.confidence || 0) * 100)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700 text-sm capitalize">{aspect.aspect}</span>
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ color: sentColor, backgroundColor: `${sentColor}15` }}
          >
            {sentIcon}
            {aspect.sentiment}
          </span>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {confPct}%
          </span>
        </div>
      </div>
      {aspect.quote && (
        <p className="text-xs text-slate-500 italic border-l-2 pl-3" style={{ borderColor: sentColor }}>
          "{aspect.quote}"
        </p>
      )}
    </div>
  )
}

function HighlightedText({ text, aspects }) {
  if (!text || !aspects?.length) return (
    <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
  )

  const highlights = []
  for (const a of aspects) {
    if (!a.quote) continue
    const idx = text.indexOf(a.quote)
    if (idx >= 0) {
      const color = a.sentiment === 'positivo' ? '#10B981'
        : a.sentiment === 'negativo' ? '#EF4444' : '#F97316'
      highlights.push({ start: idx, end: idx + a.quote.length, color })
    }
  }
  highlights.sort((a, b) => a.start - b.start)

  const parts = []
  let cursor = 0
  for (const h of highlights) {
    if (h.start > cursor) parts.push({ text: text.slice(cursor, h.start), color: null })
    parts.push({ text: text.slice(h.start, h.end), color: h.color })
    cursor = h.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), color: null })

  return (
    <p className="text-sm text-slate-600 leading-relaxed">
      {parts.map((p, i) =>
        p.color ? (
          <mark
            key={i}
            style={{ backgroundColor: `${p.color}20`, borderBottom: `2px solid ${p.color}`, color: 'inherit' }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  )
}

export default function AnalysisResult({ result, inputText, onReset }) {
  const nps    = result.nps_classification || 'pasivo'
  const colors = NPS_COLORS[nps] || NPS_COLORS.pasivo

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* 1. Tarjeta NPS principal */}
      <div
        className="rounded-2xl border-2 p-6"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span
              className="inline-block text-3xl font-black tracking-wide"
              style={{ color: colors.badge }}
            >
              {npsLabel(nps)}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium" style={{ color: colors.text }}>
                Score estimado: <strong>{result.inferred_score}/10</strong>
              </span>
              {result.industry && (
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-white border"
                  style={{ color: '#6366F1', borderColor: '#6366F1' }}
                >
                  Industria: {result.industry}
                </span>
              )}
              {result.source && result.source !== 'manual' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-white border border-slate-300 text-slate-500 capitalize">
                  {result.source}
                </span>
              )}
            </div>
          </div>
          <div
            className="text-5xl font-black tabular-nums"
            style={{ color: colors.badge }}
          >
            {result.inferred_score}
          </div>
        </div>
      </div>

      {/* 2. Barra de sentimiento */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Distribución de sentimiento</h3>
        <SentimentBar breakdown={result.sentiment_breakdown} />
      </div>

      {/* 3. Métricas secundarias */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1">
          <p className="text-xs text-slate-500 font-medium">Emoción dominante</p>
          <p className="text-lg">{EMOTION_ICONS[result.dominant_emotion] || '💬'}</p>
          <p className="text-xs font-semibold text-slate-700 capitalize leading-tight">
            {(result.dominant_emotion || '').replace('_', ' ')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1">
          <p className="text-xs text-slate-500 font-medium">Riesgo de churn</p>
          <Activity size={20} className="mx-auto" style={{ color: CHURN_COLORS[result.churn_risk] || '#94A3B8' }} />
          <p
            className="text-xs font-semibold capitalize"
            style={{ color: CHURN_COLORS[result.churn_risk] || '#94A3B8' }}
          >
            {result.churn_risk}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center space-y-1">
          <p className="text-xs text-slate-500 font-medium">Urgencia</p>
          {result.urgency ? (
            <AlertTriangle size={20} className="mx-auto text-red-500" />
          ) : (
            <CheckCircle size={20} className="mx-auto text-emerald-500" />
          )}
          <p className={`text-xs font-semibold ${result.urgency ? 'text-red-500' : 'text-emerald-600'}`}>
            {result.urgency ? 'Requiere atención' : 'Sin urgencia'}
          </p>
        </div>
      </div>

      {/* Razón de urgencia si aplica */}
      {result.urgency && result.urgency_reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{result.urgency_reason}</p>
        </div>
      )}

      {/* 4. Aspectos */}
      {result.aspects?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Aspectos analizados ({result.aspects.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.aspects.map((a, i) => <AspectCard key={i} aspect={a} />)}
          </div>
        </div>
      )}

      {/* 5. Resumen y acción recomendada */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        {result.summary && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Resumen</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{result.summary}</p>
          </div>
        )}
        {result.recommended_action && (
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#EFF6FF', borderLeft: '4px solid #6366F1' }}>
            <p className="text-xs font-semibold text-indigo-700 mb-1">Acción recomendada</p>
            <p className="text-sm text-indigo-800">{result.recommended_action}</p>
          </div>
        )}
      </div>

      {/* 6. Texto original con highlights */}
      {(inputText || result.input) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Texto del cliente</h3>
          <HighlightedText
            text={inputText || result.input}
            aspects={result.aspects || []}
          />
          <div className="flex gap-4 flex-wrap pt-1">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#10B981' }} /> Positivo
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#EF4444' }} /> Negativo
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#F97316' }} /> Neutro
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors bg-white"
      >
        <RotateCcw size={14} />
        Analizar otro feedback
      </button>
    </div>
  )
}

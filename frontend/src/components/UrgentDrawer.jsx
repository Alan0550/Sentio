import { useState, useEffect } from 'react'
import { X, Save, Loader2, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import UrgentBadge from './UrgentBadge'
import { updateUrgent, getCustomerSummary } from '../services/api'

const NPS_BADGE = {
  promotor:  { color: '#10B981', bg: '#ECFDF5' },
  pasivo:    { color: '#F59E0B', bg: '#FFFBEB' },
  detractor: { color: '#EF4444', bg: '#FEF2F2' },
}
const CHURN_COLOR = { alto: '#EF4444', medio: '#F97316', bajo: '#10B981' }
const STATUSES = [
  { key: 'pendiente',  label: 'Pendiente',  color: '#EF4444', bg: '#FEF2F2' },
  { key: 'en_gestion', label: 'En gestión', color: '#F97316', bg: '#FFF7ED' },
  { key: 'resuelto',   label: 'Resuelto',   color: '#10B981', bg: '#F0FDF4' },
]

function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('es-BO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} días`
}

export default function UrgentDrawer({ urgent, onClose, onUpdate, onNavigateCustomer }) {
  const [status,   setStatus]   = useState(urgent?.urgent_status || 'pendiente')
  const [assignee, setAssignee] = useState(urgent?.urgent_assignee || '')
  const [note,       setNote]       = useState(urgent?.urgent_note || '')
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState(null)
  const [saveError,  setSaveError]  = useState(null)
  const [custSummary, setCustSummary] = useState(null)

  useEffect(() => {
    if (!urgent) return
    setStatus(urgent.urgent_status || 'pendiente')
    setAssignee(urgent.urgent_assignee || '')
    setNote(urgent.urgent_note || '')
    setSaveError(null)
    setToast(null)
    setCustSummary(null)

    // Cargar resumen del cliente en background
    const cid = urgent.customer_id
    if (cid && cid !== 'null') {
      getCustomerSummary(cid, urgent.org_id || 'default')
        .then(s => s.found ? setCustSummary(s) : null)
        .catch(() => {})
    }
  }, [urgent?.id])

  if (!urgent) return null

  const changed = (
    status   !== (urgent.urgent_status   || 'pendiente') ||
    assignee !== (urgent.urgent_assignee || '') ||
    note     !== (urgent.urgent_note     || '')
  )

  async function handleSave() {
    setSaving(true); setSaveError(null)
    try {
      const result = await updateUrgent(urgent.id, urgent.org_id || 'default', {
        urgent_status:   status,
        urgent_assignee: assignee || null,
        urgent_note:     note     || null,
      })
      setToast('Caso actualizado')
      setTimeout(() => { setToast(null); onUpdate(result.analysis); onClose() }, 1200)
    } catch (e) {
      setSaveError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const nps   = urgent.nps_classification || 'detractor'
  const badge = NPS_BADGE[nps] || NPS_BADGE.detractor

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(15,23,42,0.4)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto"
        style={{ width: 'min(480px, 100vw)', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
      >
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-60 flex items-center gap-2 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
            <CheckCircle size={15} /> {toast}
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xl font-bold text-slate-800">
                {urgent.customer_id || 'Sin ID'}
              </p>
              <p className="text-xs text-slate-400">{formatDate(urgent.timestamp)}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                  style={{ color: badge.color, backgroundColor: badge.bg }}>
                  {nps}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ color: CHURN_COLOR[urgent.churn_risk] || '#94A3B8',
                           backgroundColor: `${CHURN_COLOR[urgent.churn_risk] || '#94A3B8'}15` }}>
                  churn {urgent.churn_risk}
                </span>
                <span className="text-xs text-slate-400 capitalize">{urgent.source}</span>
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Historial del cliente */}
          {urgent.customer_id && urgent.customer_id !== 'null' && custSummary && (
            <div className="rounded-xl px-4 py-3 space-y-1"
              style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              {custSummary.total_interactions > 1 ? (
                <>
                  <p className="text-xs text-slate-600 font-medium">
                    📋 Este cliente tiene {custSummary.total_interactions} interacciones registradas
                  </p>
                  <p className="text-xs text-slate-400">
                    Tendencia: {custSummary.trend === 'mejorando' ? '▲ Mejorando' : custSummary.trend === 'empeorando' ? '▼ Empeorando' : '● Estable'}
                    {' '} | Score actual: {custSummary.last_score}/10
                  </p>
                  {onNavigateCustomer && (
                    <button onClick={() => onNavigateCustomer(urgent.customer_id)}
                      className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
                      Ver historial completo →
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">📋 Primera interacción de este cliente</p>
              )}
            </div>
          )}

          {/* Feedback */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Feedback del cliente</p>
            <div className="rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed"
              style={{ backgroundColor: '#F8FAFC', borderLeft: '3px solid #6366F1' }}>
              {urgent.input_preview || urgent.input || '—'}
            </div>
          </div>

          {/* Motivo de urgencia */}
          {urgent.urgency_reason && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Motivo de urgencia</p>
              <div className="rounded-xl px-4 py-3 text-sm text-amber-800" style={{ backgroundColor: '#FFFBEB' }}>
                {urgent.urgency_reason}
              </div>
            </div>
          )}

          {/* Gestión */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Gestión del caso</p>

            {/* Estado */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Estado</label>
              <div className="flex gap-2">
                {STATUSES.map(s => (
                  <button key={s.key} onClick={() => setStatus(s.key)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: status === s.key ? s.bg : '#F1F5F9',
                      color:           status === s.key ? s.color : '#64748B',
                      border:          status === s.key ? `1.5px solid ${s.color}` : '1.5px solid transparent',
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsable */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Responsable</label>
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="¿Quién está atendiendo este caso?"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
              />
            </div>

            {/* Nota */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">Nota interna</label>
                <span className="text-xs text-slate-400">{note.length}/500</span>
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="¿Qué se hizo? ¿Qué se prometió al cliente? ¿Cuál es el plan?"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            {saveError && (
              <p className="text-xs text-red-500">{saveError}</p>
            )}

            <button
              onClick={handleSave}
              disabled={!changed || saving}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all"
              style={{
                backgroundColor: changed && !saving ? '#6366F1' : '#E2E8F0',
                color:           changed && !saving ? '#fff'    : '#94A3B8',
                cursor:          changed && !saving ? 'pointer' : 'not-allowed',
              }}
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : <><Save size={14} /> Guardar cambios</>}
            </button>
          </div>

          {/* Historial */}
          {urgent.urgent_updated_at && (
            <div className="border-t border-slate-100 pt-4 space-y-1 text-xs text-slate-400">
              <p>Última actualización: {timeAgo(urgent.urgent_updated_at)}</p>
              {urgent.urgent_assignee && <p>Por: {urgent.urgent_assignee}</p>}
              {urgent.urgent_resolved_at && (
                <>
                  <p>Resuelto el: {formatDate(urgent.urgent_resolved_at)}</p>
                  {urgent.resolution_time_hours !== null && (
                    <p>Tiempo de resolución: {urgent.resolution_time_hours} horas</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

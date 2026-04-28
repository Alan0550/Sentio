import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Plus, Loader2 } from 'lucide-react'
import { getAlertConfigs, createAlertConfig, deleteAlertConfig } from '../services/api'

const ALERT_TYPES = [
  {
    key:         'nps_drop',
    icon:        '📉',
    title:       'Caída de NPS',
    description: 'Avisame cuando el NPS baje más de',
    unit:        'puntos vs el mes anterior',
    needsAspect: false,
    default:     10,
  },
  {
    key:         'urgent_count',
    icon:        '🚨',
    title:       'Urgentes del día',
    description: 'Avisame cuando lleguen más de',
    unit:        'urgentes en el día',
    needsAspect: false,
    default:     5,
  },
  {
    key:         'aspect_negative',
    icon:        '⚠️',
    title:       'Aspecto crítico',
    description: 'Avisame cuando el aspecto',
    unit:        '% de negatividad',
    needsAspect: true,
    default:     80,
  },
  {
    key:         'churn_count',
    icon:        '🔥',
    title:       'Churn alto',
    description: 'Avisame cuando el churn alto supere',
    unit:        'clientes en el período',
    needsAspect: false,
    default:     10,
  },
]

export default function AlertsConfig({ onBack }) {
  const [configs, setConfigs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [thresholds, setThresholds] = useState({})
  const [aspects, setAspects]   = useState({})
  const [errors, setErrors]     = useState({})

  async function load() {
    setLoading(true)
    try {
      const res = await getAlertConfigs()
      setConfigs(res.configs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(type) {
    const thresh = parseFloat(thresholds[type.key] || type.default)
    const aspect = type.needsAspect ? (aspects[type.key] || '').trim() : null

    if (isNaN(thresh) || thresh <= 0) {
      setErrors(e => ({ ...e, [type.key]: 'El umbral debe ser un número positivo' }))
      return
    }
    if (type.needsAspect && !aspect) {
      setErrors(e => ({ ...e, [type.key]: 'Ingresá el nombre del aspecto' }))
      return
    }
    setErrors(e => ({ ...e, [type.key]: null }))
    setSaving(type.key)
    try {
      const res = await createAlertConfig('default', type.key, thresh, aspect)
      if (res.error) {
        setErrors(e => ({ ...e, [type.key]: res.error }))
      } else {
        await load()
        setThresholds(t => ({ ...t, [type.key]: '' }))
        setAspects(a => ({ ...a, [type.key]: '' }))
      }
    } catch (e) {
      setErrors(prev => ({ ...prev, [type.key]: e.message }))
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(configId) {
    setDeleting(configId)
    try {
      await deleteAlertConfig(configId)
      setConfigs(prev => prev.filter(c => c.id !== configId))
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={14} /> Volver
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Configurar alertas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Definí cuándo querés que Sentio te avise</p>
        </div>
      </div>

      {/* Tipos disponibles */}
      <div className="space-y-4">
        {ALERT_TYPES.map(type => (
          <div key={type.key} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{type.icon}</span>
              <h3 className="text-sm font-semibold text-slate-700">{type.title}</h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
              <span>{type.description}</span>
              {type.needsAspect && (
                <input
                  value={aspects[type.key] || ''}
                  onChange={e => setAspects(a => ({ ...a, [type.key]: e.target.value }))}
                  placeholder="nombre del aspecto"
                  className="border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 w-36"
                />
              )}
              <input
                type="number"
                value={thresholds[type.key] ?? type.default}
                onChange={e => setThresholds(t => ({ ...t, [type.key]: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 w-16 text-center"
                min="1"
              />
              <span>{type.unit}</span>
              <button onClick={() => handleCreate(type)}
                disabled={saving === type.key}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all ml-auto"
                style={{ backgroundColor: saving === type.key ? '#E2E8F0' : '#6366F1',
                         color: saving === type.key ? '#94A3B8' : '#fff' }}>
                {saving === type.key ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Activar
              </button>
            </div>
            {errors[type.key] && <p className="text-xs text-red-500">{errors[type.key]}</p>}
          </div>
        ))}
      </div>

      {/* Alertas activas */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Alertas activas ({configs.length})
        </h3>
        {loading ? (
          <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
        ) : configs.length === 0 ? (
          <p className="text-sm text-slate-400">No hay alertas configuradas.</p>
        ) : (
          configs.map(cfg => (
            <div key={cfg.id}
              className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                <span className="text-sm text-slate-700">{cfg.label || cfg.alert_type}</span>
                <span className="text-xs text-slate-400">umbral: {cfg.threshold}</span>
              </div>
              <button onClick={() => handleDelete(cfg.id)} disabled={deleting === cfg.id}
                className="text-slate-400 hover:text-red-500 transition-colors">
                {deleting === cfg.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

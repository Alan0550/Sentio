import { useState, useEffect } from 'react'
import { Bell, CheckCircle, Settings, RefreshCw } from 'lucide-react'
import { getAlerts, markAlertRead } from '../services/api'

const SEV_CFG = {
  critical: { color: '#EF4444', bg: '#FEF2F2', icon: '🔴', label: 'Crítico'      },
  warning:  { color: '#F97316', bg: '#FFF7ED', icon: '🟠', label: 'Advertencia'  },
  info:     { color: '#6366F1', bg: '#EEF2FF', icon: '🔵', label: 'Información'  },
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60)    return 'hace un momento'
  if (d < 3600)  return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  return `hace ${Math.floor(d / 86400)} días`
}

const FILTERS = [
  { key: 'all',      label: 'Todas'        },
  { key: 'unread',   label: 'No leídas'    },
  { key: 'critical', label: 'Críticas'     },
  { key: 'warning',  label: 'Advertencias' },
]

export default function AlertsPanel({ onNavigateConfig, onUnreadCountChange }) {
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const [marking, setMarking] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await getAlerts('default', false)
      setAlerts(res.alerts || [])
      onUnreadCountChange?.(res.unread_count || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRead(alertId) {
    setMarking(alertId)
    try {
      await markAlertRead(alertId)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a))
      const unread = alerts.filter(a => a.id !== alertId && !a.read).length
      onUnreadCountChange?.(unread)
    } catch (e) {
      console.error(e)
    } finally {
      setMarking(null)
    }
  }

  async function handleMarkAll() {
    const unread = alerts.filter(a => !a.read)
    for (const a of unread) await markAlertRead(a.id).catch(() => {})
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    onUnreadCountChange?.(0)
  }

  const filtered = alerts.filter(a => {
    if (filter === 'unread')   return !a.read
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'warning')  return a.severity === 'warning'
    return true
  })

  const unreadCount = alerts.filter(a => !a.read).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Centro de alertas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Notificaciones automáticas del sistema</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={handleMarkAll}
              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors">
              Marcar todas como leídas
            </button>
          )}
          <button onClick={() => onNavigateConfig?.()}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors">
            <Settings size={12} /> Configurar
          </button>
          <button onClick={load}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => {
          const count = f.key === 'all' ? alerts.length
            : f.key === 'unread'   ? alerts.filter(a => !a.read).length
            : alerts.filter(a => a.severity === f.key).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: filter === f.key ? '#6366F1' : '#F1F5F9',
                color:           filter === f.key ? '#fff'    : '#475569',
              }}>
              {f.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse space-y-2">
              <div className="h-3 bg-slate-100 rounded w-1/4" />
              <div className="h-3 bg-slate-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CheckCircle size={32} className="mx-auto text-emerald-300" />
          <p className="text-slate-500 text-sm font-medium">Sin alertas pendientes</p>
          <p className="text-slate-400 text-xs">Todas las alertas están al día.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => {
            const sev = SEV_CFG[alert.severity] || SEV_CFG.info
            return (
              <div key={alert.id}
                className="bg-white rounded-xl border overflow-hidden transition-all"
                style={{
                  borderLeftWidth: '4px',
                  borderLeftColor: sev.color,
                  borderColor:     alert.read ? '#E2E8F0' : `${sev.color}40`,
                  backgroundColor: alert.read ? '#fff' : sev.bg,
                  opacity:         alert.read ? 0.7 : 1,
                }}>
                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{sev.icon}</span>
                      <span className="text-xs font-bold uppercase" style={{ color: sev.color }}>
                        {sev.label}
                      </span>
                      {!alert.read && (
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                          style={{ backgroundColor: sev.color }} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{timeAgo(alert.triggered_at)}</span>
                      {!alert.read && (
                        <button onClick={() => handleRead(alert.id)}
                          disabled={marking === alert.id}
                          className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                          {marking === alert.id ? '...' : 'Marcar ✓'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{alert.message}</p>
                  {alert.period && (
                    <p className="text-xs text-slate-400 capitalize">
                      Período: {alert.period}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

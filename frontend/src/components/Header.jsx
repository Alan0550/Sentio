import { useState } from 'react'
import { Home, BarChart2, Upload, FlaskConical, AlertTriangle, Users, Bell, Menu, X } from 'lucide-react'

const NAV = [
  { key: 'home',      label: 'Inicio',    Icon: Home          },
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart2     },
  { key: 'urgents',   label: 'Urgentes',  Icon: AlertTriangle },
  { key: 'customers', label: 'Clientes',  Icon: Users         },
  { key: 'alerts',    label: 'Alertas',   Icon: Bell          },
  { key: 'csv',       label: 'Carga CSV', Icon: Upload        },
  { key: 'analyzer',  label: 'Demo',      Icon: FlaskConical  },
]

export default function Header({ view, onChangeView, pendingCount = 0, unreadAlertsCount = 0 }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeKey = ['csv', 'csv-result'].includes(view) ? 'csv'
    : view === 'customer-profile' ? 'customers'
    : ['alerts', 'alerts-config'].includes(view) ? 'alerts'
    : view

  function handleNav(key) {
    onChangeView(key)
    setMobileOpen(false)
  }

  function badge(key) {
    if (key === 'urgents' && pendingCount > 0)     return pendingCount
    if (key === 'alerts'  && unreadAlertsCount > 0) return unreadAlertsCount
    return null
  }

  return (
    <>
      <header style={{ backgroundColor: '#0F172A', height: '56px' }}
        className="shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4">

          {/* Logo — shrink-0 para que no se comprima */}
          <button onClick={() => handleNav('home')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0"
              style={{ backgroundColor: '#6366F1' }}>
              S
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-white font-bold tracking-tight" style={{ fontSize: '18px' }}>
                Sentio
              </span>
              <span className="hidden lg:inline"
                style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>
                Voz del cliente, claridad para tu negocio
              </span>
            </div>
          </button>

          {/* Nav desktop — oculta en mobile */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV.map(({ key, label, Icon }) => {
              const b = badge(key)
              return (
                <button key={key} onClick={() => handleNav(key)}
                  className="relative flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    padding:         '6px 10px',
                    backgroundColor: activeKey === key ? '#6366F1' : 'transparent',
                    color:           activeKey === key ? '#fff'    : '#94A3B8',
                  }}>
                  <Icon size={14} />
                  <span>{label}</span>
                  {b && (
                    <span className="absolute -top-1 -right-0.5 min-w-4 h-4 rounded-full text-white font-bold flex items-center justify-center"
                      style={{ backgroundColor: '#EF4444', fontSize: '9px', padding: '0 3px' }}>
                      {b > 99 ? '99+' : b}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Hamburger — solo en mobile */}
          <button onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white transition-colors">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMobileOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-64 z-50 flex flex-col"
            style={{ backgroundColor: '#0F172A' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-white font-bold">Sentio</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col p-3 gap-1 overflow-y-auto">
              {NAV.map(({ key, label, Icon }) => {
                const b = badge(key)
                return (
                  <button key={key} onClick={() => handleNav(key)}
                    className="relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left"
                    style={{
                      backgroundColor: activeKey === key ? '#6366F1' : 'transparent',
                      color:           activeKey === key ? '#fff'    : '#94A3B8',
                    }}>
                    <Icon size={16} />
                    {label}
                    {b && (
                      <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: '#EF4444' }}>
                        {b > 99 ? '99+' : b}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        </>
      )}
    </>
  )
}

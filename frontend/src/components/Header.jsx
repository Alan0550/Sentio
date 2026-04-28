import { Home, BarChart2, Upload, FlaskConical, AlertTriangle } from 'lucide-react'

const NAV = [
  { key: 'home',      label: 'Inicio',    Icon: Home          },
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart2     },
  { key: 'urgents',   label: 'Urgentes',  Icon: AlertTriangle },
  { key: 'csv',       label: 'Carga CSV', Icon: Upload        },
  { key: 'analyzer',  label: 'Demo',      Icon: FlaskConical  },
]

export default function Header({ view, onChangeView, pendingCount = 0 }) {
  const activeKey = ['csv', 'csv-result'].includes(view) ? 'csv' : view

  return (
    <header className="shadow-sm" style={{ backgroundColor: '#0F172A' }}>
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <button
          onClick={() => onChangeView('home')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ backgroundColor: '#6366F1' }}>
            S
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">Sentio</span>
            <span className="hidden sm:inline text-slate-400 text-xs ml-2">
              Voz del cliente, claridad para tu negocio
            </span>
          </div>
        </button>

        <nav className="flex items-center gap-1">
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => onChangeView(key)}
              className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeKey === key ? '#6366F1' : 'transparent',
                color:           activeKey === key ? '#fff'    : '#94A3B8',
              }}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
              {key === 'urgents' && pendingCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full text-white font-bold flex items-center justify-center"
                  style={{ backgroundColor: '#EF4444', fontSize: '10px', padding: '0 3px' }}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

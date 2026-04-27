import { BarChart2, MessageSquare, Upload } from 'lucide-react'

const NAV = [
  { key: 'analyzer', label: 'Analizador', Icon: MessageSquare },
  { key: 'csv',      label: 'Carga CSV',  Icon: Upload        },
  { key: 'dashboard',label: 'Dashboard',  Icon: BarChart2     },
]

export default function Header({ view, onChangeView }) {
  const activeView = ['csv', 'csv-result'].includes(view) ? 'csv' : view

  return (
    <header className="shadow-sm" style={{ backgroundColor: '#0F172A' }}>
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ backgroundColor: '#6366F1' }}
          >
            S
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">Sentio</span>
            <span className="hidden sm:inline text-slate-400 text-xs ml-2">
              Voz del cliente, claridad para tu negocio
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => onChangeView(key)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeView === key ? '#6366F1' : 'transparent',
                color:           activeView === key ? '#fff'    : '#94A3B8',
              }}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

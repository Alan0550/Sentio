import { BarChart2, MessageSquare } from 'lucide-react'

export default function Header({ view, onChangeView }) {
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
          <button
            onClick={() => onChangeView('analyzer')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: view === 'analyzer' ? '#6366F1' : 'transparent',
              color: view === 'analyzer' ? '#fff' : '#94A3B8',
            }}
          >
            <MessageSquare size={15} />
            <span className="hidden sm:inline">Analizador</span>
          </button>
          <button
            onClick={() => onChangeView('dashboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: view === 'dashboard' ? '#6366F1' : 'transparent',
              color: view === 'dashboard' ? '#fff' : '#94A3B8',
            }}
          >
            <BarChart2 size={15} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </nav>
      </div>
    </header>
  )
}

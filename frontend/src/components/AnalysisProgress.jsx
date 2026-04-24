const STEPS = [
  { id: 'scraping',     label: 'Obteniendo contenido',        icon: '🔗' },
  { id: 'text',         label: 'Analizando texto',            icon: '📝' },
  { id: 'images',       label: 'Analizando imágenes',         icon: '🖼️' },
  { id: 'score',        label: 'Calculando credibilidad',     icon: '🧠' },
]

export default function AnalysisProgress({ step }) {
  const currentIndex = STEPS.findIndex(s => s.id === step)

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
      <p className="text-center text-sm font-medium text-slate-400 tracking-wide uppercase">
        Analizando noticia...
      </p>

      <div className="space-y-3">
        {STEPS.map((s, i) => {
          const done    = i < currentIndex
          const active  = i === currentIndex
          const pending = i > currentIndex

          return (
            <div key={s.id} className="flex items-center gap-3">
              {/* Icono de estado */}
              <div className={`
                flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all
                ${done    ? 'bg-blue-600 text-white'            : ''}
                ${active  ? 'bg-blue-500/20 ring-2 ring-blue-500 text-blue-400' : ''}
                ${pending ? 'bg-slate-800 text-slate-600'       : ''}
              `}>
                {done ? '✓' : s.icon}
              </div>

              {/* Texto */}
              <span className={`text-sm transition-all ${
                done    ? 'text-slate-500 line-through'  :
                active  ? 'text-white font-medium'       :
                          'text-slate-600'
              }`}>
                {s.label}
              </span>

              {/* Spinner si está activo */}
              {active && (
                <svg className="ml-auto h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

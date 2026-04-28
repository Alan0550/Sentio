import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="rounded-2xl border flex items-start gap-4 px-5 py-4"
      style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
      <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>
          No se pudo cargar la información
        </p>
        {message && (
          <p className="text-xs" style={{ color: '#EF4444' }}>{message}</p>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: '#DC2626', color: '#fff' }}>
          <RefreshCw size={11} /> Reintentar
        </button>
      )}
    </div>
  )
}

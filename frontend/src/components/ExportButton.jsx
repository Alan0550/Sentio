import { useState } from 'react'
import { FileDown, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { getUrgents } from '../services/api'

export default function ExportButton({ data, label = 'Exportar PDF' }) {
  const [state, setState] = useState('idle') // idle | generating | success | error

  async function handleExport() {
    setState('generating')
    try {
      // Cargar urgentes del período antes de generar el PDF
      let urgents = []
      try {
        const res = await getUrgents(data.org_id || 'default', data.period || null)
        urgents = res.items || []
      } catch (e) {
        console.warn('No se pudieron cargar los urgentes para el PDF:', e)
      }

      const { generateMonthlyReport } = await import('../services/PdfExport.js')
      await new Promise(resolve => setTimeout(resolve, 100)) // allow UI update
      generateMonthlyReport({ ...data, urgents })
      setState('success')
      setTimeout(() => setState('idle'), 2000)
    } catch (e) {
      console.error('PDF error:', e)
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const cfg = {
    idle:       { Icon: FileDown,      text: label,          bg: '#0F172A', color: '#fff',     disabled: false },
    generating: { Icon: Loader2,       text: 'Generando...', bg: '#E2E8F0', color: '#94A3B8',  disabled: true  },
    success:    { Icon: CheckCircle,   text: 'Descargado',   bg: '#10B981', color: '#fff',     disabled: true  },
    error:      { Icon: AlertCircle,   text: 'Error al generar', bg: '#EF4444', color: '#fff', disabled: true  },
  }[state]

  return (
    <button
      onClick={handleExport}
      disabled={cfg.disabled}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <cfg.Icon size={13} className={state === 'generating' ? 'animate-spin' : ''} />
      {cfg.text}
    </button>
  )
}

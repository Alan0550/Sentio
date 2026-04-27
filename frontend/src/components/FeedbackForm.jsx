import { useState } from 'react'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'

const SOURCES = ['manual', 'encuesta', 'chat', 'email', 'reseña']

export default function FeedbackForm({ onSubmit, error }) {
  const [text, setText]             = useState('')
  const [source, setSource]         = useState('manual')
  const [customerId, setCustomerId] = useState('')
  const [orgId, setOrgId]           = useState('')
  const [showExtra, setShowExtra]   = useState(false)

  const charCount  = text.length
  const isValid    = charCount >= 10 && charCount <= 5000
  const tooShort   = charCount > 0 && charCount < 10
  const tooLong    = charCount > 5000

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({
      input:       text.trim(),
      source:      source,
      customer_id: customerId.trim() || null,
      org_id:      orgId.trim() || 'default',
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Analizá el feedback de tu cliente</h2>
        <p className="text-slate-500 mt-2 text-sm">
          Pegá una reseña, comentario de encuesta o chat de soporte para obtener un análisis completo con NPS inferido.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pegá aquí el comentario, reseña o feedback del cliente..."
            rows={7}
            className="w-full p-5 text-slate-700 text-sm resize-none outline-none placeholder-slate-400"
            style={{ fontFamily: 'inherit' }}
          />
          <div className="px-5 pb-2 flex items-center justify-between border-t border-slate-100">
            <span
              className="text-xs"
              style={{ color: tooLong ? '#EF4444' : tooShort ? '#F59E0B' : '#94A3B8' }}
            >
              {charCount}/5000 caracteres
              {tooShort && ' — mínimo 10'}
              {tooLong  && ' — máximo 5000'}
            </span>
          </div>
        </div>

        {/* Campos opcionales */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowExtra(!showExtra)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <span className="font-medium">Campos opcionales</span>
            {showExtra ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showExtra && (
            <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Origen</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 capitalize"
                >
                  {SOURCES.map(s => (
                    <option key={s} value={s} className="capitalize">{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ID del cliente</label>
                <input
                  type="text"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  placeholder="C-001"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Organización</label>
                <input
                  type="text"
                  value={orgId}
                  onChange={e => setOrgId(e.target.value)}
                  placeholder="empresa-xyz"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 font-semibold text-sm transition-all"
          style={{
            backgroundColor: isValid ? '#6366F1' : '#E2E8F0',
            color: isValid ? '#fff' : '#94A3B8',
            cursor: isValid ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={15} />
          Analizar feedback
        </button>
      </form>
    </div>
  )
}

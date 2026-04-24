import { useState } from 'react'

const MIN_LENGTH = 20

function validateInput(value) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const isUrl = trimmed.startsWith('http')

  if (isUrl) {
    try {
      new URL(trimmed)
      return null // URL válida
    } catch {
      return 'La URL no parece válida. Asegúrate de incluir http:// o https://'
    }
  }

  if (trimmed.length < MIN_LENGTH) {
    return `El texto es muy corto (mínimo ${MIN_LENGTH} caracteres)`
  }

  return null
}

export default function NewsForm({ onSubmit, loading }) {
  const [input,   setInput]   = useState('')
  const [touched, setTouched] = useState(false)

  const trimmed    = input.trim()
  const isUrl      = trimmed.startsWith('http')
  const validation = touched ? validateInput(input) : null
  const canSubmit  = trimmed.length >= MIN_LENGTH && !validateInput(input)

  function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (canSubmit) onSubmit(trimmed)
  }

  function handleBlur() {
    if (input.trim()) setTouched(true)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setTouched(false) }}
          onBlur={handleBlur}
          placeholder="Pega una URL o el texto de la noticia que quieres analizar..."
          rows={5}
          disabled={loading}
          className={`w-full rounded-xl border bg-slate-900 px-4 py-3 text-sm
                     text-slate-100 placeholder-slate-500 resize-none
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50 transition
                     ${validation ? 'border-red-600' : 'border-slate-700'}`}
        />
        {trimmed && (
          <span className="absolute bottom-3 right-3 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            {isUrl ? 'URL' : 'Texto'}
          </span>
        )}
      </div>

      {/* Mensaje de validación */}
      {validation && (
        <p className="text-xs text-red-400">{validation}</p>
      )}

      <button
        type="submit"
        disabled={loading || !trimmed}
        className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white
                   transition hover:bg-blue-500 active:scale-95
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        Analizar noticia
      </button>
    </form>
  )
}

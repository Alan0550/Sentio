const API_URL = import.meta.env.VITE_API_URL

const isUrl = (text) => text.trim().startsWith('http')

/**
 * Envía texto o URL al endpoint /analyze y retorna el resultado.
 * @param {string} input - Texto o URL de la noticia
 * @param {function} onStep - Callback para reportar el paso actual
 * @returns {Promise<object>} Resultado con score, level, signals, explanation
 */
export async function analyzeNews(input, onStep = () => {}) {
  onStep(isUrl(input) ? 'scraping' : 'text')

  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })

  onStep('images')
  await _delay(600)

  onStep('score')
  await _delay(500)

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Error ${response.status}`)
  }

  return response.json()
}

const _delay = (ms) => new Promise(res => setTimeout(res, ms))

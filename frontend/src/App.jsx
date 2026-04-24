import { useState } from 'react'
import NewsForm        from './components/NewsForm'
import ScoreDisplay    from './components/ScoreDisplay'
import AnalysisProgress from './components/AnalysisProgress'
import { analyzeNews } from './services/api'

export default function App() {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [step,    setStep]    = useState(null)
  const [error,   setError]   = useState(null)
  const [history, setHistory] = useState([])

  async function handleSubmit(input) {
    setLoading(true)
    setError(null)
    setResult(null)
    setStep(null)

    try {
      const data = await analyzeNews(input, setStep)
      setResult({ ...data, input })
      setHistory(prev => [{ ...data, input, id: Date.now() }, ...prev].slice(0, 5))
    } catch (err) {
      setError(err.message || 'Error al conectar con el servidor.')
    } finally {
      setLoading(false)
      setStep(null)
    }
  }

  function handleReset() {
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-xl space-y-8">

        {/* Header */}
        <header className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-white">
            Truth<span className="text-blue-500">Lens</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Analiza noticias y detecta señales de desinformación con IA
          </p>
        </header>

        {/* Contenido principal */}
        {loading ? (
          <AnalysisProgress step={step} />
        ) : result ? (
          <div className="space-y-4">
            <ScoreDisplay result={result} />
            <button
              onClick={handleReset}
              className="w-full rounded-xl border border-slate-700 py-3 text-sm text-slate-400
                         transition hover:border-slate-500 hover:text-slate-200"
            >
              Analizar otra noticia
            </button>
          </div>
        ) : (
          <NewsForm onSubmit={handleSubmit} loading={loading} />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 space-y-2">
            <p className="text-sm font-medium text-red-400">No se pudo completar el análisis</p>
            <p className="text-xs text-red-500">{error}</p>
            <button
              onClick={handleReset}
              className="text-xs text-red-400 underline hover:text-red-300"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Historial */}
        {history.length > 0 && !result && !loading && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Análisis recientes
            </p>
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => setResult(item)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3
                           text-left transition hover:border-slate-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">{item.input}</span>
                  <span className={`shrink-0 text-sm font-bold ${
                    item.level === 'creíble'   ? 'text-green-400' :
                    item.level === 'dudoso'    ? 'text-amber-400' :
                                                 'text-red-400'
                  }`}>
                    {item.score}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-slate-700">
          Powered by AWS Comprehend · Rekognition · Bedrock
        </footer>
      </div>
    </div>
  )
}

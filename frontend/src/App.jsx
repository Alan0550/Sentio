import { useState } from 'react'
import Header from './components/Header'
import FeedbackForm from './components/FeedbackForm'
import AnalysisResult from './components/AnalysisResult'
import Dashboard from './components/Dashboard'
import { analyzeFeedback } from './services/api'

export default function App() {
  const [view, setView]           = useState('analyzer')
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [inputText, setInputText] = useState('')

  async function handleAnalyze(formData) {
    setLoading(true)
    setError(null)
    setResult(null)
    setInputText(formData.input)
    try {
      const data = await analyzeFeedback(formData)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setResult(null)
    setError(null)
    setInputText('')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <Header view={view} onChangeView={setView} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {view === 'dashboard' ? (
          <Dashboard />
        ) : (
          <>
            {!result && !loading && (
              <FeedbackForm onSubmit={handleAnalyze} error={error} />
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div
                  className="w-12 h-12 border-4 rounded-full animate-spin"
                  style={{ borderColor: '#E2E8F0', borderTopColor: '#6366F1' }}
                />
                <p className="text-slate-500 text-sm font-medium">Analizando con IA...</p>
              </div>
            )}

            {result && (
              <AnalysisResult result={result} inputText={inputText} onReset={handleReset} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

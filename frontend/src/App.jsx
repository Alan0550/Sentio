import { useState, useEffect } from 'react'
import Header from './components/Header'
import Home from './components/Home'
import FeedbackForm from './components/FeedbackForm'
import AnalysisResult from './components/AnalysisResult'
import Dashboard from './components/Dashboard'
import CsvUploader from './components/CsvUploader'
import BatchResult from './components/BatchResult'
import UrgentBoard from './components/UrgentBoard'
import CustomerSearch from './components/CustomerSearch'
import CustomerProfile from './components/CustomerProfile'
import AlertsPanel from './components/AlertsPanel'
import AlertsConfig from './components/AlertsConfig'
import { analyzeFeedback, getUrgents, getAlerts } from './services/api'

const ANALYZE_MESSAGES = [
  'Analizando el feedback...',
  'Detectando aspectos clave...',
  'Evaluando riesgo de churn...',
  'Generando recomendación...',
]

function AnalyzingSpinner() {
  const [msgIdx, setMsgIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % ANALYZE_MESSAGES.length), 3000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 rounded-full animate-spin"
        style={{ borderColor: '#E2E8F0', borderTopColor: '#6366F1' }} />
      <p className="text-slate-500 text-sm font-medium transition-all">{ANALYZE_MESSAGES[msgIdx]}</p>
    </div>
  )
}

export default function App() {
  const [view, setView]               = useState('home')
  const [viewParams, setViewParams]   = useState({})
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)
  const [inputText, setInputText]     = useState('')
  const [batchResult, setBatchResult] = useState(null)
  const [pendingCount, setPendingCount]         = useState(0)
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0)

  useEffect(() => {
    getUrgents('default', null, 'pendiente')
      .then(res => setPendingCount(res.total || 0))
      .catch(() => {})
    getAlerts('default', true)
      .then(res => setUnreadAlertsCount(res.unread_count || 0))
      .catch(() => {})
  }, [])

  function navigate(v, params = {}) {
    setView(v)
    setViewParams(params)
    if (v === 'analyzer') { setResult(null); setError(null); setInputText('') }
    if (v === 'csv' && view === 'csv-result') setBatchResult(null)
  }

  async function handleAnalyze(formData) {
    setLoading(true); setError(null); setResult(null)
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <Header
        view={view}
        onChangeView={navigate}
        pendingCount={pendingCount}
        unreadAlertsCount={unreadAlertsCount}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {view === 'home' && <Home onNavigate={navigate} />}

        {view === 'dashboard' && (
          <Dashboard onNavigateAlerts={() => navigate('alerts')} />
        )}

        {view === 'urgents' && (
          <UrgentBoard
            initialOpenId={viewParams.openUrgentId || null}
            onPendingCountChange={setPendingCount}
            onNavigateCustomer={cid => navigate('customer-profile', { customerId: cid })}
          />
        )}

        {view === 'customers' && (
          <CustomerSearch onSelectCustomer={cid => navigate('customer-profile', { customerId: cid })} />
        )}

        {view === 'customer-profile' && (
          <CustomerProfile
            customerId={viewParams.customerId}
            orgId="default"
            onBack={() => navigate('customers')}
            onNavigate={navigate}
          />
        )}

        {view === 'alerts' && (
          <AlertsPanel
            onNavigateConfig={() => navigate('alerts-config')}
            onUnreadCountChange={setUnreadAlertsCount}
          />
        )}

        {view === 'alerts-config' && (
          <AlertsConfig onBack={() => navigate('alerts')} />
        )}

        {view === 'csv' && <CsvUploader onResult={data => { setBatchResult(data); setView('csv-result') }} />}

        {view === 'csv-result' && batchResult && (
          <BatchResult
            result={batchResult}
            onReset={() => { setBatchResult(null); setView('csv') }}
            onGoToDashboard={() => navigate('dashboard')}
          />
        )}

        {view === 'analyzer' && (
          <>
            {!result && !loading && <FeedbackForm onSubmit={handleAnalyze} error={error} />}
            {loading && <AnalyzingSpinner />}
            {result && (
              <AnalysisResult result={result} inputText={inputText}
                onReset={() => { setResult(null); setError(null); setInputText('') }} />
            )}
          </>
        )}

      </main>
    </div>
  )
}

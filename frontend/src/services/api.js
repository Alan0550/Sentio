const API_URL = import.meta.env.VITE_API_URL

export async function analyzeFeedback({ input, source = 'manual', customer_id = null, org_id = 'default' }) {
  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, source, customer_id, org_id }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Error ${response.status}`)
  }

  return response.json()
}

export async function getHistory(org_id = null) {
  const url = org_id
    ? `${API_URL}/history?org_id=${encodeURIComponent(org_id)}`
    : `${API_URL}/history`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Error ${response.status} al cargar el historial`)
  }

  return response.json()
}

export async function analyzeBatch({ feedbacks, org_id = 'default', source = 'csv_upload' }) {
  const response = await fetch(`${API_URL}/analyze/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedbacks, org_id, source }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Error ${response.status}`)
  }
  return response.json()
}

export async function uploadCsv(file, orgId = 'default') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('org_id', orgId)

  const response = await fetch(`${API_URL}/upload/csv`, {
    method: 'POST',
    body: formData,
    // NO poner Content-Type — el browser lo pone automáticamente con el boundary
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Error al procesar el CSV')
  }

  return response.json()
}

export async function getBatch(batchId) {
  const response = await fetch(`${API_URL}/batch/${batchId}`)
  if (!response.ok) throw new Error('Batch no encontrado')
  return response.json()
}

export async function getCustomers(orgId = 'default', period = null, sortBy = 'interactions') {
  let url = `${API_URL}/customers?org_id=${encodeURIComponent(orgId)}&sort_by=${sortBy}`
  if (period) url += `&period=${period}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Error al cargar clientes')
  return response.json()
}

export async function getCustomerHistory(customerId, orgId = 'default') {
  const response = await fetch(`${API_URL}/customers/${encodeURIComponent(customerId)}?org_id=${encodeURIComponent(orgId)}`)
  if (response.status === 404) return { found: false, customer_id: customerId }
  if (!response.ok) throw new Error('Error al cargar historial del cliente')
  return response.json()
}

export async function getCustomerSummary(customerId, orgId = 'default') {
  const response = await fetch(`${API_URL}/customers/${encodeURIComponent(customerId)}/summary?org_id=${encodeURIComponent(orgId)}`)
  if (response.status === 404) return { found: false, customer_id: customerId }
  if (!response.ok) throw new Error('Error al cargar resumen del cliente')
  return response.json()
}

export async function getUrgents(orgId = 'default', period = null, status = null) {
  let url = `${API_URL}/urgents?org_id=${encodeURIComponent(orgId)}`
  if (period) url += `&period=${period}`
  if (status) url += `&status=${status}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Error al cargar urgentes')
  return response.json()
}

export async function updateUrgent(analysisId, orgId = 'default', updates) {
  const response = await fetch(`${API_URL}/urgents/${analysisId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId, ...updates }),
  })
  if (!response.ok) throw new Error('Error al actualizar el urgente')
  return response.json()
}

export async function getUrgentMetrics(orgId = 'default', period = null) {
  let url = `${API_URL}/urgents/metrics?org_id=${encodeURIComponent(orgId)}`
  if (period) url += `&period=${period}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Error al cargar métricas de resolución')
  return response.json()
}

export async function getHomeSummary(orgId = 'default') {
  const response = await fetch(`${API_URL}/home?org_id=${encodeURIComponent(orgId)}`)
  if (!response.ok) throw new Error('Error al cargar el resumen')
  return response.json()
}

export async function getChannelBreakdown(orgId = 'default', period) {
  const response = await fetch(
    `${API_URL}/dashboard?org_id=${encodeURIComponent(orgId)}&period=${period}&breakdown=true`
  )
  if (!response.ok) throw new Error('Error al cargar el desglose por canal')
  return response.json()
}

export async function getDashboard(orgId = 'default', period = null, periods = null, canal = null) {
  let url = `${API_URL}/dashboard?org_id=${encodeURIComponent(orgId)}`
  if (period)  url += `&period=${period}`
  if (periods) url += `&periods=${Array.isArray(periods) ? periods.join(',') : periods}`
  if (canal)   url += `&canal=${encodeURIComponent(canal)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Error al cargar el dashboard')
  return response.json()
}

export async function comparePeriods(orgId = 'default', periodA, periodB) {
  const url = `${API_URL}/dashboard/compare?org_id=${encodeURIComponent(orgId)}&period_a=${periodA}&period_b=${periodB}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Error al comparar períodos')
  return response.json()
}

export function computeDashboardMetrics(items) {
  if (!items.length) return null

  const total      = items.length
  const promoters  = items.filter(i => i.nps_classification === 'promotor').length
  const detractors = items.filter(i => i.nps_classification === 'detractor').length
  const passives   = items.filter(i => i.nps_classification === 'pasivo').length
  const npsScore   = Math.round(((promoters - detractors) / total) * 100)
  const urgentCount = items.filter(i => i.urgency).length
  const highChurn  = items.filter(i => i.churn_risk === 'alto').length

  const aspectMap = {}
  for (const item of items) {
    const aspects = Array.isArray(item.aspects) ? item.aspects : []
    for (const a of aspects) {
      const name = a.aspect
      if (!aspectMap[name]) aspectMap[name] = { name, total: 0, positive: 0, negative: 0 }
      aspectMap[name].total++
      if (a.sentiment === 'positivo') aspectMap[name].positive++
      if (a.sentiment === 'negativo') aspectMap[name].negative++
    }
  }

  const topAspects = Object.values(aspectMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(a => ({
      ...a,
      pctPositive: Math.round((a.positive / a.total) * 100),
      pctNegative: Math.round((a.negative / a.total) * 100),
    }))

  return { total, promoters, detractors, passives, npsScore, urgentCount, highChurn, topAspects }
}

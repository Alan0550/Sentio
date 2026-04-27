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

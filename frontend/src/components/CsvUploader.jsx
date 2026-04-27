import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Download, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import { analyzeBatch } from '../services/api'

const BATCH_SIZE = 5   // filas por request (dentro del límite de 29s de API Gateway)

const EXAMPLE_CSV = `customer_id,feedback,fecha,canal
C001,"Llevo 3 semanas sin internet y nadie me da solución. Llamé 5 veces y cada vez me dicen algo diferente. Voy a cancelar.",2026-04-01,chat
C002,"Excelente atención al cliente. Me resolvieron el problema en 10 minutos. Lo recomiendo sin dudarlo.",2026-04-02,encuesta
C003,"El precio subió sin aviso este mes. La atención estuvo bien pero si sigue así voy a evaluar otras opciones.",2026-04-03,encuesta
C004,"El producto llegó dañado y al abrirlo me lastimé. Voy a hacer una denuncia formal. Esto es inaceptable.",2026-04-04,reseña
C005,"Tercera vez que compro y siempre perfecto. Entrega rápida, empaque impecable, producto exactamente como lo describían.",2026-04-05,reseña
`

const COLUMNS_INFO = [
  { name: 'feedback',     required: true,  desc: 'Texto del comentario del cliente' },
  { name: 'customer_id',  required: false, desc: 'Identificador del cliente' },
  { name: 'fecha',        required: false, desc: 'Fecha del comentario (YYYY-MM-DD)' },
  { name: 'canal',        required: false, desc: 'encuesta / chat / reseña / email' },
]

// ── Parser CSV en el browser ──────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return { success: false, error: 'El archivo está vacío o no tiene filas.' }

  // Detectar separador
  const firstLine = lines[0]
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

  const headers = parseCSVLine(firstLine, sep).map(h => h.trim().toLowerCase())

  if (!headers.includes('feedback')) {
    return { success: false, error: "Columna 'feedback' no encontrada. Es obligatoria." }
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line, sep)
    const obj  = {}
    headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim() })

    const feedback = obj['feedback'] || ''
    if (feedback.length < 10) continue

    rows.push({
      row_number:  i,
      customer_id: obj['customer_id'] || `AUTO-${i}`,
      input:       feedback.slice(0, 5000),
      source:      obj['canal'] || 'csv_upload',
    })
  }

  if (rows.length === 0) return { success: false, error: 'No se encontraron filas válidas (mínimo 10 caracteres por comentario).' }
  return { success: true, rows }
}

function parseCSVLine(line, sep) {
  const result = []
  let current  = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === sep && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function chunk(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function downloadExample() {
  const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'sentio_ejemplo.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function CsvUploader({ onResult }) {
  const [file, setFile]           = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [orgId, setOrgId]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [progress, setProgress]   = useState(null)  // { done, total }
  const inputRef                  = useRef(null)

  const validateFile = (f) => {
    if (!f) return 'No se seleccionó ningún archivo.'
    if (!f.name.toLowerCase().endsWith('.csv')) return 'El archivo debe tener extensión .csv'
    if (f.size > 10 * 1024 * 1024) return 'El archivo supera el límite de 10MB.'
    return null
  }

  const pickFile = (f) => {
    const err = validateFile(f)
    if (err) { setError(err); return }
    setFile(f); setError(null)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    pickFile(e.dataTransfer.files[0])
  }, [])

  async function handleSubmit() {
    if (!file) return
    setLoading(true); setError(null); setProgress(null)

    try {
      // 1. Leer y parsear el CSV en el browser
      const text   = await file.text()
      const parsed = parseCSVText(text)
      if (!parsed.success) { setError(parsed.error); setLoading(false); return }

      const { rows }   = parsed
      const batches    = chunk(rows, BATCH_SIZE)
      const org_id     = orgId.trim() || 'default'
      const allResults = []

      // 2. Enviar en lotes al endpoint /analyze/batch (JSON)
      for (let i = 0; i < batches.length; i++) {
        setProgress({ done: i * BATCH_SIZE, total: rows.length })
        const batch = batches[i]
        const data  = await analyzeBatch({
          feedbacks: batch,
          org_id,
          source: 'csv_upload',
        })
        allResults.push(...(data.results || []))
      }
      setProgress({ done: rows.length, total: rows.length })

      // 3. Armar resumen agregado en el frontend
      const summary = buildSummary(allResults, rows.length)
      onResult({
        batch_id:  `csv-${Date.now()}`,
        org_id,
        total:     rows.length,
        processed: allResults.filter(r => !r.error).length,
        failed:    allResults.filter(r => r.error).length,
        results:   allResults,
        summary,
      })

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function buildSummary(results, total) {
    const valid      = results.filter(r => !r.error)
    const processed  = valid.length
    const promoters  = valid.filter(r => r.nps_classification === 'promotor').length
    const passives   = valid.filter(r => r.nps_classification === 'pasivo').length
    const detractors = valid.filter(r => r.nps_classification === 'detractor').length
    const nps_score  = processed > 0 ? Math.round(((promoters - detractors) / processed) * 100) : 0

    const aspectMap   = {}
    const emotionMap  = { 'satisfacción': 0, 'frustración': 0, 'enojo': 0, 'indiferencia': 0, 'decepción': 0, 'sorpresa_positiva': 0 }
    const industryMap = { telco: 0, retail: 0, general: 0 }

    for (const r of valid) {
      const e = r.dominant_emotion || ''
      if (e in emotionMap) emotionMap[e]++
      const ind = r.industry || 'general'
      industryMap[ind] = (industryMap[ind] || 0) + 1
      for (const a of (r.aspects || [])) {
        const n = a.aspect
        if (!n) continue
        if (!aspectMap[n]) aspectMap[n] = { aspect: n, total_mentions: 0, negative: 0, positive: 0 }
        aspectMap[n].total_mentions++
        if (a.sentiment === 'negativo') aspectMap[n].negative++
        if (a.sentiment === 'positivo') aspectMap[n].positive++
      }
    }

    const top_aspects = Object.values(aspectMap)
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 10)
      .map(a => ({
        ...a,
        negative_pct: a.total_mentions ? Math.round(a.negative / a.total_mentions * 100) : 0,
        positive_pct: a.total_mentions ? Math.round(a.positive / a.total_mentions * 100) : 0,
      }))

    return {
      nps_score,
      promoters, promoters_pct: processed ? Math.round(promoters / processed * 100) : 0,
      passives,  passives_pct:  processed ? Math.round(passives  / processed * 100) : 0,
      detractors, detractors_pct: processed ? Math.round(detractors / processed * 100) : 0,
      high_churn_count: valid.filter(r => r.churn_risk === 'alto').length,
      urgent_count:     valid.filter(r => r.urgency).length,
      top_aspects,
      dominant_emotions:  emotionMap,
      industry_breakdown: industryMap,
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800">Carga masiva por CSV</h2>
        <p className="text-slate-500 mt-2 text-sm">
          Subí un archivo con múltiples comentarios y obtené el análisis completo con NPS, aspectos y riesgo de churn.
        </p>
      </div>

      {/* Drag & drop */}
      <div
        onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onClick={() => !file && inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer"
        style={{
          borderColor:     dragging ? '#6366F1' : file ? '#10B981' : '#CBD5E1',
          backgroundColor: dragging ? '#EEF2FF' : file ? '#ECFDF5' : '#ffffff',
        }}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => pickFile(e.target.files[0])} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText size={24} style={{ color: '#10B981' }} />
            <div className="text-left">
              <p className="font-semibold text-slate-700 text-sm">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null); setError(null); setProgress(null) }}
              className="ml-2 p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload size={32} className="mx-auto text-slate-300" />
            <p className="font-medium text-slate-600">Arrastrá tu archivo CSV aquí</p>
            <p className="text-xs text-slate-400">o hacé click para seleccionar · máximo 10MB</p>
          </div>
        )}
      </div>

      {/* Config */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Organización <span className="text-slate-300">(opcional)</span></label>
          <input type="text" value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="default"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Columnas del CSV</p>
          <div className="rounded-xl overflow-hidden border border-slate-100">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-400">
                <th className="px-3 py-2 text-left font-medium">Columna</th>
                <th className="px-3 py-2 text-left font-medium">Requerido</th>
                <th className="px-3 py-2 text-left font-medium">Descripción</th>
              </tr></thead>
              <tbody>
                {COLUMNS_INFO.map((c, i) => (
                  <tr key={c.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-700">{c.name}</td>
                    <td className="px-3 py-2">{c.required ? <span className="text-emerald-600 font-semibold">Sí</span> : <span className="text-slate-400">No</span>}</td>
                    <td className="px-3 py-2 text-slate-500">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button onClick={downloadExample} className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-medium">
          <Download size={13} /> Descargar CSV de ejemplo
        </button>
      </div>

      {/* Progreso */}
      {loading && progress && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Analizando comentarios...</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, backgroundColor: '#6366F1' }} />
          </div>
          {progress.done === progress.total && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle size={12} /> Completado — armando resumen...
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Botón */}
      <button onClick={handleSubmit} disabled={!file || loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 font-semibold text-sm transition-all"
        style={{
          backgroundColor: file && !loading ? '#6366F1' : '#E2E8F0',
          color:           file && !loading ? '#fff'    : '#94A3B8',
          cursor:          file && !loading ? 'pointer' : 'not-allowed',
        }}>
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> Analizando... ({progress?.done || 0}/{progress?.total || '?'})</>
          : <><Upload size={15} /> Analizar CSV</>}
      </button>
    </div>
  )
}

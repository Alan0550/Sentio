import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const INDIGO = [99, 102, 241]
const SLATE  = [15, 23, 42]
const GRAY   = [148, 163, 184]
const RED    = [239, 68, 68]
const GREEN  = [16, 185, 129]

function npsSign(v) { return v > 0 ? `+${v}` : `${v}` }
function formatPeriod(p) {
  if (!p) return '—'
  const [y, m] = p.split('-')
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${months[parseInt(m) - 1]} ${y}`
}
function today() {
  return new Date().toLocaleDateString('es-BO', { day:'2-digit', month:'long', year:'numeric' })
}

function addFooter(doc, pageNum, totalPages) {
  const pageH = doc.internal.pageSize.height
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(`Generado por Sentio — ${today()}`, 14, pageH - 8)
  doc.text(`Página ${pageNum} de ${totalPages}`, doc.internal.pageSize.width - 14, pageH - 8, { align: 'right' })
}

export function generateMonthlyReport({ dashboard, benchmark, urgents, org_id = 'default', period }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W   = doc.internal.pageSize.width
  let page  = 1

  // ── Página 1: Portada ──────────────────────────────────────────────────────
  doc.setFillColor(...SLATE)
  doc.rect(0, 0, W, 80, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(36)
  doc.setFont('helvetica', 'bold')
  doc.text('SENTIO', W / 2, 40, { align: 'center' })

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 210, 220)
  doc.text('Reporte mensual de experiencia del cliente', W / 2, 52, { align: 'center' })

  doc.setFillColor(...INDIGO)
  doc.roundedRect(W / 2 - 40, 62, 80, 10, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(formatPeriod(period), W / 2, 69, { align: 'center' })

  doc.setTextColor(...SLATE)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Organización: ${org_id}`, W / 2, 105, { align: 'center' })
  doc.text(`Generado el: ${today()}`, W / 2, 115, { align: 'center' })

  addFooter(doc, page, 5)

  // ── Página 2: Resumen ejecutivo ───────────────────────────────────────────
  doc.addPage(); page++
  doc.setFillColor(...INDIGO)
  doc.rect(0, 0, W, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen ejecutivo', 14, 8)

  const d = dashboard || {}
  const nps = d.nps_score ?? null

  doc.setTextColor(...SLATE)
  doc.setFontSize(48)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(nps !== null && nps >= 0 ? GREEN : RED))
  doc.text(nps !== null ? npsSign(nps) : '—', W / 2, 52, { align: 'center' })

  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'normal')
  doc.text('Net Promoter Score', W / 2, 60, { align: 'center' })

  const rows2 = [
    ['Promotores', `${d.promoters_pct ?? 0}%`, `${d.promoters ?? 0} clientes`],
    ['Pasivos',    `${d.passives_pct  ?? 0}%`, `${d.passives  ?? 0} clientes`],
    ['Detractores',`${d.detractors_pct ?? 0}%`,`${d.detractors ?? 0} clientes`],
  ]
  autoTable(doc, {
    startY: 66,
    head: [['Clasificación', 'Porcentaje', 'Total']],
    body: rows2,
    headStyles: { fillColor: INDIGO, textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  const afterTable = doc.lastAutoTable.finalY + 5
  const metrics = [
    ['Total analizado', d.total_analyzed ?? 0],
    ['Casos urgentes',  d.urgent_count ?? 0],
    ['Churn alto',      d.high_churn_count ?? 0],
  ]
  metrics.forEach(([label, val], i) => {
    doc.setFontSize(10)
    doc.setTextColor(...SLATE)
    doc.setFont('helvetica', 'bold')
    doc.text(String(val), 14 + i * 60, afterTable + 10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.setFontSize(8)
    doc.text(label, 14 + i * 60, afterTable + 16)
  })

  if (benchmark) {
    const by = afterTable + 28
    doc.setFontSize(9)
    doc.setTextColor(...SLATE)
    doc.text(`Benchmark: promedio histórico ${npsSign(benchmark.average_nps ?? 0)}  |  vs promedio: ${benchmark.vs_average !== null ? (benchmark.vs_average >= 0 ? '+' : '') + benchmark.vs_average : '—'} pts  |  vs mejor mes: ${benchmark.vs_best !== null ? (benchmark.vs_best >= 0 ? '+' : '') + benchmark.vs_best : '—'} pts`, 14, by)
    if (benchmark.trend_description) {
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(benchmark.trend_description, 14, by + 6)
    }
  }

  addFooter(doc, page, 5)

  // ── Página 3: Top aspectos ────────────────────────────────────────────────
  doc.addPage(); page++
  doc.setFillColor(...INDIGO)
  doc.rect(0, 0, W, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Top aspectos', 14, 8)

  const aspects = (d.top_aspects || []).map(a => [
    a.aspect || a.name || '—',
    a.total_mentions || a.total || 0,
    `${a.negative_pct ?? a.pctNegative ?? 0}%`,
    `${a.positive_pct ?? a.pctPositive ?? 0}%`,
  ])

  autoTable(doc, {
    startY: 18,
    head: [['Aspecto', 'Menciones', '% Negativo', '% Positivo']],
    body: aspects.length ? aspects : [['Sin datos', '—', '—', '—']],
    headStyles: { fillColor: INDIGO, textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
    didParseCell(data) {
      if (data.column.index === 2 && data.section === 'body') {
        const val = parseInt(data.cell.raw)
        if (val >= 70) data.cell.styles.textColor = RED
      }
    },
  })

  addFooter(doc, page, 5)

  // ── Página 4: Urgentes ────────────────────────────────────────────────────
  doc.addPage(); page++
  doc.setFillColor(...INDIGO)
  doc.rect(0, 0, W, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Urgentes del período', 14, 8)

  const urgentList = (urgents || []).slice(0, 20)
  const urgentRows = urgentList.map(u => [
    u.customer_id || '—',
    (u.input_preview || '').slice(0, 60),
    u.churn_risk || '—',
    (u.urgent_status || 'pendiente').replace('_', ' '),
    u.urgent_assignee || '—',
  ])

  if (urgentRows.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.setFont('helvetica', 'normal')
    doc.text('Sin casos urgentes en este período.', 14, 25)
  } else {
    autoTable(doc, {
      startY: 18,
      head: [['Cliente', 'Preview feedback', 'Churn', 'Estado', 'Responsable']],
      body: urgentRows,
      headStyles: { fillColor: INDIGO, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 1: { cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    })
  }

  addFooter(doc, page, 5)

  // ── Página 5: Tendencia histórica ─────────────────────────────────────────
  doc.addPage(); page++
  doc.setFillColor(...INDIGO)
  doc.rect(0, 0, W, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Tendencia histórica', 14, 8)

  const historical = benchmark?.historical_nps || []
  const histRows   = historical.map((h, i) => {
    const prev   = i > 0 ? historical[i - 1].nps_score : null
    const change = prev !== null ? (h.nps_score - prev) : '—'
    return [
      formatPeriod(h.period),
      npsSign(h.nps_score),
      h.total,
      change !== '—' ? (change >= 0 ? `+${change}` : `${change}`) : '—',
    ]
  })

  autoTable(doc, {
    startY: 18,
    head: [['Período', 'NPS', 'Total analizado', 'vs período anterior']],
    body: histRows.length ? histRows : [['Sin datos históricos', '—', '—', '—']],
    headStyles: { fillColor: INDIGO, textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === histRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  addFooter(doc, page, 5)

  // Descargar
  const filename = `sentio-reporte-${org_id}-${period || 'sin-periodo'}.pdf`
  doc.save(filename)
}

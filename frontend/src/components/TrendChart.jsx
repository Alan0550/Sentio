import { useState } from 'react'
import { formatPeriod } from './PeriodSelector'

const W = 600
const H = 280
const PAD = { top: 24, right: 24, bottom: 40, left: 48 }

export default function TrendChart({ data = [] }) {
  const [tooltip, setTooltip] = useState(null)

  if (!data.length) return (
    <p className="text-sm text-slate-400 text-center py-8">Sin datos para graficar.</p>
  )

  const validScores = data.filter(d => d.nps_score !== null && d.nps_score !== undefined)
  const allScores   = validScores.map(d => d.nps_score)
  const minScore    = allScores.length ? Math.min(...allScores, -10) : -100
  const maxScore    = allScores.length ? Math.max(...allScores,  10) :  100
  const range       = Math.max(maxScore - minScore, 20)
  const padded_min  = minScore - range * 0.1
  const padded_max  = maxScore + range * 0.1

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom
  const n      = data.length

  const xPos = i => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yPos = v => PAD.top  + innerH - ((v - padded_min) / (padded_max - padded_min)) * innerH
  const yZero = yPos(0)

  // Polyline de puntos válidos
  const linePoints = data
    .map((d, i) => d.nps_score !== null ? `${xPos(i)},${yPos(d.nps_score)}` : null)
    .filter(Boolean)
    .join(" ")

  return (
    <div className="relative w-full" style={{ paddingBottom: `${(H / W) * 100}%` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Zona positiva */}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, yZero - PAD.top)}
          fill="rgba(16,185,129,0.08)" />
        {/* Zona negativa */}
        <rect x={PAD.left} y={yZero} width={innerW} height={Math.max(0, PAD.top + innerH - yZero)}
          fill="rgba(239,68,68,0.08)" />

        {/* Línea de referencia en 0 */}
        {yZero >= PAD.top && yZero <= PAD.top + innerH && (
          <line x1={PAD.left} y1={yZero} x2={PAD.left + innerW} y2={yZero}
            stroke="#94A3B8" strokeWidth="1" strokeDasharray="4,3" />
        )}

        {/* Línea del NPS */}
        {linePoints && (
          <polyline points={linePoints} fill="none" stroke="#6366F1" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Puntos y etiquetas eje X */}
        {data.map((d, i) => {
          const x = xPos(i)
          const hasData = d.nps_score !== null && d.nps_score !== undefined
          const y = hasData ? yPos(d.nps_score) : yZero
          const isLast = i === data.length - 1
          return (
            <g key={i}
              onMouseEnter={() => setTooltip({ x, y: hasData ? y : PAD.top + innerH / 2, d })}
              style={{ cursor: 'pointer' }}
            >
              {/* Anillo exterior para el punto actual */}
              {isLast && hasData && (
                <circle cx={x} cy={y} r={11}
                  fill="rgba(99,102,241,0.15)" stroke="none" />
              )}
              {/* Punto */}
              <circle cx={x} cy={hasData ? y : yZero} r={isLast && hasData ? 7 : 5}
                fill={hasData ? "#fff" : "transparent"}
                stroke={hasData ? "#6366F1" : "#CBD5E1"}
                strokeWidth={hasData ? (isLast ? 2.5 : 2) : 1.5}
                strokeDasharray={hasData ? "0" : "3,2"}
              />
              {/* Label eje X */}
              <text x={x} y={H - 6} textAnchor="middle"
                fontSize="10" fill="#94A3B8" fontFamily="system-ui, sans-serif">
                {formatPeriod(d.period)}
              </text>
            </g>
          )
        })}

        {/* Eje Y — valores */}
        {[padded_min, 0, padded_max].map(v => {
          const y = yPos(v)
          if (y < PAD.top || y > PAD.top + innerH) return null
          return (
            <text key={v} x={PAD.left - 6} y={y + 4} textAnchor="end"
              fontSize="10" fill="#94A3B8" fontFamily="system-ui, sans-serif">
              {Math.round(v)}
            </text>
          )
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const { x, y, d } = tooltip
          const bw = 110, bh = 52
          const bx = x + bw > W - 10 ? x - bw - 8 : x + 8
          const by = y - bh < PAD.top  ? y + 6      : y - bh - 6
          return (
            <g>
              <rect x={bx} y={by} width={bw} height={bh} rx={6}
                fill="#0F172A" opacity="0.92" />
              <text x={bx + bw / 2} y={by + 16} textAnchor="middle"
                fontSize="11" fill="#94A3B8" fontFamily="system-ui, sans-serif">
                {formatPeriod(d.period)}
              </text>
              <text x={bx + bw / 2} y={by + 32} textAnchor="middle"
                fontSize="16" fontWeight="bold" fill="#fff" fontFamily="system-ui, sans-serif">
                {d.nps_score !== null ? (d.nps_score > 0 ? `+${d.nps_score}` : d.nps_score) : '—'}
              </text>
              <text x={bx + bw / 2} y={by + 46} textAnchor="middle"
                fontSize="10" fill="#64748B" fontFamily="system-ui, sans-serif">
                {d.total_analyzed} analizados
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

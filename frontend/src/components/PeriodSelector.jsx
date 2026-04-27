const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

export function formatPeriod(period) {
  if (!period) return ''
  const [year, month] = period.split("-")
  return `${MONTHS[parseInt(month) - 1]} ${year}`
}

export default function PeriodSelector({ selectedPeriod, onPeriodChange, availablePeriods = [], dataByPeriod = {} }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max pb-1">
        {availablePeriods.map(p => {
          const hasData  = dataByPeriod[p]?.total_analyzed > 0
          const selected = p === selectedPeriod
          return (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: selected ? '#6366F1' : '#F1F5F9',
                color:           selected ? '#fff'    : '#475569',
                opacity:         hasData  ? 1         : 0.4,
              }}
            >
              {formatPeriod(p)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

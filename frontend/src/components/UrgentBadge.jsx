export default function UrgentBadge({ status }) {
  const cfg = {
    pendiente:  { bg: '#FEF2F2', color: '#EF4444', label: 'Pendiente',   dot: true  },
    en_gestion: { bg: '#FFF7ED', color: '#F97316', label: 'En gestión',  dot: false },
    resuelto:   { bg: '#F0FDF4', color: '#10B981', label: 'Resuelto',    dot: false, check: true },
  }[status] || { bg: '#FEF2F2', color: '#EF4444', label: 'Pendiente', dot: true }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.dot && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: cfg.color }} />
      )}
      {cfg.check && <span>✓</span>}
      {cfg.label}
    </span>
  )
}

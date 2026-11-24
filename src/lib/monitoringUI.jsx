import { MONITORING_LEVELS } from './monitoringConfig'

// ─── MONITORING LEVEL LOGO MAP ───────────────────────────────────────────────

// Small WebP renders of the original artwork (the .svg files wrap full-size
// PNGs: ~320 KB together vs ~33 KB here). Icons display at 64 px at most.
const LEVEL_LOGOS = {
  1: 'monitoring-casual.webp',
  2: 'monitoring-scout.webp',
  3: 'monitoring-vanguard.webp',
  4: 'monitoring-strix.webp',
}

// ─── ICON COMPONENT ──────────────────────────────────────────────────────────

export function MonitoringIcon({ level, size = 24, className = '' }) {
  const src = LEVEL_LOGOS[level]
  if (!src) return null

  // STRIX (Level 4) gets a 230% upscale as it's the special top-tier level
  const finalSize = level === 4 ? Math.round(size * 2.3) : size

  return (
    <img
      src={`${import.meta.env.BASE_URL}${src}`}
      alt={MONITORING_LEVELS[level]?.name || `Level ${level}`}
      width={finalSize}
      height={finalSize}
      className={className}
      style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}
      draggable={false}
    />
  )
}

// ─── BADGE STYLE HELPER ──────────────────────────────────────────────────────

export function getMonitoringBadgeStyle(level) {
  const config = MONITORING_LEVELS[level] || MONITORING_LEVELS[1]
  return {
    background: config.colorBg,
    color: config.color,
    border: `1px solid ${config.colorBorder}`,
    padding: '0.2rem 0.6rem',
    borderRadius: 99,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  }
}

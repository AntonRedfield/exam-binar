import { MONITORING_LEVELS } from './monitoringConfig'

// ─── ICON SVG COMPONENTS ─────────────────────────────────────────────────────

export function MonitoringIcon({ level, size = 24, className = '' }) {
  const s = size

  if (level === 1) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M2 12C2 12 5.5 7 12 7C18.5 7 22 12 22 12C22 12 18.5 17 12 17C5.5 17 2 12 2 12Z" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
        <circle cx="12" cy="12" r="2.5" fill="#22c55e" opacity="0.5"/>
        <path d="M4 10C4 10 7 7 12 7C17 7 20 10 20 10" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
      </svg>
    )
  }

  if (level === 2) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M2 12C2 12 5.5 6 12 6C18.5 6 22 12 22 12C22 12 18.5 18 12 18C5.5 18 2 12 2 12Z" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="3" fill="#f59e0b"/>
        <circle cx="12" cy="12" r="1.2" fill="white"/>
      </svg>
    )
  }

  if (level === 3) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M5 7L12 5L19 7" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 12C2 12 5.5 7 12 7C18.5 7 22 12 22 12C22 12 18.5 17 12 17C5.5 17 2 12 2 12Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="3" fill="#8b5cf6"/>
        <circle cx="13" cy="11.5" r="1" fill="white"/>
        <path d="M8 16C9 17 11 17.5 12 17.5C13 17.5 15 17 16 16" stroke="#8b5cf6" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      </svg>
    )
  }

  if (level === 4) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6L6.5 9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 6L17.5 9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="12" r="4" stroke="#ef4444" strokeWidth="1.5"/>
        <circle cx="8" cy="12" r="2" fill="#ef4444"/>
        <circle cx="8.5" cy="11.5" r="0.8" fill="white"/>
        <circle cx="16" cy="12" r="4" stroke="#ef4444" strokeWidth="1.5"/>
        <circle cx="16" cy="12" r="2" fill="#ef4444"/>
        <circle cx="16.5" cy="11.5" r="0.8" fill="white"/>
        <path d="M11 13L12 15L13 13" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 9L8 8L12 10" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20 9L16 8L12 10" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }

  return null
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

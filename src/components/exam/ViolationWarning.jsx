import { ShieldAlert } from 'lucide-react'

export default function ViolationWarning({ message }) {
  if (!message) return null
  return (
    <div className="violation-overlay">
      <ShieldAlert size={20} color="var(--danger)" style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--danger)', marginBottom: '0.1rem' }}>
          Pelanggaran Terdeteksi
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{message}</div>
      </div>
    </div>
  )
}

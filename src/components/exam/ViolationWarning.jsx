import { ShieldAlert } from 'lucide-react'

export default function ViolationWarning({ message }) {
  if (!message) return null
  return (
    <div className="violation-overlay" role="alert" aria-live="assertive">
      <div className="violation-icon-wrap">
        <ShieldAlert size={22} className="violation-icon" />
      </div>
      <div className="violation-content">
        <div className="violation-title">
          Peringatan Pelanggaran
        </div>
        <div className="violation-message">
          {message}
        </div>
      </div>
    </div>
  )
}

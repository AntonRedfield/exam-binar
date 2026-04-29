import { useState, useEffect } from 'react'
import { ShieldAlert, Lock } from 'lucide-react'

/**
 * Full-screen freeze overlay that blocks all interaction.
 * Shows countdown, offense number, and warning.
 *
 * @param {Object} props
 * @param {number} props.duration - Freeze duration in seconds
 * @param {number} props.offenseNumber - Which offense this is (1st, 2nd, 3rd...)
 * @param {Function} props.onComplete - Called when freeze ends
 */
export default function ScreenFreezeOverlay({ duration, offenseNumber, onComplete }) {
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.()
      return
    }
    const timer = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining, onComplete])

  const progress = ((duration - remaining) / duration) * 100

  return (
    <div className="freeze-overlay">
      <div className="freeze-content">
        {/* Pulsing lock icon */}
        <div className="freeze-icon">
          <Lock size={48} />
        </div>

        <h2 className="freeze-title">Layar Dibekukan</h2>

        <div className="freeze-offense-badge">
          <ShieldAlert size={14} />
          Pelanggaran ke-{offenseNumber}
        </div>

        <p className="freeze-desc">
          Layar Anda dibekukan selama <strong>{duration} detik</strong> karena pelanggaran berulang.
          <br />Harap fokus pada ujian Anda.
        </p>

        {/* Countdown */}
        <div className="freeze-countdown">
          <span className="freeze-countdown-number">{remaining}</span>
          <span className="freeze-countdown-label">detik tersisa</span>
        </div>

        {/* Progress bar */}
        <div className="freeze-progress">
          <div
            className="freeze-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="freeze-warning-text">
          ⚠️ Pelanggaran berikutnya akan mengakibatkan hukuman lebih berat.
        </p>
      </div>
    </div>
  )
}

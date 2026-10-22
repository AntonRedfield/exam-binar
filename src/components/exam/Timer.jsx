import { useEffect, useState, useRef } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'

/**
 * Timer component with two modes:
 * 1. Global timer (exam mode / quiz whole): uses `endTimestamp`
 * 2. Per-question timer (quiz mode): uses `durationSeconds` + `questionKey`
 *
 * Props:
 *  - endTimestamp: ISO string end time (global timer mode)
 *  - durationSeconds: number of seconds for per-question timer
 *  - questionKey: unique key to reset timer when question changes
 *  - onExpire: callback when timer hits 0
 *  - onWarning: callback when timer reaches warning threshold
 */
export default function Timer({ endTimestamp, durationSeconds, questionKey, onExpire, onWarning, paused = false }) {
  const [remaining, setRemaining] = useState(null)
  const triggeredRef = useRef(false)
  const warningTriggeredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  const onWarningRef = useRef(onWarning)
  const pausedTimeRef = useRef(0)
  const pauseStartRef = useRef(null)

  // Track pause intervals
  useEffect(() => {
    if (paused) {
      if (!pauseStartRef.current) {
        pauseStartRef.current = Date.now()
      }
    } else {
      if (pauseStartRef.current) {
        pausedTimeRef.current += (Date.now() - pauseStartRef.current)
        pauseStartRef.current = null
      }
    }
  }, [paused])

  // Keep callback refs fresh without restarting the interval
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    onWarningRef.current = onWarning
  }, [onWarning])

  // Per-question timer mode
  useEffect(() => {
    if (!durationSeconds) return
    triggeredRef.current = false
    warningTriggeredRef.current = false
    pausedTimeRef.current = 0
    pauseStartRef.current = null

    const startTime = Date.now()
    const baseEndTime = startTime + durationSeconds * 1000

    function tick() {
      if (paused) return
      const now = Date.now()
      const currentPause = pauseStartRef.current ? (now - pauseStartRef.current) : 0
      const totalPaused = pausedTimeRef.current + currentPause
      const effectiveEnd = baseEndTime + totalPaused
      const diff = Math.max(0, Math.floor((effectiveEnd - now) / 1000))
      setRemaining(diff)

      // Warning at 20% time remaining
      const warningThreshold = Math.ceil(durationSeconds * 0.2)
      if (diff <= warningThreshold && diff > 0 && !warningTriggeredRef.current) {
        warningTriggeredRef.current = true
        onWarningRef.current?.()
      }

      if (diff <= 0 && !triggeredRef.current) {
        triggeredRef.current = true
        onExpireRef.current?.()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [durationSeconds, questionKey, paused])

  // Global timer mode (existing behavior)
  useEffect(() => {
    if (!endTimestamp || durationSeconds) return
    triggeredRef.current = false
    warningTriggeredRef.current = false

    function tick() {
      if (paused) return
      const end = new Date(endTimestamp).getTime()
      const now = Date.now()
      const currentPause = pauseStartRef.current ? (now - pauseStartRef.current) : 0
      const totalPaused = pausedTimeRef.current + currentPause
      const effectiveEnd = end + totalPaused
      const diff = Math.max(0, Math.floor((effectiveEnd - now) / 1000))
      setRemaining(diff)
      if (diff <= 0 && !triggeredRef.current) {
        triggeredRef.current = true
        onExpireRef.current?.()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endTimestamp, durationSeconds, paused])

  if (remaining === null) return null

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const pad = n => String(n).padStart(2, '0')

  // Calculate warning threshold
  const totalTime = durationSeconds || (endTimestamp ? Math.floor((new Date(endTimestamp).getTime() - Date.now()) / 1000) + remaining : remaining)
  const warningThreshold = Math.ceil((durationSeconds || totalTime) * 0.2)

  let timerClass = 'timer normal'
  if (remaining <= Math.min(warningThreshold, 120) || remaining <= 10) timerClass = 'timer danger pulsing'
  else if (remaining <= warningThreshold) timerClass = 'timer warning'

  return (
    <div className={timerClass}>
      {remaining <= warningThreshold && remaining > 0 ? <AlertTriangle size={16} /> : <Clock size={16} />}
      {pad(mins)}:{pad(secs)}
    </div>
  )
}

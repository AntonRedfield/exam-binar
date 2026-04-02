import { useEffect, useState, useRef } from 'react'
import { Clock } from 'lucide-react'

export default function Timer({ endTimestamp, onExpire }) {
  const [remaining, setRemaining] = useState(null)
  const triggeredRef = useRef(false)
  const onExpireRef = useRef(onExpire)

  // Keep callback ref fresh without restarting the interval
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (!endTimestamp) return
    triggeredRef.current = false

    function tick() {
      const end = new Date(endTimestamp).getTime()
      const now = Date.now()
      const diff = Math.max(0, Math.floor((end - now) / 1000))
      setRemaining(diff)
      if (diff <= 0 && !triggeredRef.current) {
        triggeredRef.current = true
        onExpireRef.current?.()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endTimestamp])

  if (remaining === null) return null

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const pad = n => String(n).padStart(2, '0')

  let timerClass = 'timer normal'
  if (remaining <= 120) timerClass = 'timer danger pulsing'
  else if (remaining <= 600) timerClass = 'timer warning'

  return (
    <div className={timerClass}>
      <Clock size={16} />
      {pad(mins)}:{pad(secs)}
    </div>
  )
}

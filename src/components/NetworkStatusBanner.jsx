import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { WifiOff, RefreshCw } from 'lucide-react'
import { getNetworkState, subscribeNetwork } from '../lib/network'

// How long the "unstable" hint stays up after the last failed request
const UNSTABLE_HINT_MS = 20000

/**
 * Small, non-blocking connection hint shown on every page while the device is
 * offline or requests are being retried. The exam room shows its own status
 * next to the autosave badge, so the banner stays out of its way.
 */
export default function NetworkStatusBanner() {
  const location = useLocation()
  const [view, setView] = useState(() => ({ offline: !getNetworkState().online, unstable: false }))

  useEffect(() => {
    let fadeTimer = null
    const unsubscribe = subscribeNetwork((net) => {
      const unstable = net.retrying > 0 || net.failing
      setView({ offline: !net.online, unstable })
      clearTimeout(fadeTimer)
      if (unstable && net.retrying === 0) {
        // Hide the hint again if no further failures happen
        fadeTimer = setTimeout(() => setView(v => ({ ...v, unstable: false })), UNSTABLE_HINT_MS)
      }
    })
    return () => {
      unsubscribe()
      clearTimeout(fadeTimer)
    }
  }, [])

  if (/\/exam\/[^/]+\/room/.test(location.pathname)) return null
  if (!view.offline && !view.unstable) return null

  const { offline } = view
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        margin: '0 auto',
        maxWidth: 460,
        zIndex: 4000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.55rem 0.85rem',
        borderRadius: 10,
        background: offline ? '#1f2937' : '#fffbeb',
        color: offline ? '#f9fafb' : '#92400e',
        border: offline ? '1px solid #374151' : '1px solid #fcd34d',
        boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        fontSize: '0.8rem',
        lineHeight: 1.4,
      }}
    >
      {offline ? <WifiOff size={16} style={{ flexShrink: 0 }} /> : <RefreshCw size={16} style={{ flexShrink: 0 }} />}
      <span>
        {offline
          ? 'Tidak ada koneksi internet. Data tetap tersimpan di perangkat dan dikirim otomatis saat koneksi kembali.'
          : 'Koneksi lambat / tidak stabil — sistem mencoba ulang otomatis, mohon tunggu.'}
      </span>
    </div>
  )
}

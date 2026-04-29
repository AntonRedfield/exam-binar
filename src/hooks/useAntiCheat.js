import { useEffect, useRef, useCallback, useState } from 'react'
// Penalty functions are now used directly in ExamRoom.jsx

/**
 * Anti-cheat hook with monitoring-level awareness.
 *
 * @param {Object} opts
 * @param {boolean} opts.enabled - Whether monitoring is active
 * @param {number}  opts.monitoringLevel - 1–4 (default 1 = no restrictions)
 * @param {boolean} opts.isQuiz - Whether the current session is quiz mode
 * @param {Function} opts.onViolation - Called on every violation (reason: string)
 * @param {Function} opts.onFreeze - Called when a freeze is triggered (duration: number, offenseNumber: number)
 * @param {Function} opts.onTimeReduction - Called when time should be reduced (amount: number, isQuiz: boolean)
 *
 * @returns {{ violationCount: number }}
 */
export function useAntiCheat({
  enabled,
  monitoringLevel = 1,
  isQuiz = false,
  onViolation,
  onFreeze,
  onTimeReduction,
}) {
  const enabledRef = useRef(enabled)
  const levelRef = useRef(monitoringLevel)
  const violationCountRef = useRef(0)
  const [violationCount, setViolationCount] = useState(0)

  enabledRef.current = enabled
  levelRef.current = monitoringLevel

  const trigger = useCallback((reason) => {
    if (!enabledRef.current) return
    const level = levelRef.current

    // Level 1: no restrictions at all
    if (level < 2) return

    // Notify parent about the violation
    onViolation?.(reason)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return
    const level = monitoringLevel

    // Level 1: no event listeners needed
    if (level < 2) return

    // ─── Prevent closing / navigating away ─────────────────────────────
    const handleBeforeUnload = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      e.returnValue = 'Ujian sedang berlangsung. Yakin ingin meninggalkan halaman?'
      trigger('Keluar dari halaman ujian')
      return e.returnValue
    }

    // ─── Tab / window focus events ─────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        trigger('Berpindah tab / jendela tersembunyi')
      }
    }

    // ─── Block right click ─────────────────────────────────────────────
    const blockContextMenu = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      trigger('Klik kanan terdeteksi')
    }

    // ─── Block double click ────────────────────────────────────────────
    const blockDoubleClick = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      trigger('Double-click terdeteksi')
    }

    // ─── Block critical keyboard shortcuts ─────────────────────────────
    const handleKeyDown = (e) => {
      if (!enabledRef.current) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey

      // F12 dev tools
      if (key === 'F12') { e.preventDefault(); trigger('Tombol dev tools (F12)'); return }

      // Ctrl+Shift+I/J (dev tools)
      if (ctrl && e.shiftKey && ['I','J'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Shortcut dev tools'); return }

      // Ctrl+U view source
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('Lihat sumber halaman'); return }

      // Ctrl+C/V (copy/paste)
      if (ctrl && ['c','v'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} diblokir`); return }

      // Alt+Tab detection (limited — browser captures most)
      if (e.altKey && key === 'Tab') { e.preventDefault(); trigger('Alt+Tab terdeteksi'); return }

      // Alt+F4
      if (e.altKey && key === 'F4') { e.preventDefault(); trigger('Alt+F4 terdeteksi'); return }
    }

    // ─── Block copy/paste events ───────────────────────────────────────
    const blockClipboard = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      trigger(`${e.type === 'copy' ? 'Copy' : 'Paste'} diblokir`)
    }

    // ─── Register event listeners ──────────────────────────────────────
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('dblclick', blockDoubleClick)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('copy', blockClipboard)
    document.addEventListener('paste', blockClipboard)

    // ─── Cleanup ───────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('dblclick', blockDoubleClick)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('copy', blockClipboard)
      document.removeEventListener('paste', blockClipboard)
    }
  }, [enabled, monitoringLevel, trigger])

  return {}
}

import { useEffect, useRef, useCallback } from 'react'

/**
 * Anti-cheat hook with monitoring-level awareness and automated security rules
 * for split-screen and application leaving detection.
 *
 * @param {Object} opts
 * @param {boolean} opts.enabled - Whether monitoring is active
 * @param {number}  opts.monitoringLevel - 1–4 (default 1 = casual)
 * @param {boolean} opts.isQuiz - Whether the current session is quiz mode
 * @param {Function} opts.onViolation - Called on regular violation (reason: string)
 * @param {Function} opts.onFreeze - Called when a freeze is triggered (duration: number, offenseNumber: number)
 * @param {Function} opts.onTimeReduction - Called when time should be reduced (amount: number, isQuiz: boolean)
 * @param {Function} opts.onSecurityLockout - Called when split-screen or app leaving triggers auto-logout (type: string, reason: string)
 *
 * @returns {{}}
 */
export function useAntiCheat({
  enabled,
  monitoringLevel = 1,
  isQuiz = false,
  onViolation,
  onFreeze,
  onTimeReduction,
  onSecurityLockout,
}) {
  const enabledRef = useRef(enabled)
  const levelRef = useRef(monitoringLevel)
  const awayStartTimeRef = useRef(null)
  const awayTimerRef = useRef(null)
  const splitTimerRef = useRef(null)

  enabledRef.current = enabled
  levelRef.current = monitoringLevel

  const trigger = useCallback((reason) => {
    if (!enabledRef.current) return
    onViolation?.(reason)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return
    const level = monitoringLevel

    // ─── Input focus helper (avoids false split-screen on virtual keyboard) ──
    const isInputFocused = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName?.toUpperCase()
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    // ─── Split Screen Detection Helper ─────────────────────────────────
    const detectSplitScreen = () => {
      if (isInputFocused()) return false
      const screenW = window.screen.availWidth || window.screen.width || window.innerWidth
      const screenH = window.screen.availHeight || window.screen.height || window.innerHeight
      const winW = window.innerWidth
      const winH = window.innerHeight

      const wRatio = winW / screenW
      const hRatio = winH / screenH

      // 1. Mobile Portrait split screen (height heavily reduced by multi-window)
      if (screenH > screenW && hRatio < 0.62) {
        return true
      }

      // 2. Landscape or desktop split screen (width or height snapped/halved)
      if (screenW >= screenH && (wRatio < 0.65 || hRatio < 0.62)) {
        return true
      }

      // 3. Floating or excessively compressed window
      if (winW < 320 || winH < 260) {
        return true
      }

      return false
    }

    // ─── 1. Split Screen Watcher ────────────────────────────────────────
    const handleResize = () => {
      if (!enabledRef.current) return
      if (detectSplitScreen()) {
        if (!splitTimerRef.current) {
          splitTimerRef.current = setTimeout(() => {
            if (enabledRef.current && detectSplitScreen()) {
              onSecurityLockout?.('split_screen', 'Terdeteksi mencoba Split Screen (layar ganda)')
            } else {
              splitTimerRef.current = null
            }
          }, 1500)
        }
      } else {
        if (splitTimerRef.current) {
          clearTimeout(splitTimerRef.current)
          splitTimerRef.current = null
        }
      }
    }

    // ─── 2. Leaving App Watcher (Minimizing / Switching Apps / Tabs) ────
    const handleLeaveApp = () => {
      if (!enabledRef.current) return
      if (!awayStartTimeRef.current) {
        awayStartTimeRef.current = Date.now()
        if (awayTimerRef.current) clearTimeout(awayTimerRef.current)
        awayTimerRef.current = setTimeout(() => {
          if (enabledRef.current) {
            onSecurityLockout?.('app_switch', 'Keluar dari aplikasi ujian terlalu lama')
          }
        }, 4000)
      }
    }

    const handleReturnApp = () => {
      if (!enabledRef.current) return
      if (awayStartTimeRef.current) {
        const elapsed = Date.now() - awayStartTimeRef.current
        if (awayTimerRef.current) clearTimeout(awayTimerRef.current)
        awayTimerRef.current = null
        awayStartTimeRef.current = null

        if (elapsed >= 4000) {
          onSecurityLockout?.('app_switch', 'Keluar dari aplikasi ujian terlalu lama')
        } else {
          trigger('Peringatan: Berpindah tab / jendela terdeteksi')
        }
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleLeaveApp()
      } else {
        handleReturnApp()
      }
    }

    const handleBlur = () => {
      // Ignore blur if the user clicked inside an internal on-page iframe (e.g. PDF viewer or Video)
      if (document.visibilityState === 'visible' && document.activeElement?.tagName === 'IFRAME') {
        return
      }
      handleLeaveApp()
    }

    const handleFocus = () => {
      handleReturnApp()
      handleResize()
    }

    // ─── 3. Prevent closing / navigating away ───────────────────────────
    const handleBeforeUnload = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      e.returnValue = 'Ujian sedang berlangsung. Yakin ingin meninggalkan halaman?'
      trigger('Keluar dari halaman ujian')
      return e.returnValue
    }

    // ─── 4. Level-Specific Restrictions (Level >= 2) ───────────────────
    const blockContextMenu = (e) => {
      if (!enabledRef.current || level < 2) return
      e.preventDefault()
      trigger('Klik kanan terdeteksi')
    }

    const blockDoubleClick = (e) => {
      if (!enabledRef.current || level < 2) return
      e.preventDefault()
      trigger('Double-click terdeteksi')
    }

    const handleKeyDown = (e) => {
      if (!enabledRef.current || level < 2) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey

      if (key === 'F12') { e.preventDefault(); trigger('Tombol dev tools (F12)'); return }
      if (ctrl && e.shiftKey && ['I','J'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Shortcut dev tools'); return }
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('Lihat sumber halaman'); return }
      if (ctrl && ['c','v'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} diblokir`); return }
      if (e.altKey && key === 'Tab') { e.preventDefault(); trigger('Alt+Tab terdeteksi'); return }
      if (e.altKey && key === 'F4') { e.preventDefault(); trigger('Alt+F4 terdeteksi'); return }
    }

    const blockClipboard = (e) => {
      if (!enabledRef.current || level < 2) return
      e.preventDefault()
      trigger(`${e.type === 'copy' ? 'Copy' : 'Paste'} diblokir`)
    }

    // Register active listeners
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pagehide', handleLeaveApp)
    window.addEventListener('pageshow', handleReturnApp)
    window.addEventListener('beforeunload', handleBeforeUnload)

    if (level >= 2) {
      document.addEventListener('contextmenu', blockContextMenu)
      document.addEventListener('dblclick', blockDoubleClick)
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('copy', blockClipboard)
      document.addEventListener('paste', blockClipboard)
    }

    // Initial split screen check on mount
    handleResize()

    return () => {
      if (splitTimerRef.current) clearTimeout(splitTimerRef.current)
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pagehide', handleLeaveApp)
      window.removeEventListener('pageshow', handleReturnApp)
      window.removeEventListener('beforeunload', handleBeforeUnload)

      if (level >= 2) {
        document.removeEventListener('contextmenu', blockContextMenu)
        document.removeEventListener('dblclick', blockDoubleClick)
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('copy', blockClipboard)
        document.removeEventListener('paste', blockClipboard)
      }
    }
  }, [enabled, monitoringLevel, trigger, onSecurityLockout])

  return {}
}

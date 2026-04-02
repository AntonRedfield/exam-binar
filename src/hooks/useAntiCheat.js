import { useEffect, useRef, useCallback } from 'react'

export function useAntiCheat({ enabled, onViolation }) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const trigger = useCallback((reason) => {
    if (enabledRef.current) onViolation(reason)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return

    // ─── Prevent closing / navigating away ─────────────────────────────────
    const handleBeforeUnload = (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      e.returnValue = 'Ujian sedang berlangsung. Yakin ingin meninggalkan halaman?'
      return e.returnValue
    }

    // ─── Tab / window focus events (loosened: only track tab switch) ────────
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        trigger('Tab switched / window hidden')
      }
    }

    // ─── Block right click ──────────────────────────────────────────────────
    const blockContextMenu = (e) => {
      if (enabledRef.current) e.preventDefault()
    }

    // ─── Block only critical keyboard shortcuts (loosened) ──────────────────
    const handleKeyDown = (e) => {
      if (!enabledRef.current) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey

      // F12 dev tools
      if (key === 'F12') { e.preventDefault(); trigger('Dev tools key pressed'); return }

      // Ctrl+Shift+I/J (dev tools) — removed C and K to be lighter
      if (ctrl && e.shiftKey && ['I','J'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Dev tools shortcut'); return }

      // Ctrl+U view source
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('View source attempt'); return }

      // Only block Ctrl+C/V (copy/paste) — allow Ctrl+A, Ctrl+S, Ctrl+X, Ctrl+P
      if (ctrl && ['c','v'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} blocked`); return }
    }

    // ─── Block copy/paste events ────────────────────────────────────────────
    const blockClipboard = (e) => {
      if (enabledRef.current) { e.preventDefault(); trigger(`${e.type} attempt blocked`) }
    }

    // ─── Register event listeners (no fullscreen, no blur, no PrintScreen) ──
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('copy', blockClipboard)
    document.addEventListener('paste', blockClipboard)

    // ─── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('copy', blockClipboard)
      document.removeEventListener('paste', blockClipboard)
    }
  }, [enabled, trigger])
}

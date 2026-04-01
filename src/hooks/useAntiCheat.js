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

    // ─── Tab / window focus events ──────────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        trigger('Tab switched / window hidden')
        // Auto-refocus when they come back
        const refocus = () => {
          if (enabledRef.current) {
            window.focus()
          }
        }
        document.addEventListener('visibilitychange', function onReturn() {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', onReturn)
            refocus()
          }
        })
      }
    }

    const handleBlur = () => {
      trigger('Window lost focus')
      // Try to immediately reclaim focus
      setTimeout(() => {
        if (enabledRef.current) window.focus()
      }, 100)
    }

    // ─── Block right click ──────────────────────────────────────────────────
    const blockContextMenu = (e) => {
      if (enabledRef.current) e.preventDefault()
    }

    // ─── Block dangerous keyboard shortcuts ─────────────────────────────────
    const handleKeyDown = (e) => {
      if (!enabledRef.current) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const alt = e.altKey

      // PrintScreen
      if (key === 'PrintScreen') {
        trigger('Screenshot attempt detected')
        document.body.style.filter = 'blur(10px)'
        setTimeout(() => { document.body.style.filter = '' }, 1500)
        return
      }

      // F12 dev tools
      if (key === 'F12') { e.preventDefault(); trigger('Dev tools key pressed'); return }

      // Ctrl+Shift+I/J/C/K (dev tools)
      if (ctrl && e.shiftKey && ['I','J','C','K'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Dev tools shortcut'); return }

      // Ctrl+U view source
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('View source attempt'); return }

      // Ctrl+C/V/X/A/S/P (clipboard & shortcuts)
      if (ctrl && ['c','v','x','a','s','p'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} blocked`); return }

      // Ctrl+W / Ctrl+F4 (close tab) — browser may still handle it, but we try
      if (ctrl && (key.toLowerCase() === 'w' || key === 'F4')) { e.preventDefault(); trigger('Close tab attempt blocked'); return }

      // Alt+F4 (close window)
      if (alt && key === 'F4') { e.preventDefault(); trigger('Alt+F4 blocked'); return }

      // Alt+Tab (switch window) — limited browser support but we try
      if (alt && key === 'Tab') { e.preventDefault(); trigger('Alt+Tab blocked'); return }

      // Windows/Super key
      if (key === 'Meta' || key === 'OS') { trigger('Windows key pressed'); return }

      // Escape key — prevent exiting fullscreen
      if (key === 'Escape') { 
        e.preventDefault()
        trigger('Escape key blocked')
        return 
      }
    }

    // ─── Block copy/paste/cut events ────────────────────────────────────────
    const blockClipboard = (e) => {
      if (enabledRef.current) { e.preventDefault(); trigger(`${e.type} attempt blocked`) }
    }

    // ─── Fullscreen management ──────────────────────────────────────────────
    function requestFullscreen() {
      const elem = document.documentElement
      if (document.fullscreenElement) return // Already fullscreen
      
      const request = elem.requestFullscreen 
        || elem.webkitRequestFullscreen 
        || elem.mozRequestFullScreen 
        || elem.msRequestFullscreen

      if (request) {
        request.call(elem).catch(() => {
          // Fullscreen request failed (may need user gesture)
        })
      }
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && enabledRef.current) {
        trigger('Fullscreen exited')
        // Try to re-enter fullscreen after a small delay
        setTimeout(() => {
          if (enabledRef.current) requestFullscreen()
        }, 500)
      }
    }

    // Request fullscreen on mount
    requestFullscreen()

    // ─── Register all event listeners ───────────────────────────────────────
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('copy', blockClipboard)
    document.addEventListener('cut', blockClipboard)
    document.addEventListener('paste', blockClipboard)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    // ─── Cleanup (auto-off when exam ends) ──────────────────────────────────
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('copy', blockClipboard)
      document.removeEventListener('cut', blockClipboard)
      document.removeEventListener('paste', blockClipboard)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      
      // Exit fullscreen when exam ends
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) exit.call(document).catch(() => {})
      }
    }
  }, [enabled, trigger])
}

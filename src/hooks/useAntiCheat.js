import { useEffect, useRef, useCallback } from 'react'

export function useAntiCheat({ enabled, onViolation }) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const trigger = useCallback((reason) => {
    if (enabledRef.current) onViolation(reason)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return

    // Tab / window focus events
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') trigger('Tab switched / window hidden')
    }
    const handleBlur = () => trigger('Window lost focus')

    // Block right click
    const blockContextMenu = (e) => {
      if (enabledRef.current) e.preventDefault()
    }

    // Block clipboard shortcuts and dev tools
    const handleKeyDown = (e) => {
      if (!enabledRef.current) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey

      // PrintScreen
      if (key === 'PrintScreen') {
        trigger('Screenshot attempt detected')
        // Briefly blur sensitive content
        document.body.style.filter = 'blur(10px)'
        setTimeout(() => { document.body.style.filter = '' }, 1500)
        return
      }
      // F12 dev tools
      if (key === 'F12') { e.preventDefault(); trigger('Dev tools key pressed'); return }
      // Ctrl+Shift+I/J/C
      if (ctrl && e.shiftKey && ['I','J','C','K'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Dev tools shortcut'); return }
      // Ctrl+U view source
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('View source attempt'); return }
      // Ctrl+C/V/X/A
      if (ctrl && ['c','v','x','a','s','p'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} blocked`); return }
    }

    // Block copy/paste/cut events
    const blockClipboard = (e) => {
      if (enabledRef.current) { e.preventDefault(); trigger(`${e.type} attempt blocked`) }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('copy', blockClipboard)
    document.addEventListener('cut', blockClipboard)
    document.addEventListener('paste', blockClipboard)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('copy', blockClipboard)
      document.removeEventListener('cut', blockClipboard)
      document.removeEventListener('paste', blockClipboard)
    }
  }, [enabled, trigger])
}

import { useEffect, useRef, useCallback } from 'react'

/**
 * Anti-cheat hook with monitoring-level awareness and automated security rules
 * for split-screen and application leaving detection.
 *
 * Fully supports pinch & zoom on PDF, Question, and Answer areas without false violations or lockouts.
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
  const blurDebounceTimerRef = useRef(null)

  // Tracking pinch, zoom, keyboard, and on-page iframe interactions
  const isPinchingRef = useRef(false)
  const lastPinchOrZoomTimeRef = useRef(0)
  const lastKeyboardTimeRef = useRef(0)
  const lastOrientationTimeRef = useRef(0)
  const isInteractingWithIframeRef = useRef(false)
  const iframeInteractionTimerRef = useRef(null)

  enabledRef.current = enabled
  levelRef.current = monitoringLevel

  const trigger = useCallback((reason) => {
    if (!enabledRef.current) return
    onViolation?.(reason)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return
    const level = monitoringLevel

    const cancelSplitTimer = () => {
      if (splitTimerRef.current) {
        clearTimeout(splitTimerRef.current)
        splitTimerRef.current = null
      }
    }

    // ─── Input & Keyboard focus helper (avoids false split-screen on virtual keyboard) ──
    const isInputFocused = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName?.toUpperCase()
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        el.isContentEditable ||
        Boolean(el.closest?.('textarea')) ||
        Boolean(el.closest?.('input')) ||
        Boolean(el.closest?.('.essay-field-wrapper')) ||
        Boolean(el.closest?.('.essay-textarea'))
      )
    }

    const isKeyboardActiveOrRecent = () => {
      if (isInputFocused()) return true
      if (Date.now() - lastKeyboardTimeRef.current < 6000) return true
      return false
    }

    // ─── Internal iframe detection (PDF viewer, videos, etc.) ─────────
    const isInternalIframeActive = () => {
      if (isInteractingWithIframeRef.current) return true
      const active = document.activeElement
      if (!active) return false
      if (active.tagName === 'IFRAME') return true
      if (active.closest && (active.closest('iframe') || active.closest('.pdf-pane'))) return true

      const iframes = document.querySelectorAll('iframe')
      for (const iframe of iframes) {
        if (active === iframe) return true
      }
      return false
    }

    const setIframeInteracting = (state) => {
      if (state) {
        isInteractingWithIframeRef.current = true
        if (iframeInteractionTimerRef.current) {
          clearTimeout(iframeInteractionTimerRef.current)
          iframeInteractionTimerRef.current = null
        }
        // If an away timer or split timer was running when user focused PDF, cancel immediately
        if (awayTimerRef.current) {
          clearTimeout(awayTimerRef.current)
          awayTimerRef.current = null
        }
        cancelSplitTimer()
        awayStartTimeRef.current = null
      } else {
        if (iframeInteractionTimerRef.current) clearTimeout(iframeInteractionTimerRef.current)
        iframeInteractionTimerRef.current = setTimeout(() => {
          if (!isInternalIframeActive()) {
            isInteractingWithIframeRef.current = false
          }
        }, 1500)
      }
    }

    // ─── Zoom & Pinch state detector ──────────────────────────────────
    // Ensures pinch & zoom are NEVER misinterpreted as split-screen
    const isZoomedOrPinching = () => {
      // 1. Multi-touch pinch active right now on screen
      if (isPinchingRef.current) return true

      // 2. Pinch or zoom action happened within the last 5 seconds (generous grace period)
      if (Date.now() - lastPinchOrZoomTimeRef.current < 5000) return true

      // 3. Visual Viewport scale is zoomed in or out (standard mobile & modern browsers)
      if (window.visualViewport) {
        const scale = window.visualViewport.scale || 1
        if (scale > 1.02 || scale < 0.98) {
          return true
        }
        // If visual viewport width differs from layout viewport width (pinch zoom active)
        if (Math.abs(window.visualViewport.width - window.innerWidth) > 8) {
          return true
        }
      }

      // 4. Desktop/mobile browser page zoom check
      // When zoomed in, innerWidth decreases in CSS pixels, but innerWidth * devicePixelRatio covers screen
      const pixelRatio = window.devicePixelRatio || 1
      const effectiveW = window.innerWidth * pixelRatio
      const screenW = window.screen.availWidth || window.screen.width || window.innerWidth
      if (effectiveW >= screenW * 0.65) {
        if ((window.innerWidth / screenW) < 0.65) {
          return true // Small innerWidth is 100% due to page zoom
        }
      }

      // 5. Desktop outer window dimensions
      // If outerWidth is >= 65% of screen.availWidth, the physical window is maximized or wide
      if (window.outerWidth && window.screen?.availWidth) {
        const outerRatio = window.outerWidth / window.screen.availWidth
        if (outerRatio >= 0.65) {
          return true
        }
      }

      return false
    }

    // ─── Split Screen Detection Helper ─────────────────────────────────
    // Differentiates actual OS multi-window / snapped window from pinch/zoom
    const detectSplitScreen = () => {
      // Shield 1: Virtual keyboard is open or animating closed
      if (isKeyboardActiveOrRecent()) return false

      // Shield 2: User is currently pinching, recently pinched, or viewport/page is zoomed
      if (isZoomedOrPinching()) return false

      // Shield 3: Screen orientation was changed recently
      if (Date.now() - lastOrientationTimeRef.current < 3500) return false

      // Shield 4: User is interacting with PDF or embedded on-page iframe
      if (isInteractingWithIframeRef.current || isInternalIframeActive()) return false

      const screenW = window.screen.availWidth || window.screen.width || window.innerWidth
      const screenH = window.screen.availHeight || window.screen.height || window.innerHeight
      const winW = window.innerWidth
      const winH = window.innerHeight

      // 5. Desktop: evaluate physical outer window dimensions
      if (window.outerWidth && window.screen?.availWidth) {
        const outerWRatio = window.outerWidth / window.screen.availWidth
        const outerHRatio = window.outerHeight / (window.screen.availHeight || window.screen.height)

        // Desktop split-screen is when the actual browser window is physically halved (< 58%)
        if (outerWRatio < 0.58 || outerHRatio < 0.48) {
          return true
        }
        return false
      }

      // 6. Mobile Portrait: height halved by multi-window (top/bottom split)
      if (screenH > screenW) {
        const hRatio = winH / screenH
        // In Android multi-window portrait, height drops below 48% (normal mobile is ~0.72 - 0.85)
        if (hRatio < 0.48) {
          return true
        }
        return false
      }

      // 7. Mobile Landscape: width halved by multi-window (left/right split)
      // Note: Do NOT check hRatio in landscape, because mobile browser toolbars naturally reduce height!
      if (screenW >= screenH) {
        const wRatio = winW / screenW
        if (wRatio < 0.50) {
          return true
        }
        return false
      }

      return false
    }

    // ─── 1. Split Screen Watcher ────────────────────────────────────────
    const handleResize = () => {
      if (!enabledRef.current) return

      // If user is actively pinching or zoomed, cancel any pending split screen timeout immediately
      if (isZoomedOrPinching()) {
        cancelSplitTimer()
        return
      }

      if (detectSplitScreen()) {
        if (!splitTimerRef.current) {
          splitTimerRef.current = setTimeout(() => {
            if (enabledRef.current && detectSplitScreen()) {
              onSecurityLockout?.('split_screen', 'Terdeteksi mencoba Split Screen (layar ganda)')
            } else {
              splitTimerRef.current = null
            }
          }, 3000)
        }
      } else {
        cancelSplitTimer()
      }
    }

    // ─── 2. Leaving App Watcher (Minimizing / Switching Apps / Tabs) ────
    const handleLeaveApp = () => {
      if (!enabledRef.current) return
      // Never trigger leaving app if user is typing essay, interacting with PDF, or pinch-zooming
      if (
        isInputFocused() ||
        isKeyboardActiveOrRecent() ||
        isInteractingWithIframeRef.current ||
        isInternalIframeActive() ||
        isZoomedOrPinching()
      ) {
        return
      }
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

        // If this was during typing essay/input, pinch/zoom, or internal iframe interaction, do not penalize
        if (
          isInputFocused() ||
          isKeyboardActiveOrRecent() ||
          isZoomedOrPinching() ||
          isInteractingWithIframeRef.current ||
          isInternalIframeActive()
        ) {
          return
        }

        if (elapsed >= 4000) {
          onSecurityLockout?.('app_switch', 'Keluar dari aplikasi ujian terlalu lama')
        } else {
          trigger('Peringatan: Berpindah tab / jendela terdeteksi')
        }
      }
    }

    const handleVisibility = () => {
      if (!enabledRef.current) return
      if (document.visibilityState === 'hidden') {
        if (isInputFocused() || isKeyboardActiveOrRecent()) {
          return
        }
        handleLeaveApp()
      } else {
        handleReturnApp()
      }
    }

    const handleBlur = () => {
      if (!enabledRef.current) return

      // 1. User is typing in essay/input field or keyboard is active
      if (isInputFocused() || isKeyboardActiveOrRecent()) {
        if (awayTimerRef.current) {
          clearTimeout(awayTimerRef.current)
          awayTimerRef.current = null
        }
        awayStartTimeRef.current = null
        return
      }

      // 2. Gesture or zoom in progress: blur is common on mobile during pinch
      if (isZoomedOrPinching()) {
        return
      }

      // 3. User is interacting with PDF or internal iframe
      if (isInteractingWithIframeRef.current || isInternalIframeActive()) {
        return
      }

      // 4. If document is visible, verify activeElement after delay to handle async iframe/input focus
      if (document.visibilityState === 'visible') {
        if (blurDebounceTimerRef.current) clearTimeout(blurDebounceTimerRef.current)
        blurDebounceTimerRef.current = setTimeout(() => {
          if (!enabledRef.current) return
          if (document.visibilityState !== 'visible') {
            handleLeaveApp()
            return
          }
          if (
            isInputFocused() ||
            isKeyboardActiveOrRecent() ||
            isZoomedOrPinching() ||
            isInteractingWithIframeRef.current ||
            isInternalIframeActive()
          ) {
            return
          }
          // Truly left window
          handleLeaveApp()
        }, 200)
        return
      }

      handleLeaveApp()
    }

    const handleFocus = () => {
      if (!enabledRef.current) return

      if (blurDebounceTimerRef.current) {
        clearTimeout(blurDebounceTimerRef.current)
        blurDebounceTimerRef.current = null
      }

      // If returning from essay typing, PDF iframe, or pinch/zoom, clear any away timers silently with NO warning
      if (
        isInputFocused() ||
        isKeyboardActiveOrRecent() ||
        isInteractingWithIframeRef.current ||
        isZoomedOrPinching()
      ) {
        if (awayTimerRef.current) {
          clearTimeout(awayTimerRef.current)
          awayTimerRef.current = null
        }
        awayStartTimeRef.current = null
        handleResize()
        return
      }

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

    // ─── 4. Gesture & Viewport Watchers ─────────────────────────────────
    const handleViewportChange = () => {
      lastPinchOrZoomTimeRef.current = Date.now()
      cancelSplitTimer()
    }

    const handleOrientationChange = () => {
      lastOrientationTimeRef.current = Date.now()
      lastPinchOrZoomTimeRef.current = Date.now()
      cancelSplitTimer()
    }

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleTouchStart = (e) => {
      if (e.touches && e.touches.length >= 2) {
        isPinchingRef.current = true
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
      }
      const target = e.target
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest?.('textarea') ||
        target?.closest?.('input') ||
        target?.closest?.('.essay-field-wrapper')
      ) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
      }
      if (
        target?.tagName === 'IFRAME' ||
        target?.closest?.('.pdf-pane') ||
        target?.closest?.('.exam-mobile-tabs') ||
        target?.closest?.('.zoom-controls-bar')
      ) {
        setIframeInteracting(true)
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches && e.touches.length >= 2) {
        isPinchingRef.current = true
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleTouchEnd = (e) => {
      if (!e.touches || e.touches.length < 2) {
        isPinchingRef.current = false
        lastPinchOrZoomTimeRef.current = Date.now()
      }
      cancelSplitTimer()
    }

    const handlePointerDown = (e) => {
      const target = e.target
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest?.('textarea') ||
        target?.closest?.('input') ||
        target?.closest?.('.essay-field-wrapper')
      ) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
      }
      if (
        target?.tagName === 'IFRAME' ||
        target?.closest?.('.pdf-pane') ||
        target?.closest?.('.exam-mobile-tabs') ||
        target?.closest?.('.zoom-controls-bar')
      ) {
        setIframeInteracting(true)
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleGestureStart = () => {
      isPinchingRef.current = true
      lastPinchOrZoomTimeRef.current = Date.now()
      cancelSplitTimer()
    }

    const handleGestureEnd = () => {
      isPinchingRef.current = false
      lastPinchOrZoomTimeRef.current = Date.now()
      cancelSplitTimer()
    }

    const handleFocusIn = (e) => {
      const tag = e.target?.tagName?.toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleFocusOut = (e) => {
      const tag = e.target?.tagName?.toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    const handleInputActivity = (e) => {
      const target = e.target || document.activeElement
      const tag = target?.tagName?.toUpperCase()
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        Boolean(target?.closest?.('textarea')) ||
        Boolean(target?.closest?.('input')) ||
        Boolean(target?.closest?.('.essay-field-wrapper'))
      ) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
      }
    }

    // ─── 5. Level-Specific Restrictions (Level >= 2) ───────────────────
    const blockContextMenu = (e) => {
      if (!enabledRef.current || level < 2) return
      const target = e.target || document.activeElement
      const tag = target?.tagName?.toUpperCase()
      const isInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        Boolean(target?.closest?.('textarea')) ||
        Boolean(target?.closest?.('input')) ||
        Boolean(target?.closest?.('.essay-field-wrapper')) ||
        isInputFocused()

      // Allow context menu (spelling suggestions, text selection) inside essay/input fields
      if (isInput) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
        return
      }

      e.preventDefault()
      trigger('Klik kanan terdeteksi')
    }

    const blockDoubleClick = () => {
      // Double tap/click is used for zooming into images, formulas, and questions/answers.
      // Register zoom activity without triggering false cheat violations.
      lastPinchOrZoomTimeRef.current = Date.now()
      cancelSplitTimer()
    }

    const handleKeyDown = (e) => {
      if (!enabledRef.current || level < 2) return
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const target = e.target || document.activeElement
      const tag = target?.tagName?.toUpperCase()
      const isInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        Boolean(target?.closest?.('textarea')) ||
        Boolean(target?.closest?.('input')) ||
        Boolean(target?.closest?.('.essay-field-wrapper')) ||
        isInputFocused()

      // Allow text typing, selection, and editing in essay and input fields without blocking or false cheat warnings
      if (isInput) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
        // If developer tools or window closing/switching shortcuts, block them
        if (key === 'F12') { e.preventDefault(); trigger('Tombol dev tools (F12)'); return }
        if (ctrl && e.shiftKey && ['I','J'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Shortcut dev tools'); return }
        if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('Lihat sumber halaman'); return }
        if (e.altKey && key === 'Tab') { e.preventDefault(); trigger('Alt+Tab terdeteksi'); return }
        if (e.altKey && key === 'F4') { e.preventDefault(); trigger('Alt+F4 terdeteksi'); return }
        // Let all text-editing keys pass cleanly (Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+Z, Ctrl+X, Enter, Backspace, etc.)
        return
      }

      // Allow browser zoom shortcuts without warning or blocking
      if (ctrl && (key === '+' || key === '-' || key === '=' || key === '_' || key === '0')) {
        lastPinchOrZoomTimeRef.current = Date.now()
        cancelSplitTimer()
        return
      }

      if (key === 'F12') { e.preventDefault(); trigger('Tombol dev tools (F12)'); return }
      if (ctrl && e.shiftKey && ['I','J'].includes(key.toUpperCase())) { e.preventDefault(); trigger('Shortcut dev tools'); return }
      if (ctrl && key.toLowerCase() === 'u') { e.preventDefault(); trigger('Lihat sumber halaman'); return }
      if (ctrl && ['c','v'].includes(key.toLowerCase())) { e.preventDefault(); trigger(`Ctrl+${key.toUpperCase()} diblokir`); return }
      if (e.altKey && key === 'Tab') { e.preventDefault(); trigger('Alt+Tab terdeteksi'); return }
      if (e.altKey && key === 'F4') { e.preventDefault(); trigger('Alt+F4 terdeteksi'); return }
    }

    const blockClipboard = (e) => {
      if (!enabledRef.current || level < 2) return
      const target = e.target || document.activeElement
      const tag = target?.tagName?.toUpperCase()
      const isInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        Boolean(target?.closest?.('textarea')) ||
        Boolean(target?.closest?.('input')) ||
        Boolean(target?.closest?.('.essay-field-wrapper')) ||
        isInputFocused()

      // Allow clipboard operations (copy, paste, cut) inside essay / input fields
      if (isInput) {
        lastKeyboardTimeRef.current = Date.now()
        cancelSplitTimer()
        return
      }

      e.preventDefault()
      trigger(`${e.type === 'copy' ? 'Copy' : 'Paste'} diblokir`)
    }

    // Register active listeners
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.addEventListener('wheel', handleWheel, { passive: true })
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('gesturestart', handleGestureStart, { passive: true })
    window.addEventListener('gestureend', handleGestureEnd, { passive: true })

    document.addEventListener('focusin', handleFocusIn, { passive: true })
    document.addEventListener('focusout', handleFocusOut, { passive: true })
    document.addEventListener('input', handleInputActivity, { passive: true })
    document.addEventListener('compositionstart', handleInputActivity, { passive: true })
    document.addEventListener('compositionupdate', handleInputActivity, { passive: true })

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
      if (blurDebounceTimerRef.current) clearTimeout(blurDebounceTimerRef.current)
      if (iframeInteractionTimerRef.current) clearTimeout(iframeInteractionTimerRef.current)

      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.removeEventListener('wheel', handleWheel)
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('gesturestart', handleGestureStart)
      window.removeEventListener('gestureend', handleGestureEnd)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('input', handleInputActivity)
      document.removeEventListener('compositionstart', handleInputActivity)
      document.removeEventListener('compositionupdate', handleInputActivity)

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

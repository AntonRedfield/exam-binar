import { useEffect, useState, useRef, useCallback } from 'react'

/**
 * Checks whether the current webpage has been translated by a browser
 * (Google Translate, Microsoft Edge Translator, Safari translation, etc.)
 *
 * Detection signals:
 * 1. document.documentElement.lang is no longer 'id'
 * 2. <html> contains class 'translated-ltr' or 'translated-rtl'
 * 3. DOM contains Google Translate wrappers like <font style="vertical-align: inherit">
 * 4. #quiz-area lang is no longer 'en'
 * 5. Presence of translator injected elements or attributes
 */
export function isPageTranslated() {
  if (typeof document === 'undefined') return false

  const html = document.documentElement
  if (!html) return false

  // 1. Root language changed from Indonesian ('id')
  const rootLang = (html.getAttribute('lang') || '').trim().toLowerCase()
  if (rootLang && rootLang !== 'id') {
    return true
  }

  // 2. Browser translation class on <html>
  if (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')) {
    return true
  }

  // 3. Google Translate injected font wrapper nodes
  const fontWrapper = document.querySelector('font[style*="vertical-align"]')
  if (fontWrapper) {
    return true
  }

  // 4. Injected Google Translate banner or tooltip elements
  if (
    document.querySelector('.goog-te-banner-frame') ||
    document.querySelector('#goog-gt-tt') ||
    document.querySelector('.goog-te-balloon-frame')
  ) {
    return true
  }

  // 5. Quiz area content container language changed from declared 'en'
  const quizArea = document.getElementById('quiz-area')
  if (quizArea) {
    const quizLang = (quizArea.getAttribute('lang') || '').trim().toLowerCase()
    if (quizLang && quizLang !== 'en') {
      return true
    }
  }

  return false
}

/**
 * React hook to guard exam/quiz content against browser auto-translation.
 *
 * @param {Object} options
 * @param {boolean} [options.enabled=true] - Whether guarding is active
 * @param {Function} [options.onViolation] - Callback when translation is detected
 */
export function useTranslationGuard({ enabled = true, onViolation } = {}) {
  const [isTranslated, setIsTranslated] = useState(false)
  const violationTriggeredRef = useRef(false)
  const onViolationRef = useRef(onViolation)
  onViolationRef.current = onViolation

  const evaluateState = useCallback(() => {
    if (!enabled) return false

    const translated = isPageTranslated()
    if (translated) {
      setIsTranslated(true)
      if (!violationTriggeredRef.current) {
        violationTriggeredRef.current = true
        onViolationRef.current?.('Terdeteksi menggunakan fitur terjemahan otomatis browser (Auto-Translate)')
      }
      return true
    }
    return false
  }, [enabled])

  const recheckTranslation = useCallback(() => {
    const translated = isPageTranslated()
    if (!translated) {
      // Re-apply required attributes to ensure document is clean
      if (document.documentElement) {
        document.documentElement.setAttribute('lang', 'id')
        document.documentElement.setAttribute('translate', 'no')
        document.documentElement.classList.add('notranslate')
        document.documentElement.classList.remove('translated-ltr', 'translated-rtl')
      }
      const quiz = document.getElementById('quiz-area')
      if (quiz) {
        quiz.setAttribute('lang', 'en')
        quiz.setAttribute('translate', 'no')
        quiz.classList.add('notranslate')
      }
      setIsTranslated(false)
      violationTriggeredRef.current = false
      return false
    }
    return true
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    // Run initial check on mount
    evaluateState()

    const html = document.documentElement
    if (!html) return

    // MutationObserver watching <html> and document subtree for attribute changes and injected translate wrappers
    const observer = new MutationObserver(() => {
      evaluateState()
    })

    try {
      observer.observe(html, {
        attributes: true,
        subtree: true,
        childList: true,
        attributeFilter: ['lang', 'class'],
      })
    } catch (e) {
      console.warn('Translation guard observer error:', e)
    }

    // Recheck on visibility change (e.g. user enabled translation while in another tab/menu)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluateState()
      }
    }

    // Periodic safety check
    const interval = setInterval(() => {
      evaluateState()
    }, 2000)

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', evaluateState)

    return () => {
      observer.disconnect()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', evaluateState)
    }
  }, [enabled, evaluateState])

  return {
    isTranslated,
    recheckTranslation,
    setIsTranslated,
  }
}

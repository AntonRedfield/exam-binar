/**
 * Utility functions for numeric and mark formatting across the SNT 10 CBT application.
 * Ensures all marks and scores display at most 2 digits after the comma/decimal point.
 */

/**
 * Format any score, mark, or point value to display at most `maxDigits` decimal digits (default: 2).
 * Uses Indonesian locale standard with comma as decimal separator.
 * E.g., 85 -> "85", 85.5 -> "85,5", 85.33333333 -> "85,33", 0.7142857 -> "0,71"
 * Returns "0" if null/undefined.
 */
export function formatScore(val, maxDigits = 2) {
  if (val === null || val === undefined || val === '') return '0'
  let raw = val
  if (typeof raw === 'string' && raw.includes(',')) {
    raw = raw.replace(',', '.')
  }
  const num = Number(raw)
  if (isNaN(num)) return String(val)
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits
  })
}

/**
 * Format percentage to at most `maxDigits` decimal digits (default: 2).
 * E.g., 85 -> "85%", 85.33333 -> "85,33%"
 */
export function formatPct(val, maxDigits = 2) {
  return `${formatScore(val, maxDigits)}%`
}

/**
 * Round a numeric score to at most `decimals` places (default: 2) as a pure JS Number.
 * Prevents IEEE 754 floating-point drift like 0.1 + 0.2 = 0.30000000000000004.
 * E.g., 85.3333333 -> 85.33
 */
export function roundScore(val, decimals = 2) {
  if (val === null || val === undefined || val === '') return 0
  let raw = val
  if (typeof raw === 'string' && raw.includes(',')) {
    raw = raw.replace(',', '.')
  }
  const num = Number(raw)
  if (isNaN(num)) return 0
  const factor = Math.pow(10, decimals)
  return Math.round((num + Number.EPSILON) * factor) / factor
}

/**
 * Strips HTML formatting tags and markdown markers for plain-text snippets
 */
export function stripFormatting(text) {
  if (!text) return ''
  return String(text)
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .trim()
}

/**
 * Safely processes text formatting (bold, italic, underline, bullets, numbers)
 * Returns a sanitized HTML string safe for rendering.
 */
export function processFormattedText(text) {
  if (!text) return ''

  let processed = String(text)

  // 1. Convert markdown bold **text** to <b>text</b>
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')

  // 2. Convert markdown italic *text* to <i>text</i> (without matching bullets or double asterisks)
  processed = processed.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, '$1<i>$2</i>$3')

  // 3. Strip dangerous script/iframe/object/embed tags
  processed = processed.replace(/<\/?(script|iframe|style|object|embed|link|meta|base|applet)[^>]*>/gi, '')

  // 4. Strip dangerous event handlers (e.g. onclick, onerror, onload)
  processed = processed.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
  processed = processed.replace(/\son\w+\s*=\s*[^ >]+/gi, '')

  // 5. Strip javascript: URLs
  processed = processed.replace(/javascript\s*:/gi, '')

  return processed
}

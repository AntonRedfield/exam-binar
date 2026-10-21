import React from 'react'

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
  processed = processed.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<i>$2</i>$3')

  // 3. Strip dangerous script/iframe/object/embed tags
  processed = processed.replace(/<\/?(script|iframe|style|object|embed|link|meta|base|applet)[^>]*>/gi, '')

  // 4. Strip dangerous event handlers (e.g. onclick, onerror, onload)
  processed = processed.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
  processed = processed.replace(/\son\w+\s*=\s*[^ >]+/gi, '')

  // 5. Strip javascript: URLs
  processed = processed.replace(/javascript\s*:/gi, '')

  return processed
}

/**
 * Renders formatted question text safely with bold, italic, underline, bullets, and numbers.
 */
export default function FormattedText({ text, className = '', style = {} }) {
  if (!text) return null

  const html = processFormattedText(text)

  return (
    <div
      className={`formatted-question-text ${className}`.trim()}
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 1.65,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

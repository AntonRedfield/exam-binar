import React from 'react'
import { stripFormatting, processFormattedText } from '../../lib/format'

export { stripFormatting, processFormattedText }

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

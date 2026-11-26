/**
 * Helpers for writing a result row without losing work already in it.
 */

/** A stored breakdown can be a JSON string or an array: always return an array. */
export function parseBreakdown(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const isEssayItem = (b) =>
  b && (b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))

/**
 * Fresh auto-grading marks essay items as "pending". Keep the teacher's
 * per-question essay grades from the existing breakdown (same rule as
 * results.regradeAllForExam), so re-saving a result never wipes them.
 */
export function keepGradedEssays(newBreakdown, oldBreakdown) {
  const graded = new Map()
  for (const b of parseBreakdown(oldBreakdown)) {
    if (isEssayItem(b) && b.status !== 'pending' && b.earned !== undefined) {
      graded.set(Number(b.number), b)
    }
  }
  if (graded.size === 0) return newBreakdown
  return (newBreakdown || []).map(b => {
    if (!isEssayItem(b)) return b
    const prev = graded.get(Number(b.number))
    if (!prev) return b
    const max = Number(b.max) || 0
    const earned = Math.min(Math.max(0, Number(prev.earned) || 0), max || Number(prev.earned) || 0)
    const status = earned === max ? 'correct' : (earned > 0 ? 'partial' : 'wrong')
    return { ...b, earned, status }
  })
}

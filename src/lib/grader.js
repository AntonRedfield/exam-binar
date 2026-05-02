/**
 * Grade an exam session against the correct answers.
 * Returns { autoScore, maxAutoScore, essayPending, breakdown }
 */
export function gradeExam(answers, questions) {
  let autoScore = 0
  let maxAutoScore = 0
  let essayPending = false
  const breakdown = []

  for (const q of questions) {
    const studentAnswer = answers[String(q.number)]
    const pts = q.points || 1

    if (q.type === 'ESSAY') {
      essayPending = true
      breakdown.push({ number: q.number, type: q.type, status: 'pending', earned: 0, max: pts, given: studentAnswer })
      continue
    }

    maxAutoScore += pts

    if (q.type === 'MCQ') {
      const correct = String(q.correct_answer).toLowerCase()
      const given = studentAnswer ? String(studentAnswer).toLowerCase() : ''
      const isCorrect = correct === given
      const earned = isCorrect ? pts : 0
      autoScore += earned
      breakdown.push({ number: q.number, type: q.type, status: isCorrect ? 'correct' : 'wrong', earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'TRUE_FALSE') {
      const optionsObj = q.options || {}
      const correctObj = q.correct_answer || {}
      const givenObj = studentAnswer || {}
      // Grade based on the available statements visible to the student
      const keys = Object.keys(optionsObj)
      
      let correctCount = 0
      for (const k of keys) {
        if (correctObj[k] !== undefined) {
          if (String(correctObj[k]).toLowerCase() === String(givenObj[k]).toLowerCase()) {
            correctCount++
          }
        }
      }

      const ratio = keys.length > 0 ? correctCount / keys.length : 0
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned

      let status = 'wrong'
      if (ratio >= 1) status = 'correct'
      else if (ratio > 0) status = 'partial'

      breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'COMPLEX_MCQ') {
      const correctSet = Array.isArray(q.correct_answer) ? q.correct_answer.map(a => String(a).toLowerCase()) : []
      const givenSet = Array.isArray(studentAnswer) ? studentAnswer.map(a => String(a).toLowerCase()) : []

      const correctSelected = givenSet.filter(a => correctSet.includes(a)).length
      const wrongSelected = givenSet.filter(a => !correctSet.includes(a)).length
      const totalCorrect = correctSet.length

      let ratio = totalCorrect > 0 ? (correctSelected / totalCorrect) - (wrongSelected * 0.25) : 0
      ratio = Math.max(0, ratio)
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned
      breakdown.push({ number: q.number, type: q.type, status: ratio >= 1 ? 'correct' : ratio > 0 ? 'partial' : 'wrong', earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }
  }

  return { autoScore: Math.round(autoScore * 100) / 100, maxAutoScore, essayPending, breakdown }
}

/**
 * Extract Google Drive file ID from various share link formats
 */
export function extractDriveFileId(url) {
  if (!url) return null
  // Format: /file/d/FILE_ID/view or /file/d/FILE_ID/edit
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  // Format: id=FILE_ID
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (match2) return match2[1]
  return null
}

/**
 * Build a Google Drive embed URL from a share link
 */
export function getDriveEmbedUrl(url) {
  const fileId = extractDriveFileId(url)
  if (!fileId) return url // fallback
  return `https://drive.google.com/file/d/${fileId}/preview`
}

/**
 * Build a Google Drive direct image URL from a share link
 */
export function getDriveImageUrl(url) {
  const fileId = extractDriveFileId(url)
  if (!fileId) return url // fallback
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
}

/**
 * Safely parse an option set into an array of lowercase strings.
 * Handles arrays, JSON-encoded strings, comma-separated strings, or single values.
 */
function parseOptionList(val) {
  if (!val) return []
  if (Array.isArray(val)) {
    return val.map(a => String(a).trim().toLowerCase()).filter(Boolean)
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(a => String(a).trim().toLowerCase()).filter(Boolean)
        }
      } catch {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
    }
    return [trimmed.toLowerCase()]
  }
  return []
}

/**
 * Safely parse an object map (e.g. for TRUE_FALSE, MATCHING, AGREE_DISAGREE).
 * Handles Javascript objects or JSON-encoded strings.
 */
function parseObjectMap(val) {
  if (!val) return {}
  if (typeof val === 'object' && !Array.isArray(val)) return val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
          return parsed
        }
      } catch {}
    }
  }
  return {}
}

/**
 * Safely parse an array (e.g. for SEQUENCING).
 * Handles Javascript arrays, JSON-encoded strings, or comma-separated strings.
 */
function parseArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

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
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1

    maxAutoScore += pts

    if (q.type === 'ESSAY' || q.type === 'PARAGRAPH') {
      essayPending = true
      breakdown.push({ number: q.number, type: q.type, status: 'pending', earned: 0, max: pts, given: studentAnswer })
      continue
    }

    if (q.type === 'MCQ' || q.type === 'DROPDOWN') {
      const correctArr = parseOptionList(q.correct_answer)
      if (correctArr.length > 1) {
        // Multi-option MCQ proportional scoring: (pts / totalCorrect) * correctSelected
        const givenArr = parseOptionList(studentAnswer)
        const totalCorrect = correctArr.length
        const correctSelected = givenArr.filter(a => correctArr.includes(a)).length
        const wrongSelected = givenArr.filter(a => !correctArr.includes(a)).length

        const ratio = totalCorrect > 0 ? (correctSelected / totalCorrect) : 0
        const earned = Math.round(ratio * pts * 100) / 100
        autoScore += earned

        let status = 'wrong'
        if (totalCorrect > 0 && correctSelected === totalCorrect && wrongSelected === 0) {
          status = 'correct'
        } else if (earned > 0) {
          status = 'partial'
        }

        breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
      } else {
        const correct = String(Array.isArray(q.correct_answer) ? q.correct_answer[0] : (q.correct_answer || '')).trim().toLowerCase()
        const given = studentAnswer ? String(Array.isArray(studentAnswer) ? studentAnswer[0] : studentAnswer).trim().toLowerCase() : ''
        const isCorrect = correct !== '' && correct === given
        const earned = isCorrect ? pts : 0
        autoScore += earned
        breakdown.push({ number: q.number, type: q.type, status: isCorrect ? 'correct' : 'wrong', earned, max: pts, correct: q.correct_answer, given: studentAnswer })
      }
    }

    if (q.type === 'COMPLEX_MCQ' || q.type === 'CHECKBOXES') {
      const correctSet = parseOptionList(q.correct_answer)
      const givenSet = parseOptionList(studentAnswer)

      const totalCorrect = correctSet.length
      const correctSelected = givenSet.filter(a => correctSet.includes(a)).length
      const wrongSelected = givenSet.filter(a => !correctSet.includes(a)).length

      // Proportional scoring: (pts / totalCorrect) * correctSelected
      const ratio = totalCorrect > 0 ? (correctSelected / totalCorrect) : 0
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned

      let status = 'wrong'
      if (totalCorrect > 0 && correctSelected === totalCorrect && wrongSelected === 0) {
        status = 'correct'
      } else if (earned > 0) {
        status = 'partial'
      }

      breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'TRUE_FALSE') {
      const optionsObj = parseObjectMap(q.options)
      const correctObj = parseObjectMap(q.correct_answer)
      const givenObj = parseObjectMap(studentAnswer)

      const optKeys = Object.keys(optionsObj)
      const ansKeys = Object.keys(correctObj)
      const allKeys = Array.from(new Set([...optKeys, ...ansKeys]))
      const validKeys = allKeys.filter(k => correctObj[k] !== undefined && correctObj[k] !== null && String(correctObj[k]).trim() !== '')

      let correctCount = 0
      for (const k of validKeys) {
        const correctVal = String(correctObj[k]).trim().toLowerCase()
        const givenVal = String(givenObj[k] || '').trim().toLowerCase()
        if (correctVal === givenVal) {
          correctCount++
        }
      }

      const totalStatements = validKeys.length
      // Proportional scoring: (pts / totalStatements) * correctCount
      const ratio = totalStatements > 0 ? (correctCount / totalStatements) : 0
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned

      let status = 'wrong'
      if (totalStatements > 0 && correctCount === totalStatements) {
        status = 'correct'
      } else if (earned > 0) {
        status = 'partial'
      }

      breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'MATCHING') {
      const correctObj = parseObjectMap(q.correct_answer)
      const givenObj = parseObjectMap(studentAnswer)

      const validKeys = Object.keys(correctObj).filter(k => correctObj[k] !== undefined && correctObj[k] !== null && String(correctObj[k]).trim() !== '')
      let matchCount = 0
      for (const k of validKeys) {
        const correctVal = String(correctObj[k]).trim().toLowerCase()
        const givenVal = String(givenObj[k] || '').trim().toLowerCase()
        if (correctVal !== '' && correctVal === givenVal) {
          matchCount++
        }
      }

      const totalPairs = validKeys.length
      // Proportional scoring: (pts / totalPairs) * matchCount
      const ratio = totalPairs > 0 ? (matchCount / totalPairs) : 0
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned

      let status = 'wrong'
      if (totalPairs > 0 && matchCount === totalPairs) {
        status = 'correct'
      } else if (earned > 0) {
        status = 'partial'
      }

      breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'SEQUENCING') {
      const correctArr = parseArray(q.correct_answer)
      const givenArr = parseArray(studentAnswer)
      const totalItems = correctArr.length
      let correctPosCount = 0

      for (let i = 0; i < totalItems; i++) {
        if (givenArr[i] !== undefined && String(givenArr[i]).trim() === String(correctArr[i]).trim()) {
          correctPosCount++
        }
      }

      const ratio = totalItems > 0 ? (correctPosCount / totalItems) : 0
      const earned = Math.round(ratio * pts * 100) / 100
      autoScore += earned

      let status = 'wrong'
      if (totalItems > 0 && correctPosCount === totalItems) {
        status = 'correct'
      } else if (earned > 0) {
        status = 'partial'
      }

      breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }

    if (q.type === 'AGREE_DISAGREE') {
      const optionsObj = parseObjectMap(q.options)
      const correctObj = parseObjectMap(q.correct_answer)
      const givenObj = parseObjectMap(studentAnswer)

      const isLegacy = typeof correctObj === 'object' && !('stance' in correctObj) && Object.keys(optionsObj).some(k => k.startsWith('stmt_'))

      if (isLegacy) {
        const optKeys = Object.keys(optionsObj)
        const ansKeys = Object.keys(correctObj)
        const allKeys = Array.from(new Set([...optKeys, ...ansKeys]))
        const validKeys = allKeys.filter(k => correctObj[k] !== undefined && correctObj[k] !== null && String(correctObj[k]).trim() !== '')

        let correctCount = 0
        for (const k of validKeys) {
          const correctVal = String(correctObj[k]).trim().toLowerCase()
          const givenVal = String(givenObj[k] || '').trim().toLowerCase()
          if (correctVal === givenVal) {
            correctCount++
          }
        }

        const totalStatements = validKeys.length
        const ratio = totalStatements > 0 ? (correctCount / totalStatements) : 0
        const earned = Math.round(ratio * pts * 100) / 100
        autoScore += earned

        let status = 'wrong'
        if (totalStatements > 0 && correctCount === totalStatements) {
          status = 'correct'
        } else if (earned > 0) {
          status = 'partial'
        }

        breakdown.push({ number: q.number, type: q.type, status, earned, max: pts, correct: q.correct_answer, given: studentAnswer })
      } else {
        // --- New Mechanism: Stance (Setuju / Tidak Setuju) + Reasons (Options or Essay) ---
        const correctStance = String(correctObj.stance || 'agree').trim().toLowerCase()
        const givenStance = String(givenObj.stance || (typeof studentAnswer === 'string' ? studentAnswer : '')).trim().toLowerCase()
        const stanceMatch = givenStance !== '' && givenStance === correctStance

        const reasonType = optionsObj.reason_type || correctObj.reason_type || (Array.isArray(correctObj.reasons) ? 'options' : 'essay')

        if (reasonType === 'essay') {
          // Reason is manually typed essay
          essayPending = true
          // Stance is worth 50% autoScore if matched
          const earned = stanceMatch ? Math.round(0.5 * pts * 100) / 100 : 0
          autoScore += earned

          breakdown.push({
            number: q.number,
            type: q.type,
            reason_type: 'essay',
            status: 'pending',
            earned,
            max: pts,
            correct: q.correct_answer,
            given: studentAnswer,
            stanceMatch
          })
        } else {
          // Reason is prefilled options (complex MCQ)
          const correctReasons = parseOptionList(correctObj.reasons || [])
          const givenReasons = Array.isArray(givenObj.reasons) ? givenObj.reasons.map(r => String(r).trim()) : parseOptionList(givenObj.reasons || [])

          const totalCorrectReasons = correctReasons.length
          const correctSelected = givenReasons.filter(r => correctReasons.includes(r)).length
          const wrongSelected = givenReasons.filter(r => !correctReasons.includes(r)).length

          // Stance is 50% points, Reasons are 50% points
          const stancePoints = 0.5 * pts
          const reasonPoints = 0.5 * pts

          const stanceEarned = stanceMatch ? stancePoints : 0

          let reasonRatio = 0
          if (totalCorrectReasons > 0) {
            const netCorrect = Math.max(0, correctSelected - (wrongSelected * 0.5))
            reasonRatio = netCorrect / totalCorrectReasons
          } else {
            reasonRatio = 1
          }

          const reasonEarned = reasonPoints * reasonRatio
          const earned = Math.round((stanceEarned + reasonEarned) * 100) / 100
          autoScore += earned

          let status = 'wrong'
          if (stanceMatch && totalCorrectReasons > 0 && correctSelected === totalCorrectReasons && wrongSelected === 0) {
            status = 'correct'
          } else if (earned > 0) {
            status = 'partial'
          }

          breakdown.push({
            number: q.number,
            type: q.type,
            reason_type: 'options',
            status,
            earned,
            max: pts,
            correct: q.correct_answer,
            given: studentAnswer,
            stanceMatch
          })
        }
      }
    }

    if (q.type === 'SHORT_ANSWER') {
      const correct = String(q.correct_answer || '').trim().toLowerCase()
      const given = studentAnswer ? String(studentAnswer).trim().toLowerCase() : ''
      const isCorrect = correct !== '' && correct === given
      const earned = isCorrect ? pts : 0
      autoScore += earned
      breakdown.push({ number: q.number, type: q.type, status: isCorrect ? 'correct' : 'wrong', earned, max: pts, correct: q.correct_answer, given: studentAnswer })
    }
  }

  return { autoScore: Math.round(autoScore * 100) / 100, maxAutoScore: Math.round(maxAutoScore * 100) / 100, essayPending, breakdown }
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
  return `https://drive.google.com/file/d/${fileId}/preview?embedded=true&rm=minimal`
}

/**
 * Build a Google Drive direct image URL from a share link
 */
export function getDriveImageUrl(url) {
  const fileId = extractDriveFileId(url)
  if (!fileId) return url // fallback
  return `https://lh3.googleusercontent.com/d/${fileId}=s1200`
}

export function getDriveThumbnailUrl(url) {
  const fileId = extractDriveFileId(url)
  if (!fileId) return url
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
}

export function getDriveDirectUrl(url) {
  const fileId = extractDriveFileId(url)
  if (!fileId) return url
  return `https://drive.google.com/uc?export=view&id=${fileId}`
}

/**
 * Parse video URL and return embed info (YouTube, Google Drive, Vimeo, direct MP4/WebM)
 */
export function getVideoEmbedInfo(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // 1. YouTube (watch?v=ID, youtu.be/ID, embed/ID, shorts/ID)
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) {
    return {
      type: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`,
      provider: 'youtube',
      label: 'YouTube Video'
    }
  }

  // 2. Google Drive video
  const driveId = extractDriveFileId(trimmed)
  if (driveId) {
    return {
      type: 'iframe',
      src: `https://drive.google.com/file/d/${driveId}/preview`,
      provider: 'drive',
      label: 'Google Drive Video'
    }
  }

  // 3. Vimeo
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/)
  if (vimeoMatch && vimeoMatch[3]) {
    return {
      type: 'iframe',
      src: `https://player.vimeo.com/video/${vimeoMatch[3]}`,
      provider: 'vimeo',
      label: 'Vimeo Video'
    }
  }

  // 4. Direct video file (MP4, WebM, OGG, MOV)
  const isDirectVideo = /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)
  if (isDirectVideo) {
    return {
      type: 'video',
      src: trimmed,
      provider: 'html5',
      label: 'Video MP4/WebM'
    }
  }

  // Fallback: embed as iframe
  return {
    type: 'iframe',
    src: trimmed,
    provider: 'generic',
    label: 'Video Link'
  }
}


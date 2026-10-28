import { roundScore, formatScore } from './format'

export const DEFAULT_EXTRA_SCORING_CONFIG = {
  enabled: false,
  mode: 'flat', // 'flat' | 'percentage' | 'linear_scale' | 'custom'
  flatBonus: 5,
  percentageBoost: 10,
  scaleMin: 65,
  scaleMax: 100,
  capMax100: true,
  includeUnattempted: false,
  studentOverrides: {}, // { [studentId]: number }
  showInTable: true,
  showInPdfDetail: false,
}

export function getExtraScoringStorageKey(examId) {
  return `cbt_extra_scoring_${examId}`
}

export function loadExtraScoringConfig(examId) {
  if (!examId) return { ...DEFAULT_EXTRA_SCORING_CONFIG }
  try {
    const raw = localStorage.getItem(getExtraScoringStorageKey(examId))
    if (!raw) return { ...DEFAULT_EXTRA_SCORING_CONFIG }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_EXTRA_SCORING_CONFIG,
      ...parsed,
      studentOverrides: parsed.studentOverrides || {}
    }
  } catch (e) {
    console.warn('[extraScoring] Failed to load config from localStorage:', e)
    return { ...DEFAULT_EXTRA_SCORING_CONFIG }
  }
}

export function saveExtraScoringConfig(examId, config) {
  if (!examId) return
  try {
    localStorage.setItem(getExtraScoringStorageKey(examId), JSON.stringify(config))
  } catch (e) {
    console.warn('[extraScoring] Failed to save config to localStorage:', e)
  }
}

export function clearExtraScoringConfig(examId) {
  if (!examId) return
  try {
    localStorage.removeItem(getExtraScoringStorageKey(examId))
  } catch (e) {
    console.warn('[extraScoring] Failed to clear config from localStorage:', e)
  }
}

/**
 * Compute the base percentage score (0-100) from raw auto + essay scores
 */
export function calculateStudentBaseScore(result, totalExamMaxScore, essayEdits = {}) {
  if (result.isUnattempted) return 0
  const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(result.max_auto_score) || 0)
  const essayVal = essayEdits[result.id] !== undefined ? Number(essayEdits[result.id]) : (Number(result.essay_score) || 0)
  const rawTotal = (Number(result.auto_score) || 0) + essayVal
  const currentTotal = maxPossible > 0 ? Math.min(rawTotal, maxPossible) : rawTotal
  const pctNum = maxPossible > 0 ? Math.min(100, Math.max(0, (currentTotal / maxPossible) * 100)) : 0
  return roundScore(pctNum)
}

/**
 * Compute extra score & adjusted final score for an individual student.
 * Real DB scores are NEVER modified.
 */
export function calculateStudentExtraScore(result, config, context = {}) {
  const {
    totalExamMaxScore = 0,
    essayEdits = {},
    passingGrade = 60,
    classMinScore = 0,
    classMaxScore = 100
  } = context

  const baseScore = calculateStudentBaseScore(result, totalExamMaxScore, essayEdits)
  const wasPassed = baseScore >= passingGrade

  if (!config || !config.enabled) {
    return {
      baseScore,
      extraPoints: 0,
      finalScore: baseScore,
      isPassed: wasPassed,
      wasPassed,
      hasOverride: false,
      statusChanged: false,
      isUnattempted: !!result.isUnattempted
    }
  }

  if (result.isUnattempted && !config.includeUnattempted) {
    return {
      baseScore: 0,
      extraPoints: 0,
      finalScore: 0,
      isPassed: false,
      wasPassed: false,
      hasOverride: false,
      statusChanged: false,
      isUnattempted: true
    }
  }

  const studentKey = result.student_id || result.id
  const hasOverride = config.studentOverrides && Object.prototype.hasOwnProperty.call(config.studentOverrides, studentKey) && config.studentOverrides[studentKey] !== '' && config.studentOverrides[studentKey] !== null && config.studentOverrides[studentKey] !== undefined
  
  let computedExtra = 0

  if (hasOverride) {
    computedExtra = Number(config.studentOverrides[studentKey]) || 0
  } else {
    switch (config.mode) {
      case 'flat': {
        computedExtra = Number(config.flatBonus) || 0
        break
      }
      case 'percentage': {
        const pct = Number(config.percentageBoost) || 0
        computedExtra = roundScore((baseScore * pct) / 100)
        break
      }
      case 'linear_scale': {
        const tMin = Number(config.scaleMin) ?? passingGrade
        const tMax = Number(config.scaleMax) ?? 100
        const cMin = Number(classMinScore) || 0
        const cMax = Number(classMaxScore) || 100

        if (cMax > cMin) {
          const scaled = tMin + ((baseScore - cMin) / (cMax - cMin)) * (tMax - tMin)
          computedExtra = roundScore(scaled - baseScore)
        } else {
          computedExtra = roundScore(tMin - baseScore)
        }
        break
      }
      case 'custom': {
        computedExtra = 0
        break
      }
      default:
        computedExtra = 0
    }
  }

  let finalScore = roundScore(baseScore + computedExtra)
  if (config.capMax100) {
    finalScore = Math.min(100, finalScore)
  }
  finalScore = Math.max(0, finalScore)

  const actualExtra = roundScore(finalScore - baseScore)
  const isPassed = finalScore >= passingGrade
  const statusChanged = isPassed !== wasPassed

  return {
    baseScore,
    extraPoints: actualExtra,
    finalScore,
    isPassed,
    wasPassed,
    hasOverride,
    statusChanged,
    isUnattempted: !!result.isUnattempted
  }
}

/**
 * Calculate aggregate class comparison statistics between original and adjusted scores
 */
export function calculateClassExtraStats(resultsList = [], config, context = {}) {
  const attemptedList = resultsList.filter(r => !r.isUnattempted)

  if (attemptedList.length === 0) {
    return {
      totalStudents: resultsList.length,
      attemptedCount: 0,
      origAvg: 0,
      origAvgStr: '0',
      origPassCount: 0,
      origFailCount: 0,
      adjustedAvg: 0,
      adjustedAvgStr: '0',
      adjustedPassCount: 0,
      adjustedFailCount: 0,
      newlyPassedCount: 0,
      minScore: 0,
      maxScore: 0,
      adjustedMinScore: 0,
      adjustedMaxScore: 0
    }
  }

  // Pre-calculate class base score range for linear scaling
  const baseScores = attemptedList.map(r => calculateStudentBaseScore(r, context.totalExamMaxScore, context.essayEdits))
  const classMinScore = Math.min(...baseScores)
  const classMaxScore = Math.max(...baseScores)

  const fullContext = {
    ...context,
    classMinScore,
    classMaxScore
  }

  let origTotal = 0
  let origPass = 0
  let adjTotal = 0
  let adjPass = 0
  let newlyPassed = 0

  let adjMin = 100
  let adjMax = 0

  attemptedList.forEach(r => {
    const calc = calculateStudentExtraScore(r, config, fullContext)
    origTotal += calc.baseScore
    if (calc.wasPassed) origPass++

    adjTotal += calc.finalScore
    if (calc.isPassed) adjPass++

    if (!calc.wasPassed && calc.isPassed) {
      newlyPassed++
    }

    if (calc.finalScore < adjMin) adjMin = calc.finalScore
    if (calc.finalScore > adjMax) adjMax = calc.finalScore
  })

  const count = attemptedList.length
  const origAvg = count > 0 ? roundScore(origTotal / count) : 0
  const adjustedAvg = count > 0 ? roundScore(adjTotal / count) : 0

  return {
    totalStudents: resultsList.length,
    attemptedCount: count,
    classMinScore,
    classMaxScore,
    origAvg,
    origAvgStr: formatScore(origAvg),
    origPassCount: origPass,
    origFailCount: count - origPass,
    adjustedAvg,
    adjustedAvgStr: formatScore(adjustedAvg),
    adjustedPassCount: adjPass,
    adjustedFailCount: count - adjPass,
    newlyPassedCount: newlyPassed,
    adjustedMinScore: count > 0 ? adjMin : 0,
    adjustedMaxScore: count > 0 ? adjMax : 0
  }
}

/**
 * Short human-readable summary of active extra scoring configuration
 */
export function getExtraSummaryLabel(config) {
  if (!config || !config.enabled) return 'Tidak Aktif'
  switch (config.mode) {
    case 'flat':
      return `+${config.flatBonus} Poin Tetap`
    case 'percentage':
      return `+${config.percentageBoost}% Persentase`
    case 'linear_scale':
      return `Katrol Target ${config.scaleMin}-${config.scaleMax}`
    case 'custom':
      return 'Kustom per Siswa'
    default:
      return 'Aktif'
  }
}

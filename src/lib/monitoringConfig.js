// ─── MONITORING LEVEL CONFIGURATION ──────────────────────────────────────────
// Central source of truth for all 4 monitoring levels.

export const MONITORING_LEVELS = {
  1: {
    id: 1,
    name: 'Casual Mode',
    tagline: 'Santai & Bebas',
    color: '#22c55e',        // green
    colorBg: 'white',
    colorBorder: 'rgba(34,197,94,0.3)',
    restrictions: [],
    hasPenalty: false,
    hasFaceDetection: false,
    description: 'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna. Mode ini bersifat bebas dan tanpa pengawasan.',
    guide: {
      title: 'Level 1 - Casual Mode',
      overview: 'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna. Mode ini bersifat bebas dan tanpa pengawasan.',
    },
    briefRules: [
      'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna.',
      'Mode ini bersifat bebas dan tanpa pengawasan.',
    ],
    teacherInfo: 'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna. Mode ini bersifat bebas dan tanpa pengawasan.',
  },
  2: {
    id: 2,
    name: 'Scout Mode',
    tagline: 'Pantau & Catat',
    color: '#f59e0b',        // amber
    colorBg: 'white',
    colorBorder: 'rgba(245,158,11,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: false,
    hasFaceDetection: false,
    description: 'Pengguna dilarang melakukan klik kanan, klik ganda, berpindah tab atau jendela, serta keluar dari aplikasi. Setiap pelanggaran akan dicatat oleh sistem, namun tidak ada sanksi langsung yang diberikan.',
    guide: {
      title: 'Level 2 - Scout Mode',
      overview: 'Pengguna dilarang melakukan klik kanan, klik ganda, berpindah tab atau jendela, serta keluar dari aplikasi. Setiap pelanggaran akan dicatat oleh sistem, namun tidak ada sanksi langsung yang diberikan.',
    },
    briefRules: [
      'Pengguna dilarang melakukan klik kanan dan klik ganda.',
      'Dilarang berpindah tab atau jendela.',
      'Dilarang keluar dari aplikasi.',
      'Setiap pelanggaran akan dicatat oleh sistem, namun tidak ada sanksi langsung yang diberikan.',
    ],
    teacherInfo: 'Pengguna dilarang melakukan klik kanan, klik ganda, berpindah tab atau jendela, serta keluar dari aplikasi. Setiap pelanggaran akan dicatat oleh sistem, namun tidak ada sanksi langsung yang diberikan.',
  },
  3: {
    id: 3,
    name: 'Vanguard Mode',
    tagline: 'Ketat & Tegas',
    color: '#8b5cf6',        // violet
    colorBg: 'white',
    colorBorder: 'rgba(139,92,246,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: true,
    hasFaceDetection: false,
    description: 'Menerapkan larangan aktivitas yang sama dengan Mode Scout. Namun, sistem sanksi berlaku setiap terjadi 3 kali pelanggaran dalam bentuk pembekuan layar (screen freeze).',
    guide: {
      title: 'Level 3 - Vanguard Mode',
      overview: 'Menerapkan larangan aktivitas yang sama dengan Mode Scout. Namun, sistem sanksi berlaku setiap terjadi 3 kali pelanggaran dalam bentuk pembekuan layar (screen freeze):',
      rules: [
        { label: 'Pelanggaran tahap ke-1', desc: 'Pembekuan selama 10 detik.' },
        { label: 'Pelanggaran tahap ke-2', desc: 'Pembekuan selama 20 detik.' },
        { label: 'Pelanggaran tahap ke-3', desc: 'Pembekuan selama 30 detik.' },
        { label: 'Mode Kuis', desc: 'Pembekuan layar selama 5 detik untuk setiap pelanggaran.' },
      ]
    },
    briefRules: [
      'Menerapkan larangan aktivitas yang sama dengan Mode Scout.',
      'Sanksi pembekuan layar berlaku setiap 3 kali pelanggaran.',
      'Pelanggaran ke-1: 10s, ke-2: 20s, ke-3: 30s. Kuis: 5s per pelanggaran.',
    ],
    teacherInfo: 'Menerapkan larangan aktivitas yang sama dengan Mode Scout. Namun, sistem sanksi berlaku setiap terjadi 3 kali pelanggaran dalam bentuk pembekuan layar (screen freeze):\n• Pelanggaran tahap ke-1: Pembekuan selama 10 detik.\n• Pelanggaran tahap ke-2: Pembekuan selama 20 detik.\n• Pelanggaran tahap ke-3: Pembekuan selama 30 detik.\n• Mode Kuis: Pembekuan layar selama 5 detik untuk setiap pelanggaran.',
    freezeDurations: { exam: 10, quiz: 5 }, // exam: base * offense, quiz: flat
  },
  4: {
    id: 4,
    name: 'STRIX',
    tagline: 'Deteksi Wajah & Maksimal',
    color: '#ef4444',         // red
    colorBg: 'white',
    colorBorder: 'rgba(239,68,68,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: true,
    hasFaceDetection: true,
    fullName: 'Smart Camera Automatic Recognition System',
    description: 'STRIX adalah Bahasa Latin yang berarti burung hantu, yang terkenal akan matanya yang selalu siaga, tetap menatap tajam dan presisi bahkan di malam yang paling gelap. Filosofi itu yang menjadi alasan nama STRIX Kamera pintar ini dibekali deteksi wajah yang tidak pernah lengah, siap mengenali dan memantau siapa pun secara presisi dalam keadaan apapun.',
    guide: {
      title: 'Level 4 - STRIX',
      overview: 'Ini merupakan tingkatan tertinggi dengan pengawasan berbasis deteksi wajah.',
      philosophy: 'STRIX adalah Bahasa Latin yang berarti burung hantu, yang terkenal akan matanya yang selalu siaga, tetap menatap tajam dan presisi bahkan di malam yang paling gelap. Filosofi itu yang menjadi alasan nama STRIX Kamera pintar ini dibekali deteksi wajah yang tidak pernah lengah, siap mengenali dan memantau siapa pun secara presisi dalam keadaan apapun.',
      rulesTitle: 'Ketentuan Sanksi:',
      rules: [
        { label: 'Sanksi penguncian layar', desc: 'Setiap 3 poin pelanggaran akan membekukan layar selama 15 detik (pertama), 30 detik (kedua), dan 60 detik (ketiga atau lebih).' },
        { label: 'Sanksi pengurangan waktu', desc: 'Setiap 7 poin pelanggaran akan mengakibatkan pengurangan durasi ujian selama 5 menit (atau pengurangan 20% waktu pengerjaan pada mode kuis).' },
        { label: 'Akses Kamera', desc: 'Ujian tidak dapat dimulai jika kamera tidak aktif atau mengalami kendala teknis.' },
      ]
    },
    briefRules: [
      'STRIX adalah Bahasa Latin yang berarti burung hantu, terkenal akan matanya yang selalu siaga dan presisi.',
      'Kamera pintar ini dibekali deteksi wajah yang tidak pernah lengah. Ujian tidak dapat dimulai tanpa kamera.',
      'Sanksi layar: Setiap 3 poin pelanggaran membekukan layar (15s, 30s, 60s+).',
      'Sanksi waktu: Setiap 7 poin mengurangi durasi 5 menit (Ujian) / 20% (Kuis).',
    ],
    teacherInfo: 'Ini merupakan tingkatan tertinggi dengan pengawasan berbasis deteksi wajah.\n\nMakna Filosofis: STRIX adalah Bahasa Latin yang berarti burung hantu, yang terkenal akan matanya yang selalu siaga, tetap menatap tajam dan presisi bahkan di malam yang paling gelap. Filosofi itu yang menjadi alasan nama STRIX Kamera pintar ini dibekali deteksi wajah yang tidak pernah lengah, siap mengenali dan memantau siapa pun secara presisi dalam keadaan apapun.\n\nKetentuan Sanksi:\n• Sanksi penguncian layar: Setiap 3 poin pelanggaran akan membekukan layar selama 15 detik (pertama), 30 detik (kedua), dan 60 detik (ketiga atau lebih).\n• Sanksi pengurangan waktu: Setiap 7 poin pelanggaran akan mengakibatkan pengurangan durasi ujian selama 5 menit (atau pengurangan 20% waktu pengerjaan pada mode kuis).\n• Akses Kamera: Ujian tidak dapat dimulai jika kamera tidak aktif atau mengalami kendala teknis.',
    freezeDurations: { exam: [15, 30, 60], quiz: 5 },
    timeReduction: { exam: 5 * 60, quiz: 0.20 }, // exam: 5 min in seconds, quiz: 20%
    timeReductionInterval: 7, // every 7 violations
  },
}

/**
 * Normalizes any monitoring level value (numeric, string, or legacy identifier)
 * to a valid numeric level (1, 2, 3, or 4).
 */
export function normalizeMonitoringLevel(level) {
  if (typeof level === 'number' && MONITORING_LEVELS[level]) return level
  const parsed = parseInt(level, 10)
  if (!isNaN(parsed) && MONITORING_LEVELS[parsed]) return parsed
  if (level === 'scout' || level === 'standard') return 2
  if (level === 'vanguard' || level === 'strict') return 3
  if (level === 'strix' || level === 'maximum') return 4
  return 1
}

// ─── PENALTY HELPERS ─────────────────────────────────────────────────────────

/**
 * Calculate freeze duration for a given offense number.
 * offenseNumber is 1-based (1st offense, 2nd offense, etc.)
 */
export function getFreezeDuration(level, offenseNumber, isQuiz = false) {
  const config = MONITORING_LEVELS[level]
  if (!config?.hasPenalty) return 0

  if (isQuiz) {
    return config.freezeDurations?.quiz || 5
  }

  const baseDuration = config.freezeDurations?.exam || 10
  if (Array.isArray(baseDuration)) {
    const idx = Math.min(offenseNumber - 1, baseDuration.length - 1)
    return baseDuration[idx]
  }
  
  // Scale freeze duration progressively (10s -> 20s -> 30s -> ...)
  return baseDuration * offenseNumber
}

/**
 * Check if a violation count triggers a freeze.
 * Freeze triggers at every 3 violations: 3, 6, 9, 12...
 */
export function shouldTriggerFreeze(level, violationCount) {
  if (!MONITORING_LEVELS[level]?.hasPenalty) return false
  return violationCount > 0 && violationCount % 3 === 0
}

/**
 * Get the offense number (1st, 2nd, 3rd...) from total freeze triggers.
 * offenseNumber = violationCount / 3
 */
export function getOffenseNumber(violationCount) {
  return Math.floor(violationCount / 3)
}

/**
 * Check if a violation count triggers a time reduction (Level 4 only).
 * Time reduction triggers at every 7 violations: 7, 14, 21, 28...
 */
export function shouldTriggerTimeReduction(level, violationCount) {
  if (level !== 4) return false
  return violationCount > 0 && violationCount % 7 === 0
}

/**
 * Get time reduction amount for Level 4.
 * Returns seconds for exam mode, or fraction (0.20) for quiz mode.
 */
export function getTimeReduction(isQuiz = false) {
  const config = MONITORING_LEVELS[4]
  return isQuiz ? config.timeReduction.quiz : config.timeReduction.exam
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────
// MonitoringIcon and getMonitoringBadgeStyle are in ./monitoringUI.jsx

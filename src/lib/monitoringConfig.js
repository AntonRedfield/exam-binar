// ─── MONITORING LEVEL CONFIGURATION ──────────────────────────────────────────
// Central source of truth for all 4 monitoring levels.

export const MONITORING_LEVELS = {
  1: {
    id: 1,
    name: 'Casual Mode',
    tagline: 'Santai & Bebas',
    color: '#22c55e',        // green
    colorBg: 'rgba(34,197,94,0.1)',
    colorBorder: 'rgba(34,197,94,0.3)',
    restrictions: [],
    hasPenalty: false,
    hasFaceDetection: false,
    description: 'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna. Mode ini bersifat bebas dan tanpa pengawasan ketat.',
    briefRules: [
      'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna.',
      'Mode ini bersifat bebas dan tanpa pengawasan ketat.',
      'Jawaban disimpan otomatis setiap 10 detik.',
    ],
    teacherInfo: 'Tidak terdapat batasan aktivitas maupun sanksi bagi pengguna. Mode ini bersifat bebas dan tanpa pengawasan ketat.',
  },
  2: {
    id: 2,
    name: 'Scout Mode',
    tagline: 'Pantau & Catat',
    color: '#f59e0b',        // amber
    colorBg: 'rgba(245,158,11,0.1)',
    colorBorder: 'rgba(245,158,11,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: false,
    hasFaceDetection: false,
    description: 'Pengguna dilarang melakukan klik kanan, klik ganda, berpindah tab atau jendela, serta keluar dari aplikasi. Pelanggaran dicatat.',
    briefRules: [
      'Pengguna dilarang melakukan klik kanan dan klik ganda.',
      'Dilarang berpindah tab atau jendela.',
      'Dilarang keluar dari aplikasi.',
      'Setiap pelanggaran akan dicatat oleh sistem.',
      'Tidak ada sanksi langsung yang diberikan.',
    ],
    teacherInfo: 'Pengguna dilarang melakukan klik kanan, klik ganda, berpindah tab atau jendela, serta keluar dari aplikasi. Setiap pelanggaran akan dicatat oleh sistem, namun tidak ada sanksi langsung yang diberikan.',
  },
  3: {
    id: 3,
    name: 'Vanguard Mode',
    tagline: 'Ketat & Tegas',
    color: '#8b5cf6',        // violet
    colorBg: 'rgba(139,92,246,0.1)',
    colorBorder: 'rgba(139,92,246,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: true,
    hasFaceDetection: false,
    description: 'Menerapkan larangan aktivitas yang sama dengan Mode Scout. Namun, sistem sanksi berlaku setiap terjadi 3 kali pelanggaran.',
    briefRules: [
      'Menerapkan larangan aktivitas yang sama dengan Mode Scout.',
      'Setiap 3 kali pelanggaran memicu sanksi pembekuan layar (screen freeze).',
      'a. Pelanggaran tahap ke-1: Pembekuan selama 10 detik.',
      'b. Pelanggaran tahap ke-2: Pembekuan selama 20 detik.',
      'c. Pelanggaran tahap ke-3: Pembekuan selama 30 detik.',
      'd. Mode Kuis: Pembekuan layar selama 5 detik untuk setiap pelanggaran.',
    ],
    teacherInfo: 'Menerapkan larangan aktivitas yang sama dengan Mode Scout. Namun, sistem sanksi berlaku setiap terjadi 3 kali pelanggaran dalam bentuk pembekuan layar (screen freeze):\na. Pelanggaran tahap ke-1: Pembekuan selama 10 detik.\nb. Pelanggaran tahap ke-2: Pembekuan selama 20 detik.\nc. Pelanggaran tahap ke-3: Pembekuan selama 30 detik.\nd. Mode Kuis: Pembekuan layar selama 5 detik untuk setiap pelanggaran.',
    freezeDurations: { exam: 10, quiz: 5 }, // exam: base * offense, quiz: flat
  },
  4: {
    id: 4,
    name: 'STRIX SCARS',
    tagline: 'Deteksi Wajah & Maksimal',
    color: '#ef4444',         // red
    colorBg: 'rgba(239,68,68,0.1)',
    colorBorder: 'rgba(239,68,68,0.3)',
    restrictions: ['no_rightclick', 'no_doubleclick', 'no_tab_switch', 'no_quit'],
    hasPenalty: true,
    hasFaceDetection: true,
    description: 'Tingkatan tertinggi pengawasan berbasis deteksi wajah. Burung hantu (STRIX) sebagai simbol mata yang selalu waspada dan presisi.',
    fullName: 'Smart Camera for Analytic Recognition System',
    briefRules: [
      'Tingkatan tertinggi dengan pengawasan berbasis deteksi wajah (gaze-tracking).',
      'Kamera harus selalu aktif. Ujian tidak dapat dimulai tanpa kamera.',
      'Sanksi layar: Setiap 3 poin pelanggaran membekukan layar (15s, 30s, 60s+).',
      'Sanksi waktu: Setiap 7 poin mengurangi durasi 5 menit (Ujian) / 20% (Kuis).',
    ],
    teacherInfo: 'Ini merupakan tingkatan tertinggi dengan pengawasan berbasis deteksi wajah.\nMakna Filosofis Nama "STRIX" diambil dari bahasa Latin dan Yunani yang berarti burung hantu. Burung hantu merupakan simbol utama dari mata yang selalu waspada dan tidak berkedip. Hal ini secara sempurna merepresentasikan sistem pelacakan pandangan (gaze-tracking) berbasis kamera yang mengawasi pengguna secara presisi. Sedangkan SCARS merupakan singkatan dari (Smart Camera for Analytic Recognition System).\n\nKetentuan Sanksi:\na. Sanksi penguncian layar: Setiap 3 poin pelanggaran akan membekukan layar selama 15 detik (pertama), 30 detik (kedua), dan 60 detik (ketiga atau lebih).\nb. Sanksi pengurangan waktu: Setiap 7 poin pelanggaran akan mengakibatkan pengurangan durasi ujian selama 5 menit (atau pengurangan 20% waktu pengerjaan pada mode kuis).\nc. Akses Kamera: Ujian tidak dapat dimulai jika kamera tidak aktif atau mengalami kendala teknis.',
    freezeDurations: { exam: [15, 30, 60], quiz: 5 },
    timeReduction: { exam: 5 * 60, quiz: 0.20 }, // exam: 5 min in seconds, quiz: 20%
    timeReductionInterval: 7, // every 7 violations
  },
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

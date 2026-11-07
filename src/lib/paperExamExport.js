import { getDriveImageUrl } from './grader.js'
import { processFormattedText } from './format.js'

export const DEFAULT_PAPER_CONFIG = {
  schoolName: 'SEKOLAH NASIONAL TERINTEGRASI 10 KUPANG',
  institution: 'YAYASAN PENDIDIKAN BINTANG NUSANTARA',
  address: 'Jl. Frans Seda No. 10, Kupang, Nusa Tenggara Timur',
  academicYear: '2025/2026',
  term: 'Semester Ganjil',
  headerTitle: 'ASESMEN SUMATIF / PENILAIAN HASIL BELAJAR',
  columns: 1, // 1 or 2
  fontSize: 'normal', // 'normal' (10pt) | 'compact' (9pt)
  fontFamily: 'times', // 'times' | 'arial'
  includeHeader: true,
  includeStudentIdBox: true,
  includePoints: true,
  includeEssayLines: true,
  essayLinesCount: 4,
  documentType: 'questions', // 'questions' | 'answers' | 'sheet' | 'all'
  instructions: [
    'Berdoalah terlebih dahulu sebelum mulai mengerjakan soal.',
    'Tuliskan identitas Anda secara lengkap dan jelas pada kolom yang telah disediakan.',
    'Periksa dan bacalah setiap soal dengan teliti sebelum memberikan jawaban.',
    'Dahulukan menjawab soal-soal yang Anda anggap lebih mudah.',
    'Periksa kembali seluruh lembar pekerjaan Anda sebelum diserahkan kepada pengawas ujian.'
  ]
}

/**
 * Format raw option text safely with HTML bold/italic/underline converted
 */
function cleanRichText(text) {
  if (!text) return ''
  return processFormattedText(text)
}

/**
 * Safely parse options object or array
 */
function parseOptions(options) {
  if (!options) return {}
  if (typeof options === 'object' && !Array.isArray(options)) return options
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options)
      if (typeof parsed === 'object') return parsed
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Safely parse JSON or array
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
      } catch {
        return []
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

/**
 * Generate official Kop Surat HTML
 */
export function generateKopSuratHtml(config, exam, customTitle = null) {
  exam = exam || {}
  config = { ...DEFAULT_PAPER_CONFIG, ...(config || {}) }
  const title = customTitle || config.headerTitle || exam.title || 'NASKAH SOAL UJIAN'
  const subject = exam.subject || 'Mata Pelajaran Umum'
  const targetKelas = (!exam.target_kelas || exam.target_kelas === 'all')
    ? 'Semua Kelas'
    : `Kelas ${String(exam.target_kelas).split(',').join(', ')}`
  const duration = exam.duration_minutes ? `${exam.duration_minutes} Menit` : '90 Menit'
  const currentDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return `
    <div class="kop-container">
      <div class="kop-header">
        <div class="kop-logo-box">
          <img src="/Logo_SNT.webp" alt="Logo" class="kop-logo" onerror="this.style.display='none'" />
        </div>
        <div class="kop-text">
          <div class="kop-institution">${config.institution || 'YAYASAN PENDIDIKAN BINTANG NUSANTARA'}</div>
          <div class="kop-school">${config.schoolName || 'SEKOLAH NASIONAL TERINTEGRASI 10 KUPANG'}</div>
          <div class="kop-address">${config.address || 'Jl. Frans Seda No. 10, Kupang, Nusa Tenggara Timur'}</div>
        </div>
      </div>
      <div class="kop-line"></div>

      <div class="exam-title-box">
        <div class="exam-main-title">${title.toUpperCase()}</div>
        <div class="exam-sub-title">TAHUN AJARAN ${config.academicYear || '2025/2026'} &mdash; ${config.term || 'SEMESTER GANJIL'}</div>
      </div>

      <table class="exam-meta-table">
        <tr>
          <td style="width: 18%;"><strong>Mata Pelajaran</strong></td>
          <td style="width: 32%;">: ${subject}</td>
          <td style="width: 18%;"><strong>Hari, Tanggal</strong></td>
          <td style="width: 32%;">: ${currentDate}</td>
        </tr>
        <tr>
          <td><strong>Tingkat / Kelas</strong></td>
          <td>: ${targetKelas}</td>
          <td><strong>Alokasi Waktu</strong></td>
          <td>: ${duration}</td>
        </tr>
      </table>
    </div>
  `
}

/**
 * Generate Student Identity Box for the top of the paper
 */
export function generateStudentIdBoxHtml() {
  return `
    <div class="student-id-box">
      <table class="student-id-table">
        <tr>
          <td style="width: 50%;">
            <div class="id-row"><span class="id-label">Nama Siswa</span>: ........................................................................</div>
            <div class="id-row"><span class="id-label">Kelas / No. Absen</span>: ........................................................................</div>
          </td>
          <td style="width: 50%;">
            <div class="id-row"><span class="id-label">Nomor Peserta</span>: ........................................................................</div>
            <div class="id-row"><span class="id-label">Tanda Tangan</span>: ........................................................................</div>
          </td>
        </tr>
      </table>
    </div>
  `
}

/**
 * Generate Instructions Box
 */
export function generateInstructionsHtml(instructions = []) {
  if (!instructions || instructions.length === 0) return ''
  const listItems = instructions.map(inst => `<li>${inst}</li>`).join('')
  return `
    <div class="instructions-box">
      <div class="instructions-title">PETUNJUK UMUM:</div>
      <ol class="instructions-list">
        ${listItems}
      </ol>
    </div>
  `
}

/**
 * Generate Question Paper HTML (for students)
 */
export function generateQuestionsHtml(questions = [], config = DEFAULT_PAPER_CONFIG) {
  if (!questions || questions.length === 0) {
    return `<div style="text-align: center; padding: 2rem; color: #64748b;">Belum ada butir soal dalam ujian ini.</div>`
  }

  // Sort questions by number
  const sorted = [...questions].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))

  const questionsHtml = sorted.map((q, idx) => {
    const qNum = q.number || (idx + 1)
    const qType = q.type || 'MCQ'
    const pointsStr = (config.includePoints && q.points) ? `<span class="q-points">[Bobot: ${q.points}]</span>` : ''
    const qText = cleanRichText(q.question_text || '(Pertanyaan tanpa teks)')
    const imageUrl = q.image_url ? getDriveImageUrl(q.image_url) : null
    const options = parseOptions(q.options)
    const optionImages = parseOptions(q.option_images || options.option_images)

    let bodyHtml = ''

    // ─── 1. MCQ (Pilihan Ganda Biasa) ─────────────────────────
    if (qType === 'MCQ') {
      const keys = Object.keys(options).filter(k => k !== 'option_images' && k !== 'reason_type' && k !== 'rubric')
      const optionsList = keys.map(k => {
        const optText = cleanRichText(options[k] || '')
        const img = optionImages[k] ? getDriveImageUrl(optionImages[k]) : null
        return `
          <div class="mcq-option">
            <span class="mcq-letter">${k}.</span>
            <div class="mcq-body">
              ${optText ? `<span class="mcq-text">${optText}</span>` : ''}
              ${img ? `<div class="opt-img-wrap"><img src="${img}" alt="Opsi ${k}" class="opt-image" onerror="this.style.display='none'" /></div>` : ''}
            </div>
          </div>
        `
      }).join('')

      bodyHtml = `
        <div class="mcq-options-container">
          ${optionsList}
        </div>
      `
    }
    // ─── 2. COMPLEX_MCQ (Pilihan Ganda Kompleks) ───────────────
    else if (qType === 'COMPLEX_MCQ') {
      const keys = Object.keys(options).filter(k => k !== 'option_images' && k !== 'reason_type' && k !== 'rubric')
      const optionsList = keys.map(k => {
        const optText = cleanRichText(options[k] || '')
        const img = optionImages[k] ? getDriveImageUrl(optionImages[k]) : null
        return `
          <div class="mcq-option complex-mcq-option">
            <span class="mcq-checkbox">[ &nbsp; ]</span>
            <span class="mcq-letter">${k}.</span>
            <div class="mcq-body">
              ${optText ? `<span class="mcq-text">${optText}</span>` : ''}
              ${img ? `<div class="opt-img-wrap"><img src="${img}" alt="Opsi ${k}" class="opt-image" onerror="this.style.display='none'" /></div>` : ''}
            </div>
          </div>
        `
      }).join('')

      bodyHtml = `
        <div class="q-type-hint"><em>(Pilihlah semua jawaban yang benar dengan memberi tanda centang [✓])</em></div>
        <div class="mcq-options-container">
          ${optionsList}
        </div>
      `
    }
    // ─── 3. TRUE_FALSE (Benar / Salah) ────────────────────────
    else if (qType === 'TRUE_FALSE') {
      const keys = Object.keys(options).filter(k => k !== 'option_images')
      const rows = keys.map((k, i) => {
        const stmtText = cleanRichText(options[k] || '')
        return `
          <tr>
            <td style="text-align: center; width: 36px;">${i + 1}</td>
            <td>${stmtText}</td>
            <td style="text-align: center; width: 65px;">( &nbsp;&nbsp; )</td>
            <td style="text-align: center; width: 65px;">( &nbsp;&nbsp; )</td>
          </tr>
        `
      }).join('')

      bodyHtml = `
        <div class="q-type-hint"><em>(Tentukan apakah pernyataan berikut Benar atau Salah dengan memberi tanda [✓])</em></div>
        <table class="paper-tf-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Pernyataan</th>
              <th style="text-align: center;">Benar</th>
              <th style="text-align: center;">Salah</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
    }
    // ─── 4. MATCHING (Menjodohkan) ────────────────────────────
    else if (qType === 'MATCHING') {
      const leftItems = options.left || {}
      const rightItems = options.right || {}
      const leftKeys = Object.keys(leftItems)
      const rightKeys = Object.keys(rightItems)

      const leftList = leftKeys.map(k => `
        <div class="match-item">
          <strong class="match-key">${k}.</strong>
          <span class="match-val">${cleanRichText(leftItems[k] || '')}</span>
        </div>
      `).join('')

      const rightList = rightKeys.map(k => `
        <div class="match-item">
          <strong class="match-key">${k}.</strong>
          <span class="match-val">${cleanRichText(rightItems[k] || '')}</span>
        </div>
      `).join('')

      const answerBoxes = leftKeys.map(k => `
        <span class="match-answer-slot">
          <strong>${k}</strong> &rarr; [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
        </span>
      `).join(' &nbsp;&nbsp; ')

      bodyHtml = `
        <div class="q-type-hint"><em>(Pasangkan pernyataan di Kolom Kiri dengan jawaban yang tepat di Kolom Kanan)</em></div>
        <div class="matching-columns-wrapper">
          <div class="matching-col">
            <div class="matching-col-header">KOLOM KIRI (Pernyataan)</div>
            ${leftList}
          </div>
          <div class="matching-col">
            <div class="matching-col-header">KOLOM KANAN (Pilihan)</div>
            ${rightList}
          </div>
        </div>
        <div class="matching-answer-box">
          <strong>Lembar Pasangan Jawaban:</strong><br />
          ${answerBoxes}
        </div>
      `
    }
    // ─── 5. SEQUENCING (Mengurutkan) ──────────────────────────
    else if (qType === 'SEQUENCING') {
      const items = Array.isArray(options.items) ? options.items : (Array.isArray(options) ? options : [])
      const itemsList = items.map((it, i) => {
        const text = typeof it === 'object' ? it.text : it
        const letter = String.fromCharCode(65 + i)
        return `
          <div class="seq-item">
            <span class="seq-letter">[${letter}]</span>
            <span class="seq-text">${cleanRichText(text || '')}</span>
          </div>
        `
      }).join('')

      const seqSlots = items.map(() => `[ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]`).join(' &nbsp;&rarr;&nbsp; ')

      bodyHtml = `
        <div class="q-type-hint"><em>(Urutkan tahapan/peristiwa berikut dari yang paling awal/tepat)</em></div>
        <div class="seq-items-list">
          ${itemsList}
        </div>
        <div class="seq-answer-box">
          <strong>Urutan yang benar:</strong> &nbsp;&nbsp; ${seqSlots}
        </div>
      `
    }
    // ─── 6. AGREE_DISAGREE (Setuju / Tidak Setuju) ─────────────
    else if (qType === 'AGREE_DISAGREE') {
      const reasonType = options.reason_type || 'options'
      const reasonKeys = Object.keys(options).filter(k => k !== 'reason_type' && k !== 'option_images' && k !== 'stmt_')

      let reasonHtml = ''
      if (reasonType === 'options' && reasonKeys.length > 0) {
        const rList = reasonKeys.map(k => `
          <div class="agree-reason-item">
            <span class="mcq-checkbox">[ &nbsp; ]</span>
            <strong>${k}.</strong> ${cleanRichText(options[k] || '')}
          </div>
        `).join('')
        reasonHtml = `
          <div style="margin-top: 0.5rem;">
            <strong>Pilihan Alasan Pendukung:</strong>
            <div style="margin-top: 0.25rem;">${rList}</div>
          </div>
        `
      } else {
        reasonHtml = `
          <div style="margin-top: 0.5rem;">
            <strong>Alasan Pendukung Anda:</strong>
            <div class="ruled-lines">
              <div class="rule-line"></div>
              <div class="rule-line"></div>
              <div class="rule-line"></div>
            </div>
          </div>
        `
      }

      bodyHtml = `
        <div class="q-type-hint"><em>(Tentukan sikap Anda kemudian berikan/pilih alasan pendukung yang sesuai)</em></div>
        <div class="agree-choice-boxes">
          <span class="agree-box">[ &nbsp; ] <strong>SETUJU</strong></span>
          <span class="agree-box">[ &nbsp; ] <strong>TIDAK SETUJU</strong></span>
        </div>
        ${reasonHtml}
      `
    }
    // ─── 7. ESSAY / PARAGRAPH (Uraian) ────────────────────────
    else if (qType === 'ESSAY' || qType === 'PARAGRAPH') {
      const lineCount = Math.max(2, Math.min(10, config.essayLinesCount || 4))
      const lines = config.includeEssayLines
        ? Array.from({ length: lineCount }).map(() => `<div class="rule-line"></div>`).join('')
        : `<div class="essay-empty-box" style="height: 100px; border: 1px dashed #94a3b8; border-radius: 4px; margin-top: 0.5rem;"></div>`

      bodyHtml = `
        <div class="q-type-hint"><em>(Jawablah pertanyaan berikut dengan singkat, jelas, dan tepat)</em></div>
        <div class="ruled-lines">
          ${lines}
        </div>
      `
    }
    // ─── 8. SHORT_ANSWER ──────────────────────────────────────
    else if (qType === 'SHORT_ANSWER') {
      bodyHtml = `
        <div style="margin-top: 0.5rem;">
          <strong>Jawaban:</strong> .............................................................................................................................
        </div>
      `
    }
    // ─── 9. Fallback / Survey Grid / Other ────────────────────
    else {
      bodyHtml = `
        <div class="ruled-lines" style="margin-top: 0.5rem;">
          <div class="rule-line"></div>
          <div class="rule-line"></div>
        </div>
      `
    }

    // Audio Listening Notice
    const audioBanner = q.audio_url || q.audio_title ? `
      <div class="audio-notice-badge">
        🎧 <strong>[SOAL LISTENING / MENDENGARKAN]</strong> ${q.audio_title ? `&mdash; ${q.audio_title}` : ''}
        <div style="font-size: 8pt; font-weight: normal; color: #475569; margin-top: 2px;">
          *Petunjuk: Diperdengarkan melalui pemutar audio kelas atau dibacakan naskah oleh pengawas ruang.
        </div>
      </div>
    ` : ''

    return `
      <div class="paper-question-item avoid-break">
        <div class="q-header">
          <span class="q-number">${qNum}.</span>
          <div class="q-content">
            ${audioBanner}
            <div class="q-text">${qText}</div>
            ${imageUrl ? `
              <div class="q-image-box">
                <img src="${imageUrl}" alt="Gambar Soal ${qNum}" class="paper-q-image" onerror="this.style.display='none'" />
              </div>
            ` : ''}
            ${bodyHtml}
          </div>
          ${pointsStr}
        </div>
      </div>
    `
  }).join('')

  const columnClass = config.columns === 2 ? 'two-column-layout' : 'one-column-layout'
  return `
    <div class="questions-wrapper ${columnClass}">
      ${questionsHtml}
    </div>
  `
}

/**
 * Format Answer Key string from raw correct_answer value
 */
export function formatCorrectAnswerText(q) {
  const qType = q.type || 'MCQ'
  const ans = q.correct_answer

  if (ans === undefined || ans === null) return '—'

  if (qType === 'MCQ') {
    return String(ans).toUpperCase()
  }

  if (qType === 'COMPLEX_MCQ') {
    const arr = parseArray(ans)
    return arr.map(s => String(s).toUpperCase()).sort().join(', ')
  }

  if (qType === 'TRUE_FALSE') {
    const map = parseOptions(ans)
    const keys = Object.keys(map)
    if (keys.length === 0) return '—'
    return keys.map((k, i) => `${i + 1}: ${map[k] === 'true' ? 'Benar (B)' : 'Salah (S)'}`).join(' | ')
  }

  if (qType === 'MATCHING') {
    const map = parseOptions(ans)
    const keys = Object.keys(map)
    if (keys.length === 0) return '—'
    return keys.map(k => `${k} &rarr; ${map[k]}`).join(', ')
  }

  if (qType === 'SEQUENCING') {
    const arr = parseArray(ans)
    const options = parseOptions(q.options)
    const items = Array.isArray(options.items) ? options.items : (Array.isArray(options) ? options : [])
    
    // Map IDs to original step letters if possible
    const formatted = arr.map(stepId => {
      const idx = items.findIndex(it => (typeof it === 'object' ? it.id : it) === stepId)
      if (idx !== -1) return String.fromCharCode(65 + idx)
      return stepId
    })
    return formatted.join(' &rarr; ')
  }

  if (qType === 'AGREE_DISAGREE') {
    if (typeof ans === 'object') {
      const stance = ans.stance === 'agree' ? 'SETUJU' : (ans.stance === 'disagree' ? 'TIDAK SETUJU' : ans.stance)
      const reasons = Array.isArray(ans.reasons) ? ans.reasons.join(', ') : ''
      return `Sikap: <strong>${stance}</strong>${reasons ? ` | Alasan: <strong>${reasons}</strong>` : ''}${ans.rubric ? `<br/><small>Rubrik: ${ans.rubric}</small>` : ''}`
    }
    return String(ans)
  }

  if (qType === 'ESSAY' || qType === 'PARAGRAPH') {
    const rubric = q.options?.rubric || (typeof ans === 'string' ? ans : '')
    return rubric ? `<em>Rubrik:</em> ${rubric}` : 'Pedoman Penilaian Esai Guru'
  }

  if (typeof ans === 'object') {
    try {
      return JSON.stringify(ans)
    } catch {
      return '—'
    }
  }

  return String(ans)
}

/**
 * Generate Teacher Answer Key & Scoring Guide HTML
 */
export function generateAnswerKeyHtml(questions = [], exam = {}, config = DEFAULT_PAPER_CONFIG) {
  exam = exam || {}
  config = { ...DEFAULT_PAPER_CONFIG, ...(config || {}) }
  const sorted = [...(questions || [])].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
  const totalPoints = sorted.reduce((sum, q) => sum + (Number(q.points) || 1), 0)

  const rows = sorted.map((q, idx) => {
    const qNum = q.number || (idx + 1)
    const qType = q.type || 'MCQ'
    const points = Number(q.points) || 1
    const ansText = formatCorrectAnswerText(q)

    const typeBadge = {
      MCQ: 'Pilihan Ganda',
      COMPLEX_MCQ: 'Multi-Jawab',
      TRUE_FALSE: 'Benar / Salah',
      MATCHING: 'Menjodohkan',
      SEQUENCING: 'Mengurutkan',
      AGREE_DISAGREE: 'Setuju / Tidak Setuju',
      ESSAY: 'Esai / Uraian',
      PARAGRAPH: 'Paragraf',
      SHORT_ANSWER: 'Isian Singkat'
    }[qType] || qType

    return `
      <tr>
        <td style="text-align: center; font-weight: bold; width: 45px;">${qNum}</td>
        <td style="width: 140px; font-size: 8.5pt;"><span class="ans-type-badge">${typeBadge}</span></td>
        <td style="font-size: 9.5pt;">${ansText}</td>
        <td style="text-align: center; font-weight: bold; width: 70px;">${points}</td>
      </tr>
    `
  }).join('')

  return `
    <div class="answer-key-document">
      ${generateKopSuratHtml(config, exam, 'KUNCI JAWABAN & PEDOMAN PENSKORAN')}

      <div class="answer-key-summary-card">
        <table style="width: 100%; border: none; font-size: 9.5pt;">
          <tr>
            <td style="border: none; width: 33%;"><strong>Total Butir Soal:</strong> ${sorted.length} Soal</td>
            <td style="border: none; width: 33%;"><strong>Total Bobot Skor:</strong> ${totalPoints} Poin</td>
            <td style="border: none; width: 34%;"><strong>KKM / Standar Kelulusan:</strong> ${exam.passing_grade || 60}</td>
          </tr>
        </table>
        <div style="margin-top: 0.5rem; font-size: 8.5pt; color: #334155; border-top: 1px solid #cbd5e1; padding-top: 0.4rem;">
          💡 <strong>Rumus Nilai Akhir Manual:</strong> &nbsp;
          <code>Nilai Siswa = (Total Perolehan Skor / Total Bobot Skor Maksimal) &times; 100</code>
        </div>
      </div>

      <table class="paper-answer-key-table">
        <thead>
          <tr>
            <th style="width: 45px; text-align: center;">No</th>
            <th style="width: 140px;">Bentuk Soal</th>
            <th>Kunci Jawaban Resmi / Pedoman Penskoran</th>
            <th style="width: 70px; text-align: center;">Bobot</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="signature-section">
        <table style="width: 100%; border: none; margin-top: 2rem;">
          <tr>
            <td style="border: none; width: 50%; text-align: center;">
              Mengetahui,<br />
              <strong>Kepala Sekolah</strong><br /><br /><br /><br />
              ( .............................................................. )<br />
              NIP. ....................................................
            </td>
            <td style="border: none; width: 50%; text-align: center;">
              Kupang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br />
              <strong>Guru Mata Pelajaran</strong><br /><br /><br /><br />
              ( <strong>${exam.users?.name || exam.created_by_name || 'Guru Pengampu'}</strong> )<br />
              NIP. ....................................................
            </td>
          </tr>
        </table>
      </div>
    </div>
  `
}

/**
 * Generate Student Answer Sheet (LJS / LJK)
 * Allows schools to photocopy only 1-2 pages per student, reusing the question booklet!
 */
export function generateStudentAnswerSheetHtml(questions = [], exam = {}, config = DEFAULT_PAPER_CONFIG) {
  exam = exam || {}
  config = { ...DEFAULT_PAPER_CONFIG, ...(config || {}) }
  const sorted = [...(questions || [])].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
  const mcqQuestions = sorted.filter(q => q.type === 'MCQ' || q.type === 'COMPLEX_MCQ')
  const nonMcqQuestions = sorted.filter(q => q.type !== 'MCQ' && q.type !== 'COMPLEX_MCQ')

  // Render MCQ grid bubbles (up to 5 columns of 10 items)
  const columnsCount = Math.min(5, Math.ceil(mcqQuestions.length / 10) || 1)
  const itemsPerCol = Math.ceil(mcqQuestions.length / columnsCount) || 10

  const mcqColsHtml = Array.from({ length: columnsCount }).map((_, colIdx) => {
    const colItems = mcqQuestions.slice(colIdx * itemsPerCol, (colIdx + 1) * itemsPerCol)
    const rowsHtml = colItems.map(q => {
      const qNum = String(q.number || 0).padStart(2, '0')
      const isComplex = q.type === 'COMPLEX_MCQ'
      const letters = ['A', 'B', 'C', 'D', 'E']
      const bubbles = letters.map(l => `<span class="ljs-bubble">[ ${l} ]</span>`).join(' ')
      return `
        <div class="ljs-mcq-row">
          <span class="ljs-qnum">${qNum}.</span>
          <span class="ljs-bubbles-group">${bubbles}</span>
          ${isComplex ? '<span style="font-size: 7pt; color: #64748b;">(multi)</span>' : ''}
        </div>
      `
    }).join('')

    return `
      <div class="ljs-mcq-col">
        ${rowsHtml}
      </div>
    `
  }).join('')

  // Render Non-MCQ answer slots (True/False, Matching, Essay)
  const nonMcqHtml = nonMcqQuestions.map(q => {
    const qNum = q.number || 0
    const qType = q.type

    if (qType === 'TRUE_FALSE') {
      const options = parseOptions(q.options)
      const keys = Object.keys(options).filter(k => k !== 'option_images')
      const slots = keys.map((_, i) => `<strong>${i + 1}.</strong> [ B / S ]`).join(' &nbsp;&nbsp;&nbsp;&nbsp; ')
      return `
        <div class="ljs-non-mcq-item">
          <strong>Soal No. ${qNum} (Benar / Salah):</strong><br />
          <div style="margin-top: 0.25rem;">${slots}</div>
        </div>
      `
    }

    if (qType === 'MATCHING') {
      const options = parseOptions(q.options)
      const leftKeys = Object.keys(options.left || {})
      const slots = leftKeys.map(k => `<strong>${k}</strong> &rarr; [ &nbsp;&nbsp;&nbsp;&nbsp; ]`).join(' &nbsp;&nbsp; ')
      return `
        <div class="ljs-non-mcq-item">
          <strong>Soal No. ${qNum} (Menjodohkan):</strong><br />
          <div style="margin-top: 0.25rem;">${slots}</div>
        </div>
      `
    }

    if (qType === 'SEQUENCING') {
      return `
        <div class="ljs-non-mcq-item">
          <strong>Soal No. ${qNum} (Mengurutkan):</strong><br />
          <div style="margin-top: 0.25rem;">
            Urutan: [ &nbsp;&nbsp;&nbsp;&nbsp; ] &rarr; [ &nbsp;&nbsp;&nbsp;&nbsp; ] &rarr; [ &nbsp;&nbsp;&nbsp;&nbsp; ] &rarr; [ &nbsp;&nbsp;&nbsp;&nbsp; ]
          </div>
        </div>
      `
    }

    if (qType === 'AGREE_DISAGREE') {
      return `
        <div class="ljs-non-mcq-item">
          <strong>Soal No. ${qNum} (Setuju / Tidak Setuju):</strong><br />
          <div style="margin-top: 0.25rem;">
            Sikap: [ &nbsp; ] SETUJU &nbsp;&nbsp; [ &nbsp; ] TIDAK SETUJU &nbsp;&nbsp; | Alasan: ....................................................
          </div>
        </div>
      `
    }

    if (qType === 'ESSAY' || qType === 'PARAGRAPH') {
      return `
        <div class="ljs-non-mcq-item">
          <strong>Soal No. ${qNum} (Uraian / Esai):</strong>
          <div class="ruled-lines" style="margin-top: 0.25rem;">
            <div class="rule-line"></div>
            <div class="rule-line"></div>
            <div class="rule-line"></div>
          </div>
        </div>
      `
    }

    return `
      <div class="ljs-non-mcq-item">
        <strong>Soal No. ${qNum}:</strong>
        <div class="rule-line" style="margin-top: 0.25rem;"></div>
      </div>
    `
  }).join('')

  return `
    <div class="answer-sheet-document">
      <div class="ljs-header-row">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="/Logo_SNT.webp" alt="Logo" style="height: 48px;" onerror="this.style.display='none'" />
          <div>
            <div style="font-size: 8pt; font-weight: bold; color: #475569;">${config.institution}</div>
            <div style="font-size: 11pt; font-weight: 800; color: #0f172a;">LEMBAR JAWABAN SISWA (LJS)</div>
            <div style="font-size: 8.5pt; color: #334155;">${config.schoolName} &bull; T.A ${config.academicYear}${exam?.title ? ` &bull; ${exam.title}` : ''}</div>
          </div>
        </div>
        <div class="ljs-score-box">
          <div style="font-size: 7.5pt; font-weight: bold;">NILAI</div>
          <div style="height: 38px;"></div>
        </div>
      </div>

      <div style="border-bottom: 2px solid #000; margin: 0.5rem 0 0.75rem 0;"></div>

      ${generateStudentIdBoxHtml()}

      <div style="margin-top: 0.75rem;">
        <div class="ljs-section-title">BAGIAN I: PILIHAN GANDA (Beri tanda silang [X] atau hitamkan bulatan)</div>
        <div class="ljs-mcq-grid-wrapper">
          ${mcqColsHtml}
        </div>
      </div>

      ${nonMcqQuestions.length > 0 ? `
        <div style="margin-top: 1rem;">
          <div class="ljs-section-title">BAGIAN II: SOAL ISIAN, MENJODOHKAN & URAIAN</div>
          <div class="ljs-non-mcq-wrapper">
            ${nonMcqHtml}
          </div>
        </div>
      ` : ''}
    </div>
  `
}

/**
 * Generate Complete Standalone HTML Document for Printing & Word Export
 */
export function generateFullExamDocumentHtml(exam, questionsList = [], config = DEFAULT_PAPER_CONFIG) {
  exam = exam || {}
  questionsList = questionsList || []
  config = { ...DEFAULT_PAPER_CONFIG, ...(config || {}) }
  const isTimes = config.fontFamily === 'times'
  const fontFamilyCss = isTimes ? "'Times New Roman', Times, serif" : "Arial, Helvetica, sans-serif"
  const baseFontSize = config.fontSize === 'compact' ? '9pt' : '10pt'

  let bodyContent = ''

  if (config.documentType === 'questions') {
    bodyContent = `
      ${config.includeHeader ? generateKopSuratHtml(config, exam) : ''}
      ${config.includeStudentIdBox ? generateStudentIdBoxHtml() : ''}
      ${generateInstructionsHtml(config.instructions)}
      ${generateQuestionsHtml(questionsList, config)}
    `
  } else if (config.documentType === 'answers') {
    bodyContent = generateAnswerKeyHtml(questionsList, exam, config)
  } else if (config.documentType === 'sheet') {
    bodyContent = generateStudentAnswerSheetHtml(questionsList, exam, config)
  } else if (config.documentType === 'all') {
    bodyContent = `
      <!-- BAGIAN 1: NASKAH SOAL -->
      <div class="page-container">
        ${config.includeHeader ? generateKopSuratHtml(config, exam) : ''}
        ${config.includeStudentIdBox ? generateStudentIdBoxHtml() : ''}
        ${generateInstructionsHtml(config.instructions)}
        ${generateQuestionsHtml(questionsList, config)}
      </div>

      <div class="page-break"></div>

      <!-- BAGIAN 2: LEMBAR JAWABAN SISWA -->
      <div class="page-container">
        ${generateStudentAnswerSheetHtml(questionsList, exam, config)}
      </div>

      <div class="page-break"></div>

      <!-- BAGIAN 3: KUNCI JAWABAN & PEDOMAN GURU -->
      <div class="page-container">
        ${generateAnswerKeyHtml(questionsList, exam, config)}
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${exam.title || 'Naskah_Soal_Ujian'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm 15mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: ${fontFamilyCss};
      font-size: ${baseFontSize};
      line-height: 1.45;
    }
    
    /* ─── KOP SURAT STYLING ─── */
    .kop-container {
      margin-bottom: 0.85rem;
    }
    .kop-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 0.4rem;
    }
    .kop-logo-box {
      width: 65px;
      flex-shrink: 0;
      text-align: center;
    }
    .kop-logo {
      max-width: 65px;
      max-height: 65px;
      object-fit: contain;
    }
    .kop-text {
      flex: 1;
      text-align: center;
    }
    .kop-institution {
      font-size: 9.5pt;
      font-weight: bold;
      color: #1e293b;
      letter-spacing: 0.5px;
    }
    .kop-school {
      font-size: 13.5pt;
      font-weight: 800;
      color: #0f172a;
      margin: 1px 0;
      letter-spacing: 0.5px;
    }
    .kop-address {
      font-size: 8pt;
      color: #475569;
    }
    .kop-line {
      border-top: 3px double #000000;
      margin: 0.4rem 0 0.6rem 0;
    }
    .exam-title-box {
      text-align: center;
      margin-bottom: 0.5rem;
    }
    .exam-main-title {
      font-size: 11pt;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .exam-sub-title {
      font-size: 8.5pt;
      color: #334155;
      font-weight: 600;
    }
    .exam-meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 0.6rem;
      border: 1px solid #cbd5e1;
    }
    .exam-meta-table td {
      padding: 3.5px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    /* ─── STUDENT ID BOX ─── */
    .student-id-box {
      border: 1.5px solid #000000;
      padding: 6px 10px;
      margin-bottom: 0.75rem;
      border-radius: 4px;
    }
    .student-id-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    .student-id-table td {
      border: none;
      padding: 2px 4px;
      vertical-align: top;
    }
    .id-row {
      margin-bottom: 3px;
    }
    .id-label {
      display: inline-block;
      width: 110px;
      font-weight: 600;
    }

    /* ─── INSTRUCTIONS BOX ─── */
    .instructions-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3px solid #0284c7;
      padding: 6px 12px;
      margin-bottom: 0.85rem;
      font-size: 8.5pt;
      border-radius: 3px;
    }
    .instructions-title {
      font-weight: bold;
      margin-bottom: 3px;
      color: #0f172a;
    }
    .instructions-list {
      margin: 0;
      padding-left: 18px;
    }
    .instructions-list li {
      margin-bottom: 1.5px;
    }

    /* ─── QUESTIONS WRAPPER & COLUMNS ─── */
    .questions-wrapper {
      width: 100%;
    }
    .two-column-layout {
      column-count: 2;
      column-gap: 8mm;
      column-rule: 1px dashed #cbd5e1;
    }
    .one-column-layout {
      column-count: 1;
    }

    /* ─── QUESTION ITEM ─── */
    .paper-question-item {
      margin-bottom: 0.85rem;
      padding-bottom: 0.6rem;
      border-bottom: 1px dotted #e2e8f0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .q-header {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .q-number {
      font-weight: bold;
      min-width: 22px;
      flex-shrink: 0;
    }
    .q-content {
      flex: 1;
    }
    .q-points {
      font-size: 8pt;
      font-weight: bold;
      color: #475569;
      margin-left: 6px;
      white-space: nowrap;
    }
    .q-text {
      white-space: pre-wrap;
      word-break: break-word;
      margin-bottom: 0.35rem;
    }
    .q-type-hint {
      font-size: 8pt;
      color: #475569;
      margin: 0.2rem 0 0.35rem 0;
    }
    .q-image-box {
      margin: 0.4rem 0;
    }
    .paper-q-image {
      max-width: 100%;
      max-height: 180px;
      object-fit: contain;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
    }
    .audio-notice-badge {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 8.5pt;
      margin-bottom: 0.35rem;
    }

    /* ─── MCQ OPTIONS ─── */
    .mcq-options-container {
      margin-top: 0.3rem;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .mcq-option {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 2px;
    }
    .mcq-letter {
      font-weight: bold;
      min-width: 18px;
    }
    .mcq-checkbox {
      font-weight: bold;
      min-width: 20px;
      font-family: monospace;
    }
    .mcq-body {
      flex: 1;
    }
    .opt-image {
      max-height: 110px;
      max-width: 100%;
      object-fit: contain;
      border: 1px solid #e2e8f0;
      margin-top: 3px;
      border-radius: 2px;
    }

    /* ─── TRUE / FALSE TABLE ─── */
    .paper-tf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-top: 0.35rem;
    }
    .paper-tf-table th, .paper-tf-table td {
      border: 1px solid #000000;
      padding: 4px 6px;
    }
    .paper-tf-table th {
      background: #f1f5f9;
      font-weight: bold;
    }

    /* ─── MATCHING COLUMNS ─── */
    .matching-columns-wrapper {
      display: flex;
      gap: 12px;
      margin-top: 0.35rem;
    }
    .matching-col {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      padding: 6px;
      background: #f8fafc;
    }
    .matching-col-header {
      font-weight: bold;
      font-size: 8pt;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 3px;
      margin-bottom: 4px;
      text-align: center;
    }
    .match-item {
      display: flex;
      gap: 4px;
      font-size: 8.5pt;
      margin-bottom: 3px;
    }
    .match-key {
      min-width: 16px;
    }
    .matching-answer-box {
      margin-top: 0.4rem;
      padding: 5px 8px;
      background: #f1f5f9;
      border: 1px dashed #94a3b8;
      font-size: 8.5pt;
      border-radius: 3px;
    }

    /* ─── SEQUENCING ─── */
    .seq-items-list {
      margin-top: 0.3rem;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .seq-item {
      display: flex;
      gap: 6px;
      font-size: 8.5pt;
    }
    .seq-letter {
      font-weight: bold;
    }
    .seq-answer-box {
      margin-top: 0.4rem;
      padding: 4px 8px;
      border: 1px dashed #94a3b8;
      font-size: 8.5pt;
      border-radius: 3px;
      background: #f8fafc;
    }

    /* ─── AGREE / DISAGREE ─── */
    .agree-choice-boxes {
      display: flex;
      gap: 20px;
      margin: 0.35rem 0;
      font-size: 9pt;
    }
    .agree-reason-item {
      display: flex;
      gap: 6px;
      font-size: 8.5pt;
      margin-bottom: 2px;
    }

    /* ─── RULED LINES FOR ESSAY ─── */
    .ruled-lines {
      margin-top: 0.35rem;
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 4px 0;
    }
    .rule-line {
      border-bottom: 1px dashed #94a3b8;
      height: 1px;
      width: 100%;
    }

    /* ─── ANSWER KEY TABLE ─── */
    .answer-key-summary-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 1rem;
    }
    .paper-answer-key-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-top: 0.5rem;
    }
    .paper-answer-key-table th, .paper-answer-key-table td {
      border: 1px solid #475569;
      padding: 5px 8px;
      vertical-align: top;
    }
    .paper-answer-key-table th {
      background: #f1f5f9;
      font-weight: bold;
    }
    .ans-type-badge {
      display: inline-block;
      padding: 1px 5px;
      background: #e2e8f0;
      border-radius: 3px;
      font-size: 7.5pt;
      font-weight: 600;
    }

    /* ─── LEMBAR JAWABAN SISWA (LJS) ─── */
    .ljs-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ljs-score-box {
      width: 80px;
      border: 1.5px solid #000;
      border-radius: 4px;
      text-align: center;
      padding: 2px;
    }
    .ljs-section-title {
      font-weight: bold;
      font-size: 8.5pt;
      background: #f1f5f9;
      padding: 3px 6px;
      border-left: 3px solid #0f172a;
      margin-bottom: 0.5rem;
    }
    .ljs-mcq-grid-wrapper {
      display: flex;
      gap: 12px;
      border: 1px solid #cbd5e1;
      padding: 8px;
      border-radius: 4px;
      background: #ffffff;
    }
    .ljs-mcq-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ljs-mcq-row {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 8pt;
    }
    .ljs-qnum {
      font-weight: bold;
      width: 22px;
    }
    .ljs-bubble {
      font-family: monospace;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .ljs-non-mcq-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid #cbd5e1;
      padding: 8px;
      border-radius: 4px;
    }
    .ljs-non-mcq-item {
      font-size: 8.5pt;
    }

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>
  `
}

/**
 * Print HTML directly via isolated hidden iframe
 * Prevents page reloads or UI style contamination
 */
export function printHtmlViaIframe(htmlContent, documentTitle = 'Naskah_Soal_Ujian') {
  return new Promise((resolve) => {
    // Remove any previous print iframe
    const existingIframe = document.getElementById('paper-exam-print-iframe')
    if (existingIframe) {
      existingIframe.remove()
    }

    const iframe = document.createElement('iframe')
    iframe.id = 'paper-exam-print-iframe'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'

    document.body.appendChild(iframe)

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(htmlContent)
    doc.close()

    // Give browser time to load any images or fonts
    setTimeout(() => {
      try {
        const originalTitle = document.title
        document.title = documentTitle
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        setTimeout(() => {
          document.title = originalTitle
          iframe.remove()
          resolve(true)
        }, 1500)
      } catch (err) {
        console.warn('Iframe print failed, falling back to window.open print:', err)
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          printWindow.document.open()
          printWindow.document.write(htmlContent)
          printWindow.document.close()
          setTimeout(() => {
            printWindow.focus()
            printWindow.print()
            resolve(true)
          }, 600)
        } else {
          resolve(false)
        }
      }
    }, 400)
  })
}

/**
 * Download HTML as Microsoft Word (.doc)
 * Word natively opens HTML with MIME application/msword with all formatting intact
 */
export function downloadExamAsWord(htmlContent, filename = 'Naskah_Soal.doc') {
  const wordHeader = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
    <![endif]-->
  `

  const completeWordHtml = wordHeader + htmlContent.replace('<!DOCTYPE html>', '')

  const blob = new Blob(['\ufeff' + completeWordHtml], {
    type: 'application/msword;charset=utf-8'
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

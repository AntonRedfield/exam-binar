import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, results, sessions, questions, users, fetchStudentProfilesMap, isPrivilegedUser } from '../../lib/db'
import { getCurrentUser } from '../../lib/auth'
import { gradeExam } from '../../lib/grader'
import StudentAnswerDetailModal from '../../components/exam/StudentAnswerDetailModal'
import { ChevronLeft, Printer, Edit3, Save, Eye, X, BarChart2, RefreshCw, Trash2, CheckCircle2, ShieldAlert, FileText, Copy, Plus, Users, UserX, AlertTriangle, FileDown } from 'lucide-react'
import { formatScore, roundScore } from '../../lib/format'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function ResultsView() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [resultList, setResultList] = useState([])
  const [questionList, setQuestionList] = useState([])
  const [essayEdits, setEssayEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [selectedResult, setSelectedResult] = useState(null)
  const [modalScores, setModalScores] = useState({})
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [regrading, setRegrading] = useState(false)
  const [selectedDetailResult, setSelectedDetailResult] = useState(null)
  const [unauthorized, setUnauthorized] = useState(false)

  // Target class attendance tracking state
  const [targetStudents, setTargetStudents] = useState([])
  const [unattemptedStudents, setUnattemptedStudents] = useState([])
  const [attendanceFilter, setAttendanceFilter] = useState('all') // 'all' | 'all_targets' | 'unattempted' | 'passed' | 'failed'
  const [copiedWaNotice, setCopiedWaNotice] = useState('')
  const [makeupLoading, setMakeupLoading] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Map of questions by question number for quick metadata lookup
  const questionMap = new Map((questionList || []).map(q => [Number(q.number), q]))

  // Total maximum score across all questions configured by the teacher
  const totalExamMaxScore = roundScore((questionList || []).reduce((sum, q) => {
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? roundScore(Number(q.points)) : 1
    return sum + pts
  }, 0))

  // List of all questions that require manual essay grading
  const essayQuestionsList = (questionList || []).filter(q =>
    q.type === 'ESSAY' ||
    q.type === 'PARAGRAPH' ||
    (q.type === 'AGREE_DISAGREE' && (q.options?.reason_type === 'essay' || q.correct_answer?.reason_type === 'essay'))
  )

  // Total possible essay points across the exam
  const totalMaxEssayScore = roundScore(essayQuestionsList.reduce((sum, q) => {
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? roundScore(Number(q.points)) : 1
    return sum + (q.type === 'AGREE_DISAGREE' ? (pts * 0.5) : pts)
  }, 0))

  async function load() {
    try {
      // 1. Auto-remove teacher & admin try mode entries older than 1 hour
      await sessions.cleanExpiredPrivilegedTryEntries(examId).catch(() => {})

      // 2. Automatically lock expired sessions and extract & sync their scores into results
      await sessions.autoLockAndSyncExam(examId)

      const [{ data: examData }, { data: res }, { data: sess }, { data: qs }] = await Promise.all([
        exams.getById(examId),
        results.listByExam(examId),
        sessions.listByExam(examId),
        questions.listByExam(examId)
      ])

      // Teacher ownership verification: teachers can only see results of exams they made by themselves
      const currentUser = getCurrentUser()
      const isTeacher = currentUser?.role === 'MODERATOR' || currentUser?.level === 2 || currentUser?.level === 3
      if (isTeacher && examData?.created_by && examData.created_by !== currentUser?.id) {
        setUnauthorized(true)
        setLoading(false)
        return
      }

      const rawQuestions = qs || []
      setQuestionList(rawQuestions)

      const computedTotalMax = rawQuestions.reduce((sum, q) => {
        const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
        return sum + pts
      }, 0)

      const rawResults = res || []
      const rawSessions = sess || []

      // Collect all student IDs to fetch complete profile mapping directly
      const allStudentIds = Array.from(new Set([
        ...rawResults.map(r => r.student_id),
        ...rawSessions.map(s => s.student_id)
      ])).filter(Boolean)

      const profMap = await fetchStudentProfilesMap(allStudentIds)

      const sessionMap = {}
      rawSessions.forEach(s => {
        if (s.id) sessionMap[s.id] = s
        if (s.student_id) sessionMap[s.student_id] = s
      })

      // Deduplicate results by student_id (keep highest score or latest submitted)
      const dedupedResultsMap = new Map()
      for (const r of rawResults) {
        const sid = r.student_id
        if (!sid) {
          dedupedResultsMap.set(r.id, r)
          continue
        }
        if (!dedupedResultsMap.has(sid)) {
          dedupedResultsMap.set(sid, r)
        } else {
          const existing = dedupedResultsMap.get(sid)
          const existingTotal = (existing.auto_score || 0) + (existing.essay_score || 0)
          const newTotal = (r.auto_score || 0) + (r.essay_score || 0)
          if (newTotal > existingTotal || (newTotal === existingTotal && new Date(r.created_at) > new Date(existing.created_at))) {
            dedupedResultsMap.set(sid, r)
          }
        }
      }

      let newRes = Array.from(dedupedResultsMap.values())

      // Auto-score abandoned or completed student sessions that do not have a result yet (skip teacher try sessions)
      const missingSessions = rawSessions.filter(s => s.student_id && !dedupedResultsMap.has(s.student_id) && !isPrivilegedUser(profMap[s.student_id]))
      if (missingSessions.length > 0 && qs) {
        for (const s of missingSessions) {
          const isTimeUp = s.end_timestamp && new Date(s.end_timestamp).getTime() < Date.now()
          const isAbandoned = s.status === 'time_up' || s.status === 'submitted' || isTimeUp
          if (isAbandoned) {
            try {
              const { autoScore, maxAutoScore, breakdown } = gradeExam(s.answers || {}, qs)
              const { data: createdRes } = await results.create({
                student_id: s.student_id,
                exam_id: examId,
                session_id: s.id,
                auto_score: autoScore,
                max_auto_score: maxAutoScore,
                essay_score: 0,
                violation_count: s.violation_count || 0,
                breakdown: JSON.stringify(breakdown),
              })
              if (createdRes) {
                newRes.push(createdRes)
                dedupedResultsMap.set(s.student_id, createdRes)
                if (s.status === 'active') {
                  await sessions.update(s.id, { status: 'time_up' })
                }
              }
            } catch (err) {
              console.warn('[ResultsView] Auto-score missing result error:', err)
            }
          }
        }
      }

      // Filter out teacher & admin try mode entries so results page displays a clean student roster
      const studentOnlyResults = newRes.filter(r => !isPrivilegedUser(profMap[r.student_id]))

      // Format and cross-reference profiles to guarantee proper student names and classes
      const formattedResults = studentOnlyResults.map(r => {
        const s = sessionMap[r.session_id] || sessionMap[r.student_id]
        const p = profMap[r.student_id] || r.profiles || null
        const existingUser = r.users || r.student

        const fullName = p?.fullname || p?.display_name || p?.full_name || p?.name || existingUser?.full_name || existingUser?.display_name || existingUser?.name || s?.users?.full_name || s?.users?.name || (r.student_id ? `Siswa (${r.student_id.slice(0, 8)})` : 'Siswa')
        const displayName = p?.display_name || p?.fullname || fullName
        const username = p?.username || existingUser?.username || s?.users?.username || ''
        const kelas = p?.class_section || p?.kelas || existingUser?.class_section || existingUser?.kelas || existingUser?.classes?.name || s?.users?.classes?.name || s?.users?.kelas || '—'

        const unifiedUser = {
          id: r.student_id,
          name: displayName,
          full_name: fullName,
          display_name: displayName,
          username,
          kelas,
          class_section: kelas,
          classes: { name: kelas }
        }

        const normalizedMax = computedTotalMax > 0 ? computedTotalMax : (r.max_auto_score || 0)

        return {
          ...r,
          max_auto_score: normalizedMax,
          users: unifiedUser,
          student: unifiedUser,
          profiles: p || r.profiles
        }
      })

      setExam(examData)
      setResultList(formattedResults)

      // Auto-scan target class students configured for this exam session
      try {
        const { data: targetData } = await users.listTargetStudents(examData?.target_kelas)
        const expectedTargets = targetData || []
        setTargetStudents(expectedTargets)

        // Identify students who have not attempted, attended, or submitted (excluding teachers)
        const recordedIds = new Set(formattedResults.map(r => r.student_id).filter(Boolean))
        const absentList = expectedTargets
          .filter(ts => !recordedIds.has(ts.id) && !isPrivilegedUser(ts))
          .map(ts => {
            const sess = sessionMap[ts.id]
            return {
              id: `unattempted-${ts.id}`,
              student_id: ts.id,
              isUnattempted: true,
              users: ts,
              student: ts,
              auto_score: 0,
              essay_score: 0,
              max_auto_score: computedTotalMax || 100,
              violation_count: sess?.violation_count || 0,
              sessionStatus: sess?.status || 'none',
              hasSession: Boolean(sess)
            }
          })
        setUnattemptedStudents(absentList)
      } catch (scanErr) {
        console.warn('[ResultsView] Error scanning target class students:', scanErr)
      }
    } catch (err) {
      console.error('[ResultsView] load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [examId])

  const passingGrade = exam?.passing_grade ?? 60

  // Copy absent students list in WhatsApp-friendly format
  function handleCopyAbsentList() {
    if (!unattemptedStudents.length) return
    const examTitle = exam?.title || 'Ujian'
    const targetKelas = exam?.target_kelas ? `Kelas ${exam.target_kelas.split(',').join(', ')}` : 'Semua Kelas'
    const listText = unattemptedStudents.map((s, idx) => {
      const name = s.users?.full_name || s.users?.name || 'Siswa'
      const kelas = s.users?.kelas || s.users?.class_section || targetKelas
      const uname = s.users?.username ? ` (@${s.users.username})` : ''
      return `${idx + 1}. ${name} - ${kelas}${uname}`
    }).join('\n')

    const message = `📢 *PEMBERITAHUAN SISWA BELUM MENGERJAKAN UJIAN*\n` +
      `Mata Pelajaran: *${examTitle}*\n` +
      `Target Kelas: *${targetKelas}*\n` +
      `Waktu Pengecekan: ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n` +
      `Total Belum Mengerjakan: *${unattemptedStudents.length} dari ${targetStudents.length} siswa target*\n\n` +
      `*Daftar Nama Siswa:*\n${listText}\n\n` +
      `_Mohon bantuan Bapak/Ibu Wali Kelas atau Orang Tua untuk mengingatkan siswa bersangkutan agar segera mengikuti ujian susulan._`

    navigator.clipboard.writeText(message)
    setCopiedWaNotice('✅ Berhasil Disalin!')
    setTimeout(() => setCopiedWaNotice(''), 3000)
  }

  // Grant makeup exam session for an absent student
  async function handleGrantMakeupExam(student) {
    const studentName = student.users?.full_name || student.users?.name || 'Siswa'
    if (!window.confirm(`Izinkan ujian susulan untuk ${studentName}?\n\nSistem akan membuatkan dan mengaktifkan sesi ujian selama ${exam?.duration_minutes || 60} menit agar siswa dapat langsung login dan mengerjakan ujian dari akunnya.`)) return

    setMakeupLoading(student.student_id)
    try {
      const durationMs = (exam?.duration_minutes || 60) * 60 * 1000
      const newEnd = new Date(Date.now() + durationMs).toISOString()

      const { data: sess, error: sErr } = await sessions.getOrCreate(examId, student.student_id)
      if (sErr) throw sErr

      if (sess) {
        await sessions.update(sess.id, {
          status: 'active',
          end_timestamp: newEnd,
          returnee_token_required: false,
          returnee_token: null,
          returnee_reason: null,
          returnee_unlocked_at: new Date().toISOString()
        })
      }

      alert(`✅ Berhasil! Sesi ujian susulan untuk ${studentName} telah dibuka aktif selama ${exam?.duration_minutes || 60} menit. Siswa dapat langsung masuk dari akunnya.`)
      await load()
    } catch (err) {
      alert('Gagal membuat sesi susulan: ' + (err.message || 'Error'))
    } finally {
      setMakeupLoading(null)
    }
  }

  function handleCopySingleStudent(student) {
    const studentName = student.users?.full_name || student.users?.name || 'Siswa'
    const studentClass = student.users?.kelas || '—'
    const username = student.users?.username ? `@${student.users.username}` : ''
    const examTitle = exam?.title || 'Ujian'

    const text = `Halo ${studentName} (${studentClass} ${username}), Anda tercatat BELUM MENGERJAKAN ujian "${examTitle}". Silakan segera hubungi guru pengawas untuk mengikuti ujian susulan.`
    navigator.clipboard.writeText(text)
    alert(`Teks pengingat untuk ${studentName} telah disalin ke clipboard!`)
  }

  async function handleDeleteResult(resultId, studentName) {
    if (!window.confirm(`Hapus hasil ujian untuk ${studentName || 'siswa ini'}? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      const { error } = await results.delete(resultId)
      if (error) {
        alert('Gagal menghapus hasil: ' + (error.message || 'Terjadi kesalahan'))
        return
      }
      setResultList(prev => prev.filter(r => r.id !== resultId))
    } catch (err) {
      alert('Gagal menghapus hasil: ' + (err.message || 'Terjadi kesalahan'))
    }
  }

  function openEssayModal(r) {
    const bd = (() => { try { return JSON.parse(r.breakdown || '[]') } catch { return [] } })()
    const essays = bd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))

    const initialScores = {}
    if (essays.length === 1 && (essays[0].earned === undefined || essays[0].earned === 0) && (r.essay_score || 0) > 0) {
      initialScores[essays[0].number] = r.essay_score
    } else {
      essays.forEach(e => {
        initialScores[e.number] = (e.earned !== undefined && e.status !== 'pending') ? e.earned : (e.earned || 0)
      })
    }

    setModalScores(initialScores)
    setSelectedResult(r)
  }

  function handleModalScoreChange(qNum, valueStr, maxPts) {
    if (valueStr === '') {
      setModalScores(prev => ({ ...prev, [qNum]: '' }))
      return
    }
    let val = parseFloat(valueStr)
    if (isNaN(val)) val = 0
    if (val < 0) val = 0
    if (val > maxPts) val = maxPts // Strictly enforce teacher's setup point!
    setModalScores(prev => ({ ...prev, [qNum]: val }))
  }

  async function saveModalEssayScores() {
    if (!selectedResult) return
    setSaving(selectedResult.id)
    try {
      const bd = (() => { try { return JSON.parse(selectedResult.breakdown || '[]') } catch { return [] } })()

      const updatedBd = bd.map(b => {
        const isEssay = b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay')
        if (!isEssay) return b

        const qObj = questionMap.get(Number(b.number))
        const maxPts = b.type === 'AGREE_DISAGREE'
          ? (Number(b.max || qObj?.points || 1) * 0.5)
          : Number(b.max || qObj?.points || 1)

        const rawVal = modalScores[b.number]
        const earned = roundScore(Math.min(Math.max(0, isNaN(parseFloat(rawVal)) ? 0 : parseFloat(rawVal)), maxPts))

        let status = 'wrong'
        if (earned === maxPts) status = 'correct'
        else if (earned > 0) status = 'partial'

        return {
          ...b,
          earned,
          max: maxPts,
          status
        }
      })

      const accumulated = updatedBd
        .filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))
        .reduce((sum, b) => sum + (Number(b.earned) || 0), 0)

      const finalEssayScore = roundScore(accumulated)
      const finalMaxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (selectedResult.max_auto_score || 0)

      const { data, error } = await results.update(selectedResult.id, {
        essay_score: finalEssayScore,
        max_auto_score: finalMaxScore,
        breakdown: JSON.stringify(updatedBd)
      })

      if (error) {
        alert('Gagal menyimpan nilai esai: ' + (error.message || 'Terjadi kesalahan'))
        return
      }

      setResultList(prev => prev.map(r => r.id === selectedResult.id ? {
        ...r,
        essay_score: finalEssayScore,
        max_auto_score: finalMaxScore,
        breakdown: JSON.stringify(updatedBd)
      } : r))

      setEssayEdits(prev => ({ ...prev, [selectedResult.id]: finalEssayScore }))
      setSelectedResult(null)
    } catch (err) {
      console.error('Error saving essay scores:', err)
      alert('Terjadi kesalahan saat menyimpan nilai esai')
    } finally {
      setSaving(null)
    }
  }

  async function saveEssay(resultId, essayScore) {
    setSaving(resultId)
    const targetResult = resultList.find(r => r.id === resultId)
    const numScore = parseFloat(essayScore) || 0
    const clampedScore = roundScore(totalMaxEssayScore > 0 ? Math.min(Math.max(0, numScore), totalMaxEssayScore) : Math.max(0, numScore))
    const finalMaxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (targetResult?.max_auto_score || 0)

    let updatedBreakdown = null
    if (targetResult?.breakdown) {
      try {
        const bd = JSON.parse(targetResult.breakdown || '[]')
        const essays = bd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))
        if (essays.length === 1) {
          const maxPts = essays[0].max || totalMaxEssayScore || 1
          const earned = roundScore(Math.min(clampedScore, maxPts))
          const status = earned === maxPts ? 'correct' : (earned > 0 ? 'partial' : 'wrong')
          updatedBreakdown = bd.map(b => b.number === essays[0].number ? { ...b, earned, status } : b)
        }
      } catch {}
    }

    const updatePayload = {
      essay_score: clampedScore,
      max_auto_score: finalMaxScore
    }
    if (updatedBreakdown) {
      updatePayload.breakdown = JSON.stringify(updatedBreakdown)
    }

    const { data, error } = await results.update(resultId, updatePayload)
    if (data) {
      setResultList(prev => prev.map(r => r.id === resultId
        ? {
            ...r,
            essay_score: data.essay_score,
            max_auto_score: data.max_auto_score,
            ...(updatedBreakdown ? { breakdown: JSON.stringify(updatedBreakdown) } : {})
          }
        : r
      ))
      setEssayEdits(prev => ({ ...prev, [resultId]: data.essay_score }))
    } else if (error) {
      alert('Gagal menyimpan: ' + (error.message || 'Error'))
    }
    setSaving(null)
  }

  async function handleRegrade() {
    if (!window.confirm('Hitung ulang semua nilai siswa berdasarkan sistem penilaian terbaru?')) return
    setRegrading(true)
    try {
      // Sync and lock any completed or expired sessions first
      await sessions.autoLockAndSyncExam(examId)

      const [{ data: qs }, { data: sess }, { data: currentRes }] = await Promise.all([
        questions.listByExam(examId),
        sessions.listByExam(examId),
        results.listByExam(examId)
      ])
      if (!qs || !currentRes) return

      const sessionMap = {}
      ;(sess || []).forEach(s => {
        if (s.id) sessionMap[s.id] = s
        if (s.student_id) sessionMap[s.student_id] = s
      })

      for (const r of currentRes) {
        const s = sessionMap[r.session_id] || sessionMap[r.student_id]
        if (s && s.answers) {
          const existingBd = (() => { try { return JSON.parse(r.breakdown || '[]') } catch { return [] } })()
          const gradedMap = new Map()
          existingBd.forEach(b => {
            if ((b.type === 'ESSAY' || b.type === 'PARAGRAPH' || b.reason_type === 'essay') && b.status !== 'pending' && b.earned !== undefined) {
              gradedMap.set(Number(b.number), b)
            }
          })

          const { autoScore, maxAutoScore, breakdown: newBd } = gradeExam(s.answers, qs)

          let accumulatedEssay = 0
          const mergedBd = newBd.map(b => {
            const existing = gradedMap.get(Number(b.number))
            if (existing) {
              accumulatedEssay += Number(existing.earned) || 0
              return { ...b, earned: existing.earned, status: existing.status }
            }
            return b
          })

          const finalEssay = gradedMap.size > 0 ? roundScore(accumulatedEssay) : roundScore(r.essay_score || 0)

          await results.update(r.id, {
            auto_score: roundScore(autoScore),
            max_auto_score: roundScore(maxAutoScore),
            essay_score: finalEssay,
            breakdown: JSON.stringify(mergedBd)
          })
        }
      }
      await load()
      alert('Berhasil menghitung ulang seluruh nilai siswa!')
    } catch (err) {
      console.error(err)
      alert('Gagal menghitung ulang: ' + (err.message || 'Terjadi kesalahan'))
    } finally {
      setRegrading(false)
    }
  }

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  // Trigger native print with synchronized auto-naming for browser print-to-PDF
  function handlePrint() {
    const sanitizedTitle = (exam?.title || 'Hasil_Ujian')
      .replace(/[/\\?%*:|"<>]/g, '')
      .trim()
      .replace(/\s+/g, '_')
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    const originalTitle = document.title
    document.title = `${sanitizedTitle}_${dateStr}`
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1000)
  }

  // Generate and download formal A4 PDF result report
  async function handleDownloadPdf() {
    if (downloadingPdf) return
    setDownloadingPdf(true)

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const sanitizedTitle = (exam?.title || 'Hasil_Ujian')
        .replace(/[/\\?%*:|"<>]/g, '')
        .trim()
        .replace(/\s+/g, '_')
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`
      const fileName = `${sanitizedTitle}_${dateStr}.pdf`

      // Attempt to load school logo
      let logoDataUrl = null
      try {
        logoDataUrl = await new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'Anonymous'
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas')
              canvas.width = img.width
              canvas.height = img.height
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img, 0, 0)
              resolve(canvas.toDataURL('image/png'))
            } catch {
              resolve(null)
            }
          }
          img.onerror = () => resolve(null)
          img.src = `${import.meta.env.BASE_URL}Logo_SNT.webp`
        })
      } catch {
        logoDataUrl = null
      }

      const pageWidth = 210
      const marginX = 12

      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', marginX, 10, 16, 16)
        } catch (err) {
          console.warn('Could not render logo in PDF:', err)
        }
      }

      // Formal School Header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(27, 51, 97) // #1b3361
      doc.text('SEKOLAH NASIONAL TERINTEGRASI 10 KUPANG', 105, 15, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(71, 85, 105) // #475569
      doc.text('SISTEM ASESMEN TERPADU (CBT) • REKAPITULASI HASIL ASESMEN SISWA', 105, 20, { align: 'center' })

      // Decorative divider rule
      doc.setDrawColor(27, 51, 97)
      doc.setLineWidth(0.6)
      doc.line(marginX, 28, pageWidth - marginX, 28)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.2)
      doc.line(marginX, 29, pageWidth - marginX, 29)

      // Metadata summary
      doc.setFontSize(8)
      doc.setTextColor(15, 23, 42)

      // Left Column
      doc.setFont('helvetica', 'bold')
      doc.text('Nama Ujian', marginX, 35)
      doc.text(':', marginX + 24, 35)
      doc.setFont('helvetica', 'normal')
      doc.text(exam?.title || '—', marginX + 27, 35)

      doc.setFont('helvetica', 'bold')
      doc.text('Mata Pelajaran', marginX, 40)
      doc.text(':', marginX + 24, 40)
      doc.setFont('helvetica', 'normal')
      doc.text(exam?.subject || exam?.category || 'Umum', marginX + 27, 40)

      doc.setFont('helvetica', 'bold')
      doc.text('Kelas Target', marginX, 45)
      doc.text(':', marginX + 24, 45)
      doc.setFont('helvetica', 'normal')
      const targetClassNames = targetStudents.length > 0
        ? Array.from(new Set(targetStudents.map(s => s.users?.classes?.name || s.users?.kelas || s.users?.class_section || s.kelas).filter(Boolean))).join(', ')
        : (exam?.target_kelas || exam?.classes?.name || 'Semua Kelas')
      doc.text(targetClassNames || 'Semua Kelas', marginX + 27, 45)

      // Right Column
      const colRightLabel = 120
      const colRightVal = 145

      doc.setFont('helvetica', 'bold')
      doc.text('Standar KKM', colRightLabel, 35)
      doc.text(':', colRightVal - 2, 35)
      doc.setFont('helvetica', 'normal')
      doc.text(String(passingGrade), colRightVal, 35)

      doc.setFont('helvetica', 'bold')
      doc.text('Tanggal Ujian', colRightLabel, 40)
      doc.text(':', colRightVal - 2, 40)
      doc.setFont('helvetica', 'normal')
      const examDateStr = exam?.created_at
        ? new Date(exam.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(examDateStr, colRightVal, 40)

      doc.setFont('helvetica', 'bold')
      doc.text('Statistik', colRightLabel, 45)
      doc.text(':', colRightVal - 2, 45)
      doc.setFont('helvetica', 'normal')
      doc.text(`Rata-rata: ${avgStr}% (Lulus: ${passCount}, Belum: ${failCount})`, colRightVal, 45)

      // Table rows data
      const tableBody = sortedResults.map((r, i) => {
        const isUnattempted = !!r.isUnattempted
        const studentName = r.users?.full_name || r.student?.full_name || r.users?.name || r.student?.name || (r.student_id ? `Siswa (${r.student_id.slice(0, 8)})` : 'Siswa')
        const studentClass = r.users?.classes?.name || r.users?.kelas || r.users?.class_section || r.student?.kelas || '—'
        const nisnOrUser = r.users?.nisn ? `NISN: ${r.users.nisn}` : (r.users?.username ? `@${r.users.username}` : '')
        const nameWithMeta = nisnOrUser ? `${studentName}\n${nisnOrUser}` : studentName

        if (isUnattempted) {
          return [
            String(i + 1),
            nameWithMeta,
            studentClass,
            '—',
            '—',
            '0.00%',
            'TIDAK HADIR',
            '—'
          ]
        }

        const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
        const essayVal = essayEdits[r.id] !== undefined ? Number(essayEdits[r.id]) : (Number(r.essay_score) || 0)
        const currentTotal = (Number(r.auto_score) || 0) + essayVal
        const pctNum = maxPossible > 0 ? (currentTotal / maxPossible) * 100 : 0
        const pctStr = `${formatScore(pctNum)}%`
        const isPassed = pctNum >= passingGrade

        return [
          String(i + 1),
          nameWithMeta,
          studentClass,
          formatScore(r.auto_score),
          formatScore(essayVal),
          pctStr,
          isPassed ? 'LULUS' : 'BELUM LULUS',
          r.violation_count > 0 ? `⚠ ${r.violation_count}` : '0'
        ]
      })

      const runAutoTable = typeof autoTable === 'function' ? autoTable : (doc.autoTable ? doc.autoTable.bind(doc) : null)

      if (runAutoTable) {
        runAutoTable(doc, {
          startY: 50,
          margin: { top: 20, right: marginX, bottom: 20, left: marginX },
          head: [['No', 'Nama Siswa', 'Kelas', 'Skor Auto', 'Skor Esai', 'Nilai Akhir', 'Keterangan', 'Pelanggaran']],
          body: tableBody,
          showHead: 'everyPage', // Guarantees table header repeats on every paper page in PDF
          theme: 'grid',
          headStyles: {
            fillColor: [27, 51, 97],
            textColor: [255, 255, 255],
            fontSize: 8.5,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: 2.5
          },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: [30, 41, 59],
            lineColor: [203, 213, 225],
            lineWidth: 0.15,
            valign: 'middle'
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'left', cellWidth: 54 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'center', cellWidth: 20 },
            5: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
            6: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
            7: { halign: 'center', cellWidth: 16 }
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          didParseCell: (data) => {
            if (data.section === 'body') {
              if (data.column.index === 6) {
                const val = data.cell.raw
                if (val === 'LULUS') {
                  data.cell.styles.textColor = [22, 101, 52] // green-800
                } else if (val === 'BELUM LULUS') {
                  data.cell.styles.textColor = [185, 28, 28] // red-700
                } else if (val === 'TIDAK HADIR') {
                  data.cell.styles.textColor = [220, 38, 38] // red-600
                  data.row.styles.fillColor = [254, 242, 242]
                }
              }
              if (data.column.index === 7 && String(data.cell.raw).includes('⚠')) {
                data.cell.styles.textColor = [217, 119, 6] // amber-600
                data.cell.styles.fontStyle = 'bold'
              }
            }
          }
        })
      }

      // Add page numbering and watermark footer to every page
      const totalPages = doc.internal.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(148, 163, 184) // #94a3b8

        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.line(marginX, 287, pageWidth - marginX, 287)

        doc.text('Dokumen Resmi Rekapitulasi Penilaian CBT — SNT 10 Kupang', marginX, 291)
        doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, 291, { align: 'right' })
      }

      doc.save(fileName)
    } catch (err) {
      console.error('Download PDF error:', err)
      alert('Gagal mengunduh PDF: ' + (err.message || 'Terjadi kesalahan'))
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Combined and filtered display list based on attendanceFilter
  let displayList = []
  if (attendanceFilter === 'unattempted') {
    displayList = [...unattemptedStudents]
  } else if (attendanceFilter === 'all_targets') {
    displayList = [...resultList, ...unattemptedStudents]
  } else if (attendanceFilter === 'passed') {
    displayList = resultList.filter(r => {
      const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
      const total = (Number(r.auto_score) || 0) + (Number(r.essay_score) || 0)
      const pct = maxPossible > 0 ? (total / maxPossible) * 100 : 0
      return pct >= passingGrade
    })
  } else if (attendanceFilter === 'failed') {
    displayList = resultList.filter(r => {
      const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
      const total = (Number(r.auto_score) || 0) + (Number(r.essay_score) || 0)
      const pct = maxPossible > 0 ? (total / maxPossible) * 100 : 0
      return pct < passingGrade
    })
  } else {
    // 'all' = submitted results
    displayList = [...resultList]
  }

  const sortedResults = displayList.sort((a, b) => {
    // If one is unattempted and sorting by score, unattempted goes to bottom
    if (a.isUnattempted !== b.isUnattempted && sortConfig.key === 'nilai') {
      return a.isUnattempted ? 1 : -1
    }
    const key = sortConfig.key
    let aVal, bVal

    if (key === 'nilai') {
      const aTotal = (a.auto_score || 0) + (a.essay_score || 0)
      const bTotal = (b.auto_score || 0) + (b.essay_score || 0)
      aVal = a.max_auto_score > 0 ? (aTotal / a.max_auto_score) * 100 : 0
      bVal = b.max_auto_score > 0 ? (bTotal / b.max_auto_score) * 100 : 0
    } else if (key === 'pelanggaran') {
      aVal = a.violation_count || 0
      bVal = b.violation_count || 0
    } else if (key === 'kelas') {
      aVal = String(a.users?.classes?.name || a.users?.kelas || a.student?.kelas || '').toLowerCase()
      bVal = String(b.users?.classes?.name || b.users?.kelas || b.student?.kelas || '').toLowerCase()
    } else {
      const aName = a.users?.full_name || a.users?.name || a.student?.full_name || a.student?.name || ''
      const bName = b.users?.full_name || b.users?.name || b.student?.full_name || b.student?.name || ''
      aVal = String(a.users?.[key] || aName).toLowerCase()
      bVal = String(b.users?.[key] || bName).toLowerCase()
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  if (unauthorized) {
    return (
      <div className="page-body" style={{ maxWidth: 600, margin: '4rem auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '2.5rem 1.5rem', borderTop: '4px solid var(--danger)' }}>
          <ShieldAlert size={48} color="var(--danger)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Akses Dibatasi</h3>
          <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.92rem' }}>
            Anda hanya berwenang melihat hasil ujian yang Anda buat sendiri.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/teacher/exams')}>
            <ChevronLeft size={15} /> Kembali ke Daftar Ujian
          </button>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="page-body">
        <div className="card text-center" style={{ padding: '3.5rem 1.5rem', maxWidth: 560, margin: '2rem auto' }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#1e293b' }}>Ujian Tidak Ditemukan</h3>
          <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
            Ujian dengan ID &ldquo;{examId}&rdquo; tidak ditemukan atau telah dihapus.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/teacher/exams')}>
            <ChevronLeft size={16} /> Kembali ke Daftar Ujian
          </button>
        </div>
      </div>
    )
  }

  const avgPct = resultList.length
    ? (resultList.reduce((sum, r) => {
        const total = (Number(r.auto_score) || 0) + (Number(r.essay_score) || 0)
        const maxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
        const pct = maxScore > 0 ? (total / maxScore) * 100 : 0
        return sum + pct
      }, 0) / resultList.length)
    : 0
  const avgStr = avgPct ? formatScore(avgPct) : '0'

  // Count students passing/failing
  const passCount = resultList.filter(r => {
    const total = (Number(r.auto_score) || 0) + (Number(r.essay_score) || 0)
    const maxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
    const pct = maxScore > 0 ? (total / maxScore) * 100 : 0
    return pct >= passingGrade
  }).length
  const failCount = resultList.length - passCount

  const targetStudentCount = targetStudents.length
  const attendedCount = resultList.length
  const unattendedCount = unattemptedStudents.length
  const attendanceRate = targetStudentCount > 0 ? (attendedCount / targetStudentCount) * 100 : 100
  const attendanceRateStr = formatScore(Math.min(100, attendanceRate))
  const absentRate = targetStudentCount > 0 ? (unattendedCount / targetStudentCount) * 100 : 0
  const absentRateStr = formatScore(absentRate)

  return (
    <>
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>Hasil: {exam?.title}</h2>
              <p className="text-muted text-sm">
                {resultList.length} siswa menyelesaikan · Rata-rata: {avgStr}% · KKM: {passingGrade}
                {' · '}
                <span style={{ color: 'var(--success)' }}>✓ {passCount} Lulus</span>
                {' · '}
                <span style={{ color: 'var(--danger)' }}>✗ {failCount} Belum Lulus</span>
                {unattendedCount > 0 && (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                      ⚠️ {unattendedCount} Belum Mengerjakan (Absen)
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRegrade}
              disabled={regrading || resultList.length === 0}
              title="Hitung ulang semua nilai siswa berdasarkan sistem penilaian terbaru"
            >
              <RefreshCw size={15} style={{ animation: regrading ? 'spin 0.8s linear infinite' : 'none' }} />
              {regrading ? 'Menghitung...' : 'Hitung Ulang Nilai'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/analytics/${examId}`)}>
              <BarChart2 size={15} /> Analisis Soal
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || sortedResults.length === 0}
              title="Unduh rekapitulasi nilai siswa dalam format PDF A4"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
            >
              <FileDown size={15} style={{ animation: downloadingPdf ? 'spin 1s linear infinite' : 'none' }} />
              {downloadingPdf ? 'Menyiapkan...' : 'Unduh PDF'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handlePrint}
              title="Cetak lembar nilai (A4)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
            >
              <Printer size={15} /> Cetak
            </button>
          </div>
        </div>
      </div>
      <div className="print-only" style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem', paddingTop: '1rem' }}>
        <div style={{ position: 'absolute', top: '1rem', right: '0', textAlign: 'right', fontSize: '11pt', color: 'black' }}>
          Tanggal Ujian:<br />
          {exam?.created_at ? new Date(exam.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1b3361', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Sistem Asesmen Terpadu
        </div>
        <img
          src={`${import.meta.env.BASE_URL}Logo_SNT.webp`}
          alt="Logo SNT 10 Kupang"
          style={{
            height: 75,
            width: 75,
            objectFit: 'contain',
            margin: '0.25rem auto',
            background: '#ffffff',
            borderRadius: '14px',
            padding: '5px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(27, 51, 97, 0.1)',
            display: 'block'
          }}
        />
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontFamily: "'Inter', sans-serif", color: 'black', fontWeight: 800 }}>SNT 10 Kupang</h1>
        <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.15rem', fontWeight: 'normal', color: 'black' }}>Hasil Ujian — Mata Pelajaran: {exam?.title} — KKM: {passingGrade}</h2>
      </div>
      <div className="page-body">
        {/* Class Target & Attendance KPI Card */}
        {targetStudents.length > 0 && (
          <div
            className="no-print"
            style={{
              background: unattendedCount > 0 ? 'linear-gradient(135deg, #fff5f5 0%, #fff 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)',
              border: unattendedCount > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: unattendedCount > 0 ? '#fee2e2' : '#dcfce7',
                    color: unattendedCount > 0 ? '#dc2626' : '#16a34a',
                    flexShrink: 0
                  }}
                >
                  {unattendedCount > 0 ? <UserX size={26} /> : <Users size={26} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                      Pemantauan Kehadiran: Kelas {exam?.target_kelas ? exam.target_kelas.toUpperCase() : 'Semua Target'}
                    </h3>
                    {unattendedCount > 0 ? (
                      <span className="badge badge-danger" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem' }}>
                        {unattendedCount} Belum Mengerjakan (Absen)
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem' }}>
                        ✓ 100% Hadir Lengkap
                      </span>
                    )}
                  </div>
                  <p className="text-muted text-xs" style={{ margin: '0.25rem 0 0' }}>
                    Total Target: <strong>{targetStudentCount}</strong> siswa · Sudah Mengumpulkan: <strong>{attendedCount}</strong> ({attendanceRateStr}%) · Belum Masuk/Submit: <strong>{unattendedCount}</strong> ({absentRateStr}%)
                  </p>
                </div>
              </div>

              {unattendedCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleCopyAbsentList}
                    title="Salin daftar siswa yang belum mengerjakan dalam format teks WhatsApp untuk wali kelas / orang tua"
                    style={{
                      background: '#fff',
                      borderColor: '#f87171',
                      color: '#b91c1c',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <Copy size={14} />
                    {copiedWaNotice || 'Salin Siswa Absen (Format WA)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter Navigation Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${attendanceFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setAttendanceFilter('all')}
            style={{ fontWeight: 600, borderRadius: '8px' }}
          >
            Sudah Mengumpulkan ({resultList.length})
          </button>
          {targetStudents.length > 0 && (
            <>
              <button
                className={`btn btn-sm ${attendanceFilter === 'all_targets' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAttendanceFilter('all_targets')}
                style={{ fontWeight: 600, borderRadius: '8px' }}
              >
                Semua Target Siswa ({targetStudentCount})
              </button>
              <button
                className={`btn btn-sm ${attendanceFilter === 'unattempted' ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => setAttendanceFilter('unattempted')}
                style={{
                  fontWeight: 600,
                  borderRadius: '8px',
                  color: attendanceFilter === 'unattempted' ? '#fff' : (unattendedCount > 0 ? '#dc2626' : undefined),
                  borderColor: unattendedCount > 0 ? 'rgba(239, 68, 68, 0.4)' : undefined,
                  background: attendanceFilter === 'unattempted' ? '#dc2626' : (unattendedCount > 0 ? '#fff5f5' : undefined)
                }}
              >
                <UserX size={14} style={{ marginRight: '0.3rem', display: 'inline' }} />
                Belum Mengerjakan ({unattendedCount})
              </button>
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${attendanceFilter === 'passed' ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => setAttendanceFilter('passed')}
              style={{ fontWeight: 600, borderRadius: '8px' }}
            >
              ✓ Lulus ({passCount})
            </button>
            <button
              className={`btn btn-sm ${attendanceFilter === 'failed' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setAttendanceFilter('failed')}
              style={{ fontWeight: 600, borderRadius: '8px' }}
            >
              ✗ Belum Lulus ({failCount})
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama Siswa {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="no-print">Skor Otomatis</th>
                  <th className="no-print">
                    Skor Esai {totalMaxEssayScore > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(Maks {formatScore(totalMaxEssayScore)})</span>}
                  </th>
                  <th className="no-print">
                    Total {totalExamMaxScore > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(Maks {formatScore(totalExamMaxScore)})</span>}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('nilai')}>
                    Nilai {sortConfig.key === 'nilai' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('pelanggaran')}>
                    Pelanggaran {sortConfig.key === 'pelanggaran' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                      {attendanceFilter === 'unattempted' ? (
                        <div style={{ color: '#16a34a' }}>
                          <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>🎉</div>
                          <strong>Seluruh siswa target kelas telah mengikuti ujian!</strong>
                          <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: '#64748b' }}>
                            Tidak ada siswa yang absen atau belum mengumpulkan.
                          </div>
                        </div>
                      ) : attendanceFilter === 'passed' ? (
                        'Belum ada siswa yang lulus KKM.'
                      ) : attendanceFilter === 'failed' ? (
                        'Semua siswa yang mengumpulkan telah lulus KKM.'
                      ) : (
                        'Belum ada hasil ujian yang diselesaikan untuk ujian ini.'
                      )}
                    </td>
                  </tr>
                ) : (
                  sortedResults.map((r, i) => {
                    if (r.isUnattempted) {
                      return (
                        <tr
                          key={r.id}
                          style={{
                            background: 'rgba(254, 226, 226, 0.45)',
                            borderLeft: '4px solid #ef4444'
                          }}
                        >
                          <td className="text-muted" style={{ textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#991b1b' }}>
                                {r.users?.full_name || r.users?.name || 'Siswa'}
                              </span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca',
                                  borderRadius: '6px',
                                  padding: '0.15rem 0.45rem'
                                }}
                              >
                                ❌ Belum Mengerjakan (Absen)
                              </span>
                            </div>
                            {r.users?.username && (
                              <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 500, marginTop: '0.1rem' }}>
                                @{r.users.username} {r.users?.nisn ? `· NISN: ${r.users.nisn}` : ''}
                              </div>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: '#991b1b' }}>{r.users?.kelas || '—'}</td>
                          <td className="no-print">
                            <span className="text-muted" style={{ fontSize: '0.82rem' }}>—</span>
                          </td>
                          <td className="no-print">
                            <span className="text-muted" style={{ fontSize: '0.82rem' }}>—</span>
                          </td>
                          <td className="no-print">
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>0</span>
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: '#dc2626',
                                color: '#ffffff',
                                borderRadius: '4px',
                                padding: '0.2rem 0.5rem',
                                letterSpacing: '0.03em'
                              }}
                            >
                              TIDAK HADIR
                            </span>
                          </td>
                          <td>
                            <span className="text-muted">—</span>
                          </td>
                          <td className="no-print">
                            <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                              <button
                                className="action-btn action-btn-info"
                                onClick={() => handleGrantMakeupExam(r)}
                                disabled={makeupLoading === r.student_id}
                                title="Buka sesi ujian susulan untuk siswa ini sekarang"
                                style={{
                                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                  color: '#ffffff',
                                  borderColor: 'transparent',
                                  fontWeight: 700,
                                  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)'
                                }}
                              >
                                {makeupLoading === r.student_id ? (
                                  'Membuka...'
                                ) : (
                                  <>
                                    <Plus size={14} /> Izinkan Susulan
                                  </>
                                )}
                              </button>
                              <button
                                className="action-btn"
                                onClick={() => handleCopySingleStudent(r)}
                                title="Salin pesan pengingat WA untuk siswa ini"
                                style={{
                                  background: '#ffffff',
                                  color: '#475569',
                                  borderColor: '#cbd5e1'
                                }}
                              >
                                <Copy size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(r.max_auto_score) || 0)
                    const total = (Number(r.auto_score) || 0) + (Number(r.essay_score) || 0)
                    const pctNum = maxPossible > 0 ? (total / maxPossible) * 100 : 0
                    const pctStr = formatScore(pctNum)
                    const essayVal = essayEdits[r.id] !== undefined ? essayEdits[r.id] : (r.essay_score || 0)
                    const currentTotal = (Number(r.auto_score) || 0) + (Number(essayVal) || 0)
                    const nilaiColor = pctNum >= passingGrade ? 'var(--success)' : 'var(--danger)'

                    const rBd = (() => { try { return JSON.parse(r.breakdown || '[]') } catch { return [] } })()
                    const rEssays = rBd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))
                    const isPendingGrading = rEssays.some(b => b.status === 'pending')
                    const hasEssays = rEssays.length > 0 || totalMaxEssayScore > 0

                    return (
                      <tr key={r.id}>
                        <td className="text-muted" style={{ textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          {r.users?.full_name || r.student?.full_name || r.users?.name || r.student?.name || (r.student_id ? `Siswa (${r.student_id.slice(0, 8)})` : 'Siswa')}
                          {r.users?.username && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              @{r.users.username}
                            </div>
                          )}
                        </td>
                        <td>{r.users?.classes?.name || r.users?.kelas || r.student?.kelas || '—'}</td>
                        <td className="no-print">{formatScore(r.auto_score)}</td>
                        <td className="no-print">
                          {totalMaxEssayScore > 0 ? (
                            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: 68, padding: '0.3rem 0.4rem', fontSize: '0.85rem', textAlign: 'center' }}
                                value={essayVal !== '' && !isNaN(Number(essayVal)) ? roundScore(essayVal) : essayVal}
                                step="0.01"
                                min="0"
                                max={totalMaxEssayScore}
                                title={`Maksimal nilai esai: ${formatScore(totalMaxEssayScore)} poin`}
                                onChange={e => {
                                  let val = e.target.value
                                  if (val !== '') {
                                    let num = parseFloat(val)
                                    if (num > totalMaxEssayScore) num = totalMaxEssayScore
                                    if (num < 0) num = 0
                                    val = roundScore(num)
                                  }
                                  setEssayEdits(prev => ({ ...prev, [r.id]: val }))
                                }}
                              />
                              <span className="text-muted text-xs">/ {formatScore(totalMaxEssayScore)}</span>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                          <span className="print-only">{formatScore(r.essay_score || 0)}</span>
                        </td>
                        <td className="no-print" style={{ fontWeight: 700, color: nilaiColor }}>
                          {formatScore(currentTotal)} <span className="text-muted text-xs" style={{ fontWeight: 400 }}>/ {formatScore(maxPossible)}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: nilaiColor }}>{pctStr}%</td>
                        <td>
                          {r.violation_count > 0
                            ? <span style={{ color: 'var(--warning)' }}>⚠ {r.violation_count}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="no-print">
                          <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                            <button
                              className="action-btn action-btn-info"
                              onClick={() => setSelectedDetailResult(r)}
                              title="Lihat rincian lembar jawaban lengkap siswa"
                              style={{
                                background: 'rgba(37, 99, 235, 0.08)',
                                color: '#2563eb',
                                borderColor: 'rgba(37, 99, 235, 0.3)',
                                fontWeight: 600,
                              }}
                            >
                              <FileText size={15} /> Detail Jawaban
                            </button>
                            {hasEssays && (
                              <button
                                className={`action-btn ${isPendingGrading ? 'action-btn-warning' : 'action-btn-preview'}`}
                                onClick={() => openEssayModal(r)}
                                title={isPendingGrading ? 'Ada esai yang belum dinilai - Klik untuk memberi nilai per soal' : 'Tinjau / ubah nilai esai per soal'}
                                style={isPendingGrading ? { borderColor: 'var(--warning)', color: 'var(--warning)', fontWeight: 600 } : {}}
                              >
                                <Edit3 size={15} /> {isPendingGrading ? 'Beri Nilai' : 'Nilai Esai'}
                                {isPendingGrading && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', marginLeft: 3, display: 'inline-block' }} />}
                              </button>
                            )}
                            {totalMaxEssayScore > 0 && (
                              <button
                                className="action-btn action-btn-result"
                                onClick={() => saveEssay(r.id, essayVal)}
                                disabled={saving === r.id}
                                title="Simpan Skor Esai Cepat"
                              >
                                {saving === r.id ? '...' : <><Save size={15} /> Simpan</>}
                              </button>
                            )}
                            <button
                              className="action-btn action-btn-danger"
                              onClick={() => handleDeleteResult(r.id, r.users?.full_name || r.student?.full_name)}
                              title="Hapus Hasil Ujian Siswa"
                            >
                              <Trash2 size={15} /> Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Print-only Absent Students Roster */}
        {unattendedCount > 0 && (
          <div className="print-only" style={{ marginTop: '2rem', pageBreakInside: 'avoid' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'black', borderBottom: '1px solid #000', paddingBottom: '0.35rem', marginBottom: '0.75rem' }}>
              Daftar Siswa Tidak Hadir / Belum Mengikuti Ujian ({unattendedCount} Siswa)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', width: 40, padding: '4px' }}>No</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Nama Lengkap Siswa</th>
                  <th style={{ textAlign: 'left', width: 100, padding: '4px' }}>Kelas</th>
                  <th style={{ textAlign: 'left', width: 140, padding: '4px' }}>Username / NISN</th>
                  <th style={{ textAlign: 'left', width: 160, padding: '4px' }}>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {unattemptedStudents.map((us, idx) => (
                  <tr key={us.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px' }}>{idx + 1}</td>
                    <td style={{ padding: '4px', fontWeight: 600 }}>{us.users?.full_name || us.users?.name || 'Siswa'}</td>
                    <td style={{ padding: '4px' }}>{us.users?.kelas || '—'}</td>
                    <td style={{ padding: '4px' }}>{us.users?.username ? `@${us.users.username}` : '—'}</td>
                    <td style={{ padding: '4px', color: '#b91c1c', fontWeight: 600 }}>Tidak Hadir (Belum Ujian)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {selectedResult && (() => {
        const bd = (() => { try { return JSON.parse(selectedResult.breakdown || '[]') } catch { return [] } })()
        let essays = bd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))

        // If breakdown didn't have essays but questionList has essay questions, populate from questionList
        if (essays.length === 0 && essayQuestionsList.length > 0) {
          essays = essayQuestionsList.map(q => ({
            number: q.number,
            type: q.type,
            reason_type: q.options?.reason_type || q.correct_answer?.reason_type || 'essay',
            status: 'pending',
            earned: 0,
            max: q.type === 'AGREE_DISAGREE' ? (Number(q.points || 1) * 0.5) : Number(q.points || 1),
            given: null
          }))
        }

        const modalTotalMaxEssay = essays.reduce((sum, e) => {
          const qObj = questionMap.get(Number(e.number))
          const maxPts = e.type === 'AGREE_DISAGREE'
            ? (Number(e.max || qObj?.points || 1) * 0.5)
            : Number(e.max || qObj?.points || 1)
          return sum + maxPts
        }, 0)

        const accumulatedEssayScore = essays.reduce((sum, e) => {
          const qObj = questionMap.get(Number(e.number))
          const maxPts = e.type === 'AGREE_DISAGREE'
            ? (Number(e.max || qObj?.points || 1) * 0.5)
            : Number(e.max || qObj?.points || 1)
          const val = parseFloat(modalScores[e.number])
          const safeVal = isNaN(val) ? 0 : Math.min(Math.max(0, val), maxPts)
          return sum + safeVal
        }, 0)
        const roundedAccumulated = roundScore(accumulatedEssayScore)

        const finalTotalScore = roundScore((Number(selectedResult.auto_score) || 0) + roundedAccumulated)
        const examMaxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (Number(selectedResult.max_auto_score) || 0)
        const finalPct = examMaxScore > 0 ? (finalTotalScore / examMaxScore) * 100 : 0
        const isPass = finalPct >= passingGrade

        return (
          <div className="modal-overlay" onClick={() => setSelectedResult(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                    Penilaian Esai: {selectedResult.users?.full_name || selectedResult.users?.name || selectedResult.student?.full_name || 'Siswa'}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Kelas {selectedResult.users?.classes?.name || selectedResult.users?.kelas || '—'}
                    {selectedResult.users?.username && ` · @${selectedResult.users.username}`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ padding: '0.35rem' }} onClick={() => setSelectedResult(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Live Score Summary Banner */}
              <div style={{
                margin: '1rem 0 0.5rem 0',
                padding: '0.85rem 1rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.75rem',
                alignItems: 'center'
              }}>
                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Skor Otomatis (PG/Lainnya)
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                    {formatScore(selectedResult.auto_score || 0)}
                  </span>
                </div>

                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Nilai Esai
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent)' }}>
                    {formatScore(roundedAccumulated)} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {formatScore(modalTotalMaxEssay)}</span>
                  </span>
                </div>

                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Nilai Akhir Siswa
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: isPass ? 'var(--success)' : 'var(--danger)' }}>
                    {formatScore(finalTotalScore)} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {formatScore(examMaxScore)}</span>
                    <span style={{ fontSize: '0.9rem', marginLeft: '0.35rem' }}>({formatScore(finalPct)}%)</span>
                  </span>
                </div>
              </div>

              {/* Modal Body / Questions List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {essays.length === 0 ? (
                  <p className="text-muted text-center" style={{ padding: '2rem 0' }}>Tidak ada soal esai untuk ujian ini.</p>
                ) : (
                  essays.map(essay => {
                    const isAgreeDisagree = essay.type === 'AGREE_DISAGREE'
                    const qObj = questionMap.get(Number(essay.number))
                    const maxPts = isAgreeDisagree
                      ? (Number(essay.max || qObj?.points || 1) * 0.5)
                      : Number(essay.max || qObj?.points || 1)
                    
                    const studentStance = essay.given?.stance || (typeof essay.given === 'string' ? essay.given : null)
                    const studentEssayText = essay.given?.essay || essay.given?.reason_text || (typeof essay.given === 'string' ? essay.given : null)
                    const expectedStance = essay.correct?.stance || qObj?.correct_answer?.stance
                    const rubricText = essay.correct?.rubric || qObj?.correct_answer?.rubric || (typeof qObj?.correct_answer === 'string' ? qObj?.correct_answer : null)

                    const currentScoreVal = modalScores[essay.number] !== undefined ? modalScores[essay.number] : (essay.status !== 'pending' ? essay.earned : '')
                    const numericScore = parseFloat(currentScoreVal)

                    let statusBadgeClass = 'badge-draft'
                    let statusLabel = 'Menunggu Penilaian'
                    if (currentScoreVal !== '' && !isNaN(numericScore)) {
                      if (numericScore === maxPts) {
                        statusBadgeClass = 'badge-active'
                        statusLabel = `✓ Nilai Penuh (${formatScore(numericScore)}/${formatScore(maxPts)})`
                      } else if (numericScore > 0) {
                        statusBadgeClass = 'badge-pending'
                        statusLabel = `~ Nilai Sebagian (${formatScore(numericScore)}/${formatScore(maxPts)})`
                      } else {
                        statusBadgeClass = 'badge-closed'
                        statusLabel = `✗ Kosong / 0 (${formatScore(numericScore)}/${formatScore(maxPts)})`
                      }
                    }

                    return (
                      <div key={essay.number} style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.15rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem', marginBottom: '0.85rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            Soal No. {essay.number} {isAgreeDisagree ? '(Setuju / Tidak Setuju)' : '(Esai)'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                              Maks {formatScore(maxPts)} Poin
                            </span>
                            <span className={`badge ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>

                        {/* Question Prompt if available */}
                        {qObj?.question_text && (
                          <div style={{ marginBottom: '0.85rem', padding: '0.65rem 0.85rem', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.2rem' }}>Pertanyaan:</strong>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{qObj.question_text}</div>
                            {qObj.image_url && (
                              <img src={qObj.image_url} alt="Soal" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, marginTop: '0.5rem' }} />
                            )}
                          </div>
                        )}

                        {/* Stance details for Agree/Disagree */}
                        {isAgreeDisagree && (
                          <div style={{ marginBottom: '0.85rem', padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                              <span className="text-muted">Sikap Siswa:</span>
                              <span style={{ fontWeight: 700, color: studentStance === 'agree' ? 'var(--success)' : (studentStance === 'disagree' ? 'var(--danger)' : 'inherit') }}>
                                {studentStance === 'agree' ? '👍 Setuju' : (studentStance === 'disagree' ? '👎 Tidak Setuju' : 'Belum memilih')}
                              </span>
                            </div>
                            {expectedStance && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Kunci Diharapkan: <strong>{expectedStance === 'agree' ? 'Setuju' : 'Tidak Setuju'}</strong>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Student Answer */}
                        <div style={{ marginBottom: '0.85rem' }}>
                          <div className="text-muted text-xs" style={{ marginBottom: '0.3rem', fontWeight: 600 }}>
                            {isAgreeDisagree ? 'Alasan / Uraian Siswa:' : 'Jawaban Siswa:'}
                          </div>
                          <div style={{ background: '#ffffff', color: '#111827', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.92rem', whiteSpace: 'pre-wrap', minHeight: 48, lineHeight: 1.5 }}>
                            {(isAgreeDisagree ? studentEssayText : (essay.given || studentEssayText)) || <span className="text-muted" style={{ fontStyle: 'italic' }}>Tidak dijawab</span>}
                          </div>
                        </div>

                        {/* Rubric / Guideline if available */}
                        {rubricText && (
                          <div style={{ marginBottom: '0.85rem', padding: '0.5rem 0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-primary)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <strong>Pedoman / Rubrik Penilaian Guru:</strong>
                            <div style={{ marginTop: '0.2rem', whiteSpace: 'pre-wrap' }}>{rubricText}</div>
                          </div>
                        )}

                        {/* Score Input Card with strict max enforcement */}
                        <div style={{
                          padding: '0.75rem 1rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem'
                        }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block' }}>
                              Beri Skor Soal No. {essay.number}:
                            </span>
                            <span className="text-muted text-xs">
                              Maksimal <strong>{formatScore(maxPts)}</strong> poin sesuai pengaturan guru
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <input
                              type="number"
                              min="0"
                              max={maxPts}
                              step="any"
                              className="form-input"
                              style={{ width: 80, fontSize: '0.95rem', fontWeight: 700, textAlign: 'center', padding: '0.35rem' }}
                              value={currentScoreVal}
                              placeholder="0"
                              onChange={e => handleModalScoreChange(essay.number, e.target.value, maxPts)}
                            />
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.9rem' }}>/ {formatScore(maxPts)}</span>
                            
                            <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.35rem' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', height: 26 }}
                                onClick={() => handleModalScoreChange(essay.number, 0, maxPts)}
                                title="Beri Skor 0"
                              >
                                0
                              </button>
                              {maxPts > 1 && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', height: 26 }}
                                  onClick={() => handleModalScoreChange(essay.number, roundScore(maxPts / 2), maxPts)}
                                  title="Beri Skor 50%"
                                >
                                  50%
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 26 }}
                                onClick={() => handleModalScoreChange(essay.number, maxPts, maxPts)}
                                title={`Beri Skor Penuh (${formatScore(maxPts)})`}
                              >
                                Penuh
                              </button>
                            </div>
                          </div>
                        </div>

                      </div>
                    )
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.88rem' }}>
                  Total Esai: <strong>{formatScore(roundedAccumulated)} / {formatScore(modalTotalMaxEssay)} Poin</strong>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setSelectedResult(null)}>
                    Batal
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveModalEssayScores}
                    disabled={saving === selectedResult.id || essays.length === 0}
                  >
                    {saving === selectedResult.id ? 'Menyimpan...' : <><Save size={16} /> Simpan Penilaian Esai</>}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })()}

      {/* Student Detailed Answers Review Modal */}
      {selectedDetailResult && (
        <StudentAnswerDetailModal
          result={selectedDetailResult}
          exam={exam}
          questions={questionList}
          onClose={() => setSelectedDetailResult(null)}
          onOpenEssayGrading={(res) => openEssayModal(res)}
        />
      )}
    </>
  )
}

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, results, sessions, questions, fetchStudentProfilesMap } from '../../lib/db'
import { gradeExam } from '../../lib/grader'
import { ChevronLeft, Printer, Edit3, Save, Eye, X, BarChart2, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react'

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

  // Map of questions by question number for quick metadata lookup
  const questionMap = new Map((questionList || []).map(q => [Number(q.number), q]))

  // Total maximum score across all questions configured by the teacher
  const totalExamMaxScore = (questionList || []).reduce((sum, q) => {
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
    return sum + pts
  }, 0)

  // List of all questions that require manual essay grading
  const essayQuestionsList = (questionList || []).filter(q =>
    q.type === 'ESSAY' ||
    q.type === 'PARAGRAPH' ||
    (q.type === 'AGREE_DISAGREE' && (q.options?.reason_type === 'essay' || q.correct_answer?.reason_type === 'essay'))
  )

  // Total possible essay points across the exam
  const totalMaxEssayScore = essayQuestionsList.reduce((sum, q) => {
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
    return sum + (q.type === 'AGREE_DISAGREE' ? (pts * 0.5) : pts)
  }, 0)

  async function load() {
    try {
      const [{ data: examData }, { data: res }, { data: sess }, { data: qs }] = await Promise.all([
        exams.getById(examId),
        results.listByExam(examId),
        sessions.listByExam(examId),
        questions.listByExam(examId)
      ])

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

      // Auto-score abandoned or completed sessions that do not have a result yet
      const missingSessions = rawSessions.filter(s => s.student_id && !dedupedResultsMap.has(s.student_id))
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

      // Format and cross-reference profiles to guarantee proper student names and classes
      const formattedResults = newRes.map(r => {
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
    } catch (err) {
      console.error('[ResultsView] load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [examId])

  const passingGrade = exam?.passing_grade ?? 60

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
        const earned = Math.min(Math.max(0, isNaN(parseFloat(rawVal)) ? 0 : parseFloat(rawVal)), maxPts)

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

      const finalEssayScore = Math.round(accumulated * 100) / 100
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
    const clampedScore = totalMaxEssayScore > 0 ? Math.min(Math.max(0, numScore), totalMaxEssayScore) : Math.max(0, numScore)
    const finalMaxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (targetResult?.max_auto_score || 0)

    let updatedBreakdown = null
    if (targetResult?.breakdown) {
      try {
        const bd = JSON.parse(targetResult.breakdown || '[]')
        const essays = bd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))
        if (essays.length === 1) {
          const maxPts = essays[0].max || totalMaxEssayScore || 1
          const earned = Math.min(clampedScore, maxPts)
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

          const finalEssay = gradedMap.size > 0 ? accumulatedEssay : (r.essay_score || 0)

          await results.update(r.id, {
            auto_score: autoScore,
            max_auto_score: maxAutoScore,
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

  const sortedResults = [...resultList].sort((a, b) => {
    const key = sortConfig.key
    let aVal, bVal

    if (key === 'nilai') {
      const aTotal = a.auto_score + (a.essay_score || 0)
      const bTotal = b.auto_score + (b.essay_score || 0)
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
        const total = r.auto_score + (r.essay_score || 0)
        const maxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (r.max_auto_score || 0)
        const pct = maxScore > 0 ? (total / maxScore) * 100 : 0
        return sum + pct
      }, 0) / resultList.length)
    : 0
  const avgStr = avgPct ? avgPct.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '0'

  // Count students passing/failing
  const passCount = resultList.filter(r => {
    const total = r.auto_score + (r.essay_score || 0)
    const maxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (r.max_auto_score || 0)
    const pct = maxScore > 0 ? (total / maxScore) * 100 : 0
    return pct >= passingGrade
  }).length
  const failCount = resultList.length - passCount

  return (
    <>
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>Hasil: {exam?.title}</h2>
              <p className="text-muted text-sm">
                {resultList.length} siswa · Rata-rata: {avgStr}% · KKM: {passingGrade}
                {' · '}
                <span style={{ color: 'var(--success)' }}>✓ {passCount} Lulus</span>
                {' · '}
                <span style={{ color: 'var(--danger)' }}>✗ {failCount} Belum Lulus</span>
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
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer size={15} /> Cetak</button>
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
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="no-print">#</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama Siswa {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="no-print">Skor Otomatis</th>
                  <th className="no-print">
                    Skor Esai {totalMaxEssayScore > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(Maks {totalMaxEssayScore})</span>}
                  </th>
                  <th className="no-print">
                    Total {totalExamMaxScore > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(Maks {totalExamMaxScore})</span>}
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
                      Belum ada hasil ujian yang diselesaikan untuk ujian ini.
                    </td>
                  </tr>
                ) : (
                  sortedResults.map((r, i) => {
                  const maxPossible = totalExamMaxScore > 0 ? totalExamMaxScore : (r.max_auto_score || 0)
                  const total = r.auto_score + (r.essay_score || 0)
                  const pctNum = maxPossible > 0 ? (total / maxPossible) * 100 : 0
                  const pctStr = pctNum.toLocaleString('id-ID', { maximumFractionDigits: 2 })
                  const essayVal = essayEdits[r.id] !== undefined ? essayEdits[r.id] : (r.essay_score || 0)
                  const nilaiColor = pctNum >= passingGrade ? 'var(--success)' : 'var(--danger)'

                  const rBd = (() => { try { return JSON.parse(r.breakdown || '[]') } catch { return [] } })()
                  const rEssays = rBd.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay'))
                  const isPendingGrading = rEssays.some(b => b.status === 'pending')
                  const hasEssays = rEssays.length > 0 || totalMaxEssayScore > 0

                  return (
                    <tr key={r.id}>
                      <td className="text-muted no-print">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>
                        {r.users?.full_name || r.student?.full_name || r.users?.name || r.student?.name || (r.student_id ? `Siswa (${r.student_id.slice(0, 8)})` : 'Siswa')}
                        {r.users?.username && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            @{r.users.username}
                          </div>
                        )}
                      </td>
                      <td>{r.users?.classes?.name || r.users?.kelas || r.student?.kelas || '—'}</td>
                      <td className="no-print">{r.auto_score}</td>
                      <td className="no-print">
                        {totalMaxEssayScore > 0 ? (
                          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: 68, padding: '0.3rem 0.4rem', fontSize: '0.85rem', textAlign: 'center' }}
                              value={essayVal}
                              min="0"
                              max={totalMaxEssayScore}
                              title={`Maksimal nilai esai: ${totalMaxEssayScore} poin`}
                              onChange={e => {
                                let val = e.target.value
                                if (val !== '') {
                                  let num = parseFloat(val)
                                  if (num > totalMaxEssayScore) num = totalMaxEssayScore
                                  if (num < 0) num = 0
                                  val = num
                                }
                                setEssayEdits(prev => ({ ...prev, [r.id]: val }))
                              }}
                            />
                            <span className="text-muted text-xs">/ {totalMaxEssayScore}</span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        <span className="print-only">{r.essay_score || 0}</span>
                      </td>
                      <td className="no-print" style={{ fontWeight: 700, color: nilaiColor }}>
                        {r.auto_score + Number(essayVal || 0)} <span className="text-muted text-xs" style={{ fontWeight: 400 }}>/ {maxPossible}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: nilaiColor }}>{pctStr}%</td>
                      <td>
                        {r.violation_count > 0
                          ? <span style={{ color: 'var(--warning)' }}>⚠ {r.violation_count}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="no-print">
                        <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                          {hasEssays && (
                            <button
                              className={`action-btn ${isPendingGrading ? 'action-btn-warning' : 'action-btn-preview'}`}
                              onClick={() => openEssayModal(r)}
                              title={isPendingGrading ? 'Ada esai yang belum dinilai - Klik untuk memberi nilai per soal' : 'Tinjau / ubah nilai esai per soal'}
                              style={isPendingGrading ? { borderColor: 'var(--warning)', color: 'var(--warning)', fontWeight: 600 } : {}}
                            >
                              <Eye size={15} /> {isPendingGrading ? 'Beri Nilai' : 'Nilai Esai'}
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
                }))}
              </tbody>
            </table>
          </div>
        </div>
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
        const roundedAccumulated = Math.round(accumulatedEssayScore * 100) / 100

        const finalTotalScore = Math.round(((selectedResult.auto_score || 0) + roundedAccumulated) * 100) / 100
        const examMaxScore = totalExamMaxScore > 0 ? totalExamMaxScore : (selectedResult.max_auto_score || 0)
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
                    {selectedResult.auto_score || 0}
                  </span>
                </div>

                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Nilai Esai
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent)' }}>
                    {roundedAccumulated} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {modalTotalMaxEssay}</span>
                  </span>
                </div>

                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Nilai Akhir Siswa
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: isPass ? 'var(--success)' : 'var(--danger)' }}>
                    {finalTotalScore} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {examMaxScore}</span>
                    <span style={{ fontSize: '0.9rem', marginLeft: '0.35rem' }}>({finalPct.toFixed(1)}%)</span>
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
                        statusLabel = `✓ Nilai Penuh (${numericScore}/${maxPts})`
                      } else if (numericScore > 0) {
                        statusBadgeClass = 'badge-pending'
                        statusLabel = `~ Nilai Sebagian (${numericScore}/${maxPts})`
                      } else {
                        statusBadgeClass = 'badge-closed'
                        statusLabel = `✗ Kosong / 0 (${numericScore}/${maxPts})`
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
                              Maks {maxPts} Poin
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
                              Maksimal <strong>{maxPts}</strong> poin sesuai pengaturan guru
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
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.9rem' }}>/ {maxPts}</span>
                            
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
                                  onClick={() => handleModalScoreChange(essay.number, Math.round((maxPts / 2) * 100) / 100, maxPts)}
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
                                title={`Beri Skor Penuh (${maxPts})`}
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
                  Total Esai: <strong>{roundedAccumulated} / {modalTotalMaxEssay} Poin</strong>
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
    </>
  )
}

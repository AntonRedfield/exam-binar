import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exams } from '../../lib/db'
import { Plus, Edit2, Activity, BarChart2, Trash2, Globe, Lock, Zap, Play, Sparkles, Search, X } from 'lucide-react'

export default function ExamOversight() {
  const navigate = useNavigate()
  const [examList, setExamList] = useState([])
  const [loading, setLoading] = useState(true)

  // Auto-sort mode by default: Active exams always appear at the top, sorted by most recent date descending
  const [sortConfig, setSortConfig] = useState({ key: 'auto', direction: 'desc' })
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'published' | 'draft' | 'closed'

  async function load() {
    const { data } = await exams.list()
    setExamList(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function togglePublish(exam) {
    const newStatus = exam.status === 'published' ? 'draft' : 'published'
    await exams.update(exam.id, { status: newStatus })
    await load()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus ujian ini secara permanen?')) return
    await exams.delete(id)
    await load()
  }

  function getStatusPriority(status) {
    if (status === 'published') return 1 // Active always on top
    if (status === 'draft') return 2
    if (status === 'closed') return 3
    return 4
  }

  function handleAutoSort() {
    setSortConfig({ key: 'auto', direction: 'desc' })
  }

  function handleSort(key) {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      const defaultDirection = (key === 'created_at' || key === 'status') ? 'desc' : 'asc'
      setSortConfig({ key, direction: defaultDirection })
    }
  }

  // Pre-calculated counts for filter tabs
  const counts = useMemo(() => {
    const published = examList.filter(e => e.status === 'published').length
    const draft = examList.filter(e => e.status === 'draft').length
    const closed = examList.filter(e => e.status === 'closed').length
    return { total: examList.length, published, draft, closed }
  }, [examList])

  // Filtered and sorted exams
  const sortedExams = useMemo(() => {
    let list = [...examList]

    // 1. Status Filter Tab
    if (statusFilter !== 'all') {
      list = list.filter(e => e.status === statusFilter)
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q) ||
        e.target_kelas?.toLowerCase().includes(q) ||
        (e.users?.name || e.created_by)?.toLowerCase().includes(q)
      )
    }

    // 3. Sorting
    return list.sort((a, b) => {
      // ─── AUTO-SORT: Active exam always at top, then most recent date descending ───
      if (sortConfig.key === 'auto') {
        const priorityA = getStatusPriority(a.status)
        const priorityB = getStatusPriority(b.status)
        if (priorityA !== priorityB) {
          return priorityA - priorityB
        }
        const timeA = new Date(a.created_at || a.updated_at || 0).getTime()
        const timeB = new Date(b.created_at || b.updated_at || 0).getTime()
        if (timeB !== timeA) {
          return timeB - timeA
        }
        return (a.title || '').localeCompare(b.title || '')
      }

      if (sortConfig.key === 'created_at') {
        const timeA = new Date(a.created_at || a.updated_at || 0).getTime()
        const timeB = new Date(b.created_at || b.updated_at || 0).getTime()
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA
      }

      if (sortConfig.key === 'status') {
        const priorityA = getStatusPriority(a.status)
        const priorityB = getStatusPriority(b.status)
        if (priorityA !== priorityB) {
          return sortConfig.direction === 'asc' ? priorityA - priorityB : priorityB - priorityA
        }
        const timeA = new Date(a.created_at || a.updated_at || 0).getTime()
        const timeB = new Date(b.created_at || b.updated_at || 0).getTime()
        return timeB - timeA
      }

      if (sortConfig.key === 'duration_minutes') {
        const durA = Number(a.duration_minutes || 0)
        const durB = Number(b.duration_minutes || 0)
        return sortConfig.direction === 'asc' ? durA - durB : durB - durA
      }

      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]

      if (sortConfig.key === 'teacher_name') {
        aVal = a.users?.name || a.created_by
        bVal = b.users?.name || b.created_by
      }

      aVal = String(aVal || '').toLowerCase()
      bVal = String(bVal || '').toLowerCase()

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [examList, statusFilter, searchQuery, sortConfig])

  const isAutoSorted = sortConfig.key === 'auto'

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2>Semua Ujian</h2>
            <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>
              {counts.total} ujian dari seluruh guru &bull; {counts.published} aktif berlangsung
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link to="/admin/monitor" className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#059669', color: '#ffffff', border: 'none', fontWeight: 600 }}>
              <Activity size={15} /> Hub Monitor Siswa (Live)
            </Link>
            <Link to="/admin/create" className="btn btn-gold btn-sm">
              <Plus size={16} /> Buat Ujian
            </Link>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : (
          <>
            {/* ─── Exam Page Control Toolbar ─────────────────────────────── */}
            <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                
                {/* Status Filter Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStatusFilter('all')}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '8px' }}
                  >
                    Semua ({counts.total})
                  </button>
                  <button
                    className={`btn btn-sm ${statusFilter === 'published' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStatusFilter('published')}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      color: statusFilter === 'published' ? '#ffffff' : '#059669',
                      borderColor: statusFilter === 'published' ? 'transparent' : 'rgba(5, 150, 105, 0.3)',
                      background: statusFilter === 'published' ? '#059669' : 'rgba(5, 150, 105, 0.08)'
                    }}
                  >
                    <Zap size={13} style={{ marginRight: 4 }} /> Aktif ({counts.published})
                  </button>
                  <button
                    className={`btn btn-sm ${statusFilter === 'draft' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStatusFilter('draft')}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '8px' }}
                  >
                    Draft ({counts.draft})
                  </button>
                  <button
                    className={`btn btn-sm ${statusFilter === 'closed' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStatusFilter('closed')}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '8px' }}
                  >
                    Tutup ({counts.closed})
                  </button>
                </div>

                {/* Right Controls: Auto-Sort Button, Sort Dropdown, Search Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  
                  {/* Auto-Sort Toggle Button */}
                  <button
                    type="button"
                    onClick={handleAutoSort}
                    title="Auto-Sort: Ujian Aktif selalu di paling atas, diurutkan tanggal dibuat terbaru"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: isAutoSorted ? '1px solid #10b981' : '1px solid var(--border)',
                      background: isAutoSorted ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : '#f8fafc',
                      color: isAutoSorted ? '#ffffff' : 'var(--text-secondary)',
                      boxShadow: isAutoSorted ? '0 2px 8px rgba(16, 185, 129, 0.28)' : 'none'
                    }}
                  >
                    <Sparkles size={14} />
                    <span>Auto-Sort: Aktif &amp; Terbaru</span>
                    {isAutoSorted && (
                      <span style={{
                        background: 'rgba(255, 255, 255, 0.25)',
                        fontSize: '0.65rem',
                        padding: '0.08rem 0.4rem',
                        borderRadius: '99px',
                        fontWeight: 800
                      }}>
                        AKTIF
                      </span>
                    )}
                  </button>

                  {/* Sort Select Dropdown */}
                  <select
                    value={isAutoSorted ? 'auto' : `${sortConfig.key}_${sortConfig.direction}`}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'auto') {
                        handleAutoSort()
                      } else {
                        const lastUnderscore = val.lastIndexOf('_')
                        const key = val.substring(0, lastUnderscore)
                        const direction = val.substring(lastUnderscore + 1)
                        setSortConfig({ key, direction })
                      }
                    }}
                    className="form-input"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '8px',
                      minWidth: 160,
                      background: '#ffffff',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <option value="auto">⚡ Auto (Aktif &amp; Terbaru)</option>
                    <option value="created_at_desc">📅 Tanggal (Terbaru)</option>
                    <option value="created_at_asc">📅 Tanggal (Terlama)</option>
                    <option value="title_asc">🔤 Judul (A - Z)</option>
                    <option value="title_desc">🔤 Judul (Z - A)</option>
                    <option value="status_asc">🔘 Status (Aktif ke Tutup)</option>
                    <option value="duration_minutes_desc">⏱️ Durasi (Terlama)</option>
                    <option value="duration_minutes_asc">⏱️ Durasi (Tercepat)</option>
                  </select>

                  {/* Search Input */}
                  <div style={{ position: 'relative', minWidth: 180 }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Cari ujian..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input"
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.35rem 1.8rem 0.35rem 2rem',
                        borderRadius: '8px',
                        width: '100%',
                        background: '#f8fafc',
                        border: '1px solid var(--border)'
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '0.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--text-muted)'
                        }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* ─── Table ─────────────────────────────────────────────────── */}
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('title')}>
                        Judul Ujian {sortConfig.key === 'title' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('teacher_name')}>
                        Guru {sortConfig.key === 'teacher_name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th>Mode</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('duration_minutes')}>
                        Durasi {sortConfig.key === 'duration_minutes' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('target_kelas')}>
                        Target Kelas {sortConfig.key === 'target_kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')} title="Klik untuk mengurutkan berdasarkan status">
                        Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : (isAutoSorted ? '⚡' : '')}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('created_at')} title="Klik untuk mengurutkan tanggal">
                        Tanggal {sortConfig.key === 'created_at' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : (isAutoSorted ? '↓' : '')}
                      </th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExams.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          Tidak ada ujian yang cocok dengan filter atau kata kunci pencarian.
                        </td>
                      </tr>
                    ) : (
                      sortedExams.map(exam => {
                        const isPublished = exam.status === 'published'
                        return (
                          <tr
                            key={exam.id}
                            style={{
                              borderLeft: isPublished ? '3.5px solid #10b981' : '3.5px solid transparent',
                              background: isPublished ? 'rgba(16, 185, 129, 0.02)' : undefined
                            }}
                          >
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {isPublished && (
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} title="Ujian Sedang Aktif" />
                                )}
                                <span>{exam.title}</span>
                              </div>
                            </td>
                            <td className="text-muted text-sm">{exam.users?.name || exam.created_by}</td>
                            <td>
                              <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.75rem' }}>
                                {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'}
                              </span>
                            </td>
                            <td>{exam.mode === 'quiz' ? 'Timer per soal' : `${exam.duration_minutes} mnt`}</td>
                            <td className="text-muted text-sm">{exam.target_kelas || 'Semua'}</td>
                            <td>
                              <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                                {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                              </span>
                            </td>
                            <td className="text-muted text-sm">{new Date(exam.created_at).toLocaleDateString('id-ID')}</td>
                            <td>
                              <div className="action-btn-group">
                                <button
                                  className={`action-btn ${exam.status === 'published' ? 'action-btn-live' : 'action-btn-edit'}`}
                                  onClick={() => navigate(`/admin/edit/${exam.id}`)}
                                  title={exam.status === 'published' ? 'Live Edit Soal (Ujian Berlangsung)' : 'Edit Ujian'}
                                >
                                  {exam.status === 'published' ? <Zap size={15} /> : <Edit2 size={15} />}
                                  <span>{exam.status === 'published' ? 'Live Edit' : 'Edit'}</span>
                                </button>
                                <button
                                  className="action-btn action-btn-status"
                                  onClick={() => togglePublish(exam)}
                                  title={exam.status === 'published' ? 'Tutup / Unpublish Ujian' : 'Publikasikan Ujian'}
                                >
                                  {exam.status === 'published' ? <Lock size={15} /> : <Globe size={15} />}
                                  <span>{exam.status === 'published' ? 'Tutup' : 'Publish'}</span>
                                </button>
                                <button
                                  className="action-btn action-btn-monitor"
                                  onClick={() => navigate(`/admin/monitor/${exam.id}`)}
                                  title="Buka Ruang Monitor Ujian"
                                >
                                  <Activity size={15} />
                                  <span>Monitor</span>
                                </button>
                                <button
                                  className="action-btn action-btn-result"
                                  onClick={() => navigate(`/admin/results/${exam.id}`)}
                                  title="Lihat Hasil Nilai Siswa"
                                >
                                  <BarChart2 size={15} />
                                  <span>Hasil</span>
                                </button>
                                <button
                                  className="action-btn action-btn-preview"
                                  onClick={() => navigate(`/exam/${exam.id}/lobby`)}
                                  title="Pratinjau / Uji Coba Ujian Siswa"
                                >
                                  <Play size={15} />
                                  <span>Coba</span>
                                </button>
                                <button
                                  className="action-btn action-btn-danger"
                                  onClick={() => handleDelete(exam.id)}
                                  title="Hapus Ujian Secara Permanen"
                                >
                                  <Trash2 size={15} />
                                  <span>Hapus</span>
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
          </>
        )}
      </div>
    </>
  )
}


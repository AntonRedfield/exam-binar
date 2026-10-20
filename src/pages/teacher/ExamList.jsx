import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams } from '../../lib/db'
import { Plus, Edit2, Activity, BarChart2, Trash2, Globe, Lock, Zap, BookOpen, ClipboardList, Play } from 'lucide-react'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../../lib/monitoringUI'

export default function ExamList() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [examList, setExamList] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' })

  async function load() {
    const source = exams.list()
    const { data } = await source
    setExamList(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  async function togglePublish(exam) {
    const newStatus = exam.status === 'published' ? 'draft' : 'published'
    await exams.update(exam.id, { status: newStatus })
    await load()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus ujian ini? Tindakan tidak dapat dibatalkan.')) return
    await exams.delete(id)
    await load()
  }

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const sortedExams = [...examList].sort((a, b) => {
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

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Daftar Ujian</h2>
            <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>{examList.length} ujian tersimpan</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link to="/teacher/monitor" className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#059669', color: '#ffffff', border: 'none', fontWeight: 600 }}>
              <Activity size={15} /> Hub Monitor Siswa (Live)
            </Link>
            <Link to="/teacher/create" className="btn btn-gold btn-sm">
              <Plus size={16} /> Buat Ujian
            </Link>
          </div>
        </div>
      </div>
      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
        ) : examList.length === 0 ? (
          <div className="empty-state card">
            <p>Belum ada ujian. Klik "Buat Ujian" untuk memulai.</p>
          </div>
        ) : (
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
                    <th>Target Kelas</th>
                    <th>Mode</th>
                    <th>Pengawasan</th>
                    <th>Durasi</th>
                    <th>Status</th>
                    <th>Dibuat</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExams.map(exam => (
                    <tr key={exam.id}>
                      <td style={{ fontWeight: 600 }}>{exam.title}</td>
                      <td className="text-muted text-sm">{exam.users?.name || exam.created_by}</td>
                      <td className="text-muted text-sm">
                        {!exam.target_kelas || exam.target_kelas === 'all' 
                          ? 'Semua Kelas' 
                          : `Kelas ${exam.target_kelas.split(',').join(', ')}`}
                      </td>
                      <td>
                        <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : exam.mode === 'survey' ? 'badge-survey' : 'badge-draft'}`} style={{ fontSize: '0.75rem' }}>
                          {exam.mode === 'quiz' ? '⚡ Kuis' : exam.mode === 'survey' ? '📋 Survei' : '📝 Ujian'}
                        </span>
                      </td>
                      <td>
                        {exam.mode === 'survey' ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span style={getMonitoringBadgeStyle(exam.monitoring_level || 1)}>
                            <MonitoringIcon level={exam.monitoring_level || 1} size={14} />
                            Lv.{exam.monitoring_level || 1}
                          </span>
                        )}
                      </td>
                      <td>{exam.mode === 'survey' ? 'Tanpa batas' : exam.mode === 'quiz' ? 'Timer per soal' : `${exam.duration_minutes} mnt`}</td>
                      <td>
                        <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                          {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{new Date(exam.created_at).toLocaleDateString('id-ID')}</td>
                      <td>
                        <div className="action-btn-group">
                          {(user.role === 'SUPERADMIN' || user.role === 'MODERATOR' || exam.created_by === user.id) && (
                            <>
                              <button
                                className={`action-btn ${exam.status === 'published' ? 'action-btn-live' : 'action-btn-edit'}`}
                                onClick={() => navigate(`/teacher/edit/${exam.id}`)}
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
                            </>
                          )}
                          {exam.mode !== 'survey' && (
                            <button
                              className="action-btn action-btn-monitor"
                              onClick={() => navigate(`/teacher/monitor/${exam.id}`)}
                              title="Buka Ruang Monitor Ujian"
                            >
                              <Activity size={15} />
                              <span>Monitor</span>
                            </button>
                          )}
                          {exam.mode === 'survey' ? (
                            <button
                              className="action-btn action-btn-result"
                              onClick={() => navigate(`/teacher/survey-responses/${exam.id}`)}
                              title="Lihat Respons Survei"
                            >
                              <ClipboardList size={15} />
                              <span>Respons</span>
                            </button>
                          ) : (
                            <button
                              className="action-btn action-btn-result"
                              onClick={() => navigate(`/teacher/results/${exam.id}`)}
                              title="Lihat Hasil Nilai Siswa"
                            >
                              <BarChart2 size={15} />
                              <span>Hasil</span>
                            </button>
                          )}
                          <button
                            className="action-btn action-btn-preview"
                            onClick={() => navigate(`/exam/${exam.id}/lobby`)}
                            title="Pratinjau / Uji Coba Ujian"
                          >
                            <Play size={15} />
                            <span>Coba</span>
                          </button>
                          {(user.role === 'SUPERADMIN' || exam.created_by === user.id) && (
                            <button
                              className="action-btn action-btn-danger"
                              onClick={() => handleDelete(exam.id)}
                              title="Hapus Ujian"
                            >
                              <Trash2 size={15} />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

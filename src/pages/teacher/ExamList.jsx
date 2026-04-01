import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams } from '../../lib/db'
import { Plus, Edit2, Activity, BarChart2, Trash2, Globe, Lock } from 'lucide-react'

export default function ExamList() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [examList, setExamList] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' })

  async function load() {
    const source = user.role === 'SUPERADMIN' ? exams.list() : exams.listByTeacher(user.id)
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
          <Link to="/teacher/create" className="btn btn-gold">
            <Plus size={16} /> Buat Ujian
          </Link>
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
                    {user.role === 'SUPERADMIN' && (
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('teacher_name')}>
                        Guru {sortConfig.key === 'teacher_name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    )}
                    <th>Target Kelas</th>
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
                      {user.role === 'SUPERADMIN' && <td className="text-muted text-sm">{exam.users?.name || exam.created_by}</td>}
                      <td className="text-muted text-sm">
                        {!exam.target_kelas || exam.target_kelas === 'all' 
                          ? 'Semua Kelas' 
                          : `Kelas ${exam.target_kelas.split(',').join(', ')}`}
                      </td>
                      <td>{exam.duration_minutes} mnt</td>
                      <td>
                        <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                          {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{new Date(exam.created_at).toLocaleDateString('id-ID')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/edit/${exam.id}`)} title="Edit">
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => togglePublish(exam)} title={exam.status === 'published' ? 'Unpublish' : 'Publish'}>
                            {exam.status === 'published' ? <Lock size={13} /> : <Globe size={13} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/monitor/${exam.id}`)} title="Monitor">
                            <Activity size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/results/${exam.id}`)} title="Hasil">
                            <BarChart2 size={13} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(exam.id)} title="Hapus">
                            <Trash2 size={13} />
                          </button>
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

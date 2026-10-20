import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exams } from '../../lib/db'
import { Plus, Edit2, Activity, BarChart2, Trash2, Globe, Lock, Zap, Play } from 'lucide-react'

export default function ExamOversight() {
  const navigate = useNavigate()
  const [examList, setExamList] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Semua Ujian</h2>
            <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>{examList.length} ujian dari seluruh guru</p>
          </div>
          <Link to="/admin/create" className="btn btn-gold">
            <Plus size={16} /> Buat Ujian
          </Link>
        </div>
      </div>
      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Judul Ujian</th>
                    <th>Guru</th>
                    <th>Mode</th>
                    <th>Durasi</th>
                    <th>Target Kelas</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {examList.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Belum ada ujian terdaftar.</td></tr>
                  ) : examList.map(exam => (
                    <tr key={exam.id}>
                      <td style={{ fontWeight: 600 }}>{exam.title}</td>
                      <td className="text-muted text-sm">{exam.users?.name || exam.created_by}</td>
                      <td>
                        <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.75rem' }}>
                          {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'}
                        </span>
                      </td>
                      <td>{exam.mode === 'quiz' ? 'Timer per soal' : `${exam.duration_minutes} mnt`}</td>
                      <td>{exam.target_kelas || 'Semua'}</td>
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

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exams } from '../../lib/db'
import { Edit2, Activity, BarChart2, Trash2, Globe, Lock } from 'lucide-react'

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
        <h2>Semua Ujian</h2>
        <p className="text-muted text-sm">{examList.length} ujian dari seluruh guru</p>
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
                    <th>Durasi</th>
                    <th>Target Kelas</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {examList.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Belum ada ujian terdaftar.</td></tr>
                  ) : examList.map(exam => (
                    <tr key={exam.id}>
                      <td style={{ fontWeight: 600 }}>{exam.title}</td>
                      <td className="text-muted text-sm">{exam.users?.name || exam.created_by}</td>
                      <td>{exam.duration_minutes} mnt</td>
                      <td>{exam.target_kelas || 'Semua'}</td>
                      <td>
                        <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                          {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{new Date(exam.created_at).toLocaleDateString('id-ID')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/edit/${exam.id}`)} title="Edit"><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => togglePublish(exam)} title="Toggle status">
                            {exam.status === 'published' ? <Lock size={13} /> : <Globe size={13} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/monitor/${exam.id}`)} title="Monitor"><Activity size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/results/${exam.id}`)} title="Hasil"><BarChart2 size={13} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(exam.id)} title="Hapus"><Trash2 size={13} /></button>
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

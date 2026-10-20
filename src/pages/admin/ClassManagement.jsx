import { useState, useEffect } from 'react'
import { classes, academicPeriods, users } from '../../lib/db'
import { Plus, Edit2, Trash2, X, Save, Search, Calendar, GraduationCap, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ClassManagement() {
  const [activeTab, setActiveTab] = useState('classes') // 'classes' | 'periods'

  // --- Classes State ---
  const [classList, setClassList] = useState([])
  const [teacherList, setTeacherList] = useState([])
  const [classLoading, setClassLoading] = useState(true)
  const [classSearch, setClassSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  
  // Class Modal
  const [showClassModal, setShowClassModal] = useState(false)
  const [isClassEdit, setIsClassEdit] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', grade_level: '', academic_year: '2025/2026', homeroom_teacher_id: '' })
  const [currentClassId, setCurrentClassId] = useState('')
  const [classSaving, setClassSaving] = useState(false)
  const [classError, setClassError] = useState('')

  // --- Academic Periods State ---
  const [periodList, setPeriodList] = useState([])
  const [periodLoading, setPeriodLoading] = useState(true)
  const [periodSearch, setPeriodSearch] = useState('')

  // Period Modal
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [isPeriodEdit, setIsPeriodEdit] = useState(false)
  const [periodForm, setPeriodForm] = useState({ name: '', start_date: '', end_date: '', is_active: false })
  const [currentPeriodId, setCurrentPeriodId] = useState('')
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodError, setPeriodError] = useState('')

  // Load Classes & Teachers
  async function loadClasses() {
    setClassLoading(true)
    const [cRes, tRes] = await Promise.all([
      classes.list(),
      users.listByRole('MODERATOR')
    ])
    setClassList(cRes.data || [])
    setTeacherList(tRes.data || [])
    setClassLoading(false)
  }

  // Load Periods
  async function loadPeriods() {
    setPeriodLoading(true)
    const { data } = await academicPeriods.list()
    setPeriodList(data || [])
    setPeriodLoading(false)
  }

  useEffect(() => {
    loadClasses()
    loadPeriods()
  }, [])

  // --- Class Actions ---
  function openCreateClass() {
    setIsClassEdit(false)
    setCurrentClassId('')
    setClassForm({ name: '', grade_level: '7', academic_year: '2025/2026', homeroom_teacher_id: '' })
    setClassError('')
    setShowClassModal(true)
  }

  function openEditClass(cls) {
    setIsClassEdit(true)
    setCurrentClassId(cls.id)
    setClassForm({
      name: cls.name || '',
      grade_level: cls.grade_level ? String(cls.grade_level) : '',
      academic_year: cls.academic_year || '2025/2026',
      homeroom_teacher_id: cls.homeroom_teacher_id || ''
    })
    setClassError('')
    setShowClassModal(true)
  }

  async function handleSaveClass(e) {
    e?.preventDefault()
    if (!classForm.name.trim()) {
      setClassError('Nama kelas wajib diisi.')
      return
    }

    setClassSaving(true)
    setClassError('')
    try {
      if (isClassEdit) {
        const { error } = await classes.update(currentClassId, classForm)
        if (error) throw error
      } else {
        const { error } = await classes.create(classForm)
        if (error) throw error
      }
      setShowClassModal(false)
      await loadClasses()
    } catch (err) {
      setClassError(err.message || 'Gagal menyimpan data kelas.')
    } finally {
      setClassSaving(false)
    }
  }

  async function handleDeleteClass(cls) {
    if (!confirm(`Hapus kelas "${cls.name}"? Siswa di kelas ini tidak akan terhapus namun asosiasi kelasnya akan dilepas.`)) return
    const { error } = await classes.delete(cls.id)
    if (error) {
      alert(`Gagal menghapus kelas: ${error.message}`)
    } else {
      await loadClasses()
    }
  }

  // --- Academic Period Actions ---
  function openCreatePeriod() {
    setIsPeriodEdit(false)
    setCurrentPeriodId('')
    const today = new Date().toISOString().split('T')[0]
    setPeriodForm({ name: '', start_date: today, end_date: today, is_active: false })
    setPeriodError('')
    setShowPeriodModal(true)
  }

  function openEditPeriod(p) {
    setIsPeriodEdit(true)
    setCurrentPeriodId(p.id)
    setPeriodForm({
      name: p.name || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      is_active: p.is_active || false
    })
    setPeriodError('')
    setShowPeriodModal(true)
  }

  async function handleSavePeriod(e) {
    e?.preventDefault()
    if (!periodForm.name.trim()) {
      setPeriodError('Nama periode akademik wajib diisi.')
      return
    }
    if (!periodForm.start_date || !periodForm.end_date) {
      setPeriodError('Tanggal mulai dan selesai wajib ditentukan.')
      return
    }

    setPeriodSaving(true)
    setPeriodError('')
    try {
      if (isPeriodEdit) {
        const { error } = await academicPeriods.update(currentPeriodId, periodForm)
        if (error) throw error
      } else {
        const { error } = await academicPeriods.create(periodForm)
        if (error) throw error
      }
      setShowPeriodModal(false)
      await loadPeriods()
    } catch (err) {
      setPeriodError(err.message || 'Gagal menyimpan periode akademik.')
    } finally {
      setPeriodSaving(false)
    }
  }

  async function handleTogglePeriodActive(p) {
    try {
      const { error } = await academicPeriods.update(p.id, { is_active: !p.is_active })
      if (error) throw error
      await loadPeriods()
    } catch (err) {
      alert(`Gagal mengubah status aktif: ${err.message}`)
    }
  }

  async function handleDeletePeriod(p) {
    if (!confirm(`Hapus periode akademik "${p.name}"?`)) return
    const { error } = await academicPeriods.delete(p.id)
    if (error) {
      alert(`Gagal menghapus periode: ${error.message}`)
    } else {
      await loadPeriods()
    }
  }

  // Teacher Map
  const teacherMap = teacherList.reduce((acc, t) => {
    acc[t.id] = t.full_name || t.display_name || t.username
    return acc
  }, {})

  // Filtered lists
  const filteredClasses = classList.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(classSearch.toLowerCase())
    const matchesGrade = !gradeFilter || String(c.grade_level) === gradeFilter
    return matchesSearch && matchesGrade
  })

  const filteredPeriods = periodList.filter(p => {
    return p.name?.toLowerCase().includes(periodSearch.toLowerCase())
  })

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>Data Master: Kelas &amp; Periode Akademik</h2>
            <p className="text-muted text-sm">Kelola master tabel database sekolah untuk pengorganisasian ujian</p>
          </div>
          <div>
            {activeTab === 'classes' ? (
              <button className="btn btn-gold" onClick={openCreateClass}>
                <Plus size={16} /> Tambah Kelas
              </button>
            ) : (
              <button className="btn btn-gold" onClick={openCreatePeriod}>
                <Plus size={16} /> Tambah Periode
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          <button 
            className={`btn ${activeTab === 'classes' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setActiveTab('classes')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <GraduationCap size={16} /> Data Kelas ({classList.length})
          </button>
          <button 
            className={`btn ${activeTab === 'periods' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setActiveTab('periods')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Calendar size={16} /> Periode Akademik ({periodList.length})
          </button>
        </div>

        {/* ================= TAB 1: CLASSES ================= */}
        {activeTab === 'classes' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select 
                className="form-input" 
                style={{ width: 160 }} 
                value={gradeFilter} 
                onChange={e => setGradeFilter(e.target.value)}
              >
                <option value="">Semua Tingkat</option>
                <option value="7">Kelas 7 (SMP)</option>
                <option value="8">Kelas 8 (SMP)</option>
                <option value="9">Kelas 9 (SMP)</option>
                <option value="10">Kelas 10 (SMA/SMK)</option>
                <option value="11">Kelas 11 (SMA/SMK)</option>
                <option value="12">Kelas 12 (SMA/SMK)</option>
              </select>

              <div style={{ position: 'relative', marginLeft: 'auto', width: 260 }}>
                <input 
                  className="form-input" 
                  placeholder="Cari nama kelas..." 
                  value={classSearch} 
                  onChange={e => setClassSearch(e.target.value)} 
                  style={{ width: '100%', paddingLeft: '2rem' }}
                />
                <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Kelas</th>
                      <th>Tingkat / Grade</th>
                      <th>Tahun Akademik</th>
                      <th>Wali Kelas</th>
                      <th style={{ textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classLoading ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ width: 24, height: 24, margin: '0 auto' }} /></td></tr>
                    ) : filteredClasses.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data kelas yang terdaftar.</td></tr>
                    ) : filteredClasses.map(cls => (
                      <tr key={cls.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              fontWeight: 700,
                              fontSize: '0.92rem',
                              color: '#1b3361',
                              background: 'rgba(27, 51, 97, 0.08)',
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}>
                              {cls.name}
                            </span>
                          </div>
                        </td>
                        <td>
                          {cls.grade_level ? `Tingkat ${cls.grade_level}` : '—'}
                        </td>
                        <td>
                          <span className="badge badge-outline">{cls.academic_year || '2025/2026'}</span>
                        </td>
                        <td>
                          {teacherMap[cls.homeroom_teacher_id] ? (
                            <span style={{ fontWeight: 500 }}>{teacherMap[cls.homeroom_teacher_id]}</span>
                          ) : (
                            <span className="text-muted text-xs">— Belum ditentukan —</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                            <button 
                              className="action-btn action-btn-edit" 
                              title="Edit Kelas"
                              onClick={() => openEditClass(cls)}
                            >
                              <Edit2 size={15} />
                              <span>Edit</span>
                            </button>
                            <button 
                              className="action-btn action-btn-danger" 
                              title="Hapus Kelas"
                              onClick={() => handleDeleteClass(cls)}
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
          </div>
        )}

        {/* ================= TAB 2: ACADEMIC PERIODS ================= */}
        {activeTab === 'periods' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <input 
                  className="form-input" 
                  placeholder="Cari nama periode..." 
                  value={periodSearch} 
                  onChange={e => setPeriodSearch(e.target.value)} 
                  style={{ width: '100%', paddingLeft: '2rem' }}
                />
                <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Periode</th>
                      <th>Tanggal Mulai</th>
                      <th>Tanggal Selesai</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodLoading ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ width: 24, height: 24, margin: '0 auto' }} /></td></tr>
                    ) : filteredPeriods.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data periode akademik.</td></tr>
                    ) : filteredPeriods.map(p => (
                      <tr key={p.id} style={{ background: p.is_active ? 'rgba(34, 197, 94, 0.04)' : undefined }}>
                        <td style={{ fontWeight: 700, color: '#1b3361' }}>
                          {p.name}
                        </td>
                        <td>{p.start_date || '—'}</td>
                        <td>{p.end_date || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={`badge ${p.is_active ? 'badge-active' : 'badge-draft'}`}
                            onClick={() => handleTogglePeriodActive(p)}
                            style={{ cursor: 'pointer', border: 'none' }}
                            title="Klik untuk mengubah status aktif"
                          >
                            {p.is_active ? '✓ Aktif' : 'Non-aktif'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                            <button 
                              className="action-btn action-btn-edit" 
                              title="Edit Periode"
                              onClick={() => openEditPeriod(p)}
                            >
                              <Edit2 size={15} />
                              <span>Edit</span>
                            </button>
                            <button 
                              className="action-btn action-btn-danger" 
                              title="Hapus Periode"
                              onClick={() => handleDeletePeriod(p)}
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
          </div>
        )}
      </div>

      {/* CLASS MODAL */}
      {showClassModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3>{isClassEdit ? 'Edit Kelas' : 'Tambah Kelas Baru'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowClassModal(false)}><X size={15} /></button>
            </div>

            <form onSubmit={handleSaveClass} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {classError && (
                <div className="alert alert-error" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={15} />
                  <span style={{ fontSize: '0.85rem' }}>{classError}</span>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nama Kelas <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input 
                  className="form-input" 
                  value={classForm.name} 
                  onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="cth: 7-A, 8-B, 10-IPA-1" 
                  autoFocus
                />
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tingkat / Grade</label>
                  <select 
                    className="form-input" 
                    value={classForm.grade_level} 
                    onChange={e => setClassForm(f => ({ ...f, grade_level: e.target.value }))}
                  >
                    <option value="">Pilih Tingkat</option>
                    <option value="7">Tingkat 7</option>
                    <option value="8">Tingkat 8</option>
                    <option value="9">Tingkat 9</option>
                    <option value="10">Tingkat 10</option>
                    <option value="11">Tingkat 11</option>
                    <option value="12">Tingkat 12</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tahun Akademik</label>
                  <input 
                    className="form-input" 
                    value={classForm.academic_year} 
                    onChange={e => setClassForm(f => ({ ...f, academic_year: e.target.value }))}
                    placeholder="2025/2026" 
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Wali Kelas (Guru)</label>
                <select 
                  className="form-input" 
                  value={classForm.homeroom_teacher_id} 
                  onChange={e => setClassForm(f => ({ ...f, homeroom_teacher_id: e.target.value }))}
                >
                  <option value="">— Belum ada Wali Kelas —</option>
                  {teacherList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.display_name} ({t.username})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowClassModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1, fontWeight: 700 }} disabled={classSaving}>
                  {classSaving ? 'Menyimpan...' : <><Save size={14} /> Simpan Kelas</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERIOD MODAL */}
      {showPeriodModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3>{isPeriodEdit ? 'Edit Periode Akademik' : 'Tambah Periode Baru'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPeriodModal(false)}><X size={15} /></button>
            </div>

            <form onSubmit={handleSavePeriod} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {periodError && (
                <div className="alert alert-error" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={15} />
                  <span style={{ fontSize: '0.85rem' }}>{periodError}</span>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nama Periode <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input 
                  className="form-input" 
                  value={periodForm.name} 
                  onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="cth: 2025/2026 Ganjil, 2025/2026 Genap" 
                  autoFocus
                />
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tanggal Mulai <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="date"
                    className="form-input" 
                    value={periodForm.start_date} 
                    onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tanggal Selesai <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="date"
                    className="form-input" 
                    value={periodForm.end_date} 
                    onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input 
                    type="checkbox" 
                    checked={periodForm.is_active} 
                    onChange={e => setPeriodForm(f => ({ ...f, is_active: e.target.checked }))} 
                  />
                  <span>Tetapkan sebagai periode aktif saat ini</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowPeriodModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1, fontWeight: 700 }} disabled={periodSaving}>
                  {periodSaving ? 'Menyimpan...' : <><Save size={14} /> Simpan Periode</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

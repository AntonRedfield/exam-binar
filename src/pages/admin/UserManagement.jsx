import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { users } from '../../lib/db'
import { getCurrentUser, mapAppRole } from '../../lib/auth'
import { Plus, Edit2, Trash2, X, Save, Eye, EyeOff, Upload, FileText, KeyRound, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react'

const EMPTY_FORM = { email: '', username: '', full_name: '', kelas: '', role: 'student', phone_number: '', password: '' }

export default function UserManagement() {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const isTeacher = currentUser?.role === 'MODERATOR'

  const [tab, setTab] = useState('USER') // USER | MODERATOR | SUPERADMIN
  const [userList, setUserList] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isEdit, setIsEdit] = useState(false)
  const [oldId, setOldId] = useState('')
  const [showModalPassword, setShowModalPassword] = useState(false)
  
  // Quick Reset Password Modal
  const [resetTargetUser, setResetTargetUser] = useState(null)
  const [quickPassword, setQuickPassword] = useState('')
  const [showQuickPassword, setShowQuickPassword] = useState(false)
  const [quickResetSaving, setQuickResetSaving] = useState(false)
  const [quickResetError, setQuickResetError] = useState('')
  const [quickResetSuccess, setQuickResetSuccess] = useState('')

  // Import Modal
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Filters State
  const [classList, setClassList] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  async function load() {
    setSelectedIds(new Set())
    const { data } = await users.listByRole(tab)
    setUserList(data || [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [tab])

  useEffect(() => {
    async function loadClasses() {
      const { data } = await users.getDistinctKelas()
      setClassList(data || [])
    }
    loadClasses()
  }, [])

  function openCreate() {
    const defaultRole = tab === 'USER' ? 'student' : (tab === 'MODERATOR' ? 'teacher' : 'admin')
    setForm({ ...EMPTY_FORM, role: defaultRole, password: '' })
    setIsEdit(false)
    setShowModalPassword(false)
    setError('')
    setShowModal(true)
  }

  function openEdit(user) {
    setForm({
      email: user.email || '',
      username: user.username || '',
      full_name: user.full_name || '',
      kelas: user.kelas || '',
      role: user.role,
      phone_number: user.phone_number || '',
      password: '', // Blank by default when editing
    })
    setOldId(user.id)
    setIsEdit(true)
    setShowModalPassword(false)
    setError('')
    setShowModal(true)
  }

  function openResetPassword(user) {
    setResetTargetUser(user)
    setQuickPassword('')
    setShowQuickPassword(false)
    setQuickResetError('')
    setQuickResetSuccess('')
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Nama lengkap wajib diisi.'); return }
    if (form.password && form.password.trim().length > 0 && form.password.trim().length < 6) {
      setError('Password minimal harus 6 karakter.')
      return
    }

    setSaving(true); setError('')
    try {
      const saveData = { 
        full_name: form.full_name.trim(), 
        username: form.username ? form.username.trim().toLowerCase() : undefined,
        role: form.role, 
        kelas: form.kelas || null,
        phone_number: form.phone_number || null 
      }

      if (form.password && form.password.trim().length >= 6) {
        saveData.password = form.password.trim()
      } else if (!isEdit) {
        saveData.password = 'password' // Default password for new accounts if blank
      }
      
      const res = isEdit 
        ? await users.update(oldId, saveData)
        : await users.create(saveData)
        
      if (res?.error) {
        throw new Error(res.error.message || 'Gagal menyimpan data pengguna.')
      }
      
      setShowModal(false)
      await load()
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan saat menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickResetPassword(e) {
    e?.preventDefault()
    if (!quickPassword || quickPassword.trim().length < 6) {
      setQuickResetError('Password baru minimal harus 6 karakter.')
      return
    }
    setQuickResetSaving(true)
    setQuickResetError('')
    setQuickResetSuccess('')

    try {
      const { error: resetErr } = await users.resetPassword(resetTargetUser, quickPassword.trim())
      if (resetErr) throw resetErr
      setQuickResetSuccess(`Password untuk ${resetTargetUser.full_name || resetTargetUser.username} berhasil diubah!`)
      setTimeout(() => {
        setResetTargetUser(null)
        setQuickPassword('')
        setQuickResetSuccess('')
      }, 1800)
    } catch (err) {
      setQuickResetError(err.message || 'Gagal mereset password.')
    } finally {
      setQuickResetSaving(false)
    }
  }

  async function handleDelete(userId) {
    if (!confirm(`Hapus pengguna "${userId}"? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error } = await users.delete(userId)
    if (error) {
      alert(`Gagal menghapus pengguna: ${error.message}`)
    } else {
      await load()
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Hapus ${selectedIds.size} pengguna terpilih? Tindakan ini tidak bisa dibatalkan.`)) return
    
    setLoading(true)
    try {
      const results = await Promise.all(Array.from(selectedIds).map(id => users.delete(id)))
      const failed = results.filter(r => r.error)
      if (failed.length > 0) {
        alert(`Gagal menghapus ${failed.length} pengguna.`)
      }
      await load()
    } catch (err) {
      console.error("Bulk delete error:", err)
      await load()
    }
  }

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const filtered = userList.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                          u.username?.toLowerCase().includes(search.toLowerCase())
    const matchesClass = !selectedClass || u.kelas === selectedClass
    const matchesRole = !selectedRole || u.role === selectedRole

    return matchesSearch && matchesClass && matchesRole
  }).sort((a, b) => {
    let aVal, bVal
    if (sortConfig.key === 'name') {
      aVal = (a.full_name || '').toLowerCase()
      bVal = (b.full_name || '').toLowerCase()
    } else if (sortConfig.key === 'username') {
      aVal = (a.username || '').toLowerCase()
      bVal = (b.username || '').toLowerCase()
    } else if (sortConfig.key === 'kelas') {
      aVal = (a.classes?.name || a.kelas || '').toLowerCase()
      bVal = (b.classes?.name || b.kelas || '').toLowerCase()
    } else {
      aVal = String(a[sortConfig.key] || '').toLowerCase()
      bVal = String(b[sortConfig.key] || '').toLowerCase()
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  function toggleSelectAll(e) {
    if (e.target.checked) {
      const allIds = filtered.map(u => u.id)
      setSelectedIds(new Set(allIds))
    } else {
      setSelectedIds(new Set())
    }
  }

  function toggleSelect(id) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // ==== IMPORT LOGIC ====
  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => setImportText(evt.target.result)
    reader.readAsText(file)
  }

  async function processImport() {
    setImportResult(null)
    if (!importText.trim()) return
    setImporting(true)

    const lines = importText.split(/\r?\n/).filter(line => line.trim())
    let successCount = 0
    let errors = []

    for (let i = 0; i < lines.length; i++) {
      // split by tab or comma
      const cols = lines[i].split(/\t|,/)
      if (cols.length < 2) continue // skip bad rows
      
      const username = cols[0]?.trim().toLowerCase().replace(/\s/g, '') || ''
      const full_name = cols[1]?.trim() || ''
      const kelas = cols[2]?.trim() || null
      const password = cols[3]?.trim() || 'password'

      if (!full_name) continue // Name is mandatory

      try {
        const dbRole = mapAppRole(tab)
        const { error: createErr } = await users.create({ 
          username: username || undefined,
          full_name, 
          kelas, 
          password: password.length >= 6 ? password : 'password',
          role: dbRole 
        })
        if (createErr) throw createErr
        successCount++
      } catch (err) {
        errors.push(`Baris ${i + 1} (${username || full_name}): ${err.message}`)
      }
    }

    setImportResult({ success: successCount, errors })
    setImporting(false)
    if (successCount > 0) {
      setImportText('')
      await load()
    }
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>{isTeacher ? 'Kelola Siswa' : 'Manajemen Pengguna & Akun'}</h2>
            <p className="text-muted text-sm">{userList.length} akun terdaftar di sistem</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!isTeacher && selectedIds.size > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete}>
                <Trash2 size={16} /> Hapus Terpilih ({selectedIds.size})
              </button>
            )}
            {!isTeacher && (
              <button className="btn btn-ghost" onClick={() => navigate('/admin/logs')} title="Lihat riwayat autentikasi dan deteksi breach">
                <ShieldAlert size={16} style={{ color: '#dc2626' }} /> Log Akses &amp; Keamanan
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { setImportResult(null); setImportText(''); setShowImport(true); }}>
              <Upload size={16} /> Import Data
            </button>
            <button className="btn btn-gold" onClick={openCreate}>
              <Plus size={16} /> Tambah {isTeacher ? 'Siswa' : 'Pengguna'}
            </button>
          </div>
        </div>
      </div>
      <div className="page-body">
        {/* Tabs & Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isTeacher ? (
            <button className="btn btn-primary btn-sm">Siswa</button>
          ) : (
            [['USER', 'Siswa'], ['MODERATOR', 'Guru'], ['SUPERADMIN', 'Admin']].map(([val, label]) => (
              <button 
                key={val} 
                className={`btn ${tab === val ? 'btn-primary' : 'btn-ghost'} btn-sm`} 
                onClick={() => { setTab(val); setSelectedRole(''); }}
              >
                {label}
              </button>
            ))
          )}

          <select 
            className="form-input" 
            style={{ width: 150, marginLeft: isTeacher ? 'auto' : '1rem' }} 
            value={selectedClass} 
            onChange={e => setSelectedClass(e.target.value)}
          >
            <option value="">Semua Kelas</option>
            {classList.map(c => <option key={c} value={c}>Kelas {c}</option>)}
          </select>

          {tab === 'USER' && (
            <select 
              className="form-input" 
              style={{ width: 150 }} 
              value={selectedRole} 
              onChange={e => setSelectedRole(e.target.value)}
            >
              <option value="">Semua Role</option>
              <option value="student">Siswa</option>
              <option value="parent">Wali Murid</option>
              <option value="officer">Officer</option>
            </select>
          )}

          <input 
            className="form-input" 
            style={{ marginLeft: tab === 'USER' ? '0' : 'auto', width: 220 }} 
            placeholder="Cari nama / username..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {!isTeacher && (
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        onChange={toggleSelectAll} 
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                  )}
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('username')}>
                    Username / ID {sortConfig.key === 'username' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Role</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isTeacher ? 6 : 7} style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ width: 24, height: 24, margin: '0 auto' }} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={isTeacher ? 6 : 7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Tidak ada pengguna yang sesuai kriteria.</td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} style={{ background: selectedIds.has(u.id) ? 'rgba(239,68,68,0.05)' : undefined }}>
                    {!isTeacher && (
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(u.id)} 
                          onChange={() => toggleSelect(u.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td>
                      <code style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--gold, #f59e0b)',
                        background: 'rgba(245, 158, 11, 0.1)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontFamily: 'monospace'
                      }}>
                        {u.username || '—'}
                      </code>
                    </td>
                    <td>{u.kelas || '—'}</td>
                    <td>
                      <span className="badge badge-outline" style={{
                        textTransform: 'capitalize',
                        borderColor: u.role === 'admin' ? 'var(--danger)' : u.role === 'teacher' ? 'var(--accent)' : 'var(--border)'
                      }}>
                        {u.role === 'student' ? 'Siswa' : u.role === 'parent' ? 'Wali Murid' : u.role === 'teacher' ? 'Guru' : u.role === 'admin' ? 'Admin' : u.role}
                      </span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div className="action-btn-group" style={{ justifyContent: 'center' }}>
                        <button 
                          className="action-btn action-btn-key" 
                          title="Reset Password Akun" 
                          onClick={() => openResetPassword(u)}
                        >
                          <KeyRound size={15} />
                          <span>Password</span>
                        </button>
                        <button 
                          className="action-btn action-btn-edit" 
                          title="Edit Pengguna" 
                          onClick={() => openEdit(u)}
                        >
                          <Edit2 size={15} />
                          <span>Edit</span>
                        </button>
                        <button 
                          className="action-btn action-btn-danger" 
                          title="Hapus Pengguna" 
                          onClick={() => handleDelete(u.id)}
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

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3>{isEdit ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nama Lengkap <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nama Lengkap" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Username / ID Login</label>
                  <input className="form-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="cth: 7a1, budi123" />
                </div>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="student">Siswa</option>
                    <option value="parent">Wali Murid</option>
                    <option value="officer">Officer</option>
                    {!isTeacher && (
                      <>
                        <option value="teacher">Guru</option>
                        <option value="admin">Superadmin</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Kelas</label>
                  <input className="form-input" value={form.kelas} onChange={e => setForm(f => ({ ...f, kelas: e.target.value }))} placeholder="cth: 7-A, 8-B, 10-A" />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">No. Telepon / WhatsApp</label>
                <input className="form-input" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="cth: 08123456789" />
              </div>

              {/* Password Field */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">
                  {isEdit ? 'Ganti / Reset Password (Opsional)' : 'Password Akun (Opsional)'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showModalPassword ? 'text' : 'password'}
                    className="form-input" 
                    value={form.password} 
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} 
                    placeholder={isEdit ? 'Kosongkan jika tidak ingin mengubah password' : 'Kosongkan untuk default: "password"'}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalPassword(v => !v)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    tabIndex={-1}
                  >
                    {showModalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="text-muted text-xs" style={{ marginTop: '0.3rem' }}>
                  {isEdit 
                    ? 'Jika diisi, minimal 6 karakter. Password user di auth server akan langsung diperbarui.'
                    : 'Jika dikosongkan, password awal otomatis diset ke "password".'}
                </div>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Batal</button>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Menyimpan...' : <><Save size={14} /> Simpan</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK RESET PASSWORD MODAL */}
      {resetTargetUser && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  background: 'rgba(223, 174, 52, 0.15)',
                  color: '#b48218',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <KeyRound size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Reset Password</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setResetTargetUser(null)}><X size={15} /></button>
            </div>

            {quickResetSuccess ? (
              <div style={{
                padding: '1rem',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle2 size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{quickResetSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleQuickResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Target Pengguna:</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1b3361', marginTop: '0.15rem' }}>
                    {resetTargetUser.full_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#b48218' }}>
                    @{resetTargetUser.username || resetTargetUser.id}
                  </div>
                </div>

                {quickResetError && (
                  <div className="alert alert-error" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={15} />
                    <span style={{ fontSize: '0.82rem' }}>{quickResetError}</span>
                  </div>
                )}

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem' }}>
                    Password Baru <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showQuickPassword ? 'text' : 'password'}
                      className="form-input" 
                      value={quickPassword} 
                      onChange={e => setQuickPassword(e.target.value)} 
                      placeholder="Minimal 6 karakter"
                      style={{ paddingRight: '2.5rem' }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowQuickPassword(v => !v)}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      tabIndex={-1}
                    >
                      {showQuickPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="text-muted text-xs" style={{ marginTop: '0.35rem' }}>
                    Password ini akan langsung aktif untuk login akun bersangkutan.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setResetTargetUser(null)}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-gold" style={{ flex: 1, fontWeight: 700 }} disabled={quickResetSaving || !quickPassword}>
                    {quickResetSaving ? 'Menyimpan...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3>Import Data {tab === 'USER' ? 'Siswa' : 'Pengguna'}</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>
                  Format CSV/Excel: <strong>Username, Nama Lengkap, Kelas, Password</strong>
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)}><X size={15} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, border: '1px dashed var(--border)' }}>
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Opsi 1: Upload File CSV (.csv / .txt)</p>
                <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileUpload} style={{ fontSize: '0.85rem' }} />
              </div>

              <div>
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Opsi 2: Salin &amp; Tempel langsung dari Excel / Spreadsheet</p>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: 140, fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre' }}
                  placeholder={`7a1\tBudi Santoso\t7-A\tpassword123\n7a2\tAni Lestari\t7-A\trahasia99`}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
              </div>

              {importResult && (
                <div className={`alert ${importResult.errors.length === 0 ? 'alert-success' : 'alert-warning'}`}>
                  <b>{importResult.success} akun berhasil diimpor ke sistem.</b>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                      <p>Gagal ({importResult.errors.length} baris):</p>
                      <ul style={{ paddingLeft: '1rem', marginTop: '0.25rem' }}>
                        {importResult.errors.slice(0, 5).map((e, idx) => <li key={idx}>{e}</li>)}
                        {importResult.errors.length > 5 && <li>...dan {importResult.errors.length - 5} lainnya</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowImport(false)}>Tutup</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={processImport} disabled={importing || !importText.trim()}>
                  {importing ? 'Memproses...' : <><FileText size={14}/> Proses Import Akun</>}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}

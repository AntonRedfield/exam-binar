import { useEffect, useState, useRef } from 'react'
import { users } from '../../lib/db'
import { getCurrentUser, mapAppRole, mapDbRole } from '../../lib/auth'
import { Plus, Edit2, Trash2, X, Save, Eye, EyeOff, Upload, FileText } from 'lucide-react'

const EMPTY_FORM = { email: '', full_name: '', kelas: '', role: 'USER', phone_number: '' }

export default function UserManagement() {
  const currentUser = getCurrentUser()
  const isTeacher = currentUser?.role === 'MODERATOR'

  const [tab, setTab] = useState('USER') // USER | TEACHER | SUPERADMIN
  const [userList, setUserList] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isEdit, setIsEdit] = useState(false)
  const [oldId, setOldId] = useState('')
  
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
  const [visiblePasswords, setVisiblePasswords] = useState({})
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
    setForm({ ...EMPTY_FORM, role: defaultRole })
    setIsEdit(false)
    setError('')
    setShowModal(true)
  }

  function openEdit(user) {
    setForm({
      email: user.email || '',
      full_name: user.full_name || '',
      kelas: user.kelas || '',
      role: user.role,
      phone_number: user.phone_number || '',
    })
    setOldId(user.id)
    setIsEdit(true)
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Nama wajib diisi.'); return }
    setSaving(true); setError('')
    try {
      const saveData = { 
        full_name: form.full_name.trim(), 
        role: form.role, 
        kelas: form.kelas || null,
        phone_number: form.phone_number || null 
      }
      
      const res = isEdit 
        ? await users.update(oldId, saveData)
        : await users.create(saveData)
        
      if (res?.error) {
        throw new Error(res.error.message || 'Gagal menyimpan data ke database.')
      }
      
      setShowModal(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
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

  function togglePassword(id) {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

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
      if (cols.length < 2) continue // skip bad rows that don't even have Username & Name
      
      const username = cols[0]?.trim().toLowerCase() || ''
      const full_name = cols[1]?.trim() || ''
      const kelas = cols[2]?.trim() || null

      if (!full_name) continue // Name is mandatory

      try {
        const dbRole = mapAppRole(tab)
        await users.create({ full_name, role: dbRole })
        successCount++
      } catch (err) {
        errors.push(`Baris ${i + 1} (${username}): ${err.message}`)
      }
    }

    setImportResult({ success: successCount, errors })
    setImporting(false)
    if (successCount > 0) {
      setImportText('')
      await load()
    }
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
    } else if (sortConfig.key === 'kelas') {
      aVal = (a.classes?.name || '').toLowerCase()
      bVal = (b.classes?.name || '').toLowerCase()
    } else {
      aVal = String(a[sortConfig.key] || '').toLowerCase()
      bVal = String(b[sortConfig.key] || '').toLowerCase()
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>{isTeacher ? 'Kelola Siswa' : 'Manajemen Pengguna'}</h2>
            <p className="text-muted text-sm">{userList.length} akun ditemukan</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!isTeacher && selectedIds.size > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete}>
                <Trash2 size={16} /> Hapus Terpilih ({selectedIds.size})
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { setImportResult(null); setImportText(''); setShowImport(true); }}>
              <Upload size={16} /> Import Data
            </button>
            <button className="btn btn-gold" onClick={openCreate}><Plus size={16} /> Tambah {isTeacher ? 'Siswa' : 'Pengguna'}</button>
          </div>
        </div>
      </div>
      <div className="page-body">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isTeacher ? (
            <button className="btn btn-primary btn-sm">Siswa</button>
          ) : (
            [['USER', 'Siswa'], ['MODERATOR', 'Guru'], ['SUPERADMIN', 'Admin']].map(([val, label]) => (
              <button key={val} className={`btn ${tab === val ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => { setTab(val); setSelectedRole(''); }}>{label}</button>
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

          <input className="form-input" style={{ marginLeft: tab === 'USER' ? '0' : 'auto', width: 220 }} placeholder="Cari nama / username..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Role</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isTeacher ? 5 : 6} style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ width: 24, height: 24, margin: '0 auto' }} /></td></tr>
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
                    <td>{u.kelas || '—'}</td>
                    <td>
                      <span className="badge badge-outline" style={{
                        textTransform: 'capitalize',
                        borderColor: u.role === 'admin' ? 'var(--danger)' : u.role === 'teacher' ? 'var(--accent)' : 'var(--border)'
                      }}>
                        {u.role === 'student' ? 'Siswa' : u.role === 'parent' ? 'Wali Murid' : u.role === 'teacher' ? 'Guru' : u.role === 'admin' ? 'Admin' : u.role}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}><Edit2 size={13} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3>{isEdit ? 'Edit Pengguna' : 'Tambah Pengguna'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Nama Lengkap</label>
                <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nama Lengkap" />
              </div>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Telepon</label>
                  <input className="form-input" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="cth: 08123456789" />
                </div>
                <div className="form-group">
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
              </div>
              {(form.role === 'student' || form.role === 'parent') && (
                <div className="form-group">
                  <label className="form-label">Kelas</label>
                  <input className="form-input" value={form.kelas} onChange={e => setForm(f => ({ ...f, kelas: e.target.value }))} placeholder="cth: 7A, 8B" />
                </div>
              )}
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Batal</button>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? '...' : <><Save size={14} /> Simpan</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
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
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Opsi 1: Upload File CSV</p>
                <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileUpload} style={{ fontSize: '0.85rem' }} />
              </div>

              <div>
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Opsi 2: Paste data dari Excel</p>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre' }}
                  placeholder={`budi@murid.binar\tBudi Santoso\t9A\t\nani@murid.binar\tAni Lestari\t9B\t123456`}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
              </div>

              {importResult && (
                <div className={`alert ${importResult.errors.length === 0 ? 'alert-success' : 'alert-warning'}`}>
                  <b>{importResult.success} baris berhasil diimpor.</b>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                      <p>Gagal:</p>
                      <ul style={{ paddingLeft: '1rem', marginTop: '0.25rem' }}>
                        {importResult.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowImport(false)}>Tutup</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={processImport} disabled={importing || !importText.trim()}>
                  {importing ? 'Memproses...' : <><FileText size={14}/> Proses Import</>}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}

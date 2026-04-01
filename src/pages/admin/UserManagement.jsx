import { useEffect, useState, useRef } from 'react'
import { users } from '../../lib/db'
import { getCurrentUser } from '../../lib/auth'
import { Plus, Edit2, Trash2, X, Save, Eye, EyeOff, Upload, FileText } from 'lucide-react'

const EMPTY_FORM = { id: '', password: '', name: '', kelas: '', role: 'USER' }

export default function UserManagement() {
  const currentUser = getCurrentUser()
  const isTeacher = currentUser?.role === 'TEACHER'

  const [tab, setTab] = useState('USER') // USER | TEACHER | SUPERADMIN
  const [userList, setUserList] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isEdit, setIsEdit] = useState(false)
  
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

  async function load() {
    setSelectedIds(new Set())
    const { data } = await users.listByRole(tab)
    setUserList(data || [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [tab])

  function openCreate() {
    setForm({ ...EMPTY_FORM, role: tab })
    setIsEdit(false)
    setError('')
    setShowModal(true)
  }

  function openEdit(user) {
    setForm({ id: user.id, password: user.password || '', name: user.name, kelas: user.kelas || '', role: user.role })
    setIsEdit(true)
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.id.trim() || !form.name.trim()) { setError('ID dan Nama wajib diisi.'); return }
    setSaving(true); setError('')
    try {
      if (isEdit) {
        await users.update(form.id, { password: form.password || null, name: form.name, kelas: form.kelas || null, role: form.role })
      } else {
        await users.create({ id: form.id.trim(), password: form.password || null, name: form.name, kelas: form.kelas || null, role: form.role })
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
    await users.delete(userId)
    await load()
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Hapus ${selectedIds.size} pengguna terpilih? Tindakan ini tidak bisa dibatalkan.`)) return
    
    setLoading(true)
    try {
      // Run deletion in parallel
      await Promise.all(Array.from(selectedIds).map(id => users.delete(id)))
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
      if (cols.length < 2) continue // skip bad rows that don't even have ID & Name
      
      const id = cols[0]?.trim() || ''
      const name = cols[1]?.trim() || ''
      const kelas = cols[2]?.trim() || null
      const password = cols[3]?.trim() || null

      if (!id || !name) continue // ID and Name are mandatory

      try {
        await users.create({ id, name, kelas, password, role: tab })
        successCount++
      } catch (err) {
        errors.push(`Baris ${i + 1} (${id}): ${err.message}`)
      }
    }

    setImportResult({ success: successCount, errors })
    setImporting(false)
    if (successCount > 0) {
      setImportText('')
      await load()
    }
  }

  const filtered = userList.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.id?.toLowerCase().includes(search.toLowerCase()) ||
    u.kelas?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    const aVal = String(a[sortConfig.key] || '').toLowerCase()
    const bVal = String(b[sortConfig.key] || '').toLowerCase()
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
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {isTeacher ? (
            <button className="btn btn-primary btn-sm">Siswa</button>
          ) : (
            [['USER', 'Siswa'], ['TEACHER', 'Guru'], ['SUPERADMIN', 'Admin']].map(([val, label]) => (
              <button key={val} className={`btn ${tab === val ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab(val)}>{label}</button>
            ))
          )}
          <input className="form-input" style={{ marginLeft: 'auto', width: 220 }} placeholder="Cari nama / ID / kelas..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('id')}>
                    ID {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Password</th>
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
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{u.id}</td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.kelas || '—'}</td>
                    <td className="text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {u.password ? (
                        <>
                          <span style={{ fontFamily: visiblePasswords[u.id] ? 'monospace' : 'inherit' }}>
                            {visiblePasswords[u.id] ? u.password : '••••••'}
                          </span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem' }} onClick={() => togglePassword(u.id)} title={visiblePasswords[u.id] ? "Sembunyikan password" : "Lihat password"}>
                            {visiblePasswords[u.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </>
                      ) : (
                        <em>Tanpa password</em>
                      )}
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
              {!isEdit && (
                <div className="form-group">
                  <label className="form-label">ID Login</label>
                  <input className="form-input" value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="cth: budi.090812@murid.binar" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nama Lengkap</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama Lengkap" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Kelas</label>
                  <input className="form-input" value={form.kelas} onChange={e => setForm(f => ({ ...f, kelas: e.target.value }))} placeholder="cth: 9A" />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} disabled={isTeacher}>
                    <option value="USER">Siswa</option>
                    {!isTeacher && (
                      <>
                        <option value="TEACHER">Guru</option>
                        <option value="SUPERADMIN">Superadmin</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password {form.role === 'USER' ? '(Opsional untuk siswa)' : ''}</label>
                <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Kosongkan jika ID-only" />
              </div>
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
                  Format CSV/Excel: <strong>ID, Nama Lengkap, Kelas, Password</strong>
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

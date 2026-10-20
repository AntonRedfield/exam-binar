import { useEffect, useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  AlertTriangle,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  User,
  Copy,
  Check,
  Info,
  ExternalLink,
  ChevronRight,
  Edit3,
  MapPin,
  Eye
} from 'lucide-react'
import {
  fetchLoginLogs,
  fetchLoginAuditStats,
  getDetailedDeviceInfo,
  getDeviceNickname,
  setDeviceNickname,
  formatLoginNarrative
} from '../../lib/loginAudit'

export default function LoginLogs() {
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isTableMissing, setIsTableMissing] = useState(false)
  
  // Current client device info & custom device nickname
  const [currentDevice, setCurrentDevice] = useState(null)
  const [nicknameModal, setNicknameModal] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | failed | success | suspicious
  const [roleFilter, setRoleFilter] = useState('')
  
  // Detail Modal
  const [selectedLog, setSelectedLog] = useState(null)
  const [copiedSql, setCopiedSql] = useState(false)
  const [copiedIp, setCopiedIp] = useState(null)

  const SQL_MIGRATION_TEXT = `-- Copy & Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  role_level SMALLINT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_name TEXT,
  location TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert to login_logs" ON public.login_logs;
CREATE POLICY "Allow public insert to login_logs"
  ON public.login_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read login_logs" ON public.login_logs;
DROP POLICY IF EXISTS "Allow read login_logs" ON public.login_logs;
CREATE POLICY "Allow read login_logs"
  ON public.login_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow update login_logs" ON public.login_logs;
CREATE POLICY "Allow update login_logs"
  ON public.login_logs FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_identifier ON public.login_logs(identifier);
CREATE INDEX IF NOT EXISTS idx_login_logs_status ON public.login_logs(status);
`

  async function loadData() {
    setLoading(true)
    try {
      const [logResult, statsResult] = await Promise.all([
        fetchLoginLogs({
          limit: 150,
          status: statusFilter,
          search,
          role: roleFilter
        }),
        fetchLoginAuditStats()
      ])

      setLogs(logResult.data || [])
      setIsTableMissing(logResult.isTableMissing)
      setStats(statsResult)
    } catch (e) {
      console.error('[LoginLogs] Error loading logs:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Detect current client device model
    getDetailedDeviceInfo().then(dev => {
      setCurrentDevice(dev)
      setNicknameInput(dev.deviceNickname || dev.deviceModel || '')
    })
  }, [statusFilter, roleFilter])

  function handleSaveNickname(e) {
    e.preventDefault()
    setDeviceNickname(nicknameInput)
    setNicknameModal(false)
    getDetailedDeviceInfo().then(dev => {
      setCurrentDevice(dev)
    })
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    loadData()
  }

  function handleCopySql() {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(SQL_MIGRATION_TEXT)
      setCopiedSql(true)
      setTimeout(() => setCopiedSql(false), 2500)
    }
  }

  function handleCopyIp(ip) {
    if (navigator?.clipboard && ip) {
      navigator.clipboard.writeText(ip)
      setCopiedIp(ip)
      setTimeout(() => setCopiedIp(null), 1500)
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '—'
    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)

      let relative = ''
      if (diffMins < 1) relative = 'Baru saja'
      else if (diffMins < 60) relative = `${diffMins} mnt lalu`
      else if (diffHours < 24) relative = `${diffHours} jam lalu`
      else relative = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

      const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      return { relative, full: `${date.toLocaleDateString('id-ID')} ${timeStr}` }
    } catch (e) {
      return { relative: isoString, full: isoString }
    }
  }

  function getDeviceIcon(deviceType, size = 15) {
    if (deviceType === 'Mobile') return <Smartphone size={size} style={{ color: '#0284c7' }} />
    if (deviceType === 'Tablet') return <Tablet size={size} style={{ color: '#8b5cf6' }} />
    return <Monitor size={size} style={{ color: '#64748b' }} />
  }

  function getRoleBadge(role, roleLevel) {
    const lvl = Number(roleLevel) || (role === 'admin' ? 4 : (role === 'teacher' ? 3 : 1))
    if (lvl === 4) return <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>Admin</span>
    if (lvl === 3) return <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>Guru</span>
    if (lvl === 2) return <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', fontWeight: 600 }}>Officer</span>
    return <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>Siswa</span>
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                color: '#fff',
                padding: '0.45rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(30, 58, 138, 0.25)'
              }}>
                <ShieldAlert size={22} />
              </div>
              <h2 style={{ margin: 0 }}>Audit Log Login &amp; Deteksi Breach</h2>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>
              Pantau seluruh riwayat login untuk mendeteksi pembajakan akun (account takeover), percobaan password ilegal, dan nama perangkat login (cth: mikhail login at iPad Pro).
            </p>

            {/* Current Device Pill & Nickname */}
            {currentDevice && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: '#334155',
                marginTop: '0.4rem'
              }}>
                {getDeviceIcon(currentDevice.deviceType, 14)}
                <span>Perangkat Anda Saat Ini: <strong style={{ color: '#0f172a' }}>{currentDevice.deviceModel}</strong> ({currentDevice.browser})</span>
                <button
                  type="button"
                  onClick={() => setNicknameModal(true)}
                  className="btn btn-ghost btn-xs"
                  style={{ padding: '0.1rem 0.35rem', fontSize: '0.7rem', color: '#0284c7' }}
                  title="Beri nama custom perangkat ini (cth: iPad Pro Mikhail)"
                >
                  <Edit3 size={11} style={{ marginRight: '0.2rem' }} />
                  {currentDevice.deviceNickname ? 'Ubah Nama' : 'Beri Nama'}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={loadData} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin-animation' : ''} style={{ marginRight: '0.35rem' }} />
              Segarkan
            </button>
            <button className="btn btn-primary" onClick={handleCopySql}>
              {copiedSql ? <Check size={15} style={{ marginRight: '0.35rem' }} /> : <Copy size={15} style={{ marginRight: '0.35rem' }} />}
              {copiedSql ? 'SQL Tersalin!' : 'Salin SQL Migration'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Supabase Missing Notice (if not yet executed) */}
        {isTableMissing && (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, fontSize: '0.86rem', color: '#92400e' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>Tabel `public.login_logs` di Supabase Belum Dibuat</div>
              <div>
                Log login saat ini dicatat dan diamankan secara lokal di browser. Untuk mengaktifkan sinkronisasi cloud Supabase secara permanen, silakan salin script SQL di bawah dan jalankan di <strong>Supabase Dashboard &gt; SQL Editor</strong>.
              </div>
              <button 
                onClick={handleCopySql} 
                className="btn btn-sm" 
                style={{ marginTop: '0.5rem', background: '#d97706', color: '#fff', border: 'none', padding: '0.25rem 0.75rem' }}
              >
                {copiedSql ? '✓ Berhasil Disalin ke Clipboard' : '📋 Salin Script SQL Sekarang'}
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 600 }}>Total Login Hari Ini</span>
                <Clock size={16} className="text-muted" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#1e293b' }}>
                {stats.totalToday}
              </div>
              <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
                Dari {stats.totalHistory} rekaman riwayat
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 600 }}>Login Berhasil</span>
                <ShieldCheck size={16} style={{ color: '#10b981' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#059669' }}>
                {stats.successToday}
              </div>
              <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
                Akses terverifikasi normal
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 600 }}>Percobaan Gagal (Hari Ini)</span>
                <AlertTriangle size={16} style={{ color: '#ef4444' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#dc2626' }}>
                {stats.failedToday}
              </div>
              <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
                Potensi salah password / breach
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 600 }}>Akun Target Gagal Terbanyak</span>
                <User size={16} style={{ color: '#f59e0b' }} />
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.45rem', color: '#b45309', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {stats.topTargets?.[0] ? `${stats.topTargets[0].identifier} (${stats.topTargets[0].count}x)` : 'Tidak ada'}
              </div>
              <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
                Prioritaskan pemeriksaan akun ini
              </div>
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {[
                ['all', 'Semua Status'],
                ['failed', 'Gagal / Potensi Breach'],
                ['suspicious', 'Mencurigakan'],
                ['success', 'Sukses']
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`btn ${statusFilter === val ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  onClick={() => setStatusFilter(val)}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                >
                  {val === 'failed' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 5, display: 'inline-block' }} />}
                  {val === 'suspicious' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginRight: 5, display: 'inline-block' }} />}
                  {val === 'success' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 5, display: 'inline-block' }} />}
                  {label}
                </button>
              ))}
            </div>

            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 0.25rem' }} />

            {/* Role Filter */}
            <select
              className="form-input"
              style={{ width: 140, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="">Semua Role</option>
              <option value="student">Siswa</option>
              <option value="teacher">Guru</option>
              <option value="admin">Admin</option>
              <option value="officer">Officer</option>
            </select>

            {/* Search Box */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.82rem' }}
                placeholder="Cari username, nama siswa, IP, perangkat, atau alasan..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-gold btn-sm">
              Cari
            </button>
          </form>
        </div>

        {/* Logs Table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Waktu Akses</th>
                  <th>Akun / Username</th>
                  <th>Nama Pengguna</th>
                  <th style={{ width: '160px' }}>Status</th>
                  <th>Perangkat &amp; Browser</th>
                  <th>Alamat IP</th>
                  <th>Lokasi (~250m)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                      <div className="spinner" style={{ width: 26, height: 26, margin: '0 auto 0.5rem' }} />
                      <div className="text-muted text-xs">Memuat log autentikasi...</div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                      <ShieldCheck size={36} style={{ margin: '0 auto 0.5rem', color: '#94a3b8' }} />
                      <div style={{ fontWeight: 600, color: '#475569' }}>Tidak ada log login yang cocok</div>
                      <div className="text-muted text-xs" style={{ marginTop: '0.25rem' }}>
                        Cobalah mengubah filter pencarian atau segarkan data.
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const time = formatTime(log.created_at)
                    const isSuccess = log.status === 'success'
                    const isBreachRisk = !isSuccess || log.is_suspicious

                    return (
                      <tr
                        key={log.id}
                        style={{
                          background: isBreachRisk ? 'rgba(254, 242, 242, 0.5)' : undefined,
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Timestamp */}
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b' }}>
                            {time.relative}
                          </div>
                          <div className="text-muted text-xs" title={time.full} style={{ fontSize: '0.72rem' }}>
                            {time.full}
                          </div>
                        </td>

                        {/* Identifier & Role */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1b3361' }}>
                              {log.identifier}
                            </span>
                            {getRoleBadge(log.role, log.role_level)}
                          </div>

                          {/* Action Narrative, eg: "mikhail login at iPad Pro" */}
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.71rem',
                            color: isSuccess ? '#0369a1' : '#b91c1c',
                            background: isSuccess ? '#f0f9ff' : '#fef2f2',
                            border: `1px solid ${isSuccess ? '#bae6fd' : '#fecaca'}`,
                            padding: '0.12rem 0.45rem',
                            borderRadius: '4px',
                            marginTop: '0.25rem',
                            lineHeight: 1.25
                          }}>
                            <span>
                              <strong>{log.identifier}</strong> {isSuccess ? 'login at' : 'gagal login di'}{' '}
                              <strong style={{ color: isSuccess ? '#0c4a6e' : '#7f1d1d' }}>
                                {log.metadata?.deviceModel || log.device_name || 'Perangkat'}
                              </strong>
                            </span>
                          </div>

                          {log.is_suspicious && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              color: '#b45309',
                              background: '#fef3c7',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              marginTop: '0.2rem'
                            }}>
                              <AlertTriangle size={10} />
                              Mencurigakan / Potensi Breach
                            </div>
                          )}
                        </td>

                        {/* Full Name */}
                        <td>
                          <div style={{ fontSize: '0.84rem', fontWeight: 500, color: '#334155' }}>
                            {log.full_name || '—'}
                          </div>
                          {log.metadata?.kelas && (
                            <div className="text-muted text-xs">
                              Kelas: {log.metadata.kelas}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          {isSuccess ? (
                            <div>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: '#ecfdf5',
                                color: '#065f46',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px'
                              }}>
                                <ShieldCheck size={14} style={{ color: '#10b981' }} />
                                Login Sukses
                              </span>
                              {log.sync_status === 'scanning' ? (
                                <div style={{
                                  fontSize: '0.68rem',
                                  color: '#0284c7',
                                  marginTop: '0.25rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontWeight: 600
                                }}>
                                  <span className="spin-animation">⏳</span> Memindai (~10 mnt)...
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '0.2rem' }}>
                                  ✓ Terverifikasi
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: '#fef2f2',
                                color: '#991b1b',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px'
                              }}>
                                <ShieldAlert size={14} style={{ color: '#ef4444' }} />
                                Gagal
                              </span>
                              {log.failure_reason && (
                                <div style={{ fontSize: '0.72rem', color: '#b91c1c', marginTop: '0.25rem', maxWidth: '200px', lineHeight: 1.25 }}>
                                  {log.failure_reason}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Device Info */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: '8px',
                              background: log.metadata?.deviceType === 'Tablet' ? '#f5f3ff' : (log.metadata?.deviceType === 'Mobile' ? '#f0fdf4' : '#f8fafc'),
                              border: `1px solid ${log.metadata?.deviceType === 'Tablet' ? '#ddd6fe' : (log.metadata?.deviceType === 'Mobile' ? '#bbf7d0' : '#e2e8f0')}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {getDeviceIcon(log.metadata?.deviceType, 16)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                                {log.metadata?.deviceModel || log.device_name || 'Web Browser'}
                              </div>
                              <div className="text-muted text-xs" style={{ fontSize: '0.71rem', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '1px' }}>
                                <span>{log.metadata?.browser || 'Browser'}</span>
                                <span>•</span>
                                <span>{log.metadata?.os || 'OS'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* IP Address */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#334155' }}>
                              {log.ip_address || '—'}
                            </span>
                            {log.ip_address && (
                              <button
                                className="btn btn-ghost btn-xs"
                                style={{ padding: '0.15rem 0.35rem' }}
                                onClick={() => handleCopyIp(log.ip_address)}
                                title="Salin IP"
                              >
                                {copiedIp === log.ip_address ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Device Location (~250m Precision) */}
                        <td>
                          {log.location ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: '6px',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#16a34a',
                                flexShrink: 0
                              }}>
                                <MapPin size={13} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>
                                  {log.location}
                                </div>
                                <div style={{ fontSize: '0.67rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1px' }}>
                                  <span className="badge" style={{ padding: '0.05rem 0.3rem', fontSize: '0.64rem', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                                    {log.metadata?.location_precision || '±250m'}
                                  </span>
                                  <span>{log.metadata?.location_details?.method === 'geolocation_fuzzed' ? 'GPS/WiFi' : 'Network'}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                              <Clock size={11} />
                              <span>Verifikasi 1-5m...</span>
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="action-btn action-btn-result"
                            onClick={() => setSelectedLog(log)}
                            title="Lihat Detail Lengkap Autentikasi"
                          >
                            <Eye size={15} />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="modal-card" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={20} style={{ color: selectedLog.status === 'success' ? '#10b981' : '#ef4444' }} />
                <h3>Detail Audit Akses Login</h3>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setSelectedLog(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* Standout Narrative Banner: eg: "mikhail login at iPad Pro" */}
              <div style={{
                background: selectedLog.status === 'success' ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                border: `1px solid ${selectedLog.status === 'success' ? '#a7f3d0' : '#fecaca'}`,
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '10px',
                  background: selectedLog.status === 'success' ? '#10b981' : '#ef4444',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  {getDeviceIcon(selectedLog.metadata?.deviceType, 22)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: selectedLog.status === 'success' ? '#065f46' : '#991b1b' }}>
                    {selectedLog.identifier} {selectedLog.status === 'success' ? 'login at' : 'gagal login di'}{' '}
                    {selectedLog.metadata?.deviceModel || selectedLog.device_name || 'Perangkat'}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Waktu: {new Date(selectedLog.created_at).toLocaleString('id-ID')} • IP: {selectedLog.ip_address || '—'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.55rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <strong className="text-muted">Username / Akun:</strong>
                <div>
                  <span style={{ fontWeight: 700, color: '#1b3361' }}>{selectedLog.identifier}</span>
                  <span style={{ marginLeft: '0.5rem' }}>{getRoleBadge(selectedLog.role, selectedLog.role_level)}</span>
                </div>

                <strong className="text-muted">Nama Terdaftar:</strong>
                <div>{selectedLog.full_name || 'Tidak ditemukan / Belum terdaftar'}</div>

                <strong className="text-muted">Status Login:</strong>
                <div>
                  <span style={{
                    fontWeight: 700,
                    color: selectedLog.status === 'success' ? '#059669' : '#dc2626'
                  }}>
                    {selectedLog.status === 'success' ? '✓ BERHASIL' : '✕ GAGAL'}
                  </span>
                  {selectedLog.failure_reason && (
                    <div style={{ color: '#b91c1c', marginTop: '0.2rem' }}>{selectedLog.failure_reason}</div>
                  )}
                </div>

                <strong className="text-muted">Nama / Model Perangkat:</strong>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedLog.metadata?.deviceModel || selectedLog.device_name || '—'}
                  </span>
                  {selectedLog.metadata?.deviceNickname && (
                    <span className="badge" style={{ marginLeft: '0.4rem', background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem' }}>
                      Custom Nickname
                    </span>
                  )}
                </div>

                <strong className="text-muted">Kategori Perangkat:</strong>
                <div>
                  {selectedLog.metadata?.deviceType || 'Desktop'}
                  {selectedLog.metadata?.screen && <span className="text-muted text-xs" style={{ marginLeft: '0.4rem' }}>({selectedLog.metadata.screen})</span>}
                </div>

                <strong className="text-muted">Sistem Operasi &amp; Browser:</strong>
                <div>
                  {selectedLog.metadata?.browser || 'Browser'} on {selectedLog.metadata?.os || 'OS'}
                </div>

                <strong className="text-muted">Waktu Akses:</strong>
                <div>{new Date(selectedLog.created_at).toLocaleString('id-ID')}</div>

                <strong className="text-muted">Alamat IP:</strong>
                <div style={{ fontFamily: 'monospace' }}>{selectedLog.ip_address || 'Tidak terdeteksi'}</div>

                <strong className="text-muted">Lokasi Perangkat:</strong>
                <div>
                  {selectedLog.location ? (
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <MapPin size={15} color="#0284c7" />
                        <span>{selectedLog.location}</span>
                        <span className="badge badge-active" style={{ fontSize: '0.68rem' }}>
                          Presisi {selectedLog.metadata?.location_precision || '200-300m'}
                        </span>
                      </div>
                      {selectedLog.metadata?.location_details?.coordinates && (
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                          Koordinat Fuzzed: {selectedLog.metadata.location_details.coordinates.lat}, {selectedLog.metadata.location_details.coordinates.lng} (Taksiran Radius ±{selectedLog.metadata.location_details.coordinates.accuracyMeters || 250}m)
                        </div>
                      )}
                      {selectedLog.metadata?.location_details?.coordinates && (
                        <a
                          href={`https://www.google.com/maps?q=${selectedLog.metadata.location_details.coordinates.lat},${selectedLog.metadata.location_details.coordinates.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-xs"
                          style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb' }}
                        >
                          <ExternalLink size={12} /> Buka Taksiran Area di Google Maps
                        </a>
                      )}
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                        * Diverifikasi secara pasif &amp; perlahan 1-5 menit setelah ujian dimulai agar tidak mencurigakan
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted">Sedang diverifikasi secara bertahap saat ujian berlangsung (1-5 menit)...</span>
                  )}
                </div>

                <strong className="text-muted">Kartu Grafis (GPU):</strong>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                  {selectedLog.metadata?.hardware?.gpuRenderer || selectedLog.metadata?.hardware?.cleanGpu || 'Standar / Terintegrasi'}
                </div>

                <strong className="text-muted">Prosesor &amp; RAM:</strong>
                <div>
                  {selectedLog.metadata?.hardware?.cpuCores ? `${selectedLog.metadata.hardware.cpuCores} Logical Cores` : '—'}
                  {selectedLog.metadata?.hardware?.ramGb ? ` • ${selectedLog.metadata.hardware.ramGb} GB RAM` : ''}
                </div>

                <strong className="text-muted">Status Scan Telemetri:</strong>
                <div>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: selectedLog.sync_status === 'scanning' ? '#0284c7' : '#059669',
                    background: selectedLog.sync_status === 'scanning' ? '#e0f2fe' : '#ecfdf5',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px'
                  }}>
                    {selectedLog.metadata?.scan_stage || (selectedLog.sync_status === 'scanning' ? '⏳ Sedang Memindai (~10 mnt)' : '✓ Terverifikasi Lengkap')}
                  </span>
                </div>

                <strong className="text-muted">Potensi Breach:</strong>
                <div>
                  {selectedLog.is_suspicious ? (
                    <span style={{ color: '#b45309', fontWeight: 700 }}>
                      ⚠️ Terindikasi Mencurigakan (Percobaan Login Ilegal / Pola Gagal)
                    </span>
                  ) : (
                    <span style={{ color: '#059669' }}>Normal</span>
                  )}
                </div>
              </div>

              {/* Technical User-Agent */}
              <div>
                <strong className="text-muted" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                  User Agent Header Lengkap:
                </strong>
                <pre style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0
                }}>
                  {selectedLog.user_agent || '—'}
                </pre>
              </div>

              {/* Action: Quick Filter by this Account */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setSearch(selectedLog.identifier)
                    setSelectedLog(null)
                    loadData()
                  }}
                >
                  <Search size={14} style={{ marginRight: '0.35rem' }} />
                  Filter Semua Riwayat Akun Ini
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Nickname Modal */}
      {nicknameModal && (
        <div className="modal-backdrop" onClick={() => setNicknameModal(false)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={18} style={{ color: '#0284c7' }} />
                <h3>Atur Nama Perangkat Anda</h3>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setNicknameModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveNickname}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                  Beri nama atau label khusus untuk perangkat yang Anda gunakan saat ini. Nama ini akan otomatis dicatat setiap kali Anda login (misal: <em>iPad Pro Mikhail</em>, <em>Tab Siswa 1</em>, dll).
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Nama / Label Perangkat:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={nicknameInput}
                    onChange={e => setNicknameInput(e.target.value)}
                    placeholder="cth: iPad Pro Mikhail"
                    autoFocus
                  />
                </div>
                <div className="text-muted text-xs">
                  Model terdeteksi: <strong>{currentDevice?.deviceModel || 'Komputer'}</strong>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.75rem 1rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNicknameModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary btn-sm">Simpan Nama</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

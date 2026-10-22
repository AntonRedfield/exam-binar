import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exams } from '../../lib/db'
import { getCurrentUser } from '../../lib/auth'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { getExamTokenInfo } from '../../lib/returnee'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../../lib/monitoringUI'
import {
  Activity,
  Users,
  Lock,
  AlertTriangle,
  Search,
  RefreshCw,
  Play,
  BarChart2,
  Clock,
  ShieldCheck,
  Zap,
  ArrowRight,
  BookOpen,
  Filter
} from 'lucide-react'

export default function ActiveMonitorHub() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = getCurrentUser()
  const isAdmin = currentUser?.level === 4 || currentUser?.role === 'SUPERADMIN' || currentUser?.dbRole === 'admin' || currentUser?.role === 'admin'
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/teacher'

  const [examList, setExamList] = useState([])
  const [sessionStatsMap, setSessionStatsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterTab, setFilterTab] = useState('active') // 'active' | 'mine' | 'all'
  const [search, setSearch] = useState('')

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true)
    try {
      // 1. Load all exams
      const { data: allExams } = await exams.list()
      const exList = allExams || []
      setExamList(exList)

      // 2. Fetch live active session metrics across all exams
      if (isSupabaseConfigured && supabase) {
        const { data: sessData, error: sessErr } = await supabase
          .from('exam_sessions')
          .select('id, exam_id, status, returnee_token_required, selfie_status, selfie_image')

        if (!sessErr && sessData) {
          const statsMap = {}
          for (const s of sessData) {
            if (!statsMap[s.exam_id]) {
              statsMap[s.exam_id] = { total: 0, active: 0, returnees: 0, unverifiedSelfies: 0 }
            }
            statsMap[s.exam_id].total += 1
            if (s.status === 'active') {
              statsMap[s.exam_id].active += 1
            }
            if (s.returnee_token_required) {
              statsMap[s.exam_id].returnees += 1
            }
            if (s.status !== 'reset' && (s.selfie_status === 'missing' || (!s.selfie_image && s.selfie_status !== 'teacher_confirmed'))) {
              statsMap[s.exam_id].unverifiedSelfies += 1
            }
          }
          setSessionStatsMap(statsMap)
        }
      }
    } catch (err) {
      console.warn('[ActiveMonitorHub] Error loading active exam monitoring data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Auto-refresh every 10 seconds for real-time peer monitoring
    const intervalId = setInterval(() => {
      loadData(true)
    }, 10000)
    return () => clearInterval(intervalId)
  }, [loadData])

  // Aggregate global counts
  const publishedExams = useMemo(() => examList.filter(e => e.status === 'published' && e.mode !== 'survey'), [examList])
  const myExams = useMemo(() => examList.filter(e => e.created_by === currentUser?.id), [examList, currentUser?.id])

  const totalActiveStudents = useMemo(() => {
    return publishedExams.reduce((acc, ex) => acc + (sessionStatsMap[ex.id]?.active || 0), 0)
  }, [publishedExams, sessionStatsMap])

  const totalReturneesNeedHelp = useMemo(() => {
    return publishedExams.reduce((acc, ex) => acc + (sessionStatsMap[ex.id]?.returnees || 0), 0)
  }, [publishedExams, sessionStatsMap])

  const totalUnverifiedSelfies = useMemo(() => {
    return publishedExams.reduce((acc, ex) => acc + (sessionStatsMap[ex.id]?.unverifiedSelfies || 0), 0)
  }, [publishedExams, sessionStatsMap])

  // Filtered exams according to active tab and search
  const filteredExams = useMemo(() => {
    let list = examList.filter(e => e.mode !== 'survey')

    if (filterTab === 'active') {
      list = list.filter(e => e.status === 'published')
    } else if (filterTab === 'mine') {
      list = list.filter(e => e.created_by === currentUser?.id)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.users?.name?.toLowerCase().includes(q) ||
        e.created_by?.toLowerCase().includes(q) ||
        e.target_kelas?.toLowerCase().includes(q)
      )
    }

    // Auto-sort: Active exams always appear at top, then sorted by most recent date descending
    list.sort((a, b) => {
      const pA = a.status === 'published' ? 1 : 2
      const pB = b.status === 'published' ? 1 : 2
      if (pA !== pB) return pA - pB
      const dateA = new Date(a.created_at || a.updated_at || 0).getTime()
      const dateB = new Date(b.created_at || b.updated_at || 0).getTime()
      return dateB - dateA
    })

    return list
  }, [examList, filterTab, search, currentUser?.id])

  return (
    <div className="page-container">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#fff',
                padding: '0.45rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
              }}>
                <Activity size={22} />
              </div>
              <h2 style={{ margin: 0 }}>Pusat Pengawasan Ujian Aktif (Live Monitor)</h2>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: '0.35rem', maxWidth: 850 }}>
              Pantau seluruh ujian yang sedang berlangsung secara real-time. Seluruh guru memiliki akses pengawasan bersama (<strong>peer monitoring &amp; backup pengawas</strong>) untuk membantu rekan guru merilis token returnee, perpanjangan waktu, atau verifikasi kehadiran fisik siswa.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => loadData(false)}
              disabled={refreshing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin-animation' : ''} />
              <span>{refreshing ? 'Memperbarui...' : 'Segarkan Data'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* ── Peer Monitoring Announcement Banner ─────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1px solid #bbf7d0',
          borderRadius: '10px',
          padding: '0.85rem 1.15rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: '#10b981',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#065f46' }}>
                Mode Pengawasan Bersama (Peer-to-Peer Backup) Aktif
              </div>
              <div style={{ fontSize: '0.76rem', color: '#047857', marginTop: '1px' }}>
                Anda dapat masuk ke ruang monitor ujian milik guru lain untuk membantu memantau, merilis token returnee, dan menambah waktu ujian.
              </div>
            </div>
          </div>
          <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>
            ● Auto-Refresh 10 Detik
          </span>
        </div>

        {/* ── Summary Stats Cards ────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Ujian Aktif Berlangsung</span>
              <Activity size={16} style={{ color: '#10b981' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#065f46' }}>
              {publishedExams.length}
            </div>
            <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
              Dapat dipantau oleh seluruh guru
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Siswa Sedang Ujian</span>
              <Users size={16} style={{ color: '#0284c7' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#0369a1' }}>
              {totalActiveStudents}
            </div>
            <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
              Total sesi aktif di seluruh ruangan
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', borderLeft: totalReturneesNeedHelp > 0 ? '4px solid #ef4444' : '4px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Perlu Bantuan Token</span>
              <Lock size={16} style={{ color: totalReturneesNeedHelp > 0 ? '#ef4444' : '#64748b' }} />
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              marginTop: '0.35rem',
              color: totalReturneesNeedHelp > 0 ? '#dc2626' : '#64748b'
            }}>
              {totalReturneesNeedHelp}
            </div>
            <div style={{ fontSize: '0.72rem', marginTop: '0.2rem', color: totalReturneesNeedHelp > 0 ? '#b91c1c' : '#64748b', fontWeight: totalReturneesNeedHelp > 0 ? 600 : 400 }}>
              {totalReturneesNeedHelp > 0 ? '⚠️ Siswa terkunci (butuh token)' : 'Tidak ada siswa terkunci'}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted text-xs" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Verifikasi Fisik (Anti-Joki)</span>
              <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#b45309' }}>
              {totalUnverifiedSelfies}
            </div>
            <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
              Siswa tanpa kamera butuh konfirmasi
            </div>
          </div>
        </div>

        {/* ── Filter Tabs & Search ──────────────────────────────────── */}
        <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${filterTab === 'active' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterTab('active')}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 6, display: 'inline-block' }} />
                Semua Ujian Aktif ({publishedExams.length})
              </button>

              <button
                type="button"
                className={`btn btn-sm ${filterTab === 'mine' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterTab('mine')}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                <BookOpen size={13} style={{ marginRight: 5 }} />
                Ujian Saya ({myExams.length})
              </button>

              <button
                type="button"
                className={`btn btn-sm ${filterTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterTab('all')}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                <Filter size={13} style={{ marginRight: 5 }} />
                Semua Ujian ({examList.filter(e => e.mode !== 'survey').length})
              </button>
            </div>

            <div style={{ position: 'relative', minWidth: 220, flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.82rem' }}
                placeholder="Cari judul ujian, nama guru, kelas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Active Exams Cards List ───────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 0.75rem' }} />
            <div className="text-muted text-sm">Memuat daftar ujian aktif...</div>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="card text-center" style={{ padding: '3.5rem 1.5rem', maxWidth: 600, margin: '2rem auto' }}>
            <Activity size={42} style={{ color: '#94a3b8', margin: '0 auto 0.75rem' }} />
            <h3 style={{ marginBottom: '0.5rem', color: '#1e293b' }}>
              {filterTab === 'active' ? 'Tidak Ada Ujian yang Sedang Aktif' : 'Tidak Ada Ujian Ditemukan'}
            </h3>
            <p className="text-muted text-sm" style={{ marginBottom: '1.5rem', maxWidth: 450, margin: '0 auto 1.5rem' }}>
              {filterTab === 'active'
                ? 'Saat ini belum ada ujian yang sedang berlangsung (published). Begitu ada ujian yang dipublikasikan oleh Anda atau rekan guru, ruang pengawasan akan langsung muncul di sini.'
                : 'Coba ubah kata kunci pencarian atau beralih ke tab Semua Ujian.'}
            </p>
            {filterTab === 'active' ? (
              <button className="btn btn-primary btn-sm" onClick={() => setFilterTab('all')}>
                Tampilkan Semua Riwayat Ujian
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterTab('active'); }}>
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {filteredExams.map(exam => {
              const stats = sessionStatsMap[exam.id] || { total: 0, active: 0, returnees: 0, unverifiedSelfies: 0 }
              const isLive = exam.status === 'published'
              const isMine = exam.created_by === currentUser?.id
              const teacherName = exam.users?.name || exam.profiles?.display_name || exam.created_by_name || exam.created_by || 'Guru Pengampu'
              const tokenInfo = getExamTokenInfo(exam)

              return (
                <div
                  key={exam.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    border: isLive ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                    borderTop: isLive ? '4px solid #10b981' : '4px solid #94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isLive ? '0 4px 16px rgba(16, 185, 129, 0.08)' : '0 2px 6px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {isLive ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px'
                          }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} className="spin-animation" />
                            LIVE AKTIF
                          </span>
                        ) : (
                          <span className={`badge badge-${exam.status === 'closed' ? 'closed' : 'draft'}`} style={{ fontSize: '0.72rem' }}>
                            {exam.status === 'closed' ? 'TUTUP' : 'DRAFT'}
                          </span>
                        )}

                        <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.7rem' }}>
                          {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'}
                        </span>

                        {exam.monitoring_level && (
                          <span style={getMonitoringBadgeStyle(exam.monitoring_level)}>
                            <MonitoringIcon level={exam.monitoring_level} size={12} />
                            Lv.{exam.monitoring_level}
                          </span>
                        )}
                      </div>

                      {/* Peer Proctor Tag */}
                      {isMine ? (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: '#fef3c7',
                          color: '#92400e',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px'
                        }}>
                          👤 Ujian Anda
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}>
                          <Users size={11} /> Peer / Cadangan
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: '#0f172a', lineHeight: 1.35 }}>
                      {exam.title}
                    </h3>

                    {/* Sub-info: Teacher & Classes */}
                    <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.85rem' }}>
                      <div>
                        Guru Pengampu: <strong style={{ color: '#334155' }}>{teacherName}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span>
                          Target: <strong>{!exam.target_kelas || exam.target_kelas === 'all' ? 'Semua Kelas' : `Kelas ${exam.target_kelas.split(',').join(', ')}`}</strong>
                        </span>
                        <span>•</span>
                        <span>Durasi: <strong>{exam.mode === 'quiz' ? 'Timer per soal' : `${exam.duration_minutes || 60} menit`}</strong></span>
                      </div>
                    </div>

                    {/* Live Metric Pills */}
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      textAlign: 'center',
                      marginBottom: '1rem'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                          Siswa Aktif
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7', marginTop: '1px' }}>
                          {stats.active}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                          Butuh Token
                        </div>
                        <div style={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: stats.returnees > 0 ? '#dc2626' : '#64748b',
                          marginTop: '1px'
                        }}>
                          {stats.returnees > 0 ? `⚠️ ${stats.returnees}` : '0'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                          Selesai
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginTop: '1px' }}>
                          {Math.max(0, stats.total - stats.active)}
                        </div>
                      </div>
                    </div>

                    {/* Returnee Token Status Pill */}
                    {isLive && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: tokenInfo.token && !tokenInfo.isExpired ? '#f0fdf4' : '#fffbeb',
                        border: `1px solid ${tokenInfo.token && !tokenInfo.isExpired ? '#bbf7d0' : '#fef3c7'}`,
                        borderRadius: '6px',
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.74rem',
                        marginBottom: '1rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Lock size={12} style={{ color: tokenInfo.token && !tokenInfo.isExpired ? '#16a34a' : '#d97706' }} />
                          <span style={{ color: '#475569' }}>Token Ujian:</span>
                          <strong style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#0f172a' }}>
                            {tokenInfo.token || 'Belum dibuat'}
                          </strong>
                        </div>
                        {tokenInfo.token && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: tokenInfo.isExpired ? '#dc2626' : '#15803d' }}>
                            {tokenInfo.isExpired ? 'Waktu Habis' : `Aktif (${Math.floor(tokenInfo.remainingSeconds / 60)}m ${tokenInfo.remainingSeconds % 60}s)`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate(`${basePath}/monitor/${exam.id}`)}
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        background: isLive ? 'linear-gradient(135deg, #059669, #10b981)' : '#1b3361',
                        border: 'none',
                        color: '#ffffff',
                        fontWeight: 700,
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        boxShadow: isLive ? '0 2px 8px rgba(16, 185, 129, 0.25)' : undefined
                      }}
                    >
                      <Activity size={15} />
                      <span>{isLive ? 'Masuk Ruang Monitor' : 'Buka Monitor'}</span>
                      <ArrowRight size={13} />
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`${basePath}/results/${exam.id}`)}
                      title="Lihat Hasil Nilai Siswa"
                      style={{ padding: '0.45rem 0.65rem' }}
                    >
                      <BarChart2 size={15} />
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/exam/${exam.id}/lobby`)}
                      title="Pratinjau Ujian Siswa"
                      style={{ padding: '0.45rem 0.65rem' }}
                    >
                      <Play size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

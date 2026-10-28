import { useState, useMemo } from 'react'
import {
  X,
  Sliders,
  Check,
  RotateCcw,
  Printer,
  FileDown,
  Sparkles,
  TrendingUp,
  Search,
  ShieldCheck,
  Award,
  Users,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { formatScore, roundScore } from '../../lib/format'
import {
  calculateStudentExtraScore,
  calculateClassExtraStats,
  DEFAULT_EXTRA_SCORING_CONFIG,
  getExtraSummaryLabel
} from '../../lib/extraScoring'

export default function ExtraScoringModal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  resultsList = [],
  totalExamMaxScore = 0,
  essayEdits = {},
  passingGrade = 60,
  onTriggerPrint,
  onTriggerDownloadPdf,
  examTitle = 'Ujian'
}) {
  if (!isOpen) return null

  // Local working copy of configuration
  const [draftConfig, setDraftConfig] = useState(() => ({
    ...DEFAULT_EXTRA_SCORING_CONFIG,
    ...(config || {}),
    studentOverrides: { ...(config?.studentOverrides || {}) }
  }))

  const [searchTerm, setSearchTerm] = useState('')

  // Context for calculations
  const context = useMemo(() => ({
    totalExamMaxScore,
    essayEdits,
    passingGrade
  }), [totalExamMaxScore, essayEdits, passingGrade])

  // Class comparison stats based on draftConfig
  const stats = useMemo(() => {
    return calculateClassExtraStats(resultsList, draftConfig, context)
  }, [resultsList, draftConfig, context])

  // Process all students with their calculated preview
  const studentRows = useMemo(() => {
    const fullContext = {
      ...context,
      classMinScore: stats.classMinScore,
      classMaxScore: stats.classMaxScore
    }
    return resultsList.map((r, idx) => {
      const calc = calculateStudentExtraScore(r, draftConfig, fullContext)
      const name = r.users?.full_name || r.student?.full_name || r.users?.name || r.student?.name || (r.student_id ? `Siswa (${r.student_id.slice(0, 8)})` : 'Siswa')
      const kelas = r.users?.classes?.name || r.users?.kelas || r.users?.class_section || r.student?.kelas || '—'
      const studentKey = r.student_id || r.id
      return {
        ...r,
        studentKey,
        studentName: name,
        studentClass: kelas,
        originalIndex: idx + 1,
        calc
      }
    })
  }, [resultsList, draftConfig, context, stats.classMinScore, stats.classMaxScore])

  // Filter students by search term
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return studentRows
    const term = searchTerm.toLowerCase()
    return studentRows.filter(s =>
      s.studentName.toLowerCase().includes(term) ||
      s.studentClass.toLowerCase().includes(term)
    )
  }, [studentRows, searchTerm])

  function handleModeChange(newMode) {
    setDraftConfig(prev => ({
      ...prev,
      mode: newMode
    }))
  }

  function handleStudentOverride(studentKey, valStr) {
    setDraftConfig(prev => {
      const overrides = { ...prev.studentOverrides }
      if (valStr === '' || valStr === null || valStr === undefined) {
        delete overrides[studentKey]
      } else {
        const num = parseFloat(valStr)
        overrides[studentKey] = isNaN(num) ? 0 : num
      }
      return {
        ...prev,
        studentOverrides: overrides
      }
    })
  }

  function handleResetAllOverrides() {
    setDraftConfig(prev => ({
      ...prev,
      studentOverrides: {}
    }))
  }

  function handleResetEntireConfig() {
    if (window.confirm('Reset seluruh konfigurasi nilai ekstra kembali ke pengaturan standar (tanpa nilai ekstra)?')) {
      const fresh = { ...DEFAULT_EXTRA_SCORING_CONFIG, enabled: false }
      setDraftConfig(fresh)
      onSaveConfig(fresh)
      onClose()
    }
  }

  function handleSaveAndClose() {
    onSaveConfig(draftConfig)
    onClose()
  }

  function handleApplyAndPrint() {
    onSaveConfig(draftConfig)
    onClose()
    if (onTriggerPrint) {
      setTimeout(() => onTriggerPrint(), 150)
    }
  }

  function handleApplyAndDownloadPdf() {
    onSaveConfig(draftConfig)
    onClose()
    if (onTriggerDownloadPdf) {
      setTimeout(() => onTriggerDownloadPdf(draftConfig), 150)
    }
  }

  const summaryLabel = getExtraSummaryLabel(draftConfig)

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 960,
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* ─── Modal Header ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(217, 119, 6, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                  Fungsi Nilai Ekstra (Cetak & Unduh PDF)
                </h3>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 999,
                    background: draftConfig.enabled ? '#059669' : '#475569',
                    color: '#ffffff'
                  }}
                >
                  <ShieldCheck size={12} />
                  {draftConfig.enabled ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                Atur penyesuaian nilai resmi untuk lembar cetak atau dokumen PDF — <strong style={{ color: '#38bdf8' }}>nilai asli di database tetap tersimpan murni</strong>.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{
              color: '#94a3b8',
              borderRadius: '50%',
              padding: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ─── Modal Scrollable Body ───────────────────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            background: 'var(--bg-main, #f8fafc)'
          }}
        >
          {/* Master Toggle Banner */}
          <div
            style={{
              background: draftConfig.enabled
                ? 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)'
                : '#ffffff',
              border: draftConfig.enabled ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: draftConfig.enabled ? '#d97706' : '#94a3b8',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Sliders size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.98rem', color: draftConfig.enabled ? '#92400e' : '#1e293b' }}>
                  {draftConfig.enabled
                    ? 'Fitur Nilai Ekstra Siap Diterapkan untuk Cetak & PDF'
                    : 'Fitur Nilai Ekstra Sedang Nonaktif'}
                </div>
                <div style={{ fontSize: '0.82rem', color: draftConfig.enabled ? '#b45309' : '#64748b', marginTop: '0.15rem' }}>
                  {draftConfig.enabled
                    ? `Metode aktif: ${summaryLabel}. Dokumen cetak & PDF akan menggunakan nilai penyesuaian.`
                    : 'Dokumen cetak dan PDF akan menampilkan nilai asli murni tanpa penambahan.'}
                </div>
              </div>
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                userSelect: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                color: draftConfig.enabled ? '#92400e' : '#475569'
              }}
            >
              <input
                type="checkbox"
                checked={draftConfig.enabled}
                onChange={e => setDraftConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                style={{
                  width: 22,
                  height: 22,
                  cursor: 'pointer',
                  accentColor: '#d97706'
                }}
              />
              Aktifkan
            </label>
          </div>

          {/* Mode Selector Tabs */}
          <div
            style={{
              opacity: draftConfig.enabled ? 1 : 0.6,
              pointerEvents: draftConfig.enabled ? 'auto' : 'none',
              transition: 'opacity 0.2s ease'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.5rem' }}>
              Pilih Metode Penambahan / Katrol Nilai:
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '0.75rem'
              }}
            >
              {/* Option 1: Flat */}
              <div
                onClick={() => handleModeChange('flat')}
                style={{
                  background: draftConfig.mode === 'flat' ? '#eff6ff' : '#ffffff',
                  border: draftConfig.mode === 'flat' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: draftConfig.mode === 'flat' ? '#1e40af' : '#1e293b' }}>
                    1. Bonus Poin Tetap
                  </span>
                  {draftConfig.mode === 'flat' && <Check size={18} color="#2563eb" />}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                  Tambah poin flat sama rata (misal: +5 atau +10 poin) ke seluruh siswa.
                </p>
              </div>

              {/* Option 2: Percentage */}
              <div
                onClick={() => handleModeChange('percentage')}
                style={{
                  background: draftConfig.mode === 'percentage' ? '#f0fdf4' : '#ffffff',
                  border: draftConfig.mode === 'percentage' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: draftConfig.mode === 'percentage' ? '#15803d' : '#1e293b' }}>
                    2. Persentase Bonus
                  </span>
                  {draftConfig.mode === 'percentage' && <Check size={18} color="#16a34a" />}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                  Kenaikan proporsional +X% dari perolehan nilai asli siswa.
                </p>
              </div>

              {/* Option 3: Linear Scale */}
              <div
                onClick={() => handleModeChange('linear_scale')}
                style={{
                  background: draftConfig.mode === 'linear_scale' ? '#faf5ff' : '#ffffff',
                  border: draftConfig.mode === 'linear_scale' ? '2px solid #9333ea' : '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: draftConfig.mode === 'linear_scale' ? '#7e22ce' : '#1e293b' }}>
                    3. Katrol Kurva Linear
                  </span>
                  {draftConfig.mode === 'linear_scale' && <Check size={18} color="#9333ea" />}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                  Rentang nilai terendah diangkat ke target KKM, nilai tertinggi ke 100.
                </p>
              </div>

              {/* Option 4: Custom */}
              <div
                onClick={() => handleModeChange('custom')}
                style={{
                  background: draftConfig.mode === 'custom' ? '#fff7ed' : '#ffffff',
                  border: draftConfig.mode === 'custom' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: draftConfig.mode === 'custom' ? '#c2410c' : '#1e293b' }}>
                    4. Kustom per Siswa
                  </span>
                  {draftConfig.mode === 'custom' && <Check size={18} color="#ea580c" />}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                  Beri poin bonus secara mandiri untuk tiap siswa pada tabel di bawah.
                </p>
              </div>
            </div>

            {/* Parameter Controls for Active Mode */}
            <div
              style={{
                marginTop: '1rem',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem'
              }}
            >
              {draftConfig.mode === 'flat' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.2rem' }}>
                        Besaran Tambahan Poin Tetap:
                      </label>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Misal +5 poin: Siswa bernilai 65 otomatis menjadi 70 pada dokumen cetak/PDF.
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {[2, 5, 7.5, 10, 15].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setDraftConfig(prev => ({ ...prev, flatBonus: preset }))}
                          style={{
                            background: Number(draftConfig.flatBonus) === preset ? '#2563eb' : '#f1f5f9',
                            color: Number(draftConfig.flatBonus) === preset ? '#ffffff' : '#334155',
                            fontWeight: 700,
                            borderRadius: 6
                          }}
                        >
                          +{preset}
                        </button>
                      ))}

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#2563eb' }}>+</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          className="form-input"
                          style={{ width: 80, textAlign: 'center', fontWeight: 800, fontSize: '0.95rem' }}
                          value={draftConfig.flatBonus}
                          onChange={e => setDraftConfig(prev => ({ ...prev, flatBonus: e.target.value }))}
                        />
                        <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Poin</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {draftConfig.mode === 'percentage' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.2rem' }}>
                        Persentase Kenaikan Nilai:
                      </label>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Misal +10%: Nilai 70 naik menjadi 77 pada lembar cetak.
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {[5, 10, 15, 20].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setDraftConfig(prev => ({ ...prev, percentageBoost: pct }))}
                          style={{
                            background: Number(draftConfig.percentageBoost) === pct ? '#16a34a' : '#f1f5f9',
                            color: Number(draftConfig.percentageBoost) === pct ? '#ffffff' : '#334155',
                            fontWeight: 700,
                            borderRadius: 6
                          }}
                        >
                          +{pct}%
                        </button>
                      ))}

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>+</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          className="form-input"
                          style={{ width: 80, textAlign: 'center', fontWeight: 800, fontSize: '0.95rem' }}
                          value={draftConfig.percentageBoost}
                          onChange={e => setDraftConfig(prev => ({ ...prev, percentageBoost: e.target.value }))}
                        />
                        <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {draftConfig.mode === 'linear_scale' && (
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                    Target Rentang Katrol Nilai (Min & Maks Target):
                  </label>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Nilai terendah di kelas ({formatScore(stats.classMinScore)}%) akan diangkat ke target batas minimum, dan nilai tertinggi ({formatScore(stats.classMaxScore)}%) ke target batas maksimum secara linear.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Target Terendah (KKM):</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 85, textAlign: 'center', fontWeight: 700 }}
                        value={draftConfig.scaleMin}
                        onChange={e => setDraftConfig(prev => ({ ...prev, scaleMin: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Target Tertinggi:</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 85, textAlign: 'center', fontWeight: 700 }}
                        value={draftConfig.scaleMax}
                        onChange={e => setDraftConfig(prev => ({ ...prev, scaleMax: Number(e.target.value) || 100 }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {draftConfig.mode === 'custom' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                      Silakan ketikkan nominal tambahan poin (+ / -) langsung pada kolom <strong>&ldquo;Poin Ekstra&rdquo;</strong> di tabel siswa di bawah.
                    </div>
                    {Object.keys(draftConfig.studentOverrides || {}).length > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleResetAllOverrides}
                        style={{ color: '#dc2626', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <RotateCcw size={13} /> Reset Semua Poin Kustom ({Object.keys(draftConfig.studentOverrides).length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Extra Settings Checkboxes */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  marginTop: '0.85rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid #f1f5f9',
                  flexWrap: 'wrap',
                  fontSize: '0.82rem',
                  color: '#475569'
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={draftConfig.capMax100}
                    onChange={e => setDraftConfig(prev => ({ ...prev, capMax100: e.target.checked }))}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Batasi nilai maksimal tidak melebihi 100
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={draftConfig.showInTable}
                    onChange={e => setDraftConfig(prev => ({ ...prev, showInTable: e.target.checked }))}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Tampilkan kolom Nilai Ekstra di tabel layar (pratinjau)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={draftConfig.includeUnattempted}
                    onChange={e => setDraftConfig(prev => ({ ...prev, includeUnattempted: e.target.checked }))}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Terapkan juga ke siswa yang tidak hadir / belum ujian
                </label>
              </div>
            </div>
          </div>

          {/* ─── Real-Time Class Impact Summary ────────────────────── */}
          {draftConfig.enabled && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem'
              }}
            >
              {/* Rata-Rata Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '0.85rem 1rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                  RATA-RATA KELAS
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                    {stats.adjustedAvgStr}%
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    (Asli: {stats.origAvgStr}%)
                  </span>
                </div>
                {roundScore(stats.adjustedAvg - stats.origAvg) !== 0 && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', marginTop: '0.2rem' }}>
                    ▲ +{roundScore(stats.adjustedAvg - stats.origAvg)}%
                  </div>
                )}
              </div>

              {/* Lulus KKM Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '0.85rem 1rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                  KELULUSAN (KKM {passingGrade})
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                    {stats.adjustedPassCount} Siswa
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    (Asli: {stats.origPassCount})
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.2rem' }}>
                  Belum Lulus: {stats.adjustedFailCount} siswa
                </div>
              </div>

              {/* Siswa Terbantu Lulus Card */}
              <div
                style={{
                  background: stats.newlyPassedCount > 0 ? '#f0fdf4' : '#ffffff',
                  border: stats.newlyPassedCount > 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '0.85rem 1rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: stats.newlyPassedCount > 0 ? '#15803d' : '#64748b' }}>
                  SISWA TERBANTU LULUS
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.newlyPassedCount > 0 ? '#16a34a' : '#64748b' }}>
                    +{stats.newlyPassedCount} Siswa
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  {stats.newlyPassedCount > 0
                    ? '🎉 Melampaui KKM berkat nilai ekstra'
                    : 'Tidak ada perubahan status kelulusan'}
                </div>
              </div>

              {/* Rentang Nilai Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '0.85rem 1rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                  SEBARAN MIN - MAKS
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>
                    {formatScore(stats.adjustedMinScore)} - {formatScore(stats.adjustedMaxScore)}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Asli: {formatScore(stats.classMinScore)} - {formatScore(stats.classMaxScore)}
                </div>
              </div>
            </div>
          )}

          {/* ─── Student Live Preview Table ───────────────────────────── */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div
              style={{
                padding: '0.85rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                background: '#f8fafc'
              }}
            >
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b' }}>
                  Pratinjau Nilai Siswa ({filteredRows.length} siswa)
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.5rem' }}>
                  (Anda juga dapat memasukkan poin bonus khusus per siswa di kolom Poin Ekstra)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Cari siswa atau kelas..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                      padding: '0.35rem 0.65rem 0.35rem 2rem',
                      fontSize: '0.82rem',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      width: 200
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 45 }}>No</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Nama Siswa</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 90 }}>Kelas</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 95 }}>Nilai Asli</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 130 }}>
                      Poin Ekstra (+)
                    </th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 120 }}>
                      Nilai Cetak/PDF
                    </th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: 110 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        Tidak ada siswa yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((s, idx) => {
                      const isUnat = s.calc.isUnattempted
                      const currentOverride = draftConfig.studentOverrides?.[s.studentKey]
                      const hasIndividualOverride = currentOverride !== undefined && currentOverride !== null && currentOverride !== ''

                      return (
                        <tr
                          key={s.id || s.studentKey || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isUnat
                              ? '#fff5f5'
                              : (s.calc.statusChanged ? '#f0fdf4' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'))
                          }}
                        >
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem', color: '#64748b', fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <div style={{ fontWeight: 600, color: isUnat ? '#b91c1c' : '#0f172a' }}>
                              {s.studentName}
                            </div>
                            {s.users?.username && (
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                @{s.users.username}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem', color: '#475569' }}>
                            {s.studentClass}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem', fontWeight: 600, color: '#334155' }}>
                            {isUnat ? '—' : `${formatScore(s.calc.baseScore)}%`}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.4rem 0.75rem' }}>
                            {isUnat && !draftConfig.includeUnattempted ? (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tidak Hadir</span>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                  type="number"
                                  step="any"
                                  className="form-input"
                                  disabled={!draftConfig.enabled}
                                  placeholder={formatScore(s.calc.extraPoints)}
                                  value={hasIndividualOverride ? currentOverride : ''}
                                  onChange={e => handleStudentOverride(s.studentKey, e.target.value)}
                                  title={hasIndividualOverride ? 'Override nilai ekstra per siswa aktif' : 'Masukkan angka untuk override siswa ini'}
                                  style={{
                                    width: 65,
                                    padding: '0.2rem 0.35rem',
                                    fontSize: '0.82rem',
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    borderColor: hasIndividualOverride ? '#d97706' : '#cbd5e1',
                                    background: hasIndividualOverride ? '#fef3c7' : '#ffffff'
                                  }}
                                />
                                {hasIndividualOverride && (
                                  <button
                                    type="button"
                                    onClick={() => handleStudentOverride(s.studentKey, '')}
                                    title="Hapus override khusus siswa ini"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      color: '#dc2626'
                                    }}
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem', fontWeight: 800 }}>
                            {isUnat ? (
                              <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>0%</span>
                            ) : (
                              <span style={{ color: s.calc.isPassed ? '#166534' : '#991b1b', fontSize: '0.92rem' }}>
                                {formatScore(s.calc.finalScore)}%
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>
                            {isUnat ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 4
                                }}
                              >
                                TIDAK HADIR
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: s.calc.isPassed ? '#dcfce7' : '#fee2e2',
                                  color: s.calc.isPassed ? '#15803d' : '#b91c1c',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: 4
                                }}
                              >
                                {s.calc.isPassed ? 'LULUS' : 'BELUM'}
                                {s.calc.statusChanged && (
                                  <span style={{ fontSize: '0.65rem' }}>🎉</span>
                                )}
                              </span>
                            )}
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

        {/* ─── Modal Footer ────────────────────────────────────────── */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleResetEntireConfig}
              style={{ color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RotateCcw size={14} /> Reset ke Nilai Asli
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Batal
            </button>

            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleApplyAndPrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600
              }}
            >
              <Printer size={14} /> Cetak Langsung
            </button>

            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleApplyAndDownloadPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600
              }}
            >
              <FileDown size={14} /> Unduh PDF
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveAndClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 700,
                background: '#2563eb'
              }}
            >
              <Check size={15} /> Terapkan Pengaturan
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

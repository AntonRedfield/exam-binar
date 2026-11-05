import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  Printer,
  FileDown,
  FileText,
  Settings,
  Columns,
  Type,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Key,
  Layers,
  Download
} from 'lucide-react'
import {
  DEFAULT_PAPER_CONFIG,
  generateFullExamDocumentHtml,
  printHtmlViaIframe,
  downloadExamAsWord
} from '../../lib/paperExamExport'

export default function ExportPaperExamModal({
  isOpen,
  onClose,
  exam,
  questionsList = []
}) {
  // Local configuration state
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_PAPER_CONFIG,
    headerTitle: exam?.title ? `ASESMEN SUMATIF / ${exam.title.toUpperCase()}` : DEFAULT_PAPER_CONFIG.headerTitle
  }))

  const [activeTab, setActiveTab] = useState('questions') // 'questions' | 'answers' | 'sheet' | 'all'
  const [showKopSettings, setShowKopSettings] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExportingWord, setIsExportingWord] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [notice, setNotice] = useState('')

  // Keep activeTab in sync with config.documentType
  useEffect(() => {
    setConfig(prev => ({ ...prev, documentType: activeTab }))
  }, [activeTab])

  // Computed total points
  const totalPoints = useMemo(() => {
    return (questionsList || []).reduce((sum, q) => sum + (Number(q.points) || 1), 0)
  }, [questionsList])

  // Count question types
  const questionTypeCounts = useMemo(() => {
    const counts = { mcq: 0, complex: 0, tf: 0, matching: 0, sequencing: 0, agree: 0, essay: 0 }
    ;(questionsList || []).forEach(q => {
      const t = q.type || 'MCQ'
      if (t === 'MCQ') counts.mcq++
      else if (t === 'COMPLEX_MCQ') counts.complex++
      else if (t === 'TRUE_FALSE') counts.tf++
      else if (t === 'MATCHING') counts.matching++
      else if (t === 'SEQUENCING') counts.sequencing++
      else if (t === 'AGREE_DISAGREE') counts.agree++
      else if (t === 'ESSAY' || t === 'PARAGRAPH') counts.essay++
    })
    return counts
  }, [questionsList])

  // Generate full HTML for current state
  const fullHtmlContent = useMemo(() => {
    return generateFullExamDocumentHtml(exam, questionsList, config)
  }, [exam, questionsList, config])

  function showNotification(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 4000)
  }

  // Handle direct printing
  async function handlePrint() {
    if (isPrinting) return
    setIsPrinting(true)
    showNotification('Membuka dialog cetak dokumen...')
    try {
      const docTitle = `Naskah_${(exam?.title || 'Ujian').replace(/\s+/g, '_')}_Paper`
      await printHtmlViaIframe(fullHtmlContent, docTitle)
    } catch (err) {
      console.error('Print error:', err)
      alert('Gagal membuka dialog cetak: ' + (err.message || err))
    } finally {
      setIsPrinting(false)
    }
  }

  // Handle export to Microsoft Word
  function handleDownloadWord() {
    setIsExportingWord(true)
    try {
      const sanitized = (exam?.title || 'Ujian').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_')
      const filename = `Naskah_Soal_${sanitized}.doc`
      downloadExamAsWord(fullHtmlContent, filename)
      showNotification('Dokumen Microsoft Word (.doc) berhasil diunduh!')
    } catch (err) {
      console.error('Word export error:', err)
      alert('Gagal mengekspor dokumen Word: ' + (err.message || err))
    } finally {
      setIsExportingWord(false)
    }
  }

  // Handle PDF export
  async function handleDownloadPdf() {
    if (isExportingPdf) return
    setIsExportingPdf(true)
    showNotification('Menyiapkan file PDF untuk diunduh...')
    try {
      // Dynamic import
      const [{ jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ])
      const html2canvas = html2canvasModule.default || html2canvasModule

      const tempContainer = document.createElement('div')
      tempContainer.style.position = 'fixed'
      tempContainer.style.top = '-99999px'
      tempContainer.style.left = '-99999px'
      tempContainer.style.width = '794px' // A4 width at 96 DPI
      tempContainer.style.padding = '24px'
      tempContainer.style.background = '#ffffff'
      tempContainer.style.color = '#000000'
      tempContainer.style.boxSizing = 'border-box'

      // Extract body from fullHtmlContent
      const bodyStart = fullHtmlContent.indexOf('<body>') + 6
      const bodyEnd = fullHtmlContent.indexOf('</body>')
      tempContainer.innerHTML = fullHtmlContent.substring(bodyStart, bodyEnd)

      document.body.appendChild(tempContainer)

      try {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        })

        await doc.html(tempContainer, {
          callback: (pdf) => {
            const sanitized = (exam?.title || 'Ujian').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_')
            pdf.save(`Naskah_${sanitized}_Paper.pdf`)
            showNotification('File PDF berhasil disimpan!')
            tempContainer.remove()
            setIsExportingPdf(false)
          },
          html2canvas: html2canvas,
          x: 10,
          y: 10,
          width: 190,
          windowWidth: 794
        })
      } catch (pdfErr) {
        tempContainer.remove()
        throw pdfErr
      }
    } catch (err) {
      console.warn('Direct jsPDF html conversion failed, triggering print-to-PDF:', err)
      // Fallback: trigger print dialog where user can save as PDF directly
      handlePrint()
      setIsExportingPdf(false)
    }
  }

  // Hook rules require hooks before early returns
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 1100,
          width: '96%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 14,
          overflow: 'hidden',
          background: 'var(--surface, #ffffff)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* ─── MODAL HEADER ────────────────────────────────────────────── */}
        <div
          style={{
            padding: '1rem 1.4rem',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
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
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Printer size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                  Ekspor & Cetak Naskah Soal Ujian (Paper Exam)
                </h3>
                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 4, background: '#10b981', color: '#ffffff', fontWeight: 600 }}>
                  Offline Ready
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.3 }}>
                Siap dicetak ke kertas A4 jika internet atau listrik terkendala &bull; {exam?.title || 'Ujian'} ({questionsList.length} Soal, {totalPoints} Poin)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ color: '#cbd5e1', padding: '0.4rem', borderRadius: 6 }}
            title="Tutup dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* ─── TOAST NOTIFICATION ──────────────────────────────────────── */}
        {notice && (
          <div style={{
            background: '#ecfdf5',
            color: '#065f46',
            padding: '0.5rem 1.25rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '1px solid #a7f3d0'
          }}>
            <CheckCircle2 size={15} color="#059669" />
            <span>{notice}</span>
          </div>
        )}

        {/* ─── TOOLBAR & SETTINGS SECTION ──────────────────────────────── */}
        <div style={{
          padding: '0.75rem 1.25rem',
          background: 'var(--navy-light, #f8fafc)',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          {/* Top Row: Document Type Selector & Export Buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            {/* Document Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', background: '#e2e8f0', padding: '0.25rem', borderRadius: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'questions' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                onClick={() => setActiveTab('questions')}
              >
                <BookOpen size={14} style={{ marginRight: 4 }} />
                Naskah Soal Siswa
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'answers' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                onClick={() => setActiveTab('answers')}
              >
                <Key size={14} style={{ marginRight: 4 }} />
                Kunci Jawaban & Bobot
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'sheet' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                onClick={() => setActiveTab('sheet')}
              >
                <FileText size={14} style={{ marginRight: 4 }} />
                Lembar Jawab Siswa (LJS)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                onClick={() => setActiveTab('all')}
              >
                <Layers size={14} style={{ marginRight: 4 }} />
                Paket Lengkap
              </button>
            </div>

            {/* Export Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handlePrint}
                disabled={isPrinting}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                title="Cetak langsung ke printer atau Simpan PDF resolusi tinggi via browser"
              >
                <Printer size={15} />
                <span>{isPrinting ? 'Membuka...' : 'Cetak / Print'}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadWord}
                disabled={isExportingWord}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  background: '#0d9488',
                  color: '#ffffff',
                  border: 'none'
                }}
                title="Unduh dokumen dalam format Microsoft Word (.doc) untuk diedit lebih lanjut"
              >
                <FileDown size={15} />
                <span>Word (.doc)</span>
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleDownloadPdf}
                disabled={isExportingPdf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  border: '1px solid var(--border)'
                }}
                title="Unduh file PDF A4 langsung ke perangkat"
              >
                <Download size={14} />
                <span>PDF</span>
              </button>
            </div>
          </div>

          {/* Bottom Row: Quick Format Options & Kop Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingTop: '0.4rem',
            borderTop: '1px solid rgba(0,0,0,0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
              {/* Columns Switcher */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Columns size={13} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 600 }}>Kolom:</span>
                <select
                  value={config.columns}
                  onChange={e => setConfig(prev => ({ ...prev, columns: Number(e.target.value) }))}
                  style={{
                    padding: '0.2rem 0.45rem',
                    borderRadius: 5,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    background: '#ffffff'
                  }}
                >
                  <option value={1}>1 Kolom (Standar)</option>
                  <option value={2}>2 Kolom (Hemat Kertas)</option>
                </select>
              </div>

              {/* Font Size */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Type size={13} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 600 }}>Huruf:</span>
                <select
                  value={config.fontSize}
                  onChange={e => setConfig(prev => ({ ...prev, fontSize: e.target.value }))}
                  style={{
                    padding: '0.2rem 0.45rem',
                    borderRadius: 5,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    background: '#ffffff'
                  }}
                >
                  <option value="normal">Normal (10pt)</option>
                  <option value="compact">Kompak (9pt)</option>
                </select>
              </div>

              {/* Checkboxes */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.includeStudentIdBox}
                  onChange={e => setConfig(prev => ({ ...prev, includeStudentIdBox: e.target.checked }))}
                />
                <span>Kolom Identitas Siswa</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.includeEssayLines}
                  onChange={e => setConfig(prev => ({ ...prev, includeEssayLines: e.target.checked }))}
                />
                <span>Garis Jawaban Esai</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.includePoints}
                  onChange={e => setConfig(prev => ({ ...prev, includePoints: e.target.checked }))}
                />
                <span>Tampilkan Bobot Poin</span>
              </label>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowKopSettings(prev => !prev)}
              style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent)' }}
            >
              <Settings size={13} />
              <span>{showKopSettings ? 'Sembunyikan Pengaturan Kop' : 'Edit Kop Sekolah & Petunjuk'}</span>
              {showKopSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Expandable Kop & Instructions Settings Panel */}
          {showKopSettings && (
            <div style={{
              background: '#ffffff',
              padding: '0.85rem 1rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              marginTop: '0.25rem'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sliders size={14} color="var(--accent)" />
                Kustomisasi Kop Surat Resmi & Petunjuk Ujian
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Nama Sekolah:</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto' }}
                    value={config.schoolName}
                    onChange={e => setConfig(prev => ({ ...prev, schoolName: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Yayasan / Dinas:</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto' }}
                    value={config.institution}
                    onChange={e => setConfig(prev => ({ ...prev, institution: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Alamat Sekolah:</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto' }}
                    value={config.address}
                    onChange={e => setConfig(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Tahun Ajaran / Semester:</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto', flex: 1 }}
                      value={config.academicYear}
                      placeholder="2025/2026"
                      onChange={e => setConfig(prev => ({ ...prev, academicYear: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto', flex: 1 }}
                      value={config.term}
                      placeholder="Semester Ganjil"
                      onChange={e => setConfig(prev => ({ ...prev, term: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Judul Naskah Soal:</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: 'auto' }}
                  value={config.headerTitle}
                  onChange={e => setConfig(prev => ({ ...prev, headerTitle: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        {/* ─── LIVE A4 PREVIEW WINDOW ──────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: '#475569',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start'
        }}>
          {/* Simulated A4 Sheet */}
          <div
            style={{
              width: '100%',
              maxWidth: 820,
              minHeight: 1050,
              background: '#ffffff',
              color: '#000000',
              padding: '28px 36px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              borderRadius: 3,
              fontFamily: config.fontFamily === 'times' ? "'Times New Roman', Times, serif" : 'Arial, sans-serif',
              fontSize: config.fontSize === 'compact' ? '9pt' : '10pt',
              lineHeight: 1.45,
              boxSizing: 'border-box'
            }}
          >
            {/* Real-time HTML Preview Container */}
            {(() => {
              const styleStart = fullHtmlContent.indexOf('<style>') + 7
              const styleEnd = fullHtmlContent.indexOf('</style>')
              const previewStyles = styleStart > 6 && styleEnd > styleStart ? fullHtmlContent.substring(styleStart, styleEnd) : ''
              const bodyStart = fullHtmlContent.indexOf('<body>') + 6
              const bodyEnd = fullHtmlContent.indexOf('</body>')
              const previewBody = bodyStart > 5 && bodyEnd > bodyStart ? fullHtmlContent.substring(bodyStart, bodyEnd) : ''

              return (
                <>
                  {previewStyles && <style dangerouslySetInnerHTML={{ __html: previewStyles }} />}
                  <div
                    className="paper-exam-live-preview"
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                </>
              )
            })()}
          </div>
        </div>

        {/* ─── MODAL FOOTER ────────────────────────────────────────────── */}
        <div style={{
          padding: '0.75rem 1.4rem',
          background: 'var(--surface, #ffffff)',
          borderTop: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            📊 Ringkasan: <strong>{questionsList.length} Soal</strong> &bull; Total <strong>{totalPoints} Poin</strong> &bull;
            {questionTypeCounts.mcq > 0 ? ` ${questionTypeCounts.mcq} PG,` : ''}
            {questionTypeCounts.complex > 0 ? ` ${questionTypeCounts.complex} Kompleks,` : ''}
            {questionTypeCounts.tf > 0 ? ` ${questionTypeCounts.tf} B/S,` : ''}
            {questionTypeCounts.matching > 0 ? ` ${questionTypeCounts.matching} Menjodohkan,` : ''}
            {questionTypeCounts.essay > 0 ? ` ${questionTypeCounts.essay} Esai` : ''}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Tutup
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
            >
              <Printer size={15} /> Cetak Naskah Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

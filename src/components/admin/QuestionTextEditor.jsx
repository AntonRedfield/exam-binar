import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Eye,
  Edit3,
  X,
  Check,
  FileText
} from 'lucide-react'
import FormattedText from '../common/FormattedText'

export default function QuestionTextEditor({
  value = '',
  onChange,
  placeholder = 'Tulis teks pertanyaan, narasi cerita, dialog bahasa Inggris, atau studi kasus di sini...',
  questionNumber,
  isSurvey = false,
  minHeight = 130
}) {
  const [isPreview, setIsPreview] = useState(false)
  const [isExpandedModal, setIsExpandedModal] = useState(false)
  const textareaRef = useRef(null)
  const modalTextareaRef = useRef(null)

  // Auto-grow height calculation
  const adjustHeight = useCallback((el) => {
    if (!el) return
    el.style.height = 'auto'
    const newHeight = Math.max(minHeight, el.scrollHeight)
    el.style.height = `${newHeight}px`
  }, [minHeight])

  useEffect(() => {
    if (!isPreview) {
      adjustHeight(textareaRef.current)
    }
  }, [value, isPreview, adjustHeight])

  useEffect(() => {
    if (isExpandedModal) {
      adjustHeight(modalTextareaRef.current)
    }
  }, [value, isExpandedModal, adjustHeight])

  // Helper to wrap text with tags
  const applyWrap = (startTag, endTag, defaultPlaceholder) => {
    const el = isExpandedModal ? modalTextareaRef.current : textareaRef.current
    if (!el) return

    const currentText = value || ''
    const start = el.selectionStart
    const end = el.selectionEnd
    const hasSelection = start !== end
    const selectedText = hasSelection ? currentText.substring(start, end) : defaultPlaceholder

    const before = currentText.substring(0, start)
    const after = currentText.substring(end)
    const newText = `${before}${startTag}${selectedText}${endTag}${after}`

    onChange(newText)

    // Re-focus and restore cursor selection smoothly
    setTimeout(() => {
      el.focus()
      const newCursorStart = start + startTag.length
      const newCursorEnd = newCursorStart + selectedText.length
      el.setSelectionRange(newCursorStart, newCursorEnd)
      adjustHeight(el)
    }, 0)
  }

  // Formatting actions
  const handleBold = () => applyWrap('<b>', '</b>', 'teks tebal')
  const handleItalic = () => applyWrap('<i>', '</i>', 'teks miring')
  const handleUnderline = () => applyWrap('<u>', '</u>', 'teks garis bawah')

  // Bullet list action
  const handleBulletList = () => {
    const el = isExpandedModal ? modalTextareaRef.current : textareaRef.current
    if (!el) return

    const currentText = value || ''
    const start = el.selectionStart
    const end = el.selectionEnd

    const lineStart = currentText.lastIndexOf('\n', start - 1) + 1
    let lineEnd = currentText.indexOf('\n', end)
    if (lineEnd === -1) lineEnd = currentText.length

    const selectedBlock = currentText.substring(lineStart, lineEnd)
    const lines = selectedBlock.split('\n')

    const allBulleted = lines.every(l => l.startsWith('• ') || l.startsWith('- '))
    const modifiedLines = lines.map(l => {
      if (allBulleted) {
        return l.replace(/^(• |- )\s*/, '')
      }
      return `• ${l.replace(/^(• |- |\d+\. )\s*/, '')}`
    })

    const replacement = modifiedLines.join('\n')
    const newText = currentText.substring(0, lineStart) + replacement + currentText.substring(lineEnd)
    onChange(newText)

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(lineStart, lineStart + replacement.length)
      adjustHeight(el)
    }, 0)
  }

  // Numbered list action
  const handleNumberedList = () => {
    const el = isExpandedModal ? modalTextareaRef.current : textareaRef.current
    if (!el) return

    const currentText = value || ''
    const start = el.selectionStart
    const end = el.selectionEnd

    const lineStart = currentText.lastIndexOf('\n', start - 1) + 1
    let lineEnd = currentText.indexOf('\n', end)
    if (lineEnd === -1) lineEnd = currentText.length

    const selectedBlock = currentText.substring(lineStart, lineEnd)
    const lines = selectedBlock.split('\n')

    const allNumbered = lines.every(l => /^\d+\.\s*/.test(l))
    const modifiedLines = lines.map((l, i) => {
      if (allNumbered) {
        return l.replace(/^\d+\.\s*/, '')
      }
      return `${i + 1}. ${l.replace(/^(• |- |\d+\. )\s*/, '')}`
    })

    const replacement = modifiedLines.join('\n')
    const newText = currentText.substring(0, lineStart) + replacement + currentText.substring(lineEnd)
    onChange(newText)

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(lineStart, lineStart + replacement.length)
      adjustHeight(el)
    }, 0)
  }

  // Keyboard shortcut listener
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        handleBold()
      } else if (key === 'i') {
        e.preventDefault()
        handleItalic()
      } else if (key === 'u') {
        e.preventDefault()
        handleUnderline()
      }
    }
  }

  // Stats calculation
  const wordsCount = value.trim() ? value.trim().split(/\s+/).length : 0
  const charsCount = value.length

  return (
    <div className="question-text-editor-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {/* Top Header & Toolbar Bar */}
      <div className="qte-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.4rem 0.65rem',
        background: 'var(--navy-mid)',
        border: '1px solid var(--border)',
        borderRadius: '8px 8px 0 0',
        borderBottom: 'none'
      }}>
        {/* Left Toolbar formatting buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="qte-btn"
            onClick={handleBold}
            disabled={isPreview}
            title="Tebal (Ctrl+B) - <b>teks</b>"
            aria-label="Format Bold"
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            className="qte-btn"
            onClick={handleItalic}
            disabled={isPreview}
            title="Miring (Ctrl+I) - <i>teks</i>"
            aria-label="Format Italic"
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            className="qte-btn"
            onClick={handleUnderline}
            disabled={isPreview}
            title="Garis Bawah (Ctrl+U) - <u>teks</u>"
            aria-label="Format Underline"
          >
            <Underline size={15} />
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 0.2rem' }} />

          <button
            type="button"
            className="qte-btn"
            onClick={handleBulletList}
            disabled={isPreview}
            title="Daftar Poin / Buletin (• Poin)"
            aria-label="Format Bullet List"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            className="qte-btn"
            onClick={handleNumberedList}
            disabled={isPreview}
            title="Daftar Bernomor (1. 2. 3.)"
            aria-label="Format Numbered List"
          >
            <ListOrdered size={15} />
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 0.2rem' }} />

          <button
            type="button"
            className="qte-btn"
            onClick={() => setIsExpandedModal(true)}
            title="Buka Editor Teks Panjang (Layar Luas / Fullscreen)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}
          >
            <Maximize2 size={13} />
            <span className="qte-expand-label">Perluas Editor</span>
          </button>
        </div>

        {/* Right Tab switch: Tulis vs Pratinjau & Word counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', gap: '0.4rem' }}>
            <span>{wordsCount} kata</span>
            <span>·</span>
            <span>{charsCount} karakter</span>
          </div>

          <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px', gap: '2px' }}>
            <button
              type="button"
              className={`btn btn-sm ${!isPreview ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', height: 24, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => setIsPreview(false)}
            >
              <Edit3 size={12} /> Tulis
            </button>
            <button
              type="button"
              className={`btn btn-sm ${isPreview ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', height: 24, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => setIsPreview(true)}
            >
              <Eye size={12} /> Pratinjau
            </button>
          </div>
        </div>
      </div>

      {/* Main Body: Textarea (Auto-expand) or Formatted Preview */}
      <div style={{ position: 'relative' }}>
        {!isPreview ? (
          <textarea
            ref={textareaRef}
            className="form-input qte-textarea"
            style={{
              width: '100%',
              minHeight,
              borderRadius: '0 0 8px 8px',
              borderTop: 'none',
              fontSize: '0.94rem',
              lineHeight: 1.65,
              padding: '0.85rem 1rem',
              resize: 'vertical',
              fontFamily: 'inherit',
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              adjustHeight(e.target)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
        ) : (
          <div style={{
            minHeight,
            borderRadius: '0 0 8px 8px',
            border: '1px solid var(--border)',
            borderTop: 'none',
            background: 'var(--surface)',
            padding: '1rem',
            fontSize: '0.95rem',
            lineHeight: 1.65,
            boxSizing: 'border-box'
          }}>
            {value.trim() ? (
              <FormattedText text={value} />
            ) : (
              <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>
                Belum ada teks pertanyaan. Klik tab &apos;Tulis&apos; untuk mengetik.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Helpful Hint */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span>
          💡 <strong>Tips:</strong> Gunakan <b>B</b>, <i>I</i>, <u>U</u>, atau buletin/angka. Kotak teks akan otomatis meluas mengikuti panjang cerita.
        </span>
        {wordsCount > 50 && (
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            📖 Teks Panjang ({wordsCount} kata)
          </span>
        )}
      </div>

      {/* Modal / Fullscreen Expanded View for Long Passages */}
      {isExpandedModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setIsExpandedModal(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 950,
              width: '95vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              borderRadius: 12,
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1rem 1.25rem',
              background: 'var(--navy-mid)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8, background: 'var(--accent)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <FileText size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Editor Teks Soal / Stimulus Cerita Panjang {questionNumber ? `(Soal #${questionNumber})` : ''}
                  </h3>
                  <p className="text-muted text-xs" style={{ margin: 0, marginTop: '2px' }}>
                    Sangat nyaman untuk teks bahasa Inggris (Narrative, Recount, Report), bacaan sastra, dialog, atau artikel panjang.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsExpandedModal(false)}
                style={{ padding: '0.35rem' }}
                title="Tutup mode luas"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 1.25rem',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button type="button" className="qte-btn" onClick={handleBold} title="Tebal (Ctrl+B)">
                  <Bold size={16} />
                </button>
                <button type="button" className="qte-btn" onClick={handleItalic} title="Miring (Ctrl+I)">
                  <Italic size={16} />
                </button>
                <button type="button" className="qte-btn" onClick={handleUnderline} title="Garis Bawah (Ctrl+U)">
                  <Underline size={16} />
                </button>
                <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 0.3rem' }} />
                <button type="button" className="qte-btn" onClick={handleBulletList} title="Daftar Buletin (• Poin)">
                  <List size={16} />
                </button>
                <button type="button" className="qte-btn" onClick={handleNumberedList} title="Daftar Nomor (1. 2. 3.)">
                  <ListOrdered size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <span className="badge badge-draft" style={{ fontSize: '0.78rem' }}>
                  {wordsCount} kata · {charsCount} karakter
                </span>
              </div>
            </div>

            {/* Modal Body: Side-by-side or large layout */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '1.25rem',
              background: 'var(--surface-ground, #f8fafc)'
            }}>
              {/* Left: Input Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  ✏️ Masukkan / Edit Teks:
                </div>
                <textarea
                  ref={modalTextareaRef}
                  className="form-input"
                  style={{
                    flex: 1,
                    minHeight: 380,
                    fontSize: '0.96rem',
                    lineHeight: 1.7,
                    padding: '1rem',
                    borderRadius: 8,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  autoFocus
                />
              </div>

              {/* Right: Live Real-time Formatted Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  👁️ Pratinjau Tampilan Siswa (Real-time):
                </div>
                <div style={{
                  flex: 1,
                  minHeight: 380,
                  maxHeight: 520,
                  overflowY: 'auto',
                  padding: '1.25rem',
                  background: 'var(--surface)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: '0.98rem',
                  lineHeight: 1.7
                }}>
                  {value.trim() ? (
                    <FormattedText text={value} />
                  ) : (
                    <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>
                      Pratinjau teks akan otomatis muncul di sini saat Anda mengetik di sebelah kiri...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.85rem 1.25rem',
              background: 'var(--navy-mid)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span className="text-muted text-xs">
                Perubahan langsung diterapkan ke butir soal.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsExpandedModal(false)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1.2rem' }}
              >
                <Check size={15} /> Selesai & Simpan Teks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

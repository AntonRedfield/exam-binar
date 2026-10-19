export default function QuestionEssay({ value, onChange }) {
  const text = value || ''

  const stopNative = (e) => {
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation?.()
  }

  return (
    <div className="essay-field-wrapper" style={{ width: '100%' }}>
      <textarea
        className="form-input essay-textarea"
        style={{
          minHeight: 220,
          resize: 'vertical',
          width: '100%',
          touchAction: 'manipulation',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          padding: '0.85rem',
        }}
        placeholder="Tuliskan jawaban Anda di sini..."
        value={text}
        onChange={e => onChange(e.target.value)}
        onKeyDown={stopNative}
        onKeyUp={stopNative}
        onCopy={stopNative}
        onPaste={stopNative}
        onCut={stopNative}
        onContextMenu={stopNative}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck="false"
      />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.25rem' }}>
        {text.length} karakter
      </div>
      <div className="alert alert-info" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
        Jawaban esai akan dinilai oleh guru setelah ujian selesai.
      </div>
    </div>
  )
}

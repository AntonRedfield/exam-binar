export default function QuestionEssay({ value, onChange }) {
  const text = value || ''
  return (
    <div>
      <textarea
        className="form-input"
        style={{ minHeight: 200, resize: 'vertical' }}
        placeholder="Tuliskan jawaban Anda di sini..."
        value={text}
        onChange={e => onChange(e.target.value)}
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

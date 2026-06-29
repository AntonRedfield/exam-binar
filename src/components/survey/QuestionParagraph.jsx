export default function QuestionParagraph({ value, onChange, disabled }) {
  return (
    <div className="survey-question-input">
      <textarea
        className="form-input"
        placeholder="Ketik jawaban panjang Anda di sini..."
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ minHeight: 120, resize: 'vertical', fontSize: '0.95rem', lineHeight: 1.6 }}
        maxLength={5000}
      />
      <div className="text-xs text-muted" style={{ textAlign: 'right', marginTop: '0.25rem' }}>
        {(value || '').length}/5000 karakter
      </div>
    </div>
  )
}

export default function QuestionShortAnswer({ value, onChange, disabled }) {
  return (
    <div className="survey-question-input">
      <input
        type="text"
        className="form-input"
        placeholder="Ketik jawaban singkat Anda..."
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        maxLength={500}
        style={{ fontSize: '0.95rem' }}
      />
      <div className="text-xs text-muted" style={{ textAlign: 'right', marginTop: '0.25rem' }}>
        {(value || '').length}/500 karakter
      </div>
    </div>
  )
}

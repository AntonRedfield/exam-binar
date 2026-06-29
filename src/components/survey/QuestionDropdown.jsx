export default function QuestionDropdown({ question, value, onChange, disabled }) {
  const options = question.options || {}
  const optionKeys = Object.keys(options)

  return (
    <div className="survey-question-input">
      <select
        className="form-input survey-dropdown"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ fontSize: '0.95rem', padding: '0.625rem 0.875rem' }}
      >
        <option value="">— Pilih jawaban —</option>
        {optionKeys.map(key => (
          <option key={key} value={key}>
            {options[key] || `Opsi ${key}`}
          </option>
        ))}
      </select>
    </div>
  )
}

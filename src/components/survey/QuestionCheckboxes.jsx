export default function QuestionCheckboxes({ question, value, onChange, disabled }) {
  const options = question.options || {}
  const optionKeys = Object.keys(options)
  // value = ['A', 'C', ...]
  const selected = Array.isArray(value) ? value : []

  function handleToggle(key) {
    if (disabled) return
    const updated = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange(updated)
  }

  return (
    <div className="survey-mc-options">
      {optionKeys.map(key => (
        <label
          key={key}
          className={`survey-mc-option ${selected.includes(key) ? 'selected' : ''}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={() => handleToggle(key)}
            disabled={disabled}
          />
          <span className="survey-mc-option-text">{options[key] || `Opsi ${key}`}</span>
        </label>
      ))}
    </div>
  )
}

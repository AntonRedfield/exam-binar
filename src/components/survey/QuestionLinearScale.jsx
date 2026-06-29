export default function QuestionLinearScale({ question, value, onChange, disabled }) {
  const min = question.scale_min ?? 1
  const max = question.scale_max ?? 5
  const minLabel = question.scale_min_label || ''
  const maxLabel = question.scale_max_label || ''

  const scaleValues = []
  for (let i = min; i <= max; i++) scaleValues.push(i)

  return (
    <div className="linear-scale">
      <div className="linear-scale-row">
        {minLabel && <span className="linear-scale-label">{minLabel}</span>}
        <div className="linear-scale-options">
          {scaleValues.map(v => (
            <label key={v} className={`linear-scale-option ${value === v ? 'selected' : ''}`}>
              <input
                type="radio"
                name={`scale_${question.id || question.number}`}
                value={v}
                checked={value === v}
                onChange={() => onChange(v)}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              <span className="linear-scale-value">{v}</span>
            </label>
          ))}
        </div>
        {maxLabel && <span className="linear-scale-label">{maxLabel}</span>}
      </div>
    </div>
  )
}

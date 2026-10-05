import { getDriveImageUrl } from '../../lib/grader'

export default function QuestionCheckboxes({ question, value, onChange, disabled }) {
  const options = question?.options || {}
  const optionImages = question?.option_images || question?.options?.option_images || {}
  const optionKeys = Object.keys(options).filter(k => k !== 'option_images')
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
      {optionKeys.map(key => {
        const imgUrl = optionImages[key]
        return (
          <label
            key={key}
            className={`survey-mc-option ${selected.includes(key) ? 'selected' : ''}`}
            style={{ alignItems: imgUrl ? 'flex-start' : 'center' }}
          >
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() => handleToggle(key)}
              disabled={disabled}
              style={{ marginTop: imgUrl ? '3px' : 0 }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="survey-mc-option-text">{options[key] || `Opsi ${key}`}</span>
              {imgUrl && (
                <div className="option-image-wrapper">
                  <img
                    src={getDriveImageUrl(imgUrl)}
                    alt={`Gambar Opsi ${key}`}
                    className="option-adaptive-img"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}

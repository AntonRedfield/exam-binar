import AdaptiveExamImage from './AdaptiveExamImage'

export default function QuestionMCQ({ question, value, onChange }) {
  const options = question?.options || {}
  const optionImages = question?.option_images || question?.options?.option_images || {}
  // Filter out non-option keys like option_images if nested
  const keys = Object.keys(options).filter(k => k !== 'option_images')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {keys.map(key => {
        const hasText = options[key] && String(options[key]).trim().length > 0
        const imgUrl = optionImages[key]

        return (
          <button
            key={key}
            type="button"
            className={`option-btn ${value === key ? 'selected' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="option-key">{key}</span>
            <div className="option-content" style={{ flex: 1, minWidth: 0 }}>
              {hasText && <span className="option-text">{options[key]}</span>}
              {imgUrl && (
                <AdaptiveExamImage
                  src={imgUrl}
                  alt={`Opsi ${key}`}
                  type="option"
                  optionKey={key}
                  maxHeight={220}
                />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

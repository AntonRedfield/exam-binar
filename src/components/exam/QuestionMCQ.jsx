import { getDriveImageUrl } from '../../lib/grader'

export default function QuestionMCQ({ question, value, onChange }) {
  const options = question?.options || {}
  const optionImages = question?.option_images || question?.options?.option_images || {}
  // Filter out non-option keys like option_images if nested
  const keys = Object.keys(options).filter(k => k !== 'option_images')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {keys.map(key => {
        const imgUrl = optionImages[key]
        return (
          <button
            key={key}
            type="button"
            className={`option-btn ${value === key ? 'selected' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="option-key">{key}</span>
            <div className="option-content">
              {options[key] && <span className="option-text">{options[key]}</span>}
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
          </button>
        )
      })}
    </div>
  )
}

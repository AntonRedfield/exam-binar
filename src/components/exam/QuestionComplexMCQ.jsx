import { CheckSquare, Square } from 'lucide-react'
import { getDriveImageUrl } from '../../lib/grader'

export default function QuestionComplexMCQ({ question, value, onChange }) {
  const options = question?.options || {}
  const optionImages = question?.option_images || question?.options?.option_images || {}
  const keys = Object.keys(options).filter(k => k !== 'option_images')
  const selected = Array.isArray(value) ? value : []

  function toggle(key) {
    const newVal = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange(newVal.length > 0 ? newVal : undefined)
  }

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '0.875rem', fontSize: '0.8rem' }}>
        Pilih semua jawaban yang benar (lebih dari satu pilihan mungkin benar).
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {keys.map(key => {
          const isSelected = selected.includes(key)
          const imgUrl = optionImages[key]
          return (
            <button
              key={key}
              type="button"
              className={`option-btn ${isSelected ? 'selected-multi' : ''}`}
              onClick={() => toggle(key)}
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
              <div style={{ flexShrink: 0, marginTop: imgUrl ? '2px' : 0 }}>
                {isSelected ? <CheckSquare size={18} /> : <Square size={18} style={{ opacity: 0.3 }} />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

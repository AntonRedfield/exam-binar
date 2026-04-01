import { CheckSquare, Square } from 'lucide-react'

export default function QuestionComplexMCQ({ question, value, onChange }) {
  const options = question.options || {}
  const keys = Object.keys(options)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {keys.map(key => {
          const isSelected = selected.includes(key)
          return (
            <button
              key={key}
              className={`option-btn ${isSelected ? 'selected-multi' : ''}`}
              onClick={() => toggle(key)}
            >
              <span className="option-key">{key}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{options[key]}</span>
              {isSelected ? <CheckSquare size={16} style={{ flexShrink: 0 }} /> : <Square size={16} style={{ flexShrink: 0, opacity: 0.3 }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

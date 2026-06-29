import { useState } from 'react'

export default function QuestionMultipleChoice({ question, value, onChange, disabled }) {
  const options = question.options || {}
  const optionKeys = Object.keys(options)
  const allowOther = question.allow_other
  // value = { selected: 'A', otherText: '...' } OR just 'A'
  const selected = typeof value === 'object' ? value?.selected : value
  const otherText = typeof value === 'object' ? value?.otherText : ''

  function handleSelect(key) {
    if (disabled) return
    if (key === '__other__') {
      onChange({ selected: '__other__', otherText: otherText || '' })
    } else {
      onChange({ selected: key, otherText: '' })
    }
  }

  function handleOtherText(text) {
    if (disabled) return
    onChange({ selected: '__other__', otherText: text })
  }

  return (
    <div className="survey-mc-options">
      {optionKeys.map(key => (
        <label
          key={key}
          className={`survey-mc-option ${selected === key ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name={`mc_${question.id || question.number}`}
            checked={selected === key}
            onChange={() => handleSelect(key)}
            disabled={disabled}
          />
          <span className="survey-mc-option-text">{options[key] || `Opsi ${key}`}</span>
        </label>
      ))}
      {allowOther && (
        <label className={`survey-mc-option ${selected === '__other__' ? 'selected' : ''}`}>
          <input
            type="radio"
            name={`mc_${question.id || question.number}`}
            checked={selected === '__other__'}
            onChange={() => handleSelect('__other__')}
            disabled={disabled}
          />
          <span className="survey-mc-option-text">Lainnya:</span>
          {selected === '__other__' && (
            <input
              type="text"
              className="form-input survey-other-input"
              placeholder="Ketik jawaban lain..."
              value={otherText}
              onChange={e => handleOtherText(e.target.value)}
              disabled={disabled}
              onClick={e => e.stopPropagation()}
            />
          )}
        </label>
      )}
    </div>
  )
}

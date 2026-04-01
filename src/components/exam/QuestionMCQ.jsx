export default function QuestionMCQ({ question, value, onChange }) {
  const options = question.options || {}
  const keys = Object.keys(options)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {keys.map(key => (
        <button
          key={key}
          className={`option-btn ${value === key ? 'selected' : ''}`}
          onClick={() => onChange(key)}
        >
          <span className="option-key">{key}</span>
          <span>{options[key]}</span>
        </button>
      ))}
    </div>
  )
}

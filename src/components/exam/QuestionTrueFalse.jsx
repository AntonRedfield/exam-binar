export default function QuestionTrueFalse({ question, value, onChange }) {
  const options = question?.options || {}
  const keys = Object.keys(options)
  const currentAnswers = value || {}

  function handleSelect(key, val) {
    const newAnswers = { ...currentAnswers, [key]: val }
    onChange(newAnswers)
  }

  if (keys.length === 0) {
    return (
      <div className="alert alert-warning" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
        Tidak ada pernyataan yang ditambahkan untuk soal ini.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
      <div className="alert alert-info" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
        Tentukan apakah setiap pernyataan di bawah ini Benar atau Salah.
      </div>
      
      {keys.map((key, i) => (
        <div
          key={key}
          className="card"
          style={{
            padding: '0.85rem 1.1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
            border: '1.5px solid #cbd5e1',
            borderLeft: '4px solid var(--accent)',
            borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{i + 1}.</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{options[key]}</span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
            <button
              className={`tf-btn ${currentAnswers[key] === 'true' ? 'selected-true' : ''}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => handleSelect(key, 'true')}
            >
              ✓ Benar
            </button>
            <button
              className={`tf-btn ${currentAnswers[key] === 'false' ? 'selected-false' : ''}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => handleSelect(key, 'false')}
            >
              ✗ Salah
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

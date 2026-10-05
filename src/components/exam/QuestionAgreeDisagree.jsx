export default function QuestionAgreeDisagree({ question, value, onChange }) {
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
        Tentukan apakah Anda Setuju atau Tidak Setuju untuk setiap pernyataan di bawah ini.
      </div>
      
      {keys.map((key, i) => (
        <div key={key} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{i + 1}.</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{options[key]}</span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
            <button
              type="button"
              className={`ad-btn ${currentAnswers[key] === 'agree' ? 'selected-agree' : ''}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => handleSelect(key, 'agree')}
            >
              👍 Setuju
            </button>
            <button
              type="button"
              className={`ad-btn ${currentAnswers[key] === 'disagree' ? 'selected-disagree' : ''}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => handleSelect(key, 'disagree')}
            >
              👎 Tidak Setuju
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

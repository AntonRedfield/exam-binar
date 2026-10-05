import { ArrowRight } from 'lucide-react'

export default function QuestionMatching({ question, value, onChange }) {
  const options = question?.options || {}
  const leftItems = options.left || {}
  const rightItems = options.right || {}
  const leftKeys = Object.keys(leftItems)
  const rightKeys = Object.keys(rightItems)
  const answers = value || {}

  function handleSelect(leftKey, rightKey) {
    const updated = { ...answers, [leftKey]: rightKey || undefined }
    if (!rightKey) {
      delete updated[leftKey]
    }
    onChange(Object.keys(updated).length > 0 ? updated : undefined)
  }

  if (leftKeys.length === 0 || rightKeys.length === 0) {
    return (
      <div className="alert alert-warning" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
        Belum ada pasangan item yang ditambahkan pada soal menjodohkan ini.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
      <div className="alert alert-info" style={{ fontSize: '0.8rem', margin: 0 }}>
        Pasangkan setiap pernyataan di kolom kiri dengan pilihan yang tepat di kolom kanan.
      </div>

      {/* Available choices preview badge list */}
      <div style={{ padding: '0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div className="text-xs text-muted" style={{ marginBottom: '0.375rem', fontWeight: 600 }}>
          Daftar Pilihan Pasangan (Kolom Kanan):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {rightKeys.map(rKey => (
            <span
              key={rKey}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.25rem 0.6rem', borderRadius: 6,
                background: 'white', border: '1px solid var(--border)',
                fontSize: '0.82rem'
              }}
            >
              <strong style={{ color: 'var(--accent)' }}>{rKey}.</strong> {rightItems[rKey]}
            </span>
          ))}
        </div>
      </div>

      {/* Left items matching list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {leftKeys.map((lKey, i) => {
          const selectedRight = answers[lKey] || ''
          return (
            <div
              key={lKey}
              className="card"
              style={{
                padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '1rem', flexWrap: 'wrap', background: 'var(--surface)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flex: 1, minWidth: 200 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{i + 1}.</span>
                <span style={{ flex: 1, lineHeight: 1.4, fontSize: '0.9rem' }}>{leftItems[lKey]}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <ArrowRight size={16} color="var(--text-muted)" />
                <select
                  className="form-input"
                  style={{
                    minWidth: 180, maxWidth: 260, fontSize: '0.85rem', padding: '0.35rem 0.6rem',
                    borderColor: selectedRight ? 'var(--accent)' : 'var(--border)',
                    fontWeight: selectedRight ? 600 : 400
                  }}
                  value={selectedRight}
                  onChange={e => handleSelect(lKey, e.target.value)}
                >
                  <option value="">-- Pilih Pasangan --</option>
                  {rightKeys.map(rKey => (
                    <option key={rKey} value={rKey}>
                      {rKey}. {rightItems[rKey]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

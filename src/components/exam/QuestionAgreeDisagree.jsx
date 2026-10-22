import React from 'react'
import { CheckSquare, Square, CheckCircle2 } from 'lucide-react'

export default function QuestionAgreeDisagree({ question, value, onChange }) {
  const options = question?.options || {}
  const reasonType = options.reason_type || question?.correct_answer?.reason_type || (Object.keys(options).some(k => ['A', 'B', 'C', 'D', 'E'].includes(k)) ? 'options' : 'essay')
  
  // Check for legacy format: options has stmt_... and no stance in correct_answer
  const isLegacy = Object.keys(options).some(k => k.startsWith('stmt_')) && !question?.correct_answer?.stance

  if (isLegacy) {
    // Legacy renderer for backward compatibility
    const keys = Object.keys(options)
    const currentAnswers = (value && typeof value === 'object' && !('stance' in value)) ? value : {}

    function handleLegacySelect(key, val) {
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
                onClick={() => handleLegacySelect(key, 'agree')}
              >
                👍 Setuju
              </button>
              <button
                type="button"
                className={`ad-btn ${currentAnswers[key] === 'disagree' ? 'selected-disagree' : ''}`}
                style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                onClick={() => handleLegacySelect(key, 'disagree')}
              >
                👎 Tidak Setuju
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // --- New Mechanism (AKM / HOTS Style) ---
  const currentVal = (value && typeof value === 'object') ? value : {}
  const stance = currentVal.stance || ''
  const selectedReasons = Array.isArray(currentVal.reasons) ? currentVal.reasons : []
  const essayText = currentVal.essay || currentVal.reason_text || (typeof value === 'string' ? value : '')

  const reasonKeys = Object.keys(options).filter(k => k !== 'reason_type' && k !== 'option_images')

  function handleStanceSelect(newStance) {
    const updated = {
      ...currentVal,
      stance: newStance,
    }
    onChange(updated)
  }

  function handleToggleReason(key) {
    const newReasons = selectedReasons.includes(key)
      ? selectedReasons.filter(k => k !== key)
      : [...selectedReasons, key]
    onChange({
      ...currentVal,
      reasons: newReasons
    })
  }

  function handleEssayChange(text) {
    onChange({
      ...currentVal,
      essay: text
    })
  }

  const stopNative = (e) => {
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
      {/* Instruction banner */}
      <div className="alert alert-info" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>
        💡 Berdasarkan kasus / cerita pada soal di atas, tentukan apakah Anda <strong>Setuju</strong> atau <strong>Tidak Setuju</strong>, kemudian tentukan alasan pendukungnya.
      </div>

      {/* Step 1: Choose Stance */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 800
          }}>1</span>
          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            Apakah Anda Setuju atau Tidak Setuju dengan kasus / cerita di atas?
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {/* Card Setuju */}
          <button
            type="button"
            className={`ad-stance-card ${stance === 'agree' ? 'selected-agree' : ''}`}
            onClick={() => handleStanceSelect('agree')}
            style={{
              padding: '1rem 1.15rem',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '0.85rem',
              cursor: 'pointer',
              border: stance === 'agree' ? '2px solid var(--success)' : '1px solid var(--border)',
              background: stance === 'agree' ? 'var(--success-bg, rgba(16, 185, 129, 0.08))' : 'var(--surface)',
              borderRadius: 10,
              transition: 'all 0.2s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: stance === 'agree' ? 'var(--success)' : 'rgba(16, 185, 129, 0.1)',
              color: stance === 'agree' ? '#ffffff' : 'var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.35rem', flexShrink: 0
            }}>
              👍
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700,
                fontSize: '1rem',
                color: stance === 'agree' ? 'var(--success)' : 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                Setuju
                {stance === 'agree' && <CheckCircle2 size={16} color="var(--success)" />}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Saya sependapat dengan kasus / pernyataan di atas
              </div>
            </div>
          </button>

          {/* Card Tidak Setuju */}
          <button
            type="button"
            className={`ad-stance-card ${stance === 'disagree' ? 'selected-disagree' : ''}`}
            onClick={() => handleStanceSelect('disagree')}
            style={{
              padding: '1rem 1.15rem',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '0.85rem',
              cursor: 'pointer',
              border: stance === 'disagree' ? '2px solid var(--danger)' : '1px solid var(--border)',
              background: stance === 'disagree' ? 'var(--danger-bg, rgba(239, 68, 68, 0.08))' : 'var(--surface)',
              borderRadius: 10,
              transition: 'all 0.2s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: stance === 'disagree' ? 'var(--danger)' : 'rgba(239, 68, 68, 0.1)',
              color: stance === 'disagree' ? '#ffffff' : 'var(--danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.35rem', flexShrink: 0
            }}>
              👎
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700,
                fontSize: '1rem',
                color: stance === 'disagree' ? 'var(--danger)' : 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                Tidak Setuju
                {stance === 'disagree' && <CheckCircle2 size={16} color="var(--danger)" />}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Saya menolak / tidak sependapat dengan kasus di atas
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Step 2: Reasons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        paddingTop: '0.85rem',
        borderTop: '1px dashed var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 800
          }}>2</span>
          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {reasonType === 'options'
              ? 'Pilih alasan yang mendasari sikap Anda (dapat memilih lebih dari satu):'
              : 'Tuliskan alasan / argumen mengapa Anda memilih sikap tersebut:'}
          </span>
        </div>

        {/* Reason Mode: Options (Complex MCQ style) */}
        {reasonType === 'options' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {reasonKeys.length === 0 ? (
              <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>
                Belum ada opsi alasan yang disediakan untuk soal ini.
              </div>
            ) : (
              reasonKeys.map((key) => {
                const isSelected = selectedReasons.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={`option-btn ${isSelected ? 'selected-multi' : ''}`}
                    onClick={() => handleToggleReason(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      borderRadius: 8,
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent-bg, rgba(59, 130, 246, 0.08))' : 'var(--surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span className="option-key" style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: isSelected ? 'var(--accent)' : 'var(--navy-mid)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.82rem', flexShrink: 0
                    }}>
                      {key}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      <span className="option-text">{options[key]}</span>
                    </div>
                    <div style={{ flexShrink: 0, color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {isSelected ? <CheckSquare size={20} /> : <Square size={20} style={{ opacity: 0.4 }} />}
                    </div>
                  </button>
                )
              })
            )}

            {selectedReasons.length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingLeft: '0.25rem' }}>
                ✓ {selectedReasons.length} alasan dipilih ({selectedReasons.join(', ')})
              </div>
            )}
          </div>
        )}

        {/* Reason Mode: Essay */}
        {reasonType === 'essay' && (
          <div className="essay-field-wrapper" style={{ width: '100%' }}>
            <textarea
              className="form-input essay-textarea"
              style={{
                minHeight: 140,
                resize: 'vertical',
                width: '100%',
                touchAction: 'manipulation',
                fontSize: '0.92rem',
                lineHeight: 1.6,
                padding: '0.75rem',
                borderRadius: 8,
              }}
              placeholder="Tuliskan argumen atau alasan lengkap Anda di sini..."
              value={essayText}
              onChange={e => handleEssayChange(e.target.value)}
              onKeyDown={stopNative}
              onKeyUp={stopNative}
              onCopy={stopNative}
              onPaste={stopNative}
              onCut={stopNative}
              onContextMenu={stopNative}
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck="false"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>Jawaban esai akan dinilai oleh guru setelah ujian selesai.</span>
              <span>{essayText.length} karakter</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

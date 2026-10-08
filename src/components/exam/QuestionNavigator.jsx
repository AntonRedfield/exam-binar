export default function QuestionNavigator({ questions, answers, currentQ, onSelect }) {
  return (
    <div className="q-navigator" role="navigation" aria-label="Navigasi Nomor Soal">
      <div className="q-nav-label-wrapper">
        <span className="q-nav-label">
          SOAL
        </span>
      </div>
      <div className="q-nav-grid">
        {questions.map((q, index) => {
          const displayNum = index + 1;
          const ans = answers[String(q.number)]
          let hasAnswer = false

          if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
            hasAnswer = Object.keys(ans).length > 0
          } else if (Array.isArray(ans)) {
            hasAnswer = ans.length > 0
          } else {
            hasAnswer = ans !== undefined && ans !== null && ans !== ''
          }

          const isCurrent = displayNum === currentQ
          let cls = 'q-nav-btn'
          if (isCurrent) cls += ' current'
          if (hasAnswer) cls += ' answered'

          return (
            <button
              key={q.number}
              type="button"
              className={cls}
              onClick={() => onSelect(displayNum)}
              title={`Soal ${displayNum}${hasAnswer ? ' (Sudah Dijawab)' : ''}`}
              aria-label={`Pindah ke soal nomor ${displayNum}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              {displayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function QuestionNavigator({ questions, answers, currentQ, onSelect }) {
  return (
    <div className="q-navigator">
      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'center' }}>
        Soal
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
          else if (hasAnswer) cls += ' answered'

          return (
            <button key={q.number} className={cls} onClick={() => onSelect(displayNum)} title={`Soal ${displayNum}`}>
              {displayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}

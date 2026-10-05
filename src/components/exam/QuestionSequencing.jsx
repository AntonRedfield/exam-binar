import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, ListOrdered } from 'lucide-react'

function shuffleArray(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr
}

export default function QuestionSequencing({ question, value, onChange }) {
  const items = question?.options?.items || []
  const itemMap = {}
  items.forEach(it => { itemMap[it.id] = it })

  // Initialize or synchronize ordered IDs
  const [currentOrder, setCurrentOrder] = useState(() => {
    if (Array.isArray(value) && value.length === items.length) {
      return value
    }
    const ids = items.map(it => it.id)
    return shuffleArray(ids)
  })

  useEffect(() => {
    if (Array.isArray(value) && value.length === items.length) {
      setCurrentOrder(value)
    }
  }, [value, items.length])

  function moveItem(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= currentOrder.length) return
    const newOrder = [...currentOrder]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setCurrentOrder(newOrder)
    onChange(newOrder)
  }

  function handleDirectRank(itemIdx, targetRank) {
    const targetIdx = Number(targetRank) - 1
    moveItem(itemIdx, targetIdx)
  }

  if (items.length === 0) {
    return (
      <div className="alert alert-warning" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
        Tidak ada item yang ditambahkan untuk soal urutan ini.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '0.5rem' }}>
      <div className="alert alert-info" style={{ fontSize: '0.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ListOrdered size={16} />
        <span>Urutkan langkah / tahapan berikut dari urutan awal (No. 1) hingga urutan akhir menggunakan tombol panah atau pilihan urutan.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {currentOrder.map((id, idx) => {
          const item = itemMap[id]
          if (!item) return null
          return (
            <div
              key={id}
              className="card"
              style={{
                padding: '0.625rem 0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1 }}>
                <span
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--navy)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.85rem', flexShrink: 0
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: '0.9rem', lineHeight: 1.4, flex: 1 }}>
                  {item.text}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                {/* Direct Rank selector */}
                <select
                  className="form-input"
                  style={{ width: 'auto', padding: '0.2rem 0.4rem', fontSize: '0.8rem', height: 28 }}
                  value={idx + 1}
                  onChange={e => handleDirectRank(idx, e.target.value)}
                  title="Pindah langsung ke urutan"
                >
                  {currentOrder.map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Ke-{i + 1}
                    </option>
                  ))}
                </select>

                {/* Move Up */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0.2rem 0.4rem', height: 28 }}
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, idx - 1)}
                  title="Pindahkan ke atas"
                >
                  <ChevronUp size={16} />
                </button>

                {/* Move Down */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0.2rem 0.4rem', height: 28 }}
                  disabled={idx === currentOrder.length - 1}
                  onClick={() => moveItem(idx, idx + 1)}
                  title="Pindahkan ke bawah"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

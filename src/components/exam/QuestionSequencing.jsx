import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronUp, ChevronDown, ListOrdered, CheckCircle2 } from 'lucide-react'

/**
 * Robust normalization of question options.
 * Handles:
 * - standard format: { items: [ { id, text, image? }, ... ] }
 * - JSON stringified object or array: "{\"items\":[...]}" or "[...]"
 * - direct array of objects or strings: [ { id, text } ] or [ "Langkah 1", "Langkah 2" ]
 * - key-value objects: { "1": "Langkah 1", "2": "Langkah 2" }
 */
function extractItems(options) {
  if (!options) return []
  let raw = options

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        raw = JSON.parse(trimmed)
      } catch {
        return []
      }
    } else {
      return []
    }
  }

  // 1. Array directly: [ { id, text }, ... ] or [ "text", ... ]
  if (Array.isArray(raw)) {
    return raw
      .map((it, idx) => {
        if (typeof it === 'object' && it !== null) {
          return {
            id: String(it.id ?? `seq_${idx + 1}`),
            text: String(it.text ?? it.label ?? it.value ?? ''),
            image: it.image || it.image_url || null,
          }
        }
        return {
          id: `seq_${idx + 1}`,
          text: String(it ?? ''),
          image: null,
        }
      })
      .filter(it => it.text.trim().length > 0 || it.image)
  }

  // 2. Object with items array: { items: [ ... ] }
  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
    return raw.items
      .map((it, idx) => {
        if (typeof it === 'object' && it !== null) {
          return {
            id: String(it.id ?? `seq_${idx + 1}`),
            text: String(it.text ?? it.label ?? it.value ?? ''),
            image: it.image || it.image_url || null,
          }
        }
        return {
          id: `seq_${idx + 1}`,
          text: String(it ?? ''),
          image: null,
        }
      })
      .filter(it => it.text.trim().length > 0 || it.image)
  }

  // 3. Key-value mapping: { "1": "text 1", "2": "text 2" }
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw).filter(k => k !== 'items' && k !== 'option_images')
    if (keys.length > 0) {
      return keys.map((k) => ({
        id: String(k),
        text: String(raw[k] ?? ''),
        image: raw.option_images?.[k] || null,
      })).filter(it => it.text.trim().length > 0 || it.image)
    }
  }

  return []
}

/**
 * Fast deterministic string 32-bit FNV-1a hash
 */
function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Fast deterministic seeded shuffle using Xorshift PRNG (<0.01ms).
 * Guarantees that items won't re-scramble inconsistently during tab/question switching.
 */
function seededShuffle(arr, seedNum) {
  const result = [...arr]
  if (result.length <= 1) return result

  let seed = seedNum || 123456789
  for (let i = result.length - 1; i > 0; i--) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    const rand = Math.abs(seed) % (i + 1);
    [result[i], result[rand]] = [result[rand], result[i]];
  }

  // Ensure initial display is scrambled if length >= 2
  if (result.length > 1 && result.every((item, idx) => item === arr[idx])) {
    result.push(result.shift())
  }
  return result
}

/**
 * Safely parse candidate answer value
 */
function parseSafeValue(val) {
  if (!val) return null
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.map(String)
      } catch {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean)
    }
    return [trimmed]
  }
  return null
}

/**
 * Determine effective active order from saved answer or initial deterministic shuffle.
 */
function resolveOrder(savedValue, allItems, qKey) {
  const itemIds = allItems.map(it => it.id)
  const idSet = new Set(itemIds)
  const parsed = parseSafeValue(savedValue)

  if (parsed && parsed.length > 0) {
    const validSaved = parsed.filter(id => idSet.has(id))
    // Append any missing items if question was edited
    const missing = itemIds.filter(id => !validSaved.includes(id))
    const merged = [...validSaved, ...missing]
    if (merged.length === itemIds.length && itemIds.length > 0) {
      return { order: merged, isAnswered: true }
    }
  }

  // Not answered yet: generate deterministic initial scrambled order
  const seed = hashSeed(String(qKey))
  const shuffled = seededShuffle(itemIds, seed)
  return { order: shuffled, isAnswered: false }
}

export default function QuestionSequencing({ question, value, onChange }) {
  const items = useMemo(() => extractItems(question?.options), [question?.options])
  const itemMap = useMemo(() => {
    const map = new Map()
    items.forEach(it => map.set(it.id, it))
    return map
  }, [items])

  const qKey = question?.id || question?.number || 'seq_default'

  // Resolve current active order based on value and items
  const resolved = useMemo(() => {
    return resolveOrder(value, items, qKey)
  }, [value, items, qKey])

  const [currentOrder, setCurrentOrder] = useState(() => resolved.order)

  // Keep state synchronized with question/items/value
  useEffect(() => {
    setCurrentOrder(resolved.order)
  }, [resolved.order])

  const moveItem = useCallback((fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= currentOrder.length || fromIdx === toIdx) return
    const next = [...currentOrder]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setCurrentOrder(next)
    onChange?.(next)
  }, [currentOrder, onChange])

  const handleDirectRank = useCallback((itemIdx, targetRank) => {
    const targetIdx = Number(targetRank) - 1
    moveItem(itemIdx, targetIdx)
  }, [moveItem])

  const handleConfirmAsIs = useCallback(() => {
    onChange?.(currentOrder)
  }, [currentOrder, onChange])

  if (items.length === 0) {
    return (
      <div className="alert alert-warning" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
        Tidak ada item yang ditambahkan untuk soal urutan ini.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
      {/* Informational banner / status */}
      <div
        className={resolved.isAnswered ? 'alert alert-success' : 'alert alert-info'}
        style={{
          fontSize: '0.82rem',
          margin: 0,
          padding: '0.6rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          borderRadius: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 200 }}>
          {resolved.isAnswered ? <CheckCircle2 size={16} color="var(--success, #16a34a)" /> : <ListOrdered size={16} />}
          <span>
            {resolved.isAnswered
              ? 'Urutan telah tersimpan. Anda tetap dapat mengubah urutan langkah kapan saja menggunakan tombol panah atau pilihan nomor.'
              : 'Urutkan tahapan dari awal (No. 1) hingga akhir (No. ' + items.length + ') menggunakan tombol panah atau pilihan nomor urutan.'}
          </span>
        </div>

        {!resolved.isAnswered && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={handleConfirmAsIs}
            style={{
              padding: '0.25rem 0.6rem',
              fontSize: '0.78rem',
              height: 30,
              touchAction: 'manipulation',
              border: '1px solid currentColor',
              borderRadius: 6,
              fontWeight: 600,
              flexShrink: 0
            }}
            title="Gunakan urutan saat ini sebagai jawaban"
          >
            ✓ Tetapkan Susunan Ini
          </button>
        )}
      </div>

      {/* Ordered Items List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {currentOrder.map((id, idx) => {
          const item = itemMap.get(id)
          if (!item) return null

          return (
            <div
              key={id}
              className="card"
              style={{
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                transition: 'border-color 0.12s ease, background-color 0.12s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                {/* Step number badge */}
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--navy, #1e3a8a)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  {idx + 1}
                </span>

                {/* Step text & optional image */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.92rem', lineHeight: 1.45, color: 'var(--text-primary)', wordBreak: 'break-word', display: 'block' }}>
                    {item.text}
                  </span>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={`Langkah ${idx + 1}`}
                      style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, marginTop: '0.35rem', objectFit: 'contain' }}
                      loading="lazy"
                    />
                  )}
                </div>
              </div>

              {/* Action Controls Group: Mobile touch-optimized */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                {/* Direct Rank selector */}
                <select
                  className="form-input"
                  style={{
                    width: 'auto',
                    minWidth: 64,
                    height: 36,
                    padding: '0 0.4rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    borderRadius: 6,
                    touchAction: 'manipulation',
                    cursor: 'pointer'
                  }}
                  value={idx + 1}
                  onChange={e => handleDirectRank(idx, e.target.value)}
                  title="Pindah langsung ke urutan nomor"
                  aria-label={`Ubah urutan langkah ke-${idx + 1}`}
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
                  style={{
                    width: 36,
                    height: 36,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    borderRadius: 6
                  }}
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, idx - 1)}
                  title="Pindahkan ke atas"
                  aria-label="Pindahkan ke atas"
                >
                  <ChevronUp size={18} />
                </button>

                {/* Move Down */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    width: 36,
                    height: 36,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    borderRadius: 6
                  }}
                  disabled={idx === currentOrder.length - 1}
                  onClick={() => moveItem(idx, idx + 1)}
                  title="Pindahkan ke bawah"
                  aria-label="Pindahkan ke bawah"
                >
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

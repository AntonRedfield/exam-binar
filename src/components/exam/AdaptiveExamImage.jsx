import React, { useState, useEffect } from 'react'
import { extractDriveFileId } from '../../lib/grader'
import { ExternalLink, Image as ImageIcon, AlertTriangle } from 'lucide-react'

/**
 * Lightweight, resilient image renderer for exam questions and MCQ options.
 * Handles Google Drive links with multiple CDN mirrors (lh3, thumbnail, uc?export=view).
 * If all direct image mirrors fail (e.g. Drive file is restricted), falls back
 * to an iframe preview or direct open button so candidates can still view the content.
 */
export default function AdaptiveExamImage({
  src,
  alt = 'Lampiran Gambar',
  maxHeight = 360,
  style = {},
  className = '',
  type = 'question', // 'question' | 'option'
  optionKey = '',
}) {
  const [attemptIndex, setAttemptIndex] = useState(0)
  const [hasFailedAllDirect, setHasFailedAllDirect] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const driveId = extractDriveFileId(src)

  // Candidate direct image URLs to try in order
  const candidates = React.useMemo(() => {
    if (!src) return []
    if (driveId) {
      return [
        `https://lh3.googleusercontent.com/d/${driveId}=s1200`,
        `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`,
        `https://drive.google.com/uc?export=view&id=${driveId}`,
      ]
    }
    return [src]
  }, [src, driveId])

  useEffect(() => {
    setAttemptIndex(0)
    setHasFailedAllDirect(false)
    setIsLoaded(false)
  }, [src])

  if (!src) return null

  const currentSrc = candidates[attemptIndex]

  const handleImageError = () => {
    if (attemptIndex < candidates.length - 1) {
      setAttemptIndex(prev => prev + 1)
    } else {
      setHasFailedAllDirect(true)
    }
  }

  // --- Fallback View when all direct image links fail ---
  if (hasFailedAllDirect) {
    if (type === 'question') {
      return (
        <div
          style={{
            border: '1.5px solid #cbd5e1',
            borderRadius: '8px',
            background: '#ffffff',
            overflow: 'hidden',
            marginBottom: '1rem',
          }}
        >
          {/* Card Header */}
          <div
            style={{
              padding: '0.5rem 0.85rem',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e3a8a', fontSize: '0.8rem', fontWeight: 600 }}>
              <ImageIcon size={15} color="#2563eb" />
              <span>Lampiran Gambar Soal {driveId ? '(Google Drive)' : ''}</span>
            </div>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: '#2563eb',
                fontSize: '0.75rem',
                fontWeight: 600,
                textDecoration: 'none',
                background: '#eff6ff',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid #bfdbfe',
              }}
            >
              <span>Buka Gambar di Tab Baru</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Iframe preview for Drive images */}
          {driveId ? (
            <div style={{ width: '100%', height: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight, minHeight: '260px', background: '#f8fafc' }}>
              <iframe
                src={`https://drive.google.com/file/d/${driveId}/preview`}
                title={alt}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="autoplay"
              />
            </div>
          ) : (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              <AlertTriangle size={20} color="#f59e0b" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
              <div>Gambar tidak dapat dimuat langsung. Silakan buka melalui tautan di atas.</div>
            </div>
          )}

          {/* Helpful Footer Hint */}
          <div
            style={{
              padding: '0.35rem 0.75rem',
              background: '#f1f5f9',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.7rem',
              color: '#64748b',
              lineHeight: 1.3,
            }}
          >
            💡 Catatan: Jika pratinjau meminta izin, pastikan izin file Google Drive telah diatur ke &ldquo;Siapa saja yang memiliki tautan&rdquo;.
          </div>
        </div>
      )
    }

    // Fallback for option image
    return (
      <div style={{ marginTop: '0.35rem', marginBottom: '0.2rem' }}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#1e3a8a',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <ImageIcon size={14} color="#2563eb" />
          <span>Lihat Lampiran Gambar Opsi {optionKey}</span>
          <ExternalLink size={12} />
        </a>
      </div>
    )
  }

  // --- Normal Direct Image Rendering ---
  return (
    <div
      className={type === 'option' ? 'option-image-wrapper' : 'question-image-box'}
      style={
        type === 'question'
          ? {
              marginBottom: '1rem',
              textAlign: 'center',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.5rem',
              ...style,
            }
          : { ...style }
      }
    >
      <img
        src={currentSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={handleImageError}
        className={className || (type === 'option' ? 'option-adaptive-img' : '')}
        style={{
          maxWidth: '100%',
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          objectFit: 'contain',
          borderRadius: type === 'option' ? '6px' : '6px',
          display: isLoaded ? 'block' : 'block',
          margin: '0 auto',
        }}
      />
    </div>
  )
}

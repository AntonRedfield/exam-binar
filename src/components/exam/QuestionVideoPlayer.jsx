import React, { useState } from 'react'
import { getVideoEmbedInfo } from '../../lib/grader'
import { Video, ExternalLink, AlertCircle } from 'lucide-react'

export default function QuestionVideoPlayer({
  videoUrl,
  title = 'Lampiran Video',
  maxHeight = 360,
  style = {},
  showTitle = false,
}) {
  const [hasError, setHasError] = useState(false)
  const embed = getVideoEmbedInfo(videoUrl)

  if (!videoUrl || !embed) return null

  return (
    <div
      className="question-video-container"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#0f172a',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        ...style,
      }}
    >
      {showTitle && (
        <div
          style={{
            padding: '0.5rem 0.85rem',
            background: 'rgba(255,255,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f8fafc', fontSize: '0.8rem', fontWeight: 600 }}>
            <Video size={14} color="var(--gold)" />
            <span>{title}</span>
            {embed.label && (
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>({embed.label})</span>
            )}
          </div>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', textDecoration: 'none' }}
            title="Buka video di tab baru"
          >
            <span>Buka Tab Baru</span>
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      {hasError ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>
          <AlertCircle size={24} style={{ margin: '0 auto 0.5rem', display: 'block' }} />
          <div>Tidak dapat memuat pratinjau video langsung.</div>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: '0.75rem', display: 'inline-flex', gap: '0.35rem', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <ExternalLink size={13} /> Tonton Video di Sumber Asli
          </a>
        </div>
      ) : embed.type === 'video' ? (
        <video
          controls
          playsInline
          preload="metadata"
          onError={() => setHasError(true)}
          style={{
            width: '100%',
            maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
            display: 'block',
            background: '#000',
          }}
          src={embed.src}
        >
          Browser Anda tidak mendukung pemutar video HTML5.
        </video>
      ) : (
        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}>
          <iframe
            src={embed.src}
            title={title}
            onError={() => setHasError(true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0,
            }}
          />
        </div>
      )}
    </div>
  )
}

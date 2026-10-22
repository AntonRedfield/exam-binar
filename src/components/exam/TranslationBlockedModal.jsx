import React, { useState } from 'react'
import { Languages, AlertTriangle, RefreshCw, HelpCircle } from 'lucide-react'

export default function TranslationBlockedModal({ onRecheck, violationCount = 0 }) {
  const [checking, setChecking] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleCheck = () => {
    setChecking(true)
    setErrorMsg('')
    setTimeout(() => {
      const stillTranslated = onRecheck?.()
      setChecking(false)
      if (stillTranslated) {
        setErrorMsg('Fitur terjemahan browser masih terdeteksi aktif. Silakan pilih "Tampilkan naskah asli" atau matikan terjemahan pada browser Anda.')
      }
    }, 400)
  }

  const handleReload = () => {
    window.location.reload()
  }

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: 520,
          width: '100%',
          background: 'var(--surface, #ffffff)',
          borderRadius: 16,
          border: '2px solid var(--danger, #ef4444)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Languages size={24} color="#ffffff" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              Terjemahan Otomatis Terdeteksi!
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
              Pelanggaran Integritas Ujian
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem' }}>
          <div
            className="alert alert-error"
            style={{
              marginBottom: '1rem',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#991b1b',
              borderRadius: 8,
              padding: '0.85rem',
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Perhatian:</strong> Terjemahan otomatis terdeteksi. Matikan terjemahan browser untuk melanjutkan ujian / kuis.
              {violationCount > 0 && (
                <div style={{ marginTop: '0.35rem', fontWeight: 600 }}>
                  Aktivitas ini telah dicatat sebagai pelanggaran #{violationCount}.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: 'var(--navy-light, #f8fafc)',
              borderRadius: 10,
              padding: '1rem',
              border: '1px solid var(--border, #e2e8f0)',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary, #334155)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary, #0f172a)' }}>
              <HelpCircle size={16} /> Cara Menonaktifkan Terjemahan:
            </div>
            <ol style={{ paddingLeft: '1.25rem', margin: 0, lineHeight: 1.6 }}>
              <li>Klik ikon <strong>Google Translate / Microsoft Translator</strong> di bilah alamat (URL bar) atau menu browser.</li>
              <li>Pilih <strong>"Tampilkan naskah asli"</strong> (<em>Show original</em>) atau nonaktifkan terjemahan otomatis.</li>
              <li>Pilih opsi <strong>"Jangan pernah terjemahkan situs ini"</strong> (<em>Never translate this site</em>).</li>
              <li>Setelah dimatikan, klik tombol <strong>Periksa Ulang</strong> di bawah.</li>
            </ol>
          </div>

          {errorMsg && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onClick={handleCheck}
              disabled={checking}
            >
              {checking ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  Memeriksa Status Terjemahan...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Periksa Ulang & Lanjutkan Ujian
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.82rem',
                color: 'var(--text-muted, #64748b)',
              }}
              onClick={handleReload}
            >
              Muat Ulang Halaman (Reset Bersih)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

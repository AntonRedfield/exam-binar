import React from 'react'
import {
  AlertTriangle,
  X,
  Lock,
  Zap,
  BarChart2,
  FileText,
  RefreshCw,
  ShieldAlert
} from 'lucide-react'

/**
 * UnpublishExamModal
 * 
 * Prominent confirmation dialog displayed before unpublishing an exam.
 * Explains clearly that all currently active students will be force-submitted,
 * their answers will be extracted and automatically graded, and the exam will
 * revert to draft status.
 */
export default function UnpublishExamModal({
  isOpen,
  onClose,
  exam,
  onConfirm,
  isProcessing = false
}) {
  if (!isOpen || !exam) return null

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isProcessing) onClose()
      }}
      style={{
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        className="modal card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 540,
          width: '100%',
          padding: 0,
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1.5px solid #f87171',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
          background: 'var(--surface, #ffffff)',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Modal Top Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            borderBottom: '1px solid #fecaca',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              background: '#fee2e2',
              border: '2px solid #ef4444',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <AlertTriangle size={24} />
          </div>

          <div style={{ flex: 1, paddingRight: '1.5rem' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#991b1b',
                lineHeight: 1.3
              }}
            >
              Konfirmasi Unpublish &amp; Kumpul Paksa
            </h3>
            <div
              style={{
                marginTop: '0.35rem',
                fontSize: '0.82rem',
                color: '#b91c1c',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <FileText size={13} />
              <span style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {exam.title}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              padding: '0.35rem',
              borderRadius: '8px',
              color: '#991b1b'
            }}
            title="Batal dan tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.92rem',
              color: '#334155',
              lineHeight: 1.55,
              fontWeight: 500
            }}
          >
            Membatalkan publikasi (Unpublish) akan menghentikan pelaksanaan ujian ini seketika. Sistem akan secara otomatis menjalankan tindakan berikut:
          </p>

          {/* Action Explanations */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Zap size={16} />
              </div>
              <div style={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.45 }}>
                <strong style={{ color: '#0f172a' }}>1. Force Submit Otomatis:</strong> Seluruh siswa yang sedang aktif mengerjakan akan langsung dipaksa mengumpulkan ujian pada detik ini.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <FileText size={16} />
              </div>
              <div style={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.45 }}>
                <strong style={{ color: '#0f172a' }}>2. Ekstraksi Semua Jawaban:</strong> Sistem mengekstrak seluruh rekaman jawaban terakhir yang telah dipilih atau diisi oleh siswa.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BarChart2 size={16} />
              </div>
              <div style={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.45 }}>
                <strong style={{ color: '#0f172a' }}>3. Penilaian (Grading) Otomatis:</strong> Nilai siswa langsung dihitung dan disimpan secara permanen ke daftar hasil ujian.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Lock size={16} />
              </div>
              <div style={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.45 }}>
                <strong style={{ color: '#0f172a' }}>4. Ujian Masuk Draft:</strong> Status ujian berubah menjadi Draft. Siswa di ruang ujian akan dialihkan ke lembar nilai dan tidak bisa lagi mengerjakan.
              </div>
            </div>
          </div>

          {/* Caution alert box */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}
          >
            <ShieldAlert size={18} color="#d97706" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: '#92400e', lineHeight: 1.4 }}>
              Pastikan Anda memang ingin menutup ujian sekarang. Hasil nilai yang diekstrak dapat ditinjau kapan saja melalui menu <strong>Hasil Ujian</strong>.
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-subtle, #f8fafc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem'
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isProcessing}
            style={{ fontWeight: 600, color: '#64748b' }}
          >
            Batal
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isProcessing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              background: '#dc2626',
              borderColor: '#b91c1c',
              color: '#ffffff',
              padding: '0.6rem 1.25rem',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
            }}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Mengekstrak &amp; Menilai...</span>
              </>
            ) : (
              <>
                <Lock size={15} />
                <span>Ya, Unpublish &amp; Kumpulkan Jawaban</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

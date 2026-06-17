import { useState, useEffect } from 'react'
import { getCurrentUser, updatePasskeyStatus } from '../lib/auth'
import {
  shouldOfferBiometric,
  registerBiometric,
  dismissBiometricPrompt,
  detectFastLoginState,
  FastLoginState,
} from '../lib/biometric'
import { Fingerprint, ScanFace, KeyRound, X, ShieldCheck, ChevronRight, ShieldAlert } from 'lucide-react'

export default function BiometricPrompt() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState('offer') // 'offer' | 'registering' | 'success' | 'error' | 'no_platform'
  const [errorMsg, setErrorMsg] = useState('')
  const user = getCurrentUser()

  useEffect(() => {
    async function check() {
      if (!user) return

      // First check if we should even offer (dismissed or already registered)
      const shouldShow = await shouldOfferBiometric(user.id)
      if (!shouldShow) return

      // Then do a full state detection to ensure platform authenticator is available
      const { state } = await detectFastLoginState()

      if (state === FastLoginState.NO_PLATFORM_AUTH) {
        // Device has no PIN/fingerprint/Face ID — show helpful message instead
        setTimeout(() => {
          setStep('no_platform')
          setShow(true)
        }, 1200)
        return
      }

      if (state === FastLoginState.UNSUPPORTED_BROWSER) {
        // Don't show anything on unsupported browsers
        return
      }

      // Platform authenticator available and no passkey registered — offer enrollment
      if (state === FastLoginState.READY_TO_REGISTER || state === FastLoginState.PASSKEY_READY) {
        setTimeout(() => setShow(true), 1200)
      }
    }
    check()
  }, [user?.id])

  async function handleEnable() {
    if (!user) return

    setStep('registering')
    setErrorMsg('')

    try {
      await registerBiometric(user)

      // Sync passkey status to Supabase
      await updatePasskeyStatus(user.id, true).catch(err => {
        console.warn('[FastLogin] Failed to sync passkey status to server:', err)
      })

      setStep('success')
      setTimeout(() => setShow(false), 2500)
    } catch (err) {
      setErrorMsg(err.message)
      setStep('error')
    }
  }

  function handleDismiss() {
    dismissBiometricPrompt(user?.id)
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="biometric-overlay">
      <div className="biometric-modal">
        <button
          className="biometric-close"
          onClick={handleDismiss}
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        {step === 'offer' && (
          <>
            <div className="biometric-icon-group">
              <div className="biometric-icon-circle">
                <Fingerprint size={32} strokeWidth={1.5} />
              </div>
              <div className="biometric-icon-circle biometric-icon-face">
                <ScanFace size={28} strokeWidth={1.5} />
              </div>
              <div className="biometric-icon-circle biometric-icon-pin">
                <KeyRound size={24} strokeWidth={1.5} />
              </div>
            </div>

            <h3 className="biometric-title">Login Lebih Cepat</h3>
            <p className="biometric-desc">
              Hai <strong>{user?.name}</strong>, aktifkan login cepat menggunakan sidik jari, Face ID, atau PIN perangkat Anda.
              Login berikutnya cukup satu sentuhan!
            </p>

            <div className="biometric-methods">
              <div className="biometric-method">
                <Fingerprint size={16} />
                <span>Sidik Jari</span>
              </div>
              <div className="biometric-method">
                <ScanFace size={16} />
                <span>Face ID</span>
              </div>
              <div className="biometric-method">
                <KeyRound size={16} />
                <span>PIN / Pola</span>
              </div>
            </div>

            <button className="btn biometric-enable-btn" onClick={handleEnable}>
              <ShieldCheck size={18} />
              Aktifkan Sekarang
              <ChevronRight size={16} />
            </button>

            <button className="biometric-skip" onClick={handleDismiss}>
              Nanti saja
            </button>
          </>
        )}

        {step === 'registering' && (
          <div className="biometric-status">
            <div className="biometric-icon-circle biometric-icon-pulse">
              <Fingerprint size={32} strokeWidth={1.5} />
            </div>
            <h3 className="biometric-title">Memverifikasi...</h3>
            <p className="biometric-desc">
              Ikuti instruksi pada perangkat Anda untuk mendaftarkan biometrik, Face ID, atau PIN.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="biometric-status">
            <div className="biometric-icon-circle biometric-icon-success">
              <ShieldCheck size={32} strokeWidth={1.5} />
            </div>
            <h3 className="biometric-title" style={{ color: 'var(--success)' }}>Berhasil!</h3>
            <p className="biometric-desc">
              Login biometrik untuk <strong>{user?.name}</strong> telah diaktifkan. Selanjutnya cukup satu sentuhan!
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="biometric-status">
            <div className="biometric-icon-circle biometric-icon-error">
              <X size={32} strokeWidth={1.5} />
            </div>
            <h3 className="biometric-title" style={{ color: 'var(--danger)' }}>Gagal</h3>
            <p className="biometric-desc">{errorMsg}</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', width: '100%' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleDismiss}>Lewati</button>
              <button className="btn biometric-enable-btn" style={{ flex: 1 }} onClick={() => setStep('offer')}>
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {step === 'no_platform' && (
          <div className="biometric-status">
            <div className="biometric-icon-circle biometric-icon-warn">
              <ShieldAlert size={32} strokeWidth={1.5} />
            </div>
            <h3 className="biometric-title" style={{ color: 'var(--warning)' }}>Pengaturan Diperlukan</h3>
            <p className="biometric-desc">
              Untuk menggunakan Fast Login, silakan aktifkan salah satu metode keamanan berikut di pengaturan perangkat Anda:
            </p>
            <div className="biometric-methods" style={{ marginBottom: '1rem' }}>
              <div className="biometric-method">
                <Fingerprint size={16} />
                <span>Sidik Jari</span>
              </div>
              <div className="biometric-method">
                <ScanFace size={16} />
                <span>Face ID</span>
              </div>
              <div className="biometric-method">
                <KeyRound size={16} />
                <span>PIN / Pola</span>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={handleDismiss}>
              Mengerti
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

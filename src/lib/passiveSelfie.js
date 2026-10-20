/**
 * Passive Hidden Selfie & Anti-Piloting (Anti-Joki) Engine
 * 
 * Silently and passively takes a quick photo of the user while they are
 * reading the exam description in ExamLobby or beginning the exam.
 * 
 * If camera is blocked, unavailable, or denied, the session is flagged
 * as unverified/missing so teachers can inspect it on the Monitor page
 * and verify physical attendance before confirming.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'

const PASSIVE_SELFIE_PREFIX = 'binar_passive_selfie_'

/**
 * Capture a secret, passive selfie without audio, flashes, or popups.
 */
export async function capturePassiveSelfie({
  timeoutMs = 8000,
  maxWidth = 360,
  maxHeight = 270,
  quality = 0.65
} = {}) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      success: false,
      reason: 'Browser atau perangkat tidak mendukung akses kamera'
    }
  }

  let stream = null
  let video = null

  try {
    const capturePromise = new Promise(async (resolve, reject) => {
      try {
        video = document.createElement('video')
        video.setAttribute('autoplay', '')
        video.setAttribute('playsinline', '')
        video.setAttribute('muted', '')
        video.muted = true
        video.style.position = 'fixed'
        video.style.top = '-9999px'
        video.style.left = '-9999px'
        video.style.width = '1px'
        video.style.height = '1px'
        video.style.opacity = '0'
        video.style.pointerEvents = 'none'
        document.body.appendChild(video)

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 480 },
            height: { ideal: 360 }
          },
          audio: false
        })

        video.srcObject = stream

        video.onloadedmetadata = async () => {
          try {
            await video.play()

            // Wait ~800ms for camera sensor exposure and brightness to stabilize
            await new Promise(r => setTimeout(r, 800))

            const vw = video.videoWidth || 320
            const vh = video.videoHeight || 240

            // Scale down to lightweight dimensions
            const scale = Math.min(maxWidth / vw, maxHeight / vh, 1)
            const targetWidth = Math.round(vw * scale)
            const targetHeight = Math.round(vh * scale)

            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight

            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

            // Convert to lightweight JPEG data URL (~25KB)
            const dataUrl = canvas.toDataURL('image/jpeg', quality)

            resolve({
              success: true,
              image: dataUrl,
              width: targetWidth,
              height: targetHeight,
              capturedAt: new Date().toISOString()
            })
          } catch (playErr) {
            reject(playErr)
          }
        }

        video.onerror = (e) => reject(new Error('Video stream error'))
      } catch (err) {
        reject(err)
      }
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout mengambil foto pasif')), timeoutMs)
    )

    const result = await Promise.race([capturePromise, timeoutPromise])
    return result
  } catch (err) {
    let failureReason = err.message || 'Gagal mengambil foto verifikasi'
    if (err.name === 'NotAllowedError' || failureReason.includes('Permission denied')) {
      failureReason = 'Izin kamera ditolak oleh siswa'
    } else if (err.name === 'NotFoundError' || failureReason.includes('DevicesNotFoundError')) {
      failureReason = 'Kamera tidak ditemukan pada perangkat'
    } else if (err.name === 'NotReadableError') {
      failureReason = 'Kamera sedang digunakan aplikasi lain'
    }

    return {
      success: false,
      reason: failureReason
    }
  } finally {
    // Immediately stop all media tracks to turn off camera LED
    if (stream) {
      try {
        stream.getTracks().forEach(t => t.stop())
      } catch (e) {}
    }
    if (video && video.parentNode) {
      try {
        video.parentNode.removeChild(video)
      } catch (e) {}
    }
  }
}

/**
 * Get cached passive selfie for current exam from sessionStorage.
 */
export function getStoredPassiveSelfie(examId) {
  try {
    const raw = sessionStorage.getItem(`${PASSIVE_SELFIE_PREFIX}${examId}`)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

/**
 * Cache passive selfie result in sessionStorage.
 */
export function setStoredPassiveSelfie(examId, selfieResult) {
  try {
    if (selfieResult) {
      sessionStorage.setItem(`${PASSIVE_SELFIE_PREFIX}${examId}`, JSON.stringify(selfieResult))
    } else {
      sessionStorage.removeItem(`${PASSIVE_SELFIE_PREFIX}${examId}`)
    }
  } catch (e) {}
}

/**
 * Teacher confirms physical attendance of student (clearing anti-piloting warning).
 */
export async function confirmStudentPhysicalAttendance(sessionId, teacherName = 'Pengawas') {
  if (!sessionId) return { success: false, error: 'Session ID tidak valid' }

  const now = new Date().toISOString()
  const payload = {
    selfie_status: 'teacher_confirmed',
    teacher_confirmed_by: teacherName,
    teacher_confirmed_at: now
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('exam_sessions')
        .update(payload)
        .eq('id', sessionId)

      if (error) {
        console.warn('[PassiveSelfie] Supabase update warning:', error.message)
        // If columns not migrated yet, still return success for UI state
      }
    } catch (e) {
      console.warn('[PassiveSelfie] Database call error:', e)
    }
  }

  return { success: true, payload }
}

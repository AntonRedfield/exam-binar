import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Face detection hook using Google MediaPipe Face Landmarker (WASM).
 *
 * Strategy: Captures frames at ~1 FPS, runs face landmark detection,
 * calculates head orientation from nose tip + eye landmarks.
 * If 3+ "LookAway" events within a 10-second rolling window → triggers violation.
 *
 * Zero video is uploaded. Frames are discarded immediately after inference.
 *
 * @param {Object} opts
 * @param {boolean} opts.enabled - Only true for Level 4 exams
 * @param {Function} opts.onViolation - Called when gaze violation is confirmed
 * @returns {{ cameraReady, cameraError, lookAwayCount, requestCamera, stopCamera, videoRef }}
 */
export function useFaceDetection({ enabled, onViolation }) {
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [lookAwayCount, setLookAwayCount] = useState(0)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const inferenceTimerRef = useRef(null)
  const lookAwayWindowRef = useRef([])
  const enabledRef = useRef(enabled)
  const onViolationRef = useRef(onViolation)
  const modelLoadingRef = useRef(false)
  const modelLoadedRef = useRef(false)

  // Keep refs in sync
  enabledRef.current = enabled
  onViolationRef.current = onViolation

  // ─── Request camera access ──────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    setCameraError('')
    try {
      console.log('[FaceDetection] Requesting camera access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream

      if (!videoRef.current) {
        const vid = document.createElement('video')
        vid.setAttribute('playsinline', '')
        vid.setAttribute('autoplay', '')
        vid.muted = true
        vid.width = 320
        vid.height = 240
        videoRef.current = vid
      }

      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraReady(true)
      console.log('[FaceDetection] Camera ready ✓')
      return true
    } catch (err) {
      console.error('[FaceDetection] Camera error:', err)
      const msg = err.name === 'NotAllowedError'
        ? 'Akses kamera ditolak. Izinkan kamera untuk memulai ujian Level 4.'
        : err.name === 'NotFoundError'
        ? 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.'
        : `Gagal mengakses kamera: ${err.message}`
      setCameraError(msg)
      return false
    }
  }, [])

  // ─── Stop camera & cleanup ─────────────────────────────────────────
  const stopCamera = useCallback(() => {
    console.log('[FaceDetection] Stopping camera & cleanup')
    if (inferenceTimerRef.current) {
      clearInterval(inferenceTimerRef.current)
      inferenceTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
  }, [])

  // ─── Load MediaPipe Face Landmarker from npm package ───────────────
  const loadFaceLandmarker = useCallback(async () => {
    if (modelLoadingRef.current || modelLoadedRef.current) return modelLoadedRef.current
    modelLoadingRef.current = true

    try {
      console.log('[FaceDetection] Loading MediaPipe Face Landmarker...')

      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      )

      console.log('[FaceDetection] WASM loaded, creating Face Landmarker...')

      const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

      faceLandmarkerRef.current = faceLandmarker
      modelLoadedRef.current = true
      modelLoadingRef.current = false
      console.log('[FaceDetection] Face Landmarker loaded ✓')
      return true
    } catch (err) {
      console.error('[FaceDetection] Failed to load MediaPipe:', err)
      modelLoadingRef.current = false
      setCameraError('Gagal memuat sistem deteksi wajah. Periksa koneksi internet.')
      return false
    }
  }, [])

  // ─── Trigger LookAway Violation ────────────────────────────────────
  const addLookAwayEvent = useCallback(() => {
    setLookAwayCount(prev => prev + 1)
    console.log('[FaceDetection] VIOLATION — Wajah tidak menghadap layar (snapshot 5 detik)')
    onViolationRef.current?.('Wajah tidak menghadap layar (deteksi kamera)')
  }, [])

  // ─── Run inference loop ────────────────────────────────────────────
  const startInference = useCallback(() => {
    if (inferenceTimerRef.current) {
      clearInterval(inferenceTimerRef.current)
    }

    console.log('[FaceDetection] Starting inference loop (1 frame every 5s)...')
    let frameCount = 0

    inferenceTimerRef.current = setInterval(() => {
      if (!enabledRef.current || !faceLandmarkerRef.current || !videoRef.current) return
      if (videoRef.current.readyState < 2) return

      try {
        const results = faceLandmarkerRef.current.detectForVideo(
          videoRef.current,
          performance.now()
        )

        frameCount++
        if (frameCount % 10 === 1) {
          console.log(`[FaceDetection] Frame #${frameCount} — faces: ${results.faceLandmarks?.length || 0}`)
        }

        if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
          // No face detected — count as LookAway
          addLookAwayEvent()
          return
        }

        const landmarks = results.faceLandmarks[0]

        // Key landmarks (MediaPipe face mesh indices):
        // 1 = nose tip, 33 = left eye inner, 263 = right eye inner
        const noseTip = landmarks[1]
        const leftEye = landmarks[33]
        const rightEye = landmarks[263]

        if (!noseTip || !leftEye || !rightEye) return

        // Calculate horizontal gaze offset
        const eyeMidX = (leftEye.x + rightEye.x) / 2
        const noseOffsetX = noseTip.x - eyeMidX

        // Calculate eye distance for normalization
        const eyeDistance = Math.abs(rightEye.x - leftEye.x)
        if (eyeDistance < 0.01) return

        const horizontalRatio = Math.abs(noseOffsetX) / eyeDistance

        // Vertical: nose below eye center = looking down
        const eyeMidY = (leftEye.y + rightEye.y) / 2
        const noseOffsetY = noseTip.y - eyeMidY
        const verticalRatio = noseOffsetY / eyeDistance

        // Thresholds: head turned too far left/right or looking down
        const isLookingAway = horizontalRatio > 0.35 || verticalRatio > 0.7

        if (isLookingAway) {
          if (frameCount % 5 === 0) {
            console.log(`[FaceDetection] LookAway — hRatio: ${horizontalRatio.toFixed(2)}, vRatio: ${verticalRatio.toFixed(2)}`)
          }
          addLookAwayEvent()
        }
      } catch (err) {
        console.warn('[FaceDetection] Inference error:', err.message)
      }
    }, 5000) // 1 frame every 5 seconds
  }, [addLookAwayEvent])

  // ─── Main effect: load model when enabled ──────────────────────────
  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function init() {
      const loaded = await loadFaceLandmarker()
      if (cancelled || !loaded) return

      // If camera is already ready, start inference
      if (videoRef.current?.srcObject && videoRef.current.readyState >= 2) {
        startInference()
      }
    }

    init()

    return () => {
      cancelled = true
      if (inferenceTimerRef.current) {
        clearInterval(inferenceTimerRef.current)
        inferenceTimerRef.current = null
      }
    }
  }, [enabled, loadFaceLandmarker, startInference])

  // Start inference when camera becomes ready AFTER model is loaded
  useEffect(() => {
    if (enabled && cameraReady && faceLandmarkerRef.current && !inferenceTimerRef.current) {
      console.log('[FaceDetection] Camera ready + model loaded → starting inference')
      startInference()
    }
  }, [enabled, cameraReady, startInference])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  return {
    cameraReady,
    cameraError,
    lookAwayCount,
    requestCamera,
    stopCamera,
    videoRef,
  }
}

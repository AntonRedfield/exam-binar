import { useEffect, useRef } from 'react'
import { Camera, CameraOff, Eye, EyeOff } from 'lucide-react'

/**
 * Small picture-in-picture webcam status indicator for Level 4.
 * Shows camera feed thumbnail + face detection status.
 *
 * @param {Object} props
 * @param {Object} props.videoRef - Ref to the video element
 * @param {boolean} props.cameraReady - Whether camera is active
 * @param {number} props.lookAwayCount - Total look-away events
 * @param {string} props.cameraError - Error message if any
 */
export default function FaceDetectionStatus({ videoRef, cameraReady, lookAwayCount, cameraError }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  // Draw video feed to small canvas
  useEffect(() => {
    if (!cameraReady || !videoRef?.current) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, 80, 60)
      }
      animRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [cameraReady, videoRef])

  if (cameraError) {
    return (
      <div className="face-detect-pip face-detect-error">
        <CameraOff size={16} />
        <span className="face-detect-pip-label">Kamera Error</span>
      </div>
    )
  }

  return (
    <div className="face-detect-pip">
      {cameraReady ? (
        <>
          <canvas
            ref={canvasRef}
            width={80}
            height={60}
            className="face-detect-canvas"
          />
          <div className="face-detect-pip-info">
            <div className="face-detect-status-dot face-detect-active" />
            <Camera size={11} />
            <span className="face-detect-pip-label">LIVE</span>
          </div>
          {lookAwayCount > 0 && (
            <div className="face-detect-lookaway-badge">
              <EyeOff size={10} />
              {lookAwayCount}
            </div>
          )}
        </>
      ) : (
        <div className="face-detect-loading">
          <div className="spinner" style={{ width: 16, height: 16 }} />
          <span className="face-detect-pip-label">Memuat kamera...</span>
        </div>
      )}
    </div>
  )
}

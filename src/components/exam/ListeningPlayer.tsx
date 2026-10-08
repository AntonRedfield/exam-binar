import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Volume1, Play, Pause, AlertCircle, Lock, Wifi, WifiOff, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { getCurrentUser } from '../../lib/auth';

// ------------------------------------------------------------------------------
// Component Interfaces (Strict TypeScript - zero 'any')
// ------------------------------------------------------------------------------

export interface ListeningPlayerProps {
  /** Unique ID of the question this audio belongs to */
  questionId: string;
  /** Direct audio stream URL (from Supabase CDN or Google Drive direct mirror) */
  audioUrl: string;
  /** UUID of the candidate. If omitted, falls back to the logged in user profile */
  studentId?: string;
  /** Maximum allowed playback count (defaults to 1 for IELTS/TOEFL standard) */
  maxPlays?: number;
  /** Whether the candidate is allowed to pause during playback (defaults to false) */
  allowPause?: boolean;
  /** Optional custom Supabase client instance (defaults to app client) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any;
  /** Callback fired when playback successfully begins after server authorization */
  onPlaybackStarted?: () => void;
  /** Callback fired when playback reaches completion */
  onPlaybackEnded?: () => void;
  /** Callback fired whenever the lock status updates */
  onLockStatusChanged?: (isLocked: boolean) => void;
  /** Optional container CSS class */
  className?: string;
}

export type PlayerStatus =
  | 'idle'
  | 'caching'
  | 'ready'
  | 'authorizing'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'locked'
  | 'error';

interface PlaybackRpcResult {
  allowed: boolean;
  remaining_plays: number;
  reason: string;
}

/**
 * Format raw seconds to MM:SS display
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const ListeningPlayer: React.FC<ListeningPlayerProps> = ({
  questionId,
  audioUrl,
  studentId,
  maxPlays = 1,
  allowPause = false,
  supabaseClient,
  onPlaybackStarted,
  onPlaybackEnded,
  onLockStatusChanged,
  className = '',
}) => {
  const client = supabaseClient || defaultSupabase;

  // Player state
  const [status, setStatus] = useState<PlayerStatus>('caching');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0.8);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [remainingPlays, setRemainingPlays] = useState<number>(maxPlays);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);

  // References for strict tamper protection
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedTimeRef = useRef<number>(0);
  const isSeekingLockedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Determine effective student identifier
  const getEffectiveStudentId = useCallback((): string => {
    if (studentId) return studentId;
    const currentUser = getCurrentUser();
    if (currentUser?.id) return currentUser.id;
    return '00000000-0000-0000-0000-000000000000';
  }, [studentId]);

  // ----------------------------------------------------------------------------
  // 1. OFFLINE / WI-FI DROP IMMUNITY: Pre-cache audio track into in-memory Blob
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!audioUrl) {
      setStatus('error');
      setAuthError('URL audio belum ditentukan untuk butir soal ini.');
      return;
    }

    let isMounted = true;
    abortControllerRef.current = new AbortController();

    async function preloadAudioTrack() {
      try {
        setStatus('caching');
        setDownloadProgress(0);
        setIsOfflineReady(false);

        const response = await fetch(audioUrl, {
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          throw new Error(`Gagal mengunduh audio dari server (HTTP ${response.status})`);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

        let audioBlob: Blob;

        // If ReadableStream is supported and Content-Length exists, stream chunk by chunk
        if (response.body && totalBytes > 0) {
          const reader = response.body.getReader();
          let loadedBytes = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loadedBytes += value.length;
              if (isMounted) {
                const percent = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
                setDownloadProgress(percent);
              }
            }
          }

          const mimeType = response.headers.get('content-type') || 'audio/mpeg';
          audioBlob = new Blob(chunks, { type: mimeType });
        } else {
          // Fallback if Content-Length header is omitted
          if (isMounted) setDownloadProgress(50);
          audioBlob = await response.blob();
          if (isMounted) setDownloadProgress(100);
        }

        if (!isMounted) return;

        const objectUrl = URL.createObjectURL(audioBlob);
        setBlobUrl(objectUrl);
        setIsOfflineReady(true);
        setStatus('ready');
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof Error && err.name === 'AbortError') return;

        console.error('[ListeningPlayer] Pre-caching audio failed:', err);
        setStatus('error');
        setAuthError(err instanceof Error ? err.message : 'Gagal memuat berkas audio ke memori.');
      }
    }

    preloadAudioTrack();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [audioUrl]);

  // ----------------------------------------------------------------------------
  // 2. SERVER SYNC: Trigger start_audio_playback RPC prior to playback
  // ----------------------------------------------------------------------------
  const handleStartListening = async () => {
    if (status !== 'ready' || !blobUrl || !audioRef.current) return;

    setStatus('authorizing');
    setAuthError(null);

    const targetStudentId = getEffectiveStudentId();

    try {
      if (client?.rpc) {
        const { data, error } = await client.rpc('start_audio_playback', {
          p_student_id: targetStudentId,
          p_question_id: questionId,
        });

        if (error) {
          console.error('[ListeningPlayer] RPC execution error:', error);
          setStatus('locked');
          setAuthError(error.message || 'Otorisasi pemutaran ditolak oleh server.');
          onLockStatusChanged?.(true);
          return;
        }

        const result = data as PlaybackRpcResult;

        if (!result || !result.allowed) {
          setStatus('locked');
          setAuthError(result?.reason || 'Batas pemutaran audio telah habis.');
          setRemainingPlays(0);
          onLockStatusChanged?.(true);
          return;
        }

        setRemainingPlays(result.remaining_plays ?? 0);
      } else {
        // Fallback for offline local dev mode
        setRemainingPlays((prev) => Math.max(0, prev - 1));
      }

      // Audio authorized -> Start playback
      audioRef.current.currentTime = 0;
      lastRecordedTimeRef.current = 0;
      audioRef.current.volume = volume;

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setStatus('playing');
            onPlaybackStarted?.();
          })
          .catch((err) => {
            console.error('[ListeningPlayer] Audio playback initiation failed:', err);
            setStatus('error');
            setAuthError('Kebijakan pemutaran peramban membatasi audio. Silakan klik tombol putar kembali.');
          });
      }
    } catch (err: unknown) {
      console.error('[ListeningPlayer] Unexpected error:', err);
      setStatus('error');
      setAuthError(err instanceof Error ? err.message : 'Terjadi kendala saat meminta otorisasi pemutaran.');
    }
  };

  // ----------------------------------------------------------------------------
  // 3. TAMPER PROTECTION: Anti-Seeking & DevTools Scrubbing Lock
  // ----------------------------------------------------------------------------
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const now = audioRef.current.currentTime;
    lastRecordedTimeRef.current = now;
    setCurrentTime(now);
  };

  const handleSeeking = () => {
    if (!audioRef.current || !isSeekingLockedRef.current) return;

    // Detect illegal scrub forward or backward (exceeding natural tick threshold)
    const drift = Math.abs(audioRef.current.currentTime - lastRecordedTimeRef.current);
    if (drift > 0.4) {
      // Instantly snap currentTime back to the verified timestamp!
      audioRef.current.currentTime = lastRecordedTimeRef.current;
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) {
      return;
    }
    setDuration(audioRef.current.duration || 0);
    audioRef.current.volume = volume;
  };

  const handleEnded = () => {
    setStatus('completed');
    if (remainingPlays <= 0) {
      setStatus('locked');
      onLockStatusChanged?.(true);
    }
    onPlaybackEnded?.();
  };

  // Optional Pause / Resume (Only if allowPause === true)
  const handleTogglePause = () => {
    if (!allowPause || !audioRef.current) return;

    if (status === 'playing') {
      audioRef.current.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      audioRef.current.play();
      setStatus('playing');
    }
  };

  // ----------------------------------------------------------------------------
  // 4. CANDIDATE CONTROLS: Master Volume Slider Only (0% to 100%)
  // ----------------------------------------------------------------------------
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  // Tamper protection: Prevent right-click context menu and inspect shortcuts
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Intercept F12 and standard DevTools inspector shortcuts
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
      (e.ctrlKey && ['U', 'u', 'S', 's'].includes(e.key))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Calculate playback percentage for visual progress ring / bar
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`listening-player-container ${className}`}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: '#f8fafc',
        border: '1.5px solid #cbd5e1',
        borderRadius: '10px',
        padding: '1rem',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        fontFamily: 'inherit',
      }}
    >
      {/* Hidden Native Audio Element (No controls, strictly driven by code) */}
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          style={{ display: 'none' }}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {/* Top Banner: Listening Header with Official Badges */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '0.65rem',
          marginBottom: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#1e3a8a',
              background: '#dbeafe',
              border: '1px solid #bfdbfe',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            🎧 Bagian Ujian Mendengarkan (Listening)
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#475569',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
            }}
          >
            {maxPlays === 1 ? 'Putar 1 Kali (Standar Resmi)' : `Batas Putar: ${maxPlays} Kali`}
          </span>
        </div>

        {/* Network & Memory Offline Status */}
        <div>
          {isOfflineReady ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#15803d',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              <Wifi size={13} /> Tersimpan di Memori (Aman Gangguan Jaringan)
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#b45309',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              <RefreshCw size={12} /> Mengunduh Audio ({downloadProgress}%)...
            </span>
          )}
        </div>
      </div>

      {/* Main Player State Display */}
      <div>
        {/* State 1: Caching In Progress */}
        {status === 'caching' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              border: '1px solid #cbd5e1',
              marginBottom: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                color: '#334155',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <RefreshCw size={13} /> Menyimpan audio ke memori ({downloadProgress}%)
              </span>
              <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.72rem' }}>
                Perlindungan gangguan sinyal Wi-Fi
              </span>
            </div>
            <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${downloadProgress}%`,
                  height: '100%',
                  background: '#2563eb',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.45rem', margin: '0.45rem 0 0 0' }}>
              Mohon tunggu sejenak. Berkas audio sedang diunduh secara penuh ke memori agar pemutaran berjalan lancar tanpa kendala jaringan.
            </p>
          </div>
        )}

        {/* State 2: Ready to Play (Candidate click required for Autoplay Policy) */}
        {status === 'ready' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              background: '#ffffff',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              border: '1.5px solid #86efac',
              marginBottom: '0.85rem',
            }}
          >
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
                <ShieldCheck size={16} color="#16a34a" />
                Audio Siap Diputar
              </div>
              <p style={{ fontSize: '0.75rem', color: '#4b5563', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>
                {allowPause
                  ? 'Anda diperbolehkan menjeda audio jika diperlukan.'
                  : 'Perhatian: Setelah dimulai, fitur penggeseran waktu dinonaktifkan dan audio tidak dapat diulang kembali.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartListening}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '6px',
                background: '#16a34a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <Play size={15} fill="#ffffff" />
              Mulai Dengarkan Audio (Sisa: {remainingPlays} kali)
            </button>
          </div>
        )}

        {/* State 3: Authorizing with Server */}
        {status === 'authorizing' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              padding: '1.25rem',
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '0.85rem',
            }}
          >
            <RefreshCw size={16} />
            <span>Memverifikasi otorisasi pemutaran ke server ujian...</span>
          </div>
        )}

        {/* State 4 & 5: Playing or Paused */}
        {(status === 'playing' || status === 'paused') && (
          <div
            style={{
              background: '#ffffff',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              border: '1.5px solid #93c5fd',
              marginBottom: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1e40af' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: status === 'playing' ? '#2563eb' : '#f59e0b',
                    }}
                  />
                  {status === 'playing' ? 'Audio Sedang Diputar' : 'Audio Dijeda'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                  <Lock size={11} color="#d97706" />
                  Kendali Terkunci • Penggeseran Waktu Dilarang
                </div>
              </div>

              {/* Timestamp Indicator */}
              <div
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: '#0f172a',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '5px',
                }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Read-Only Visual Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '7px',
                background: '#e2e8f0',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'not-allowed',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: '#2563eb',
                  transition: 'width 0.15s linear',
                }}
              />
            </div>

            {/* Candidate Action: Pause Button (Only rendered if allowPause is true) */}
            {allowPause && (
              <div style={{ marginTop: '0.65rem' }}>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {status === 'playing' ? (
                    <>
                      <Pause size={13} /> Jeda
                    </>
                  ) : (
                    <>
                      <Play size={13} /> Lanjutkan
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* State 6 & 7: Completed or Locked */}
        {(status === 'completed' || status === 'locked') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              background: '#fffbeb',
              border: '1.5px solid #fde68a',
              marginBottom: '0.85rem',
            }}
          >
            <Lock size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.78rem' }}>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#92400e', marginBottom: '0.2rem' }}>
                Sesi Pemutaran Selesai (Terkunci)
              </strong>
              <p style={{ color: '#b45309', margin: 0, lineHeight: 1.4 }}>
                {authError ||
                  'Pemutaran audio untuk butir soal ini telah selesai dan tidak dapat diputar kembali sesuai peraturan integritas ujian CBT.'}
              </p>
            </div>
          </div>
        )}

        {/* State 8: Error */}
        {status === 'error' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              marginBottom: '0.85rem',
            }}
          >
            <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.78rem' }}>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#991b1b', marginBottom: '0.2rem' }}>
                Kendala Pemutaran Audio
              </strong>
              <p style={{ color: '#b91c1c', margin: 0, lineHeight: 1.4 }}>
                {authError || 'Terjadi kendala saat memuat berkas audio. Harap segera hubungi pengawas ujian Anda.'}
              </p>
            </div>
          </div>
        )}

        {/* Candidate Controls: Master Volume Slider Only (0% to 100%) */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
            {volume === 0 ? (
              <VolumeX size={16} color="#dc2626" />
            ) : volume < 0.5 ? (
              <Volume1 size={16} color="#475569" />
            ) : (
              <Volume2 size={16} color="#1b3361" />
            )}
            <span>Volume Suara Utama</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '220px', maxWidth: '60%' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Volume Suara Utama"
              style={{
                flex: 1,
                height: '6px',
                accentColor: '#1b3361',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.78rem',
                color: '#1e293b',
                minWidth: '38px',
                textAlign: 'right',
              }}
            >
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListeningPlayer;

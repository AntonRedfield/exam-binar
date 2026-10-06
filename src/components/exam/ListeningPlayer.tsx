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
      className={`select-none outline-none font-sans rounded-xl border border-slate-700 bg-slate-900/90 text-slate-100 p-4 md:p-5 shadow-xl backdrop-blur-md transition-all ${className}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Hidden Native Audio Element (No controls, strictly driven by code) */}
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          className="hidden"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {/* Top Banner: IELTS/TOEFL Standard Listening Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase">
            Bagian Ujian Mendengarkan (Listening)
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {maxPlays === 1 ? 'Putar 1 Kali (Standar Resmi)' : `Batas Putar: ${maxPlays} Kali`}
          </span>
        </div>

        {/* Network & Offline Status */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          {isOfflineReady ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full text-[11px]">
              <Wifi size={12} />
              Tersimpan di Memori (Aman Gangguan Jaringan)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full text-[11px]">
              <RefreshCw size={12} className="animate-spin" />
              Mengunduh Audio...
            </span>
          )}
        </div>
      </div>

      {/* Main Player State Display */}
      <div className="space-y-4">
        {/* State 1: Caching In Progress */}
        {status === 'caching' && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/60">
            <div className="flex justify-between items-center text-xs text-slate-300 mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <RefreshCw size={14} className="animate-spin text-cyan-400" />
                Menyimpan audio ke memori perangkat ({downloadProgress}%)
              </span>
              <span className="text-slate-400">Perlindungan gangguan sinyal Wi-Fi</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Mohon tunggu sejenak. Berkas audio sedang diunduh secara penuh ke memori agar pemutaran berjalan lancar tanpa kendala jaringan.
            </p>
          </div>
        )}

        {/* State 2: Ready to Play (Candidate click required for Autoplay Policy) */}
        {status === 'ready' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-lg border border-slate-700">
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                Audio Siap Diputar
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {allowPause
                  ? 'Anda diperbolehkan menjeda audio jika diperlukan.'
                  : 'Perhatian: Setelah dimulai, fitur penggeseran waktu dinonaktifkan dan audio tidak dapat diulang kembali.'}
              </p>
            </div>

            <button
              onClick={handleStartListening}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm shadow-lg shadow-emerald-950 transition-all cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              Mulai Dengarkan Audio (Sisa: {remainingPlays} kali)
            </button>
          </div>
        )}

        {/* State 3: Authorizing with Server */}
        {status === 'authorizing' && (
          <div className="flex items-center justify-center gap-3 py-6 bg-slate-800/30 rounded-lg border border-slate-800">
            <RefreshCw size={18} className="animate-spin text-cyan-400" />
            <span className="text-sm font-medium text-slate-300">
              Memverifikasi otorisasi pemutaran ke server ujian...
            </span>
          </div>
        )}

        {/* State 4 & 5: Playing or Paused */}
        {(status === 'playing' || status === 'paused') && (
          <div className="space-y-3 bg-slate-800/60 p-4 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Visual Audio Waveform Animation */}
                <div className="flex items-end gap-1 h-5 px-1">
                  {[40, 80, 50, 95, 60, 30, 85].map((height, i) => (
                    <div
                      key={i}
                      className={`w-1 bg-cyan-400 rounded-full transition-all duration-300 ${
                        status === 'playing' ? 'animate-pulse' : 'opacity-40'
                      }`}
                      style={{
                        height: status === 'playing' ? `${height}%` : '25%',
                        animationDelay: `${i * 120}ms`,
                      }}
                    />
                  ))}
                </div>

                <div>
                  <span className="text-xs font-medium text-slate-200">
                    {status === 'playing' ? 'Audio Sedang Diputar' : 'Audio Dijeda'}
                  </span>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Lock size={10} className="text-amber-400" />
                    Kendali Terkunci • Penggeseran Waktu Dilarang
                  </div>
                </div>
              </div>

              {/* Timestamp Indicator */}
              <div className="text-xs font-mono font-semibold text-cyan-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Read-Only Visual Progress Bar (Cannot be clicked or dragged) */}
            <div className="relative w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800 cursor-not-allowed">
              <div
                className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full rounded-full transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Candidate Action: Pause Button (Only rendered if allowPause is true) */}
            {allowPause && (
              <div className="pt-1 flex justify-start">
                <button
                  onClick={handleTogglePause}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-xs font-medium text-slate-200"
                >
                  {status === 'playing' ? (
                    <>
                      <Pause size={14} /> Jeda
                    </>
                  ) : (
                    <>
                      <Play size={14} /> Lanjutkan
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* State 6 & 7: Completed or Locked */}
        {(status === 'completed' || status === 'locked') && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-950/30 border border-amber-900/60 text-amber-200">
            <Lock size={20} className="text-amber-400 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-amber-300">
                Sesi Pemutaran Selesai (Terkunci)
              </p>
              <p className="text-amber-200/80 mt-0.5">
                {authError ||
                  'Pemutaran audio untuk butir soal ini telah selesai dan tidak dapat diputar kembali sesuai peraturan integritas ujian CBT.'}
              </p>
            </div>
          </div>
        )}

        {/* State 8: Error */}
        {status === 'error' && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-rose-950/40 border border-rose-900/70 text-rose-200">
            <AlertCircle size={20} className="text-rose-400 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-rose-300">Kendala Pemutaran Audio</p>
              <p className="text-rose-200/80 mt-0.5">
                {authError || 'Terjadi kendala saat memuat berkas audio. Harap segera hubungi pengawas ujian Anda.'}
              </p>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------------- */}
        {/* Candidate Controls: Master Volume Slider Only (0% to 100%)              */}
        {/* ---------------------------------------------------------------------- */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            {volume === 0 ? (
              <VolumeX size={16} className="text-rose-400" />
            ) : volume < 0.5 ? (
              <Volume1 size={16} className="text-slate-300" />
            ) : (
              <Volume2 size={16} className="text-slate-300" />
            )}
            <span className="font-medium">Volume Suara Utama</span>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-[200px]">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Volume Suara Utama"
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListeningPlayer;

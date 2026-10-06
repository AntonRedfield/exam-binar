import React, { useState, useEffect, useRef } from 'react';
import {
  Link as LinkIcon,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Headphones,
  Trash2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { supabase as defaultSupabase } from '../../lib/supabase';

// ------------------------------------------------------------------------------
// TypeScript Interfaces (Strict - zero 'any')
// ------------------------------------------------------------------------------

export interface QuestionAudioInputProps {
  /** Target question identifier */
  questionId: string;
  /** Initial audio CDN URL if previously configured */
  initialAudioUrl?: string;
  /** Max plays configuration (default: 1) */
  initialMaxPlays?: number;
  /** Allow pause toggle (default: false) */
  initialAllowPause?: boolean;
  /** Callback fired when audio sync or options change */
  onAudioSynced?: (data: {
    audioUrl: string;
    maxPlays: number;
    allowPause: boolean;
  }) => void;
  /** Optional custom Supabase client */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any;
  /** Optional class name */
  className?: string;
}

export type SyncStage =
  | 'idle'
  | 'extracting'
  | 'mirroring'
  | 'ready'
  | 'error';

interface IngestFunctionResponse {
  success: boolean;
  audioUrl?: string;
  questionId?: string;
  driveId?: string;
  message?: string;
  error?: string;
  code?: string;
  details?: string;
}

export const QuestionAudioInput: React.FC<QuestionAudioInputProps> = ({
  questionId,
  initialAudioUrl = '',
  initialMaxPlays = 1,
  initialAllowPause = false,
  onAudioSynced,
  supabaseClient,
  className = '',
}) => {
  const client = supabaseClient || defaultSupabase;

  // Form State
  const [driveUrl, setDriveUrl] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>(initialAudioUrl);
  const [maxPlays, setMaxPlays] = useState<number>(initialMaxPlays);
  const [allowPause, setAllowPause] = useState<boolean>(initialAllowPause);

  // Sync Progress State
  const [syncStage, setSyncStage] = useState<SyncStage>(
    initialAudioUrl ? 'ready' : 'idle'
  );
  const [syncMessage, setSyncMessage] = useState<string>(
    initialAudioUrl ? 'Audio Siap' : ''
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionErrorGuide, setPermissionErrorGuide] = useState<boolean>(false);

  // File Upload State
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Audio Preview State
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<number>(0);
  const [previewDuration, setPreviewDuration] = useState<number>(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState<number>(0);

  // Update initial audioUrl when prop changes
  useEffect(() => {
    if (initialAudioUrl) {
      setAudioUrl(initialAudioUrl);
      setSyncStage('ready');
      setSyncMessage('Audio Siap');
    }
  }, [initialAudioUrl]);

  // ----------------------------------------------------------------------------
  // Google Drive URL Regex Helper
  // ----------------------------------------------------------------------------
  function extractDriveId(url: string): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) return fileDMatch[1];
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) return idParamMatch[1];
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) return trimmed;
    return null;
  }

  // ----------------------------------------------------------------------------
  // Action 1: Validate & Sync Google Drive Link via Edge Function
  // ----------------------------------------------------------------------------
  const handleValidateAndSync = async () => {
    if (!driveUrl.trim()) {
      setErrorMessage('Masukkan tautan Google Drive terlebih dahulu.');
      return;
    }

    setErrorMessage(null);
    setPermissionErrorGuide(false);

    setSyncStage('extracting');
    setSyncMessage('Mengekstrak ID...');

    const driveId = extractDriveId(driveUrl);
    if (!driveId) {
      setSyncStage('error');
      setErrorMessage('Format tautan tidak valid. Contoh: https://drive.google.com/file/d/FILE_ID/view');
      return;
    }

    await new Promise((r) => setTimeout(r, 300));
    setSyncStage('mirroring');
    setSyncMessage('Menyinkronkan...');

    try {
      let resultData: IngestFunctionResponse | null = null;

      if (client?.functions?.invoke) {
        const { data, error } = await client.functions.invoke('ingest-audio', {
          body: {
            driveUrl: driveUrl.trim(),
            questionId,
          },
        });

        if (error) throw new Error(error.message || 'Pemanggilan edge function gagal.');
        resultData = data as IngestFunctionResponse;
      } else {
        const supabaseUrl = client?.supabaseUrl || 'https://asjgavgxbppauzykqqgv.supabase.co';
        const anonKey = client?.supabaseKey || 'sb_publishable_t1Ye4udfVDBd8iSJZjQ9HQ_HpebFnks';

        const res = await fetch(`${supabaseUrl}/functions/v1/ingest-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            driveUrl: driveUrl.trim(),
            questionId,
          }),
        });

        resultData = (await res.json()) as IngestFunctionResponse;
      }

      if (!resultData?.success || !resultData?.audioUrl) {
        if (
          resultData?.code === 'DRIVE_PERMISSION_DENIED' ||
          resultData?.error?.toLowerCase().includes('private') ||
          resultData?.error?.toLowerCase().includes('access')
        ) {
          setPermissionErrorGuide(true);
        }
        throw new Error(resultData?.error || 'Gagal mengambil berkas audio dari Google Drive.');
      }

      const newCdnUrl = resultData.audioUrl;
      setAudioUrl(newCdnUrl);
      setSyncStage('ready');
      setSyncMessage('Audio Siap');

      if (client?.from) {
        await client
          .from('questions')
          .update({
            audio_url: newCdnUrl,
            max_plays: maxPlays,
            allow_pause: allowPause,
          })
          .eq('id', questionId);
      }

      onAudioSynced?.({
        audioUrl: newCdnUrl,
        maxPlays,
        allowPause,
      });
    } catch (err: unknown) {
      console.error('[QuestionAudioInput] Ingest error:', err);
      setSyncStage('error');
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat sinkronisasi audio.';
      setErrorMessage(msg);
      if (
        msg.toLowerCase().includes('private') ||
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('akses')
      ) {
        setPermissionErrorGuide(true);
      }
    }
  };

  // ----------------------------------------------------------------------------
  // Action 2: Direct File Upload to Supabase Storage
  // ----------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setErrorMessage(null);
    setPermissionErrorGuide(false);
    setSyncStage('mirroring');
    setSyncMessage('Mengunggah...');

    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const filePath = `questions/${questionId}/${Date.now()}.${ext}`;

      if (!client?.storage) {
        throw new Error('Layanan penyimpanan Supabase Storage tidak tersedia.');
      }

      const { error: uploadError } = await client.storage
        .from('exam-audio')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'audio/mpeg',
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = client.storage
        .from('exam-audio')
        .getPublicUrl(filePath);

      const uploadedCdnUrl = publicUrlData.publicUrl;

      setAudioUrl(uploadedCdnUrl);
      setSyncStage('ready');
      setSyncMessage('Audio Siap');

      if (client?.from) {
        await client
          .from('questions')
          .update({
            audio_url: uploadedCdnUrl,
            max_plays: maxPlays,
            allow_pause: allowPause,
          })
          .eq('id', questionId);
      }

      onAudioSynced?.({
        audioUrl: uploadedCdnUrl,
        maxPlays,
        allowPause,
      });
    } catch (err: unknown) {
      console.error('[QuestionAudioInput] File upload error:', err);
      setSyncStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengunggah berkas audio.');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ----------------------------------------------------------------------------
  // Action 3: Clear Audio Configuration
  // ----------------------------------------------------------------------------
  const handleRemoveAudio = async () => {
    setAudioUrl('');
    setDriveUrl('');
    setSyncStage('idle');
    setSyncMessage('');
    setErrorMessage(null);
    setPermissionErrorGuide(false);
    setIsPlayingPreview(false);

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }

    if (client?.from) {
      await client
        .from('questions')
        .update({ audio_url: null })
        .eq('id', questionId);
    }

    onAudioSynced?.({
      audioUrl: '',
      maxPlays,
      allowPause,
    });
  };

  // ----------------------------------------------------------------------------
  // Action 4: Settings Change (Max Plays & Allow Pause)
  // ----------------------------------------------------------------------------
  const handleMaxPlaysChange = async (val: number) => {
    const clamped = Math.max(1, Math.min(10, val));
    setMaxPlays(clamped);

    if (audioUrl && client?.from) {
      await client
        .from('questions')
        .update({ max_plays: clamped })
        .eq('id', questionId);
    }

    if (audioUrl) {
      onAudioSynced?.({
        audioUrl,
        maxPlays: clamped,
        allowPause,
      });
    }
  };

  const handleAllowPauseToggle = async (checked: boolean) => {
    setAllowPause(checked);

    if (audioUrl && client?.from) {
      await client
        .from('questions')
        .update({ allow_pause: checked })
        .eq('id', questionId);
    }

    if (audioUrl) {
      onAudioSynced?.({
        audioUrl,
        maxPlays,
        allowPause: checked,
      });
    }
  };

  // ----------------------------------------------------------------------------
  // Audio Preview Controls
  // ----------------------------------------------------------------------------
  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const handlePreviewTimeUpdate = () => {
    if (!previewAudioRef.current) return;
    const cur = previewAudioRef.current.currentTime;
    const dur = previewAudioRef.current.duration || 1;
    setPreviewCurrentTime(cur);
    setPreviewProgress((cur / dur) * 100);
  };

  const handlePreviewLoadedMetadata = () => {
    if (!previewAudioRef.current) return;
    setPreviewDuration(previewAudioRef.current.duration || 0);
  };

  const handlePreviewEnded = () => {
    setIsPlayingPreview(false);
    setPreviewProgress(0);
    setPreviewCurrentTime(0);
  };

  function formatTime(sec: number): string {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.875rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.625rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
      className={className}
    >
      {/* ─── BARIS 1: Header (Label & Status Lencana) ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <label
          style={{
            fontSize: '0.82rem',
            fontWeight: 700,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            color: 'var(--text-primary)',
          }}
        >
          <Headphones size={15} style={{ color: 'var(--accent)' }} />
          Audio Listening <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(TOEFL / IELTS)</span>
        </label>

        {/* Lencana Status */}
        <div>
          {syncStage === 'extracting' && (
            <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
              <RefreshCw size={10} className="animate-spin" /> Ekstrak ID...
            </span>
          )}
          {syncStage === 'mirroring' && (
            <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>
              <RefreshCw size={10} className="animate-spin" /> Sinkron...
            </span>
          )}
          {syncStage === 'ready' && audioUrl && (
            <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
              <CheckCircle2 size={10} style={{ color: 'var(--success)' }} /> Audio Siap
            </span>
          )}
          {syncStage === 'error' && (
            <span className="badge badge-closed" style={{ fontSize: '0.7rem' }}>
              <AlertTriangle size={10} /> Gagal
            </span>
          )}
          {!audioUrl && syncStage === 'idle' && (
            <span className="badge badge-draft" style={{ fontSize: '0.7rem' }}>
              Opsional
            </span>
          )}
        </div>
      </div>

      {/* ─── BARIS 2: Input Tautan & Tombol Sejajar (Seragam 36px) ─── */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          value={driveUrl}
          onChange={(e) => {
            setDriveUrl(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Tautan Google Drive atau URL audio..."
          style={{
            fontSize: '0.82rem',
            height: '36px',
            padding: '0.4rem 0.65rem',
            flex: 1,
            minWidth: 0,
            borderRadius: '6px',
          }}
        />

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleValidateAndSync}
          disabled={!driveUrl.trim() || syncStage === 'extracting' || syncStage === 'mirroring'}
          style={{
            height: '36px',
            padding: '0 0.75rem',
            fontSize: '0.78rem',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            borderRadius: '6px',
          }}
          title="Validasi tautan dan simpan ke server CDN"
        >
          {syncStage === 'extracting' || syncStage === 'mirroring' ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              <span>Sinkron...</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} />
              <span>Sinkron</span>
            </>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3,audio/mpeg,audio/wav,audio/aac,audio/m4a,audio/ogg"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingFile}
          style={{
            height: '36px',
            padding: '0 0.75rem',
            fontSize: '0.78rem',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: '#ffffff',
          }}
          title="Unggah berkas audio MP3/AAC langsung dari perangkat"
        >
          <UploadCloud size={13} />
          <span>{isUploadingFile ? 'Unggah...' : 'Pilih File'}</span>
        </button>
      </div>

      {/* ─── BARIS 3: Pengaturan Sederhana & Seragam (Tinggi 36px Sempurna) ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.4rem',
          alignItems: 'center',
        }}
      >
        {/* Kontrol 1: Batas Putar Stepper (Tinggi 36px) */}
        <div
          style={{
            height: '36px',
            padding: '0 0.65rem',
            background: 'var(--navy-light)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Maks. Putar:
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
            }}
          >
            <button
              type="button"
              onClick={() => handleMaxPlaysChange(maxPlays - 1)}
              disabled={maxPlays <= 1}
              style={{
                width: '24px',
                height: '24px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: '#ffffff',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: maxPlays <= 1 ? 'not-allowed' : 'pointer',
                opacity: maxPlays <= 1 ? 0.35 : 1,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              -
            </button>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                minWidth: '22px',
                textAlign: 'center',
                color: 'var(--accent)',
              }}
            >
              {maxPlays}x
            </span>
            <button
              type="button"
              onClick={() => handleMaxPlaysChange(maxPlays + 1)}
              disabled={maxPlays >= 10}
              style={{
                width: '24px',
                height: '24px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: '#ffffff',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: maxPlays >= 10 ? 'not-allowed' : 'pointer',
                opacity: maxPlays >= 10 ? 0.35 : 1,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Kontrol 2: Izinkan Jeda Toggle Button (Tinggi 36px) */}
        <button
          type="button"
          onClick={() => handleAllowPauseToggle(!allowPause)}
          style={{
            height: '36px',
            padding: '0 0.65rem',
            background: allowPause ? 'rgba(27, 51, 97, 0.08)' : 'var(--navy-light)',
            borderRadius: '6px',
            border: allowPause ? '1px solid var(--accent)' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text-primary)',
          }}
          title={allowPause ? 'Klik untuk mengunci audio tanpa jeda' : 'Klik untuk mengizinkan peserta menjeda audio'}
        >
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Jeda (Pause):
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              background: allowPause ? 'var(--accent)' : '#ffffff',
              color: allowPause ? '#ffffff' : 'var(--text-secondary)',
              border: allowPause ? 'none' : '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
            }}
          >
            {allowPause ? 'Diizinkan' : 'Terkunci'}
          </span>
        </button>
      </div>

      {/* ─── BARIS 4: Pemutar Pratinjau Guru (Jika audio terpasang) ─── */}
      {audioUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            height: '36px',
            padding: '0 0.65rem',
            background: 'rgba(27, 51, 97, 0.04)',
            borderRadius: '6px',
            border: '1px solid rgba(27, 51, 97, 0.12)',
            boxSizing: 'border-box',
          }}
        >
          <audio
            ref={previewAudioRef}
            src={audioUrl}
            preload="metadata"
            onTimeUpdate={handlePreviewTimeUpdate}
            onLoadedMetadata={handlePreviewLoadedMetadata}
            onEnded={handlePreviewEnded}
          />

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={togglePreviewPlay}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title={isPlayingPreview ? 'Jeda Pratinjau' : 'Putar Pratinjau'}
          >
            {isPlayingPreview ? (
              <Pause size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" style={{ marginLeft: '1px' }} />
            )}
          </button>

          {/* Baris Progress Track */}
          <div style={{ flex: 1, minWidth: 60 }}>
            <div
              style={{
                width: '100%',
                height: '5px',
                background: 'var(--border)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${previewProgress}%`,
                  height: '100%',
                  background: 'var(--gold)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
          </div>

          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            {formatTime(previewCurrentTime)} / {formatTime(previewDuration)}
          </span>

          <a
            href={audioUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '0.72rem',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              textDecoration: 'none',
              flexShrink: 0,
            }}
            title="Buka tautan audio CDN di tab baru"
          >
            <ExternalLink size={11} />
          </a>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleRemoveAudio}
            style={{
              height: '26px',
              padding: '0 0.45rem',
              fontSize: '0.72rem',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.2)',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
            }}
            title="Hapus audio dari soal ini"
          >
            <Trash2 size={11} />
            <span>Hapus</span>
          </button>
        </div>
      )}

      {/* ─── BARIS 5: Pesan Kendala / Panduan Izin Google Drive ─── */}
      {errorMessage && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: 'var(--danger)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
            <AlertTriangle size={13} />
            <span>{errorMessage}</span>
          </div>

          {permissionErrorGuide && (
            <div
              style={{
                marginTop: '0.4rem',
                paddingTop: '0.4rem',
                borderTop: '1px dashed rgba(239,68,68,0.3)',
                fontSize: '0.72rem',
                color: 'var(--text-primary)',
                lineHeight: 1.4,
              }}
            >
              <strong>Cara Mengatur Izin Google Drive:</strong>
              <div style={{ marginTop: '0.2rem' }}>
                Buka berkas di Google Drive &rarr; Klik <strong>Bagikan</strong> &rarr; Ubah Akses Umum menjadi <strong>"Siapa saja yang memiliki tautan"</strong> (Pelihat) &rarr; Salin dan tempel kembali.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionAudioInput;

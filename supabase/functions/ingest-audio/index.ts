// ==============================================================================
// Supabase Edge Function: ingest-audio
// Description: Downloads audio from Google Drive (or direct URL) and saves it to
//              Supabase Storage CDN bucket 'exam-audio', then updates questions table.
// Runtime: Supabase Edge Runtime (Deno / TypeScript)
// ==============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ------------------------------------------------------------------------------
// Type Definitions
// ------------------------------------------------------------------------------

export interface IngestAudioRequestPayload {
  driveUrl: string;
  questionId: string;
}

export interface IngestAudioResponse {
  success: boolean;
  audioUrl?: string;
  questionId?: string;
  driveId?: string;
  mimeType?: string;
  storagePath?: string;
  message?: string;
  error?: string;
  code?:
    | "INVALID_PAYLOAD"
    | "INVALID_DRIVE_URL"
    | "DRIVE_PERMISSION_DENIED"
    | "DRIVE_FETCH_FAILED"
    | "STORAGE_UPLOAD_FAILED"
    | "DATABASE_UPDATE_FAILED"
    | "INTERNAL_SERVER_ERROR";
  details?: string;
}

// ------------------------------------------------------------------------------
// CORS Configuration
// ------------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ------------------------------------------------------------------------------
// Google Drive Helper Functions
// ------------------------------------------------------------------------------

export function extractGoogleDriveId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // Pattern 1: /file/d/[id]
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Pattern 2: ?id=[id] or &id=[id]
  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch && idQueryMatch[1]) return idQueryMatch[1];

  // Pattern 3: Direct alphanumeric ID of 20-50 chars
  if (/^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function getExtensionFromMime(mime: string | null): string {
  if (!mime) return "mp3";
  const normalized = mime.toLowerCase().split(";")[0].trim();

  switch (normalized) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
    case "application/ogg":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/webm":
      return "webm";
    case "audio/flac":
      return "flac";
    default:
      return "mp3";
  }
}

// ------------------------------------------------------------------------------
// Helper to construct JSON response
// ------------------------------------------------------------------------------

function jsonResponse(body: IngestAudioResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ------------------------------------------------------------------------------
// Google Drive Download Handler with multi-endpoint fallback
// ------------------------------------------------------------------------------

async function fetchFromGoogleDrive(driveId: string): Promise<{
  data?: ArrayBuffer;
  contentType: string;
  error?: string;
  code?: IngestAudioResponse["code"];
}> {
  const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const candidateUrls = [
    `https://drive.usercontent.google.com/download?id=${driveId}&export=download&authuser=0&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`,
    `https://docs.google.com/uc?export=download&id=${driveId}`,
  ];

  for (const directUrl of candidateUrls) {
    try {
      const res = await fetch(directUrl, {
        headers: { "User-Agent": browserUserAgent },
        redirect: "follow",
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          return {
            error:
              "Berkas Google Drive bersifat privat atau dibatasi. Harap ubah pengaturan berbagi berkas menjadi 'Siapa saja yang memiliki tautan' (Pelihat Umum) di Google Drive.",
            code: "DRIVE_PERMISSION_DENIED",
            contentType: "",
          };
        }
        continue;
      }

      const rawContentType = res.headers.get("content-type") || "";

      // Check if Google Drive returned an HTML page (login page, warning page, etc.)
      if (rawContentType.includes("text/html")) {
        const textContent = await res.text();

        // Permission denied / sign in page
        const isPermissionDenied =
          textContent.includes("accounts.google.com") ||
          textContent.includes("Sign in") ||
          textContent.includes("Access denied") ||
          textContent.includes("You need access") ||
          textContent.includes("tidak memiliki akses");

        if (isPermissionDenied) {
          return {
            error:
              "Berkas Google Drive bersifat privat atau dibatasi. Harap ubah pengaturan berbagi berkas menjadi 'Siapa saja yang memiliki tautan' (Pelihat Umum) di Google Drive.",
            code: "DRIVE_PERMISSION_DENIED",
            contentType: "",
          };
        }

        // Check if there is a virus scan / confirmation token to bypass
        const confirmMatch =
          textContent.match(/confirm=([0-9a-zA-Z_-]+)/) ||
          textContent.match(/name="confirm" value="([0-9a-zA-Z_-]+)"/);
        const actionMatch = textContent.match(/action="([^"]+)"/);

        if (confirmMatch && confirmMatch[1]) {
          const confirmToken = confirmMatch[1];
          const confirmUrl = actionMatch?.[1]
            ? `${actionMatch[1]}?id=${driveId}&confirm=${confirmToken}&export=download`
            : `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=${confirmToken}`;

          const retryRes = await fetch(confirmUrl, {
            headers: { "User-Agent": browserUserAgent },
            redirect: "follow",
          });

          if (retryRes.ok && !retryRes.headers.get("content-type")?.includes("text/html")) {
            const buf = await retryRes.arrayBuffer();
            return {
              data: buf,
              contentType: retryRes.headers.get("content-type") || "audio/mpeg",
            };
          }
        }

        // HTML returned without usable audio
        return {
          error:
            "Google Drive mengembalikan laman web HTML alih-alih berkas audio. Pastikan berkas di Google Drive disetel ke 'Siapa saja yang memiliki tautan'.",
          code: "DRIVE_FETCH_FAILED",
          contentType: "",
        };
      }

      // Valid media binary stream
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 50) {
        continue;
      }

      // Check if binary starts with HTML tag
      const previewText = new TextDecoder().decode(buffer.slice(0, 50)).toLowerCase();
      if (previewText.includes("<!doc") || previewText.includes("<html")) {
        return {
          error:
            "Google Drive tidak mengizinkan pengunduhan langsung berkas ini. Pastikan pengaturan berbagi adalah publik (Siapa saja yang memiliki tautan).",
          code: "DRIVE_PERMISSION_DENIED",
          contentType: "",
        };
      }

      return {
        data: buffer,
        contentType: rawContentType || "audio/mpeg",
      };
    } catch {
      // Continue to next candidate URL
    }
  }

  return {
    error:
      "Gagal mengunduh audio dari Google Drive. Pastikan tautan benar dan izin berkas disetel ke 'Siapa saja yang memiliki tautan'.",
    code: "DRIVE_FETCH_FAILED",
    contentType: "",
  };
}

// ------------------------------------------------------------------------------
// Edge Function Handler
// ------------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed. Only POST is accepted.",
        code: "INVALID_PAYLOAD",
      },
      405
    );
  }

  try {
    // 2. Parse payload
    let body: IngestAudioRequestPayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({
        success: false,
        error: "Payload JSON tidak valid. Format: { driveUrl, questionId }.",
        code: "INVALID_PAYLOAD",
      });
    }

    const { driveUrl, questionId } = body;
    if (!driveUrl || !questionId) {
      return jsonResponse({
        success: false,
        error: "Parameter 'driveUrl' dan 'questionId' wajib disertakan.",
        code: "INVALID_PAYLOAD",
      });
    }

    // 3. Initialize Supabase Client
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ||
      Deno.env.get("VITE_BOLOS_SUPABASE_URL") ||
      "";
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({
        success: false,
        error: "Konfigurasi variabel lingkungan Supabase tidak ditemukan pada server.",
        code: "INTERNAL_SERVER_ERROR",
      });
    }

    const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    let audioBuffer: ArrayBuffer | undefined;
    let mimeType = "audio/mpeg";
    let fileExt = "mp3";
    let driveId = "";

    // 4. Download Audio (from Google Drive or direct URL)
    const extractedDriveId = extractGoogleDriveId(driveUrl);

    if (extractedDriveId) {
      driveId = extractedDriveId;
      const driveResult = await fetchFromGoogleDrive(driveId);

      if (driveResult.error || !driveResult.data) {
        return jsonResponse({
          success: false,
          error: driveResult.error || "Gagal mengunduh audio dari Google Drive.",
          code: driveResult.code || "DRIVE_FETCH_FAILED",
        });
      }

      audioBuffer = driveResult.data;
      mimeType = driveResult.contentType.split(";")[0].trim() || "audio/mpeg";
      fileExt = getExtensionFromMime(mimeType);
    } else if (driveUrl.startsWith("http://") || driveUrl.startsWith("https://")) {
      // Direct audio URL provided
      try {
        const directRes = await fetch(driveUrl, { redirect: "follow" });
        if (!directRes.ok) {
          return jsonResponse({
            success: false,
            error: `Gagal mengunduh berkas dari URL (HTTP ${directRes.status}).`,
            code: "DRIVE_FETCH_FAILED",
          });
        }
        audioBuffer = await directRes.arrayBuffer();
        mimeType = directRes.headers.get("content-type")?.split(";")[0].trim() || "audio/mpeg";
        fileExt = getExtensionFromMime(mimeType);
        driveId = `direct_${Date.now()}`;
      } catch (err) {
        return jsonResponse({
          success: false,
          error: `Gagal menghubungi URL audio: ${err instanceof Error ? err.message : String(err)}`,
          code: "DRIVE_FETCH_FAILED",
        });
      }
    } else {
      return jsonResponse({
        success: false,
        error:
          "Format tautan tidak valid. Harap gunakan tautan Google Drive publik atau URL audio langsung.",
        code: "INVALID_DRIVE_URL",
      });
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return jsonResponse({
        success: false,
        error: "Berkas audio yang diunduh kosong (0 byte).",
        code: "DRIVE_FETCH_FAILED",
      });
    }

    // 5. Upload to Supabase Storage 'exam-audio'
    const timestamp = Date.now();
    const storagePath = `questions/${questionId}/${driveId}_${timestamp}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("exam-audio")
      .upload(storagePath, audioBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return jsonResponse({
        success: false,
        error: `Gagal mengunggah ke penyimpanan Supabase: ${uploadError.message}`,
        code: "STORAGE_UPLOAD_FAILED",
      });
    }

    // 6. Generate Public CDN URL
    const { data: urlData } = supabase.storage
      .from("exam-audio")
      .getPublicUrl(storagePath);

    const cdnUrl = urlData.publicUrl;

    // 7. Update questions table record
    const { error: updateError } = await supabase
      .from("questions")
      .update({ audio_url: cdnUrl })
      .eq("id", questionId);

    if (updateError) {
      return jsonResponse({
        success: false,
        error: `Audio berhasil diunggah tetapi gagal memperbarui butir soal: ${updateError.message}`,
        code: "DATABASE_UPDATE_FAILED",
        details: `Audio tersimpan di: ${cdnUrl}`,
      });
    }

    // 8. Return Success Response
    return jsonResponse({
      success: true,
      audioUrl: cdnUrl,
      questionId,
      driveId,
      mimeType,
      storagePath,
      message: "Audio berhasil disinkronkan ke Supabase Storage CDN dan ditautkan ke soal.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({
      success: false,
      error: `Internal Server Error: ${message}`,
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

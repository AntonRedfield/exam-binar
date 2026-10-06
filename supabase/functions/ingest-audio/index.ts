// ==============================================================================
// Supabase Edge Function: ingest-audio
// Description: Streams audio from Google Drive directly to Supabase Storage CDN
// Path: supabase/functions/ingest-audio/index.ts
// Runtime: Supabase Edge Runtime (Deno / TypeScript)
// Constraints:
//   - Zero RAM buffering: streams response.body directly to Storage with duplex: 'half'
//   - Graceful Google Drive permission detection (private link warnings)
//   - Updates questions table record with the public CDN URL
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ------------------------------------------------------------------------------
// Type Definitions (Strict TypeScript - zero 'any')
// ------------------------------------------------------------------------------

export interface IngestAudioRequestPayload {
  driveUrl: string;
  questionId: string;
}

export interface IngestAudioSuccessResponse {
  success: true;
  audioUrl: string;
  questionId: string;
  driveId: string;
  mimeType: string;
  storagePath: string;
  message: string;
}

export interface IngestAudioErrorResponse {
  success: false;
  error: string;
  code:
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

/**
 * Extracts the file ID from various Google Drive URL formats:
 * - https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing
 * - https://drive.google.com/uc?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
 * - https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
 * - Direct ID strings
 */
export function extractGoogleDriveId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // Pattern 1: /file/d/[id]
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }

  // Pattern 2: ?id=[id] or &id=[id]
  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch && idQueryMatch[1]) {
    return idQueryMatch[1];
  }

  // Pattern 3: Direct alphanumeric ID of 25+ chars (standard GDrive file ID format)
  if (/^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Maps Content-Type or file signatures to appropriate audio file extensions.
 */
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
// Edge Function Handler
// ------------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    const errorBody: IngestAudioErrorResponse = {
      success: false,
      error: "Method not allowed. Only POST is accepted.",
      code: "INVALID_PAYLOAD",
    };
    return new Response(JSON.stringify(errorBody), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Parse and validate input JSON
    let body: IngestAudioRequestPayload;
    try {
      body = await req.json();
    } catch {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: "Malformed JSON payload. Expected { driveUrl: string, questionId: string }.",
        code: "INVALID_PAYLOAD",
      };
      return new Response(JSON.stringify(errRes), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { driveUrl, questionId } = body;

    if (!driveUrl || !questionId) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: "Missing required fields: both 'driveUrl' and 'questionId' are mandatory.",
        code: "INVALID_PAYLOAD",
      };
      return new Response(JSON.stringify(errRes), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse Google Drive File ID
    const driveId = extractGoogleDriveId(driveUrl);
    if (!driveId) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error:
          "Format tautan Google Drive tidak valid. Gunakan format seperti: https://drive.google.com/file/d/[id]/view atau ?id=[id].",
        code: "INVALID_DRIVE_URL",
      };
      return new Response(JSON.stringify(errRes), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Initialize Supabase Client with Service Role or Env
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ||
      Deno.env.get("VITE_BOLOS_SUPABASE_URL") ||
      "";
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";

    if (!supabaseUrl || !supabaseServiceKey) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: "Konfigurasi variabel lingkungan Supabase tidak ditemukan pada server.",
        code: "INTERNAL_SERVER_ERROR",
      };
      return new Response(JSON.stringify(errRes), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 4. Fetch Google direct download stream
    const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`;

    const driveResponse = await fetch(directDownloadUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CBT-Listening-Ingest/1.0",
      },
      redirect: "follow",
    });

    if (!driveResponse.ok) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: `Gagal mengunduh audio dari Google Drive (HTTP ${driveResponse.status} ${driveResponse.statusText}).`,
        code: "DRIVE_FETCH_FAILED",
      };
      return new Response(JSON.stringify(errRes), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawContentType = driveResponse.headers.get("content-type") || "";

    // Check if Google Drive returned an HTML page instead of a media binary
    if (rawContentType.includes("text/html")) {
      const textPreview = await driveResponse.text();

      const isPermissionDenied =
        textPreview.includes("accounts.google.com") ||
        textPreview.includes("Sign in") ||
        textPreview.includes("Access denied") ||
        textPreview.includes("You need access") ||
        textPreview.includes("Google Drive - Virus scan warning");

      if (isPermissionDenied) {
        const errRes: IngestAudioErrorResponse = {
          success: false,
          error:
            "Berkas Google Drive bersifat privat atau dibatasi. Harap ubah pengaturan berbagi berkas menjadi 'Siapa saja yang memiliki tautan' (Pelihat Umum) di Google Drive.",
          code: "DRIVE_PERMISSION_DENIED",
          details:
            "Endpoint unduhan Google Drive mengembalikan halaman otentikasi login atau penolakan izin akses.",
        };
        return new Response(JSON.stringify(errRes), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errRes: IngestAudioErrorResponse = {
        success: false,
        error:
          "Google Drive mengembalikan laman web alih-alih berkas audio. Pastikan tautan mengarah langsung ke berkas audio yang valid.",
        code: "DRIVE_FETCH_FAILED",
      };
      return new Response(JSON.stringify(errRes), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!driveResponse.body) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: "Google Drive returned an empty response body stream.",
        code: "DRIVE_FETCH_FAILED",
      };
      return new Response(JSON.stringify(errRes), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Stream directly into Supabase Storage 'exam-audio' without container RAM buffering
    const ext = getExtensionFromMime(rawContentType);
    const mimeType = rawContentType.split(";")[0].trim() || "audio/mpeg";
    const timestamp = Date.now();
    const storagePath = `questions/${questionId}/${driveId}_${timestamp}.${ext}`;

    // Passing driveResponse.body (ReadableStream) directly with duplex: 'half'
    // streams the bytes directly over the socket without keeping the audio file in memory.
    const { error: uploadError } = await supabase.storage
      .from("exam-audio")
      .upload(storagePath, driveResponse.body, {
        contentType: mimeType,
        upsert: true,
        // @ts-ignore - Deno Fetch / Supabase Storage duplex streaming support
        duplex: "half",
      });

    if (uploadError) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: `Supabase Storage upload failed: ${uploadError.message}`,
        code: "STORAGE_UPLOAD_FAILED",
      };
      return new Response(JSON.stringify(errRes), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Generate Public CDN URL
    const { data: urlData } = supabase.storage
      .from("exam-audio")
      .getPublicUrl(storagePath);

    const cdnUrl = urlData.publicUrl;

    // 7. Update corresponding record in questions table
    const { error: updateError } = await supabase
      .from("questions")
      .update({ audio_url: cdnUrl })
      .eq("id", questionId);

    if (updateError) {
      const errRes: IngestAudioErrorResponse = {
        success: false,
        error: `Failed to update question with audio CDN URL: ${updateError.message}`,
        code: "DATABASE_UPDATE_FAILED",
        details: `Audio was uploaded to: ${cdnUrl}`,
      };
      return new Response(JSON.stringify(errRes), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Return successful response with public CDN URL
    const successRes: IngestAudioSuccessResponse = {
      success: true,
      audioUrl: cdnUrl,
      questionId,
      driveId,
      mimeType,
      storagePath,
      message:
        "Audio berhasil disinkronkan ke CDN Supabase Storage dan ditautkan ke butir soal.",
    };

    return new Response(JSON.stringify(successRes), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const errRes: IngestAudioErrorResponse = {
      success: false,
      error: `Internal Server Error: ${message}`,
      code: "INTERNAL_SERVER_ERROR",
    };
    return new Response(JSON.stringify(errRes), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * src/utils/api.ts
 * ----------------
 * Typed fetch wrapper for the OmniCast FastAPI backend.
 *
 * - Automatically attaches the Supabase JWT from the active custom session.
 * - Handles multipart form data for /clone/voice.
 * - Returns typed results or throws structured ApiError objects.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Retrieve the raw JWT stored in the custom_session cookie via an API route. */
async function getSessionToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return null;
    const { token } = await res.json();
    return token ?? null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string
  ) {
    super(`[${status}] ${detail}`);
    this.name = "ApiError";
  }
}

async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getSessionToken();

  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.clone().json();
      detail = body.detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }

  return res;
}

// ── API surface ───────────────────────────────────────────────────────────────

/**
 * Generate speech from text.
 * @returns Blob of type audio/wav
 */
export async function generateSpeech(params: {
  text: string;
  voice_id?: string;
  speed?: number;
  metadata?: any;
}): Promise<Blob> {
  const res = await apiFetch("/api/v1/tts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      voice_id: params.voice_id ?? null,
      speed: params.speed ?? 1.0,
      metadata: params.metadata ?? null,
    }),
  });
  return res.blob();
}

/**
 * Clone a voice from a reference audio file and synthesize speech.
 * @param text          - The text to read aloud in the cloned voice.
 * @param referenceFile - WAV / MP3 / OGG reference recording (max 10 MB).
 * @param speed         - Playback speed multiplier (0.5 – 2.0).
 * @returns Blob of type audio/wav
 */
export async function cloneVoice(params: {
  text: string;
  referenceFile: File;
  speed?: number;
}): Promise<Blob> {
  const form = new FormData();
  form.append("text", params.text);
  form.append("speed", String(params.speed ?? 1.0));
  form.append("reference_audio", params.referenceFile);

  const res = await apiFetch("/api/v1/clone/voice", {
    method: "POST",
    body: form,
    // ⚠ Do NOT set Content-Type — the browser sets it automatically with the
    //   correct multipart boundary when using FormData.
  });
  return res.blob();
}

/**
 * Save a generated voice to the user's library.
 */
export async function saveVoice(params: {
  name: string;
  voice_type: 'designed' | 'cloned';
  metadata?: any;
}) {
  const res = await apiFetch("/api/v1/voices/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

/**
 * Save a cloned voice with its reference audio to Supabase.
 */
export async function saveClonedVoice(params: {
  name: string;
  referenceFile: File;
  metadata?: any;
}) {
  const form = new FormData();
  form.append("voice_name", params.name);
  form.append("reference_audio", params.referenceFile);
  if (params.metadata) {
    form.append("metadata", JSON.stringify(params.metadata));
  }

  const res = await apiFetch("/api/v1/voices/clone", {
    method: "POST",
    body: form,
  });
  return res.json();
}

/**
 * List all saved voices in the library.
 */
export async function listVoices() {
  const res = await apiFetch("/api/v1/voices", {
    method: "GET",
  });
  return res.json();
}

/**
 * Delete a voice by id.
 */
export async function deleteVoice(voiceId: string) {
  const res = await apiFetch(`/api/v1/voices/${voiceId}`, {
    method: "DELETE",
  });
  return res.json();
}

/**
 * Converse with the assistant (Groq ASR + LLM + OmniVoice).
 * @returns Blob of type audio/wav
 */
export async function converseVoice(params: {
  voice_id: string;
  audio: Blob;
}): Promise<Blob> {
  const form = new FormData();
  form.append("voice_id", params.voice_id);
  form.append("user_audio", params.audio, "user_audio.webm");

  const res = await apiFetch("/api/v1/converse", {
    method: "POST",
    body: form,
  });
  return res.blob();
}

/**
 * Active call pipeline (VAD chunks -> ASR + LLM + TTS).
 * @returns Blob of type audio/wav
 */
export async function activeCall(params: {
  call_id: string;
  voice_id: string;
  audio: Blob;
}): Promise<Blob> {
  const form = new FormData();
  form.append("call_id", params.call_id);
  form.append("voice_id", params.voice_id);
  form.append("user_audio", params.audio, "user_audio.wav");

  const res = await apiFetch("/api/v1/active_call", {
    method: "POST",
    body: form,
  });
  return res.blob();
}

/**
 * Convenience: convert an audio Blob to an object URL for <audio> elements.
 * Remember to call URL.revokeObjectURL() when done.
 */
export function blobToAudioUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Health check — useful for testing connectivity in development.
 */
export async function checkHealth(): Promise<{
  status: string;
  cuda: boolean;
  gpu: string | null;
  vram_gb: number;
}> {
  const res = await fetch(`${BACKEND_URL}/health`);
  return res.json();
}

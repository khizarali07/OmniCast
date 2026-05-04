"use client";

import { useEffect, useRef, useState } from "react";
import localFont from "next/font/local";
import { useSearchParams } from "next/navigation";
import { blobToAudioUrl, converseVoice, listVoices } from "@/utils/api";

const geist = localFont({
  src: "../../../fonts/GeistVF.woff",
  variable: "--font-geist",
  display: "swap",
});

const geistMono = localFont({
  src: "../../../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

type VoiceRecord = {
  id: string;
  name: string;
  type?: string;
  file_url?: string | null;
  metadata?: Record<string, any> | null;
};

export default function ChatPage() {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const requestedVoiceId = searchParams.get("voice_id") ?? "";

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingVoices(true);
    listVoices()
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data) ? data : [];
        setVoices(items);
        if (requestedVoiceId && items.some((voice) => voice.id === requestedVoiceId)) {
          setSelectedVoiceId(requestedVoiceId);
        } else if (items.length > 0) {
          setSelectedVoiceId(items[0].id);
        }
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Failed to load voices. Try again.");
      })
      .finally(() => {
        if (!active) return;
        setLoadingVoices(false);
      });

    return () => {
      active = false;
    };
  }, [requestedVoiceId]);

  const startRecording = async () => {
    if (isRecording || isThinking) return;
    setError(null);

    if (!selectedVoiceId) {
      setError("Select a voice before recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());

        setIsThinking(true);
        try {
          const { audioBlob } = await converseVoice({
            voice_id: selectedVoiceId,
            audio: blob,
          });
          const url = blobToAudioUrl(audioBlob);
          if (audioRef.current) {
            audioRef.current.pause();
          }
          audioRef.current = new Audio(url);
          await audioRef.current.play();
        } catch (err) {
          setError("Converse request failed. Try again.");
        } finally {
          setIsThinking(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    setIsRecording(false);
  };

  const statusLabel = isRecording
    ? "Listening"
    : isThinking
    ? "Thinking"
    : "Hold to speak";

  return (
    <div
      className={`${geist.variable} ${geistMono.variable} relative flex-1 px-10 pb-16 pt-10 text-white`}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.9),_rgba(2,6,23,1)_60%)]" />
      <div className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-[120px]" />
      <div className="absolute bottom-0 left-8 h-80 w-80 rounded-full bg-cyan-300/10 blur-[140px]" />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-emerald-200/70 font-[var(--font-geist-mono)]">
              VoxCanvas
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight font-[var(--font-geist)]">
              Conversational Loop
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="text-xs uppercase tracking-[0.3em] text-emerald-200/70 font-[var(--font-geist-mono)]">
              Active Voice
            </label>
            <select
              className="w-64 rounded-full border border-emerald-200/20 bg-slate-950/70 px-4 py-2 text-sm text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              value={selectedVoiceId}
              onChange={(event) => setSelectedVoiceId(event.target.value)}
              disabled={loadingVoices}
            >
              {loadingVoices ? (
                <option>Loading voices...</option>
              ) : voices.length === 0 ? (
                <option>No voices found</option>
              ) : (
                voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} {voice.type ? `(${voice.type})` : ""}
                  </option>
                ))
              )}
            </select>
          </div>
        </header>

        <section className="rounded-3xl border border-emerald-200/10 bg-slate-950/70 p-8 shadow-[0_0_60px_rgba(15,23,42,0.4)]">
          <div className="flex flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-100/60 font-[var(--font-geist-mono)]">
                Push to Talk
              </p>
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`group relative flex h-24 w-24 items-center justify-center rounded-full border border-emerald-200/30 bg-gradient-to-br from-emerald-400/30 via-emerald-500/10 to-cyan-400/20 text-emerald-50 shadow-[0_0_40px_rgba(16,185,129,0.35)] transition-all duration-300 ${
                  isRecording ? "scale-105" : "hover:scale-105"
                }`}
              >
                <span className="material-symbols-outlined text-3xl">
                  {isRecording ? "stop" : "mic"}
                </span>
                <span className="absolute -inset-2 rounded-full border border-emerald-400/20 opacity-0 transition group-hover:opacity-100" />
              </button>
              <p className="text-sm text-emerald-50/80 font-[var(--font-geist-mono)]">
                {statusLabel}
              </p>
            </div>

            <div className="flex w-full flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-10 w-2 rounded-full bg-emerald-300/40 transition-all ${
                      isRecording
                        ? "animate-[pulse_0.8s_ease-in-out_infinite]"
                        : isThinking
                        ? "animate-[pulse_1.4s_ease-in-out_infinite]"
                        : "opacity-30"
                    }`}
                    style={{
                      animationDelay: `${index * 0.08}s`,
                    }}
                  />
                ))}
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/50 font-[var(--font-geist-mono)]">
                {isThinking ? "AI Thinking" : "Signal"}
              </p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            {!error && !loadingVoices && voices.length === 0 ? (
              <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100/80">
                No voices yet. Create one from the Design Voice or Clone Voice page.
              </div>
            ) : null}
          </div>
        </section>

        <footer className="flex items-center justify-between text-xs text-emerald-200/60 font-[var(--font-geist-mono)]">
          <span>Groq ASR + Llama 3.1 + OmniVoice</span>
          <span>{isThinking ? "Rendering audio..." : "Ready"}</span>
        </footer>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { activeCall, blobToAudioUrl, listVoices } from '@/utils/api';
import { useMicVAD, utils as vadUtils } from '@ricky0123/vad-react';
import { toast } from 'sonner';

type VoiceRecord = {
  id: string;
  name: string;
  type?: string;
};

type CallRecord = {
  id: string;
  created_at: string;
  voice_id: string | null;
};

type TranscriptRecord = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  created_at: string;
};

export default function CallPage() {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const vad = useMicVAD({
    startOnLoad: true,
    processorType: 'ScriptProcessor',
    model: 'v5',
    baseAssetPath: '/vad/',
    onnxWASMBasePath: '/onnxruntime/',
    ortConfig: (ort) => {
      ort.env.logLevel = 'error';
      ort.env.wasm.numThreads = 1;
    },
    onSpeechStart: () => {
      if (!call) return;
    },
    onSpeechEnd: async (audio) => {
      if (!call || !selectedVoiceId || isThinking || isSpeaking) return;

      setIsThinking(true);
      try {
        const wavBuffer = vadUtils.encodeWAV(audio, 1, 16000, 1, 16);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        const { audioBlob, userTranscript, assistantReply } = await activeCall({
          call_id: call.id,
          voice_id: selectedVoiceId,
          audio: wavBlob,
        });

        // Add to transcripts immediately for "Live" feel
        if (userTranscript || assistantReply) {
          const now = new Date().toISOString();
          const newEntries: TranscriptRecord[] = [];
          if (userTranscript) {
            newEntries.push({
              id: `temp-u-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'user',
              message: userTranscript,
              created_at: now,
            });
          }
          if (assistantReply) {
            newEntries.push({
              id: `temp-a-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'assistant',
              message: assistantReply,
              created_at: now,
            });
          }
          setTranscripts((prev) => [...prev, ...newEntries]);
        }

        const url = blobToAudioUrl(audioBlob);
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const playback = new Audio(url);
        audioRef.current = playback;
        setIsSpeaking(true);
        playback.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        playback.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await playback.play();
      } catch (error) {
        console.error(error);
        toast.error('Active call request failed.');
      } finally {
        setIsThinking(false);
      }
    },
  });

  useEffect(() => {
    let active = true;
    setLoadingVoices(true);
    listVoices()
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data) ? data : [];
        const cloned = items.filter((voice) => voice.type === 'cloned');
        setVoices(cloned);
        if (cloned.length > 0) {
          setSelectedVoiceId(cloned[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        toast.error('Failed to load voices.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingVoices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (vad.loading || vad.errored) return;

    if (call && !vad.listening) {
      vad.start().catch((error) => {
        console.error(error);
        toast.error('Failed to start microphone.');
      });
      return;
    }

    if (!call && vad.listening) {
      vad.pause().catch((error) => {
        console.error(error);
      });
    }
  }, [call, vad.loading, vad.errored, vad.listening, vad]);

  useEffect(() => {
    if (!call?.id) {
      setTranscripts([]);
      return;
    }

    let canceled = false;
    let intervalId: number | undefined;

    const fetchTranscripts = async (isFirst = false) => {
      if (isFirst) {
        setLoadingTranscripts(true);
      }
      try {
        const res = await fetch(`/api/calls/${call.id}/transcripts`);
        if (!res.ok) throw new Error('Failed to load transcripts');
        const data = (await res.json()) as TranscriptRecord[];
        if (!canceled) {
          setTranscripts((prev) => {
            const incoming = Array.isArray(data) ? data : [];
            if (incoming.length === 0) return prev;
            
            // Merge logic: 
            // 1. Keep all items from DB (incoming).
            // 2. Keep temp items from 'prev' that haven't been 'confirmed' by DB yet.
            // A temp item is confirmed if its message/role exists in incoming.
            const dbMessages = new Set(incoming.map(i => `${i.role}:${i.message}`));
            const remainingTemps = prev.filter(p => p.id.startsWith('temp-') && !dbMessages.has(`${p.role}:${p.message}`));
            
            // Avoid redundant updates if nothing changed
            const combined = [...incoming, ...remainingTemps].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            // Simple optimization: only set state if count or last message changed
            if (combined.length === prev.length && combined.length > 0 && 
                combined[combined.length-1].message === prev[prev.length-1].message) {
              return prev;
            }

            return combined;
          });
        }
      } catch (error) {
        if (!canceled) console.error(error);
      } finally {
        if (!canceled && isFirst) {
          setLoadingTranscripts(false);
        }
      }
    };

    fetchTranscripts(true);
    intervalId = window.setInterval(fetchTranscripts, 2000);

    return () => {
      canceled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [call?.id]);

  async function startCall() {
    if (call || startingCall) return;
    if (!selectedVoiceId) {
      toast.error('Select a cloned voice first.');
      return;
    }

    setStartingCall(true);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: selectedVoiceId }),
      });

      if (!res.ok) {
        let message = 'Failed to start call';
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parsing errors
        }
        throw new Error(message);
      }

      const data = (await res.json()) as CallRecord;
      setCall(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to start call.');
    } finally {
      setStartingCall(false);
    }
  }

  async function endCall() {
    if (!call) return;
    try {
      await vad.pause();
      await fetch(`/api/calls/${call.id}`, { method: 'PATCH' });
    } catch (error) {
      console.error(error);
    } finally {
      setCall(null);
      setIsThinking(false);
      setIsSpeaking(false);
    }
  }

  const isActive = Boolean(call);
  const isListening = isActive && vad.listening;
  const statusLabel = !isActive
    ? 'Idle'
    : isThinking
    ? 'AI Thinking'
    : isSpeaking
    ? 'AI Speaking'
    : vad.userSpeaking
    ? 'Listening'
    : 'Ready';

  const orbTone = isThinking
    ? 'from-fuchsia-500/50 via-purple-500/30 to-indigo-500/20'
    : isSpeaking
    ? 'from-cyan-400/55 via-sky-400/30 to-blue-500/20'
    : vad.userSpeaking
    ? 'from-emerald-400/50 via-teal-400/30 to-green-500/20'
    : 'from-slate-400/20 via-slate-600/20 to-slate-800/20';

  return (
    <main className="relative flex-1 px-8 py-10 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(12,18,32,0.9),_rgba(2,6,23,1)_65%)]" />
      <div className="absolute -top-32 left-16 h-72 w-72 rounded-full bg-fuchsia-400/10 blur-[140px]" />
      <div className="absolute bottom-0 right-10 h-80 w-80 rounded-full bg-cyan-400/10 blur-[160px]" />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-200/70 font-body-sm">
              VoxCanvas Live
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Active Call
            </h1>
            <p className="mt-2 text-sm text-slate-300/80 max-w-md">
              Speak naturally, pause to let the AI respond, and keep the flow going hands-free.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2">
            <label className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/70">
              Voice Persona
            </label>
            <select
              className="w-72 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white shadow-[0_0_24px_rgba(99,102,241,0.15)] focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40"
              value={selectedVoiceId}
              onChange={(event) => setSelectedVoiceId(event.target.value)}
              disabled={loadingVoices || isActive}
            >
              {loadingVoices ? (
                <option>Loading voices...</option>
              ) : voices.length === 0 ? (
                <option>No cloned voices found</option>
              ) : (
                voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-8 shadow-[0_0_60px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col items-center gap-8">
              <div className="relative">
                <div
                  className={`h-56 w-56 rounded-full bg-gradient-to-br ${orbTone} shadow-[0_0_80px_rgba(125,211,252,0.25)] transition-all duration-500 ${
                    isActive ? 'scale-100' : 'scale-95'
                  } ${
                    vad.userSpeaking || isThinking || isSpeaking
                      ? 'animate-[pulse_1.2s_ease-in-out_infinite]'
                      : 'opacity-70'
                  }`}
                />
                <div className="absolute inset-0 rounded-full border border-white/10" />
                <div className="absolute inset-6 rounded-full border border-white/10" />
                <div className="absolute inset-12 rounded-full border border-white/5" />
              </div>

              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/60">
                  Status
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {statusLabel}
                </h3>
                <p className="mt-2 text-sm text-slate-300/80">
                  {isListening
                    ? 'Microphone live. Speak and pause to receive a response.'
                    : 'Start the call to activate live voice detection.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={startCall}
                  disabled={isActive || startingCall || loadingVoices || voices.length === 0}
                  className="px-6 py-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-semibold shadow-[0_0_30px_rgba(168,85,247,0.45)] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingCall ? 'Starting...' : 'Start Call'}
                </button>
                <button
                  type="button"
                  onClick={endCall}
                  disabled={!isActive}
                  className="px-6 py-3 rounded-full border border-rose-400/30 text-rose-100 hover:border-rose-300/60 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  End Call
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/70 to-slate-950/80 p-6 shadow-[0_0_50px_rgba(15,23,42,0.35)]">
              <h4 className="text-sm uppercase tracking-[0.3em] text-slate-300/60">Session Details</h4>
              <div className="mt-6 space-y-4 text-sm text-slate-200/80">
                <div className="flex items-center justify-between">
                  <span>Call ID</span>
                  <span className="text-white">
                    {call?.id ? `${call.id.slice(0, 8)}...` : 'Not started'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Voice</span>
                  <span className="text-white">
                    {voices.find((voice) => voice.id === selectedVoiceId)?.name ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>VAD Ready</span>
                  <span className="text-white">{vad.loading ? 'Loading' : 'Ready'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Microphone</span>
                  <span className="text-white">{isListening ? 'Live' : 'Muted'}</span>
                </div>
              </div>

              {vad.errored ? (
                <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                  {vad.errored}
                </div>
              ) : null}

              {!loadingVoices && voices.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100/80">
                  No cloned voices yet. Save a clone from the Clone Voice page.
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_0_50px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <h4 className="text-sm uppercase tracking-[0.3em] text-slate-300/60">
                  Live Transcript
                </h4>
                <span className={`text-[10px] uppercase tracking-[0.3em] ${
                  isActive ? 'text-emerald-200' : 'text-slate-400'
                }`}>
                  {isActive ? 'Live' : 'Idle'}
                </span>
              </div>

              <div className="mt-4 max-h-[320px] space-y-4 overflow-y-auto pr-2">
                {loadingTranscripts ? (
                  <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-xs text-slate-300">
                    Loading transcript...
                  </div>
                ) : transcripts.length === 0 ? (
                  <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-xs text-slate-300">
                    {isActive
                      ? 'Start speaking to generate the live transcript.'
                      : 'Start a call to see live transcription.'}
                  </div>
                ) : (
                  transcripts.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                        item.role === 'user'
                          ? 'border-white/10 bg-white/5 text-slate-100'
                          : 'border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/15 to-indigo-500/10 text-white'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300/70">
                        {item.role === 'user' ? 'You' : 'AI'}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{item.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { listVoices } from '@/utils/api';
import { toast } from 'sonner';

interface CallRecord {
  id: string;
  voice_id: string | null;
  created_at: string;
  ended_at: string | null;
}

interface TranscriptRecord {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  created_at: string;
}

export default function LogsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [callsRes, voices] = await Promise.all([
          fetch('/api/calls'),
          listVoices(),
        ]);

        if (!callsRes.ok) {
          throw new Error('Failed to load calls');
        }

        const callsData = (await callsRes.json()) as CallRecord[];
        if (active) {
          setCalls(callsData);
          if (callsData.length > 0) {
            setSelectedCallId(callsData[0].id);
          }
        }

        if (Array.isArray(voices) && active) {
          const mapping: Record<string, string> = {};
          voices.forEach((voice) => {
            mapping[voice.id] = voice.name;
          });
          setVoiceMap(mapping);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          toast.error('Failed to load call history.');
        }
      } finally {
        if (active) setLoadingCalls(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCallId) {
      setTranscripts([]);
      return;
    }

    let active = true;
    async function loadTranscripts() {
      setLoadingTranscripts(true);
      try {
        const res = await fetch(`/api/calls/${selectedCallId}/transcripts`);
        if (!res.ok) {
          throw new Error('Failed to load transcripts');
        }
        const data = (await res.json()) as TranscriptRecord[];
        if (active) {
          setTranscripts(data);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          toast.error('Failed to load transcripts.');
        }
      } finally {
        if (active) setLoadingTranscripts(false);
      }
    }

    loadTranscripts();
    return () => {
      active = false;
    };
  }, [selectedCallId]);

  const selectedCall = useMemo(() => {
    return calls.find((call) => call.id === selectedCallId) ?? null;
  }, [calls, selectedCallId]);

  return (
    <main className="relative flex-1 px-8 py-10 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(10,15,28,0.92),_rgba(2,6,23,1)_65%)]" />
      <div className="absolute -top-24 right-12 h-72 w-72 rounded-full bg-indigo-400/10 blur-[150px]" />
      <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-rose-400/10 blur-[160px]" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-200/70">
            VoxCanvas Archive
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Call Logs</h1>
          <p className="mt-2 text-sm text-slate-300/80">
            Review previous conversations and replay the full transcript history.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.6fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_0_40px_rgba(15,23,42,0.4)]">
            <h2 className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              Sessions
            </h2>
            <div className="mt-6 space-y-4">
              {loadingCalls ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  Loading calls...
                </div>
              ) : calls.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  No calls yet. Start an Active Call to generate logs.
                </div>
              ) : (
                calls.map((call) => {
                  const isActive = call.id === selectedCallId;
                  const callDate = new Date(call.created_at).toLocaleString();
                  const voiceLabel =
                    (call.voice_id && voiceMap[call.voice_id]) || 'Unknown Voice';

                  return (
                    <button
                      key={call.id}
                      type="button"
                      onClick={() => setSelectedCallId(call.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                        isActive
                          ? 'border-indigo-400/40 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.25)]'
                          : 'border-white/5 bg-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{voiceLabel}</p>
                          <p className="text-xs text-slate-300/70">{callDate}</p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                            call.ended_at
                              ? 'bg-white/5 text-slate-300/70'
                              : 'bg-emerald-400/20 text-emerald-200'
                          }`}
                        >
                          {call.ended_at ? 'Ended' : 'Live'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_0_50px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
                  Transcript
                </h2>
                <p className="mt-2 text-sm text-slate-300/70">
                  {selectedCall
                    ? `Voice: ${
                        (selectedCall.voice_id && voiceMap[selectedCall.voice_id]) || 'Unknown'
                      }`
                    : 'Select a call to view details'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              {loadingTranscripts ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  Loading transcripts...
                </div>
              ) : transcripts.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  No transcripts for this call yet.
                </div>
              ) : (
                transcripts.map((item) => (
                  <div
                    key={item.id}
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      item.role === 'user'
                        ? 'self-start bg-white/5 border border-white/10 text-slate-200'
                        : 'self-end bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10 border border-indigo-400/20 text-white'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300/60">
                      {item.role === 'user' ? 'You' : 'AI'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{item.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

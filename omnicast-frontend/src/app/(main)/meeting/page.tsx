'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  generateAvatarVideo,
  listAvatars,
  listVoices,
  AvatarSummary,
} from '@/utils/api';
import { toast } from 'sonner';

export default function LiveMeetingPage() {
  const [avatars, setAvatars] = useState<AvatarSummary[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [prompt, setPrompt] = useState('');
  const [useOriginalVoice, setUseOriginalVoice] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentBlobUrl = useRef<string | null>(null);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadAvatars() {
      try {
        const data = await listAvatars();
        if (isActive) setAvatars(data);
      } catch (error) {
        console.error(error);
        if (isActive) setAvatars([]);
      } finally {
        if (isActive) setIsLoadingAvatars(false);
      }
    }

    async function loadVoices() {
      try {
        const data = await listVoices();
        if (isActive) setVoices(data);
      } catch (error) {
        console.error(error);
        if (isActive) setVoices([]);
      } finally {
        if (isActive) setIsLoadingVoices(false);
      }
    }

    loadAvatars();
    loadVoices();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (currentBlobUrl.current) {
        URL.revokeObjectURL(currentBlobUrl.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!selectedAvatar) {
      toast.error('Select an avatar first.');
      return;
    }
    if (!useOriginalVoice && !selectedVoice) {
      toast.error('Select a voice first.');
      return;
    }
    if (!prompt.trim()) {
      toast.error('Type a prompt to generate speech.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateAvatarVideo({
        avatarId: selectedAvatar,
        text: prompt.trim(),
        voiceId: useOriginalVoice ? undefined : selectedVoice,
      });

      // Revoke previous blob URL to free memory
      if (currentBlobUrl.current) {
        URL.revokeObjectURL(currentBlobUrl.current);
      }
      // Create a fresh object URL and set it directly on the video element
      // This bypasses IDM since it's a programmatic src change, not a navigation
      const blobUrl = URL.createObjectURL(result.videoBlob);
      currentBlobUrl.current = blobUrl;

      if (videoRef.current) {
        videoRef.current.src = blobUrl;
        videoRef.current.load();
        videoRef.current.play().catch(() => {/* autoplay blocked is ok */});
      }
      setHasVideo(true);
      toast.success('Video generated.');
    } catch (error: any) {
      console.error(error);
      toast.error(error.detail || 'Failed to generate video.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AppShell>
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-10 pt-8 pb-24 z-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-h1 text-h1 text-white mb-2">Live Video Meeting</h2>
            <p className="font-body-md text-slate-400 max-w-2xl">
              Generate a real-time avatar response with your saved voices and lip-synced video output.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="bg-[#1e1e2d] border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Live Output</h3>
              <span className="text-xs text-slate-500">Auto-play enabled</span>
            </div>

            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#141421] border border-gray-800">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                controls
                style={{ display: hasVideo ? 'block' : 'none' }}
              />
              {!hasVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-full bg-purple-500/10 text-purple-300 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-2xl">smart_display</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Your generated avatar video will appear here.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-800 bg-[#17172a] px-4 py-3 text-xs text-slate-400">
              Tip: Keep prompts under 30 seconds for fastest generation.
            </div>
          </div>

          <div className="bg-[#1e1e2d] border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
            <div>
              <h3 className="text-lg font-semibold text-white">Controls</h3>
              <p className="text-sm text-slate-400">Select your avatar, voice, and prompt.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="avatar-select">
                Avatar
              </label>
              <select
                id="avatar-select"
                value={selectedAvatar}
                onChange={(event) => setSelectedAvatar(event.target.value)}
                className="w-full rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30"
              >
                <option value="" disabled>
                  {isLoadingAvatars ? 'Loading avatars...' : 'Select avatar'}
                </option>
                {avatars.map((avatar) => (
                  <option key={avatar.id} value={avatar.id}>
                    {avatar.name}
                  </option>
                ))}
              </select>
              {!isLoadingAvatars && avatars.length === 0 && (
                <p className="text-xs text-slate-500">No avatars found. Create one first.</p>
              )}
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={useOriginalVoice}
                onChange={(event) => setUseOriginalVoice(event.target.checked)}
                className="h-4 w-4 rounded border-gray-700 bg-[#131321] accent-purple-600 focus:ring-2 focus:ring-purple-600"
              />
              Use audio detected from avatar video
            </label>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="voice-select">
                Voice
              </label>
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(event) => setSelectedVoice(event.target.value)}
                disabled={useOriginalVoice}
                className={`w-full rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 ${
                  useOriginalVoice ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <option value="" disabled>
                  {isLoadingVoices ? 'Loading voices...' : 'Select voice'}
                </option>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
              {!isLoadingVoices && voices.length === 0 && (
                <p className="text-xs text-slate-500">No voices found. Save a voice first.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Type what the avatar should say..."
                className="w-full min-h-[140px] rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-60"
            >
              {isGenerating ? 'Generating Video...' : 'Generate & Speak'}
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

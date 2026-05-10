'use client';

import { useRef, useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { registerAvatar, listVoices } from '@/utils/api';
import { toast } from 'sonner';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function CreateAvatarPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarName, setAvatarName] = useState('');
  const [speakingText, setSpeakingText] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');

  useEffect(() => {
    async function loadVoices() {
      try {
        const data = await listVoices();
        setVoices(data || []);
      } catch (err) {
        console.error('Failed to load voices', err);
      }
    }
    loadVoices();
  }, []);

  const handleFile = (file: File) => {
    const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
    if (!isMp4) {
      toast.error('Please upload an MP4 video.');
      return;
    }
    setVideoFile(file);
    setAvatarId(null);
    setOutputVideoUrl(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!avatarName.trim()) {
      toast.error('Please enter an avatar name.');
      return;
    }
    if (!videoFile) {
      toast.error('Please upload a base MP4 video.');
      return;
    }
    if (!speakingText.trim()) {
      toast.error('Please enter a speaking test prompt.');
      return;
    }
    if (!selectedVoiceId) {
      toast.error('Please select a voice for this avatar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await registerAvatar({
        name: avatarName.trim(),
        videoFile,
        text: speakingText.trim(),
        voiceId: selectedVoiceId,
      });
      const createdId = (data as any).avatar_id || (data as any).id || null;
      setAvatarId(createdId);
      setOutputVideoUrl(data.output_video_url || null);
      setPreviewError(data.preview_error || null);
      toast.success('Avatar registered successfully.');
      if (data.preview_error) {
        toast.warning('Avatar created, but preview generation failed.');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.detail || 'Failed to register avatar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-10 pt-8 pb-24 z-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-h1 text-h1 text-white mb-2">Create Your Avatar</h2>
            <p className="font-body-md text-slate-400 max-w-2xl">
              Upload a base MP4 video to register your AI avatar. The engine will extract facial data and create a reusable model.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="bg-[#1e1e2d] border border-gray-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white">Base Video</h3>
                <p className="text-sm text-slate-400">MP4 only, 10-30 seconds recommended.</p>
              </div>
              <span className="text-xs text-slate-500">{videoFile ? '1 / 1 file' : '0 / 1 file'}</span>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="video/mp4"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            <div
              className={`border-2 border-dashed rounded-2xl px-8 py-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-800 bg-[#161625] hover:border-purple-500/60 hover:bg-[#1b1b2b]'
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              <div className="w-14 h-14 rounded-full bg-purple-500/10 text-purple-300 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">cloud_upload</span>
              </div>
              <h4 className="text-white font-semibold mb-2">
                {videoFile ? videoFile.name : 'Drag and drop your MP4'}
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                {videoFile ? `${formatBytes(videoFile.size)} • Click to replace` : 'Or click to browse your files'}
              </p>
              <div className="text-xs text-slate-500">
                The system will automatically extract the base face model.
              </div>
            </div>
          </div>

          <div className="bg-[#1e1e2d] border border-gray-800 rounded-2xl p-8 flex flex-col gap-6 shadow-xl">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Avatar Details</h3>
              <p className="text-sm text-slate-400">Give your avatar a memorable name.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="avatar-name">
                Avatar Name
              </label>
              <input
                id="avatar-name"
                value={avatarName}
                onChange={(event) => setAvatarName(event.target.value)}
                placeholder="e.g., Nova Agent"
                className="w-full rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="speaking-test">
                Speaking Test
              </label>
              <textarea
                id="speaking-test"
                value={speakingText}
                onChange={(event) => setSpeakingText(event.target.value)}
                placeholder="Type what the avatar should say during setup..."
                className="w-full min-h-[120px] rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="voice-select">
                Select Voice
              </label>
              <select
                id="voice-select"
                value={selectedVoiceId}
                onChange={(event) => setSelectedVoiceId(event.target.value)}
                className="w-full rounded-lg bg-[#131321] border border-gray-800 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30"
              >
                <option value="" disabled>Select a voice...</option>
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !selectedVoiceId}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-60"
            >
              {isSubmitting ? 'Registering Avatar...' : 'Register Avatar'}
            </button>

            {avatarId && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-200">
                Avatar registered: <span className="font-semibold">{avatarId}</span>
              </div>
            )}

            {outputVideoUrl && (
              <div className="rounded-xl border border-gray-800 bg-[#151526] px-4 py-3 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Preview</p>
                <video
                  controls
                  className="w-full rounded-lg border border-gray-800"
                  src={outputVideoUrl}
                />
              </div>
            )}

            {previewError && !outputVideoUrl && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                Preview generation failed. You can retry from the meeting page. ({previewError})
              </div>
            )}

            <div className="mt-auto rounded-xl border border-gray-800 bg-[#151526] px-4 py-3 text-xs text-slate-400">
              Tip: Use well-lit, frontal video for best lip-sync results.
            </div>
          </div>
        </form>
      </main>
    </AppShell>
  );
}

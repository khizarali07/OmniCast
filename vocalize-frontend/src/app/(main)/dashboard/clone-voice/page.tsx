'use client';

import { useState, useRef } from 'react';
import { cloneVoice, blobToAudioUrl, saveVoice } from '@/utils/api';
import { toast } from 'sonner';

export default function CloneVoicePage() {
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [voiceName, setVoiceName] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        const file = new File([blob], "recording.webm", { type: 'audio/webm' });
        setReferenceFile(file);
        toast.success("Recording captured!");
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioUrl(null); // Clear previous results
    } catch (err) {
      console.error(err);
      toast.error("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReferenceFile(e.target.files[0]);
      setRecordedBlob(null); // Clear recording if file uploaded
      toast.success(`Selected: ${e.target.files[0].name}`);
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error('Please enter text for synthesis.');
      return;
    }
    if (!referenceFile) {
      toast.error('Please upload or record a reference sample.');
      return;
    }

    setIsLoading(true);
    try {
      const blob = await cloneVoice({
        text,
        referenceFile,
        speed,
      });
      
      const url = blobToAudioUrl(blob);
      setAudioUrl(url);
      toast.success('Voice cloned and synthesized successfully!');
    } catch (error: any) {
      console.error(error);
      toast.error(error.detail || 'Cloning failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!audioUrl || !voiceName) {
      toast.error("Please provide a voice name before saving.");
      return;
    }
    setIsSaving(true);
    try {
      await saveVoice({
        name: voiceName,
        voice_type: 'cloned',
        metadata: { text, speed }
      });
      toast.success(`Voice "${voiceName}" saved to your library!`);
    } catch (error: any) {
      toast.error(error.detail || "Failed to save voice.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex-1 px-10 py-lg max-w-[calc(1440px-280px)] w-full">
      {/* Page Header */}
      <div className="mb-xl">
        <h2 className="font-h1 text-h1 text-on-surface mb-xs">Clone Voice</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">Record or upload high-quality audio samples to generate a custom AI voice model.</p>
      </div>

      <form onSubmit={handleClone}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-lg">
          {/* Main Form Card */}
          <div className="bg-[#121826] border border-[#1E293B] rounded-xl p-xl flex flex-col gap-lg shadow-sm">
            {/* Voice Name */}
            <div className="space-y-sm">
              <label className="font-label-caps text-label-caps text-on-surface-variant tracking-wider block" htmlFor="voice-name">Voice Name</label>
              <input 
                className="w-full bg-[#070A12] border border-outline-variant/30 rounded-lg px-md py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-[#9D50BB] focus:border-[#9D50BB] transition-all" 
                id="voice-name" 
                placeholder="e.g., My Persona V1" 
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
              />
            </div>

            {/* Synthesis Text */}
            <div className="space-y-sm">
              <label className="font-label-caps text-label-caps text-on-surface-variant tracking-wider block" htmlFor="text">Synthesis Text</label>
              <textarea 
                className="w-full bg-[#070A12] border border-outline-variant/30 rounded-lg px-md py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-[#9D50BB] focus:border-[#9D50BB] transition-all min-h-[100px]" 
                id="text" 
                placeholder="Type what the cloned voice should say..." 
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
            </div>

            {/* Upload/Record Zone */}
            <div className="space-y-sm flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider block">Reference Audio</span>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${isRecording ? 'bg-error/20 text-error animate-pulse' : 'bg-surface-container-high text-on-surface-variant hover:text-white'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{isRecording ? 'stop_circle' : 'mic'}</span>
                    {isRecording ? 'Stop Recording' : 'Record Voice'}
                  </button>
                  <span className="font-label-caps text-label-caps text-primary-container mt-1">{referenceFile ? '1 / 1 File' : '0 / 1 File'}</span>
                </div>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="audio/*" 
                onChange={handleFileChange}
              />

              <div 
                className={`flex-1 border-2 border-dashed rounded-xl transition-all duration-300 flex flex-col items-center justify-center p-xl gap-md cursor-pointer group relative overflow-hidden min-h-[200px] ${referenceFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-[#6E48AA]/40 bg-surface-container-lowest/50 hover:bg-[#121826]/80 hover:border-[#9D50BB]/60'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-sm group-hover:scale-110 transition-transform duration-300 shadow-lg ${referenceFile ? 'bg-emerald-500/20 text-emerald-500' : 'bg-surface-container text-primary-container'}`}>
                  <span className="material-symbols-outlined text-[32px]">{recordedBlob ? 'keyboard_voice' : referenceFile ? 'check_circle' : 'cloud_upload'}</span>
                </div>
                
                <div className="text-center relative z-10">
                  <h3 className="font-h2 text-h2 text-on-surface mb-unit">{recordedBlob ? 'Voice Recorded' : referenceFile ? referenceFile.name : 'Select reference audio'}</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mb-4">{referenceFile ? 'Click to change file' : 'WAV, MP3, or FLAC supported'}</p>
                  
                  {recordedBlob && (
                    <div className="bg-[#070A12] p-3 rounded-lg border border-emerald-500/30 flex flex-col gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] font-label-caps text-emerald-400 uppercase tracking-widest">Recorded Sample Preview</span>
                      <audio controls className="h-8 w-48" src={URL.createObjectURL(recordedBlob)} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audio Player & Save Action */}
            {audioUrl && (
              <div className="bg-[#1E293B]/40 rounded-xl p-6 border border-[#9D50BB]/20 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#9D50BB]/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#9D50BB]">record_voice_over</span>
                    </div>
                    <span className="font-body-sm font-medium text-on-surface">Generation Result</span>
                  </div>
                  <button 
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">{isSaving ? 'progress_activity' : 'library_add'}</span>
                    {isSaving ? 'Saving...' : 'Save to Library'}
                  </button>
                </div>
                <audio controls className="w-full h-10" key={audioUrl}>
                  <source src={audioUrl} type="audio/wav" />
                </audio>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-md border-t border-outline-variant/10 flex justify-end">
              <button 
                type="submit"
                disabled={isLoading}
                className="bg-gradient-to-r from-primary-container to-secondary-container text-white px-xl py-3 rounded-lg font-body-md font-medium tracking-wide shadow-lg hover:brightness-110 transition-all active:scale-95 flex items-center gap-sm disabled:opacity-50 disabled:scale-100"
              >
                <span className={`material-symbols-outlined text-[20px] ${isLoading ? 'animate-spin' : ''}`}>
                  {isLoading ? 'progress_activity' : 'auto_awesome'}
                </span>
                {isLoading ? 'Processing Clone...' : 'Initialize Clone'}
              </button>
            </div>
          </div>

          {/* Contextual Side Panel */}
          <div className="flex flex-col gap-lg">
            {/* Waveform Card */}
            <div className="h-48 rounded-xl bg-surface-container-high border border-outline-variant/20 overflow-hidden relative" style={{backgroundImage: "linear-gradient(135deg, rgba(15,19,31,0.9) 0%, rgba(38,42,55,0.9) 100%)"}}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-container/20 via-transparent to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4 flex items-end gap-[2px] h-12 opacity-70">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="w-full bg-primary-container rounded-t-sm animate-pulse" 
                    style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}
                  ></div>
                ))}
              </div>
            </div>

            {/* Guidelines Card */}
            <div className="bg-[#121826] border border-[#1E293B] rounded-xl p-lg shadow-sm flex-1">
              <div className="flex items-center gap-sm mb-lg">
                <span className="material-symbols-outlined text-primary-container text-[24px]">model_training</span>
                <h3 className="font-h2 text-h2 text-on-surface">Best Practices</h3>
              </div>
              <ul className="space-y-md">
                <li className="flex items-start gap-md">
                  <span className="material-symbols-outlined text-emerald-400 text-[20px] shrink-0 mt-0.5">check_circle</span>
                  <div>
                    <h4 className="font-body-sm font-semibold text-on-surface">Clean Environment</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">Ensure recordings are free from background noise or heavy room reverb.</p>
                  </div>
                </li>
                <li className="flex items-start gap-md">
                  <span className="material-symbols-outlined text-emerald-400 text-[20px] shrink-0 mt-0.5">check_circle</span>
                  <div>
                    <h4 className="font-body-sm font-semibold text-on-surface">Sufficient Length</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">Provide at least 30-60 seconds of natural speech for cloning.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}

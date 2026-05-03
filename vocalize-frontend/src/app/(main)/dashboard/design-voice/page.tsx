'use client';

import { useState } from 'react';
import { generateSpeech, blobToAudioUrl, saveVoice } from '@/utils/api';
import { toast } from 'sonner';

export default function DesignVoicePage() {
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [voiceName, setVoiceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [gender, setGender] = useState('female');
  const [age, setAge] = useState('young');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error('Please enter some text to synthesize.');
      return;
    }

    setIsLoading(true);
    try {
      const blob = await generateSpeech({
        text,
        speed,
        voice_id: 'default', // Using a default ID for now as per backend stub
      });
      
      const url = blobToAudioUrl(blob);
      setAudioUrl(url);
      toast.success('Voice synthesized successfully!');
    } catch (error: any) {
      console.error(error);
      toast.error(error.detail || 'Failed to generate voice. Is the backend running?');
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
        voice_type: 'designed',
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
    <main className="flex-1 w-full max-w-[1000px] mx-auto px-10 pt-12 pb-24 z-10">
      {/* Page Header */}
      <div className="mb-10">
        <h2 className="font-h1 text-h1 text-white mb-2">Design Voice</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">Create a unique AI persona by shaping demographic traits and vocal characteristics. The engine will instantly synthesize a bespoke voice model.</p>
      </div>

      {/* Form Container (Glassmorphic Card) */}
      <div className="bg-[#121826]/80 backdrop-blur-xl border border-[#1E293B]/60 rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <form className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10" onSubmit={handleGenerate}>
          {/* Voice Name (Full Width) */}
          <div className="col-span-1 md:col-span-2 space-y-3">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider" htmlFor="voice_name">Voice Name</label>
            <input 
              className="w-full bg-[#070A12] border border-outline-variant rounded-lg py-3.5 px-4 text-white font-body-md focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-surface-variant" 
              id="voice_name" 
              placeholder="e.g. Midnight Narrator" 
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </div>

          {/* Synthesis Text (New - Required for Backend) */}
          <div className="col-span-1 md:col-span-2 space-y-3">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider" htmlFor="text">Synthesis Text</label>
            <textarea 
              className="w-full bg-[#070A12] border border-outline-variant rounded-lg py-3.5 px-4 text-white font-body-md focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-surface-variant min-h-[120px]" 
              id="text" 
              placeholder="Type what the AI should say..." 
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>

          {/* Gender */}
          <div className="col-span-1 space-y-3">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider" htmlFor="gender">Gender</label>
            <div className="relative">
              <select 
                className="w-full bg-[#070A12] border border-outline-variant rounded-lg py-3.5 px-4 text-white font-body-md appearance-none focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all cursor-pointer" 
                id="gender" 
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="androgynous">Androgynous</option>
              </select>
            </div>
          </div>

          {/* Age */}
          <div className="col-span-1 space-y-3">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider" htmlFor="age">Perceived Age</label>
            <div className="relative">
              <select 
                className="w-full bg-[#070A12] border border-outline-variant rounded-lg py-3.5 px-4 text-white font-body-md appearance-none focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all cursor-pointer" 
                id="age" 
                value={age}
                onChange={(e) => setAge(e.target.value)}
              >
                <option value="young">Young Adult (18-30)</option>
                <option value="middle">Middle Aged (30-50)</option>
                <option value="senior">Senior (50+)</option>
              </select>
            </div>
          </div>

          {/* Speed Slider (Updated from Pitch to match Backend) */}
          <div className="col-span-1 md:col-span-2 space-y-6 pt-4 border-t border-surface-variant/50">
            <div className="flex justify-between items-end">
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider" htmlFor="speed">Synthesis Speed</label>
              <span className="font-body-sm text-primary-container font-medium bg-primary-container/10 px-2 py-1 rounded">{speed.toFixed(1)}x</span>
            </div>
            <div className="relative w-full pb-6">
              <input 
                className="w-full appearance-none bg-[#1E293B] h-1.5 rounded-lg cursor-pointer accent-primary-container" 
                id="speed" 
                max="2.0" 
                min="0.5" 
                step="0.1" 
                type="range" 
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
              />
              <div className="flex justify-between w-full mt-3 px-1">
                <span className="text-xs font-body-sm text-surface-variant font-medium">Slow</span>
                <span className="text-xs font-body-sm text-surface-variant font-medium">Fast</span>
              </div>
            </div>
          </div>

          {/* Audio Player & Save Action */}
          {audioUrl && (
            <div className="col-span-1 md:col-span-2 bg-[#1E293B]/60 rounded-xl p-6 border border-primary-container/20 space-y-4 animate-in fade-in slide-in-from-bottom-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-container">record_voice_over</span>
                  </div>
                  <span className="font-body-md font-medium text-on-surface">Synthesis Result</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">{isSaving ? 'progress_activity' : 'library_add'}</span>
                    {isSaving ? 'Saving...' : 'Save to Library'}
                  </button>
                  <a 
                    href={audioUrl} 
                    download={`${voiceName || 'generated-voice'}.wav`}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-on-surface-variant"
                    title="Download"
                  >
                    <span className="material-symbols-outlined">download</span>
                  </a>
                </div>
              </div>
              <audio controls className="w-full h-10" key={audioUrl}>
                <source src={audioUrl} type="audio/wav" />
              </audio>
            </div>
          )}

          {/* Actions */}
          <div className="col-span-1 md:col-span-2 flex justify-end items-center gap-4 pt-6 border-t border-surface-variant/50">
            <button 
              className="px-6 py-2.5 rounded-lg border border-white/10 text-white font-body-md font-medium hover:bg-white/5 hover:border-white/20 transition-all duration-200" 
              type="button"
              onClick={() => {
                setText('');
                setAudioUrl(null);
              }}
            >
              Reset
            </button>
            <button 
              className="px-8 py-2.5 rounded-lg bg-gradient-to-r from-[#9D50BB] to-[#6E48AA] text-white font-body-md font-semibold shadow-[0_4px_16px_rgba(157,80,187,0.3)] hover:shadow-[0_6px_24px_rgba(157,80,187,0.4)] hover:scale-[1.02] transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed" 
              type="submit"
              disabled={isLoading}
            >
              <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>
                {isLoading ? 'progress_activity' : 'model_training'}
              </span>
              {isLoading ? 'Synthesizing...' : 'Generate Voice'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listVoices } from '@/utils/api';
import { toast } from 'sonner';

export default function DashboardPage() {
  const [voices, setVoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadVoices() {
      try {
        const data = await listVoices();
        setVoices(data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load your voices.");
      } finally {
        setIsLoading(false);
      }
    }
    loadVoices();
  }, []);

  return (
    <main className="flex-1 w-full max-w-[1440px] mx-auto px-10 pt-8 pb-24 z-10">
      {/* Page Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="font-h1 text-h1 text-on-surface mb-2">My Voices</h2>
          <p className="font-body-md text-tertiary">Manage and utilize your custom AI voice models.</p>
        </div>
        <button className="px-6 py-2.5 rounded-lg border border-white/10 hover:border-white/20 text-on-surface font-body-sm transition-all duration-200 flex items-center space-x-2">
          <span className="material-symbols-outlined text-[18px]">filter_list</span>
          <span>Filter</span>
        </button>
      </div>

      {/* Bento Grid / Cards Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Dynamic Voice Cards */}
        {voices.map((voice) => (
          <div 
            key={voice.id}
            className="bg-[#121826] border border-[#1E293B] rounded-xl p-6 flex flex-col hover:border-[#9D50BB]/40 transition-all group"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-lg bg-[#9D50BB]/10 flex items-center justify-center text-[#9D50BB]">
                <span className="material-symbols-outlined">{voice.type === 'cloned' ? 'content_copy' : 'auto_fix_high'}</span>
              </div>
              <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-white/5">
                {voice.type}
              </span>
            </div>
            <h3 className="font-h2 text-lg text-on-surface mb-1">{voice.name}</h3>
            <p className="font-body-xs text-tertiary mb-6">Created {new Date(voice.created_at).toLocaleDateString()}</p>
            
            <div className="mt-auto flex items-center gap-3">
              <button className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-on-surface transition-all">
                Use Voice
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/5 hover:border-error/20 hover:text-error transition-all">
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </div>
          </div>
        ))}

        {/* Add New Voice Card */}
        <Link 
          href="/dashboard/design-voice"
          className="bg-[#121826] border-2 border-dashed border-[#6E48AA]/40 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#121826]/80 hover:border-primary-container/60 transition-all duration-300 min-h-[260px] group"
        >
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(157,80,187,0.1)]">
            <span className="material-symbols-outlined text-primary-container text-[32px]">add</span>
          </div>
          <h3 className="font-h2 text-xl text-on-surface mb-2">Create New Voice</h3>
          <p className="font-body-sm text-tertiary max-w-[240px]">Design or clone a new voice persona.</p>
        </Link>
      </div>
    </main>
  );
}

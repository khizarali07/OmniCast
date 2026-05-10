'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { deleteVoice, listAvatars, listVoices, updateVoice, deleteAvatar, updateAvatar, AvatarSummary } from '@/utils/api';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [voices, setVoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [avatars, setAvatars] = useState<AvatarSummary[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    type: 'voice' | 'avatar';
  } | null>(null);

  const [filterType, setFilterType] = useState<'all' | 'cloned' | 'designed'>('all');
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; type: 'voice' | 'avatar' } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

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

  useEffect(() => {
    async function loadAvatars() {
      try {
        const data = await listAvatars();
        setAvatars(data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load your avatars.");
      } finally {
        setIsLoadingAvatars(false);
      }
    }
    loadAvatars();
  }, []);

  function requestDelete(item: { id: string; name: string }, type: 'voice' | 'avatar') {
    setPendingDelete({ id: item.id, name: item.name, type });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    try {
      setDeletingId(pendingDelete.id);
      if (pendingDelete.type === 'voice') {
        await deleteVoice(pendingDelete.id);
        setVoices((prev) => prev.filter((voice) => voice.id !== pendingDelete.id));
      } else {
        await deleteAvatar(pendingDelete.id);
        setAvatars((prev) => prev.filter((avatar) => avatar.id !== pendingDelete.id));
      }
      toast.success(`${pendingDelete.type === 'voice' ? 'Voice' : 'Avatar'} deleted.`);
      setPendingDelete(null);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to delete the ${pendingDelete.type}.`);
    } finally {
      setDeletingId(null);
    }
  }

  function startEditing(item: any, type: 'voice' | 'avatar') {
    setEditingItem({ id: item.id, name: item.name, type });
    setNewItemName(item.name);
  }

  async function handleUpdateName() {
    if (!editingItem || !newItemName.trim()) return;
    setIsUpdating(true);
    try {
      if (editingItem.type === 'voice') {
        await updateVoice(editingItem.id, newItemName);
        setVoices((prev) => 
          prev.map((v) => (v.id === editingItem.id ? { ...v, name: newItemName } : v))
        );
      } else {
        await updateAvatar(editingItem.id, newItemName);
        setAvatars((prev) => 
          prev.map((a) => (a.id === editingItem.id ? { ...a, name: newItemName } : a))
        );
      }
      toast.success(`${editingItem.type === 'voice' ? 'Voice' : 'Avatar'} renamed successfully.`);
      setEditingItem(null);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to rename ${editingItem.type}.`);
    } finally {
      setIsUpdating(false);
    }
  }

  const filteredVoices = voices.filter((voice) => {
    const matchesSearch = voice.name.toLowerCase().includes(q.toLowerCase());
    const matchesFilter = filterType === 'all' || voice.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const filteredAvatars = avatars.filter((avatar) => {
    if (!q) return true;
    return avatar.name.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-10 pt-8 pb-24 z-10">
        {/* Page Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-h1 text-h1 text-on-surface mb-2">My Voices</h2>
            <p className="font-body-md text-tertiary">Manage and utilize your custom AI voice models.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
              {(['all', 'cloned', 'designed'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                    filterType === type 
                      ? 'bg-[#9D50BB] text-white shadow-lg' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bento Grid / Cards Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Dynamic Voice Cards */}
          {filteredVoices.map((voice) => (
            <div
              key={voice.id}
              className="bg-[#121826] border border-[#1E293B] rounded-xl p-6 flex flex-col hover:border-[#9D50BB]/40 transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-lg bg-[#9D50BB]/10 flex items-center justify-center text-[#9D50BB]">
                  <span className="material-symbols-outlined">{voice.type === 'cloned' ? 'content_copy' : 'auto_fix_high'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => startEditing(voice, 'voice')}
                    className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                    title="Edit name"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-white/5">
                    {voice.type}
                  </span>
                </div>
              </div>
              <h3 className="font-h2 text-lg text-on-surface mb-1">{voice.name}</h3>
              <p className="font-body-xs text-tertiary mb-6">Created {new Date(voice.created_at).toLocaleDateString()}</p>

              <div className="mt-auto flex items-center gap-3">
                <Link
                  href={`/dashboard/chat?voice_id=${voice.id}`}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-on-surface transition-all text-center"
                >
                  Use Voice
                </Link>
                <button
                  type="button"
                  onClick={() => requestDelete(voice, 'voice')}
                  disabled={deletingId === voice.id}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/5 hover:border-error/20 hover:text-error transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
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

        <div className="mt-12 mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-h1 text-h1 text-on-surface mb-2">My Avatars</h2>
            <p className="font-body-md text-tertiary">Manage your avatar library and create new personas.</p>
          </div>
          {isLoadingAvatars && (
            <span className="text-xs text-slate-500">Loading avatars...</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAvatars.map((avatar) => (
            <div
              key={avatar.id}
              className="bg-[#121826] border border-[#1E293B] rounded-xl p-6 flex flex-col hover:border-[#9D50BB]/40 transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-lg bg-[#9D50BB]/10 flex items-center justify-center text-[#9D50BB]">
                  <span className="material-symbols-outlined">person</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => startEditing(avatar, 'avatar')}
                    className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                    title="Edit name"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-white/5">
                    Avatar
                  </span>
                </div>
              </div>
              <h3 className="font-h2 text-lg text-on-surface mb-1">{avatar.name}</h3>
              <p className="font-body-xs text-tertiary mb-6">ID {avatar.id}</p>

              <div className="mt-auto flex items-center gap-3">
                <Link
                  href="/meeting"
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-on-surface transition-all text-center"
                >
                  Use Avatar
                </Link>
                <button
                  type="button"
                  onClick={() => requestDelete(avatar, 'avatar')}
                  disabled={deletingId === avatar.id}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/5 hover:border-error/20 hover:text-error transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          ))}

          <Link
            href="/avatars/create"
            className="bg-[#121826] border-2 border-dashed border-[#6E48AA]/40 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#121826]/80 hover:border-primary-container/60 transition-all duration-300 min-h-[260px] group"
          >
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(157,80,187,0.1)]">
              <span className="material-symbols-outlined text-primary-container text-[32px]">add</span>
            </div>
            <h3 className="font-h2 text-xl text-on-surface mb-2">Create New Avatar</h3>
            <p className="font-body-sm text-tertiary max-w-[240px]">Upload a base video to register a new avatar.</p>
          </Link>
        </div>
      </main>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F1A]/70 backdrop-blur-sm px-6">
          <div className="bg-[#121826] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-4 text-white">Rename {editingItem.type === 'voice' ? 'Voice' : 'Avatar'}</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="w-full bg-[#1E293B] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#9D50BB]/50 mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateName}
                disabled={isUpdating || !newItemName.trim()}
                className="px-4 py-2 rounded-lg bg-[#9D50BB] hover:bg-[#B068D1] text-white font-medium transition-all disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F1A]/70 backdrop-blur-sm px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-item-title"
          aria-describedby="delete-item-desc"
        >
          <div className="glass-panel w-full max-w-md border border-white/10 rounded-2xl p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#9D50BB]/15 flex items-center justify-center text-[#C084FC]">
                <span className="material-symbols-outlined text-[22px]">warning</span>
              </div>
              <div className="flex-1">
                <h3 id="delete-item-title" className="font-h2 text-lg text-on-surface">
                  Delete {pendingDelete.type === 'voice' ? 'voice' : 'avatar'}
                </h3>
                <p id="delete-item-desc" className="font-body-sm text-tertiary mt-1">
                  Are you sure you want to delete <span className="text-on-surface">{pendingDelete.name}</span>? This cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId === pendingDelete.id}
                className="px-4 py-2 rounded-lg border border-white/10 text-on-surface/80 hover:text-on-surface hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId === pendingDelete.id}
                className="px-4 py-2 rounded-lg bg-[#9D50BB] hover:bg-[#B068D1] text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

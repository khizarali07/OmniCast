'use client';

import { useEffect, useState } from 'react';
import { updateProfileName, uploadAvatar, changePassword, getProfile } from '@/utils/api';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getProfile();
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        if (data.avatar_url) {
          setPreviewUrl(data.avatar_url);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error('Failed to load profile details.');
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, []);

  async function handleNameUpdate() {
    if (!fullName.trim()) return;
    setIsUpdatingName(true);
    try {
      await updateProfileName(fullName);
      toast.success('Name updated successfully.');
    } catch (error) {
      toast.error('Failed to update name.');
    } finally {
      setIsUpdatingName(false);
    }
  }

  async function handlePasswordUpdate() {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await changePassword(password);
      toast.success('Password updated successfully.');
      setPassword('');
    } catch (error) {
      toast.error('Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const res = await uploadAvatar(file);
      toast.success('Profile picture updated.');
    } catch (error) {
      toast.error('Failed to upload profile picture.');
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoadingProfile) {
    return (
      <main className="flex-1 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-fuchsia-500/20 border-t-fuchsia-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium">Loading settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-10 pt-12 pb-24 z-10 text-white">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2 font-h1">Account Settings</h1>
        <p className="text-slate-400 font-body-md">Manage your profile, identity, and security.</p>
      </header>

      <div className="space-y-8">
        {/* Profile Section */}
        <section className="bg-[#121826] border border-white/10 rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-h2">
            <span className="material-symbols-outlined text-[#9D50BB]">person</span>
            Profile Information
          </h2>
          
          <div className="flex flex-col md:flex-row gap-10">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative group w-32 h-32">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-[#9D50BB]/40 flex items-center justify-center overflow-hidden bg-white/5 transition-all group-hover:border-[#9D50BB] shadow-inner">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-slate-500">account_circle</span>
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                  <span className="material-symbols-outlined text-white">upload</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </label>
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-body-xs">Profile Photo</p>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={email || "Your Name"}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-[#9D50BB]/50 transition-all font-body-sm"
                  />
                  <button
                    onClick={handleNameUpdate}
                    disabled={isUpdatingName || !fullName.trim()}
                    className="px-6 py-2.5 rounded-lg bg-[#9D50BB] hover:bg-[#B068D1] text-white font-medium transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isUpdatingName ? 'Saving...' : 'Update'}
                  </button>
                </div>
                {email && !fullName && (
                   <p className="mt-2 text-xs text-slate-500 italic">Account: {email}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-[#121826] border border-white/10 rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 font-h2">
            <span className="material-symbols-outlined text-[#9D50BB]">security</span>
            Security & Password
          </h2>
          
          <div className="max-w-md space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-[#9D50BB]/50 transition-all font-body-sm"
                />
                <button
                  onClick={handlePasswordUpdate}
                  disabled={isUpdatingPassword || password.length < 8}
                  className="px-6 py-2.5 rounded-lg border border-[#9D50BB]/50 text-on-surface hover:bg-[#9D50BB]/10 transition-all disabled:opacity-50 active:scale-95"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Change'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="border border-error/20 bg-error/5 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2 text-error font-h2">
            <span className="material-symbols-outlined">report_problem</span>
            Danger Zone
          </h2>
          <p className="text-sm text-slate-400 mb-6 font-body-sm">Once you delete your account, there is no going back. Please be certain.</p>
          <button className="px-6 py-2.5 rounded-lg border border-error/30 text-error hover:bg-error hover:text-white transition-all font-medium active:scale-95">
            Delete Account
          </button>
        </section>
      </div>
    </main>
  );
}

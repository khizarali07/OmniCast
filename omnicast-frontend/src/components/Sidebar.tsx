'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/logout-action';

export default function Sidebar() {
  const pathname = usePathname();

  const getLinkClass = (path: string) => {
    const isActive = pathname === path;
    if (isActive) {
      return "flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#9D50BB] to-[#6E48AA] text-white rounded-lg shadow-lg shadow-purple-900/20 active:scale-95 transition-transform font-inter text-sm font-medium tracking-wide";
    }
    return "flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 hover:bg-white/10 active:scale-95 font-inter text-sm font-medium tracking-wide";
  };

  return (
    <nav className="fixed h-full w-[280px] left-0 top-0 border-r border-slate-800/20 bg-[#121826]/70 backdrop-blur-xl shadow-[0_0_32px_rgba(157,80,187,0.15)] flex flex-col p-6 space-y-8 z-50">
      {/* Header */}
      <div className="flex items-center gap-4 px-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shrink-0 border border-white/10">
          <img alt="User Profile Avatar" className="w-full h-full object-cover rounded-full mix-blend-luminosity opacity-80" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDiQ6GjeFI8wDQtp3kBk6uX0KG56rNnElqpqpumDgTf4ncMbh9K476kwgERJt1A1CpEKlniSn0LYI6v2bvINb8QzztkYyrxeIwnuhymF4g4g54Svz0N5JG5Qnqv6CPYqOk4E09Md8MF0I6lZgQATrNKD2h5DQ6sQ_jj45Zv4RA032NoY4EWImPFxdqLeOwxTxutLLnp3xq1g10NjGLjUkSRcFFwlSja_KwUcD3mbF4-46Lnc6Y-tFmI0kXARgq99gcn1XkT0mfDva69"/>
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white font-h2">OmniCast</h1>
          <p className="text-xs text-slate-400 font-label-caps">Professional Plan</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 flex flex-col space-y-2 pt-4">
        <Link className={getLinkClass('/dashboard')} href="/dashboard">
          <span className="material-symbols-outlined text-xl">library_music</span>
          Voice Library
        </Link>
        <Link className={getLinkClass('/dashboard/design-voice')} href="/dashboard/design-voice">
          <span className="material-symbols-outlined text-xl" style={{fontVariationSettings: "'FILL' 1"}}>auto_fix_high</span>
          Design Voice
        </Link>
        <Link className={getLinkClass('/dashboard/clone-voice')} href="/dashboard/clone-voice">
          <span className="material-symbols-outlined text-xl">content_copy</span>
          Clone Voice
        </Link>
        <Link className={getLinkClass('/dashboard/call')} href="/dashboard/call">
          <span className="material-symbols-outlined text-xl">call</span>
          Active Call
        </Link>
        <Link className={getLinkClass('/dashboard/logs')} href="/dashboard/logs">
          <span className="material-symbols-outlined text-xl">history</span>
          Call Logs
        </Link>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col space-y-2 pt-8 border-t border-white/10">
        <Link className={getLinkClass('/dashboard/settings')} href="/dashboard/settings">
          <span className="material-symbols-outlined text-xl">settings</span>
          Settings
        </Link>
        <Link className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 font-inter text-sm font-medium tracking-wide" href="#">
          <span className="material-symbols-outlined text-xl">help_outline</span>
          Support
        </Link>

        <button onClick={() => logout()} className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-error hover:bg-error/5 rounded-lg transition-all duration-200 font-inter text-sm font-medium tracking-wide">
          <span className="material-symbols-outlined text-xl">logout</span>
          Logout
        </button>

        <button className="mt-4 w-full py-3 px-4 bg-surface-variant border border-outline-variant/50 rounded-lg text-primary hover:bg-surface-bright transition-colors font-body-sm font-semibold flex justify-center items-center gap-2 group">
          Upgrade to Pro
          <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </button>
      </div>
    </nav>
  );
}

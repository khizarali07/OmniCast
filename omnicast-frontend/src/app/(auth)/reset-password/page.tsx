import Link from 'next/link';
import { resetPassword } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';
import { AuthToast } from '@/components/AuthToast';

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string; email?: string };
}) {
  return (
    <>
      <AuthToast />
      {/* Atmospheric Background Layers */}
      <div className="absolute inset-0 z-0 opacity-10 bg-cover bg-center" style={{backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDgvrh0Gc07-_GiSPl7Z83vZMOQVifv3nQeD9gD_oWYotxFASds8SE_8OSCuptH3zp2JWoYamaPav_ln-oFOTnf2zGbeZZed3zpCM9FOaH0C8LxBOKEuKaP7p774Nx24ujxxDOipKorB_CkULU6vMOT_-N4UoURk1BuX_HmUxdSX6YkWzx6nS21dRCe-s1Uf-ihk4EAFpB7_gh6WMqhpvSURtxTfjj18LrRolPrEKw8toNykaV9cNSVxcFM_rGCs27z5_G9t4y44_Oo')"}}></div>
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary-container/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-secondary-container/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

      {/* Main Canvas / Auth Card */}
      <main className="w-full max-w-[440px] px-6 relative z-10 m-auto mt-20">
        {/* Glassmorphic Card Container */}
        <div className="bg-surface-container-low/70 backdrop-blur-xl border border-outline-variant/30 rounded-xl p-8 shadow-[0_16px_64px_rgba(157,80,187,0.08)]">
          {/* Branding Header */}
          <Link href="/" className="text-center mb-8 flex flex-col items-center group block hover:opacity-90 transition-opacity">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container/30 to-secondary-container/10 flex items-center justify-center mb-5 border border-primary-container/20 shadow-[0_0_16px_rgba(157,80,187,0.2)] group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>password</span>
            </div>
            <h1 className="font-h2 text-h2 text-on-surface mb-2">New Password</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Please enter your new password.</p>
          </Link>

          {/* Authentication Form */}
          <form className="space-y-5" action={resetPassword}>
            <input type="hidden" name="token" value={searchParams.token || ''} />
            <input type="hidden" name="email" value={searchParams.email || ''} />
            {/* Password Input */}
            <div className="space-y-2">
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase" htmlFor="password">New Password</label>
              <PasswordInput id="password" name="password" />
            </div>

            <div className="space-y-2">
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase" htmlFor="confirm_password">Confirm Password</label>
              <PasswordInput id="confirm_password" name="confirm_password" />
            </div>

            {/* Action Button */}
            <button className="w-full mt-2 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-body-md text-body-md font-medium py-3 px-4 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(157,80,187,0.25)] border border-primary/20" type="submit">
              Update Password
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

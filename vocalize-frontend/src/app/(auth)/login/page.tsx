import Link from 'next/link';
import { login } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';
import { AuthToast } from '@/components/AuthToast';

export default function LoginPage() {
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
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>graphic_eq</span>
            </div>
            <h1 className="font-h2 text-h2 text-on-surface mb-2">Sonic AI</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Sign in to orchestrate your voice models.</p>
          </Link>

          {/* Authentication Form */}
          <form className="space-y-5" action={login}>
            {/* Email Input */}
            <div className="space-y-2">
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase" htmlFor="email">Work Email</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-outline-variant group-focus-within:text-primary transition-colors text-[20px]">mail</span>
                </div>
                <input className="w-full bg-surface-dim border border-outline-variant/40 rounded-lg py-3 pl-11 pr-4 font-body-md text-body-md text-on-surface placeholder-outline focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all duration-200" id="email" name="email" placeholder="name@company.com" required type="email"/>
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase" htmlFor="password">Password</label>
                <Link className="font-label-caps text-label-caps text-primary hover:text-primary-fixed transition-colors" href="/forgot-password">Forgot?</Link>
              </div>
              <PasswordInput id="password" name="password" />
            </div>

            {/* Action Button */}
            <button className="w-full mt-2 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-body-md text-body-md font-medium py-3 px-4 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(157,80,187,0.25)] border border-primary/20" type="submit">
              Get Started
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </form>

          {/* Divider */}
          <div className="mt-8 mb-6 flex items-center">
            <div className="flex-grow border-t border-outline-variant/20"></div>
            <span className="px-4 font-label-caps text-label-caps text-outline-variant uppercase">Or continue via</span>
            <div className="flex-grow border-t border-outline-variant/20"></div>
          </div>

          {/* SSO Options */}
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-outline-variant/30 bg-surface/40 hover:bg-white/5 font-body-sm text-body-sm text-on-surface transition-colors group" type="button">
              <span className="material-symbols-outlined text-[20px] text-outline group-hover:text-on-surface transition-colors">hub</span>
              SSO
            </button>
            <button className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-outline-variant/30 bg-surface/40 hover:bg-white/5 font-body-sm text-body-sm text-on-surface transition-colors group" type="button">
              <span className="material-symbols-outlined text-[20px] text-outline group-hover:text-on-surface transition-colors">code</span>
              GitHub
            </button>
          </div>

          {/* Footer Link */}
          <div className="mt-8 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              New to Sonic AI? 
              <Link className="text-primary hover:text-primary-fixed font-medium transition-colors ml-1" href="/signup">Create an account</Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

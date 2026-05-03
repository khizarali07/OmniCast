import Link from 'next/link';
import { AuthToast } from '@/components/AuthToast';
import { verifyOTP } from '@/app/actions';
import { logout } from '@/app/logout-action';
import ResendButton from '@/components/ResendButton';
import { getSession } from '@/utils/session';
import { createAdminClient } from '@/utils/supabase/admin';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { otp?: string; email?: string };
}) {
  let displayEmail = searchParams.email;

  // If email is missing from URL, try to get it from the session
  if (!displayEmail) {
    const session = await getSession();
    if (session?.user_id) {
      const supabase = createAdminClient();
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', session.user_id)
        .single();
      
      if (user) displayEmail = user.email;
    }
  }

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
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>mark_email_read</span>
            </div>
            <h1 className="font-h2 text-h2 text-on-surface mb-2">Check Your Email</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant text-center">
              We've sent a 6-digit verification code to <span className="text-primary font-medium">{displayEmail || 'your email'}</span>.
            </p>
          </Link>

          {/* Verification Form */}
          <form className="space-y-6" action={verifyOTP}>
            <input type="hidden" name="email" value={displayEmail || ''} />
            
            <div className="space-y-2">
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase text-center" htmlFor="otp">Enter Verification Code</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-outline-variant group-focus-within:text-primary transition-colors text-[20px]">pin</span>
                </div>
                <input 
                  className="w-full bg-surface-dim border border-outline-variant/40 rounded-lg py-4 pl-11 pr-4 font-h2 text-2xl text-center tracking-[12px] text-on-surface placeholder-outline focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all duration-200" 
                  id="otp" 
                  name="otp" 
                  placeholder="000000" 
                  required 
                  type="text"
                  maxLength={6}
                  defaultValue={searchParams.otp || ''}
                />
              </div>
            </div>

            <button className="w-full mt-2 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-body-md text-body-md font-medium py-3 px-4 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(157,80,187,0.25)] border border-primary/20" type="submit">
              Verify Account
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
            </button>
          </form>

          <div className="mt-8 text-center space-y-4">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Didn't receive the code? 
              <ResendButton email={displayEmail || ''} />
            </p>
            <form action={logout}>
              <button className="text-outline hover:text-on-surface transition-colors font-body-sm flex items-center justify-center gap-1 w-full" type="submit">
                <span className="material-symbols-outlined text-sm">logout</span>
                Logout & Back to Login
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}

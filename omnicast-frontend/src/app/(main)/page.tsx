'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white font-sans selection:bg-primary/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-primary-container/20 rounded-full blur-[150px] pointer-events-none mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[900px] h-[900px] bg-secondary-container/20 rounded-full blur-[180px] pointer-events-none mix-blend-screen opacity-50"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_20px_rgba(157,80,187,0.4)]">
            <span className="material-symbols-outlined text-white" style={{fontVariationSettings: "'FILL' 1"}}>graphic_eq</span>
          </div>
          <span className="text-xl font-bold tracking-wide">OmniCast</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Sign In</Link>
          <Link href="/signup" className="text-sm font-medium bg-white text-black px-5 py-2.5 rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)]">Get Started</Link>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        {/* Hero Section */}
        <section className="text-center mt-12 mb-32 flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-block mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md text-primary text-sm font-medium tracking-wide uppercase"
          >
            Powered by RTX 3070 • Zero Latency
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-6xl md:text-8xl font-black tracking-tight leading-[1.1] mb-8 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/50"
          >
            The Ultimate <br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-primary-fixed drop-shadow-lg">Multi-Modal AI</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl text-white/60 max-w-2xl mb-10 font-light"
          >
            Seamlessly fuse lightning-fast voice cloning with photorealistic avatars. Build, design, and interact with your AI twin in real-time.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link href="/signup" className="px-8 py-4 rounded-full bg-gradient-to-r from-primary to-secondary text-white font-semibold text-lg hover:shadow-[0_0_30px_rgba(157,80,187,0.5)] hover:scale-105 transition-all flex items-center justify-center gap-2">
              Start Creating Free
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
            <a href="#features" className="px-8 py-4 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-white font-medium text-lg hover:bg-white/10 transition-all">
              Explore Engine
            </a>
          </motion.div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="mt-32">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Audio Engine */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-surface-container/50 to-transparent border border-white/10 backdrop-blur-xl group hover:border-primary/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 border border-primary/30 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-3xl">mic</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">OmniVoice Engine</h3>
              <p className="text-white/60 mb-6 line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
                Single-stage diffusion architecture that operates 40x faster than real-time. Craft pristine audio with zero latency.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span> 600+ Languages (Urdu, Hindi)</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span> 3s Zero-Shot Voice Cloning</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span> Out-of-Thin-Air Voice Design</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span> Non-Verbal Control [laughs]</li>
              </ul>
            </motion.div>

            {/* Video Engine */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="p-8 rounded-3xl bg-gradient-to-bl from-secondary-container/30 to-transparent border border-white/10 backdrop-blur-xl group hover:border-secondary/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-secondary/20 flex items-center justify-center mb-6 border border-secondary/30 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-secondary text-3xl">videocam</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">HeyGen Video Integration</h3>
              <p className="text-white/60 mb-6 text-sm">
                Transform a single photo into a photorealistic avatar with the Avatar IV/V Engine.
              </p>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span> Expressive Lip-Sync</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span> Authentic Gestures</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span> Voice Director & Mirroring</li>
              </ul>
            </motion.div>

            {/* Platform Capabilities */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3 mt-4 p-8 rounded-3xl bg-surface/40 border border-white/10 backdrop-blur-xl overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>
              <div className="grid md:grid-cols-4 gap-8 relative z-10 text-center">
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-4xl text-white/80 mb-3">memory</span>
                  <h4 className="font-semibold text-lg mb-1">Local Processing</h4>
                  <p className="text-xs text-white/50">100% private, RTX 3070 optimized</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-4xl text-white/80 mb-3">record_voice_over</span>
                  <h4 className="font-semibold text-lg mb-1">Real-Time VAD</h4>
                  <p className="text-xs text-white/50">Seamless conversational turns</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-4xl text-white/80 mb-3">dns</span>
                  <h4 className="font-semibold text-lg mb-1">Supabase Auth</h4>
                  <p className="text-xs text-white/50">Cloud persistence & sync</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-4xl text-white/80 mb-3">hub</span>
                  <h4 className="font-semibold text-lg mb-1">Multi-Modal</h4>
                  <p className="text-xs text-white/50">Audio to Video pipeline</p>
                </div>
              </div>
            </motion.div>

          </div>
        </section>
      </main>
    </div>
  );
}

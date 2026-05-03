import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      {/* Main Content Area */}
      <div className="flex-1 ml-[280px] min-h-screen flex flex-col relative overflow-hidden">
        {/* Ambient Background Glows */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary-container/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-secondary-container/10 rounded-full blur-[100px] pointer-events-none"></div>
        
        {/* TopAppBar (Shared Component) */}
        <header className="w-full h-16 sticky top-0 z-40 bg-transparent flex items-center justify-between px-10 max-w-[calc(1440px-280px)] mx-auto font-body-sm text-sm">
          <div className="flex items-center flex-1">
            <div className="w-full flex justify-end items-center">
              <div className="relative w-64 mr-6 group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-hover:text-primary transition-colors">search</span>
                <input className="w-full bg-surface-container-low/50 border border-surface-container-high rounded-full py-2 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container/50 transition-all placeholder:text-slate-500 backdrop-blur-md" placeholder="Search voices..." type="text"/>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-[#9D50BB] hover:text-white transition-colors active:opacity-80">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-[#9D50BB] hover:text-white transition-colors active:opacity-80 border border-primary-container/30 overflow-hidden">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
        </header>

        {children}
      </div>
    </>
  );
}

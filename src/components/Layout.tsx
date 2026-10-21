import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Scroll to the top on route change (HashRouter does not do this for us).
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-2 backdrop-blur lg:hidden">
          <button type="button" className="btn" onClick={() => setOpen(true)} aria-label="Open experiment list">
            ☰
          </button>
          <span className="font-semibold">RoboLab</span>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

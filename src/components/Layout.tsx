import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { EXPERIMENTS } from '../experiments/registry';

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1C1B19" />
      <circle cx="10" cy="22" r="3" fill="#2F5FD0" />
      <line x1="10" y1="22" x2="17" y2="12" stroke="#2F5FD0" strokeWidth="3" strokeLinecap="round" />
      <line x1="17" y1="12" x2="25" y2="17" stroke="#E5533D" strokeWidth="3" strokeLinecap="round" />
      <circle cx="25" cy="17" r="2.5" fill="#F2B33D" />
    </svg>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = EXPERIMENTS.find((e) => e.route === location.pathname);
  const crumb = current ? current.title : location.pathname === '/about' ? 'About' : location.pathname === '/' ? 'Overview' : 'Not found';

  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-4">
        <button type="button" className="btn px-2 py-1 lg:hidden" onClick={() => setOpen(true)} aria-label="Open experiment list">
          ☰
        </button>
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-heading text-[17px] font-semibold text-ink">RoboLab</span>
        </Link>
        <nav className="ml-3 hidden items-center gap-2 text-sm text-muted sm:flex" aria-label="Breadcrumb">
          <span className="text-line">|</span>
          <Link to="/" className="hover:text-ink">Experiments</Link>
          <span>›</span>
          <span className="text-ink">{crumb}</span>
          {current && <span className="eyebrow ml-2 rounded-md bg-sidebar px-2 py-0.5">{current.tag}</span>}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

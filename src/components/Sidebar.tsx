import { NavLink } from 'react-router-dom';
import { EXPERIMENTS, MODULES, experimentsByModule } from '../experiments/registry';
import Icon from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'group flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition',
      isActive ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
    ].join(' ');

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-950/95 backdrop-blur transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Experiments"
      >
        <NavLink to="/" onClick={onClose} className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-lg font-bold text-white shadow">
            R
          </span>
          <span>
            <span className="block text-lg font-semibold leading-tight tracking-tight text-white">RoboLab</span>
            <span className="block text-xs text-slate-400">Virtual Robotics & AI Lab</span>
          </span>
        </NavLink>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLink to="/" end onClick={onClose} className={linkClass}>
            <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-800 text-xs font-semibold text-slate-300 group-[.active]:bg-sky-500/20">
              ⌂
            </span>
            Home
          </NavLink>

          {MODULES.map((m) => (
            <div key={m.id} className="mt-5">
              <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.title}</h3>
              <ul className="space-y-0.5">
                {experimentsByModule(m.id).map((e) => (
                  <li key={e.id}>
                    <NavLink to={e.route} onClick={onClose} className={linkClass}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-800 font-mono text-xs font-semibold text-slate-300">
                        {e.number}
                      </span>
                      <span className="flex-1 truncate">{e.title}</span>
                      <Icon name={e.icon} className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-90" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-3 py-2">
          <NavLink to="/about" onClick={onClose} className={linkClass}>
            <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-800 text-xs font-semibold text-slate-300">i</span>
            About · syllabus map
          </NavLink>
          <div className="px-3 pb-1 pt-2 text-xs text-slate-500">{EXPERIMENTS.length} experiments · runs fully in the browser</div>
        </div>
      </aside>
    </>
  );
}

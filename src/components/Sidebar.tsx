import { NavLink } from 'react-router-dom';
import { EXPERIMENTS, MODULES, experimentsByModule } from '../experiments/registry';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const rowClass = ({ isActive }: { isActive: boolean }) =>
    ['group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition', isActive ? 'bg-[#E4DED2] text-ink' : 'text-ink/80 hover:bg-[#E9E4D9] hover:text-ink'].join(' ');

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={['fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-sidebar transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full'].join(' ')}
        aria-label="Experiments"
      >
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="eyebrow px-3 pb-2">Workspace</div>
          <NavLink to="/" end onClick={onClose} className={rowClass}>
            <span className="mono w-6 text-[11px] text-muted">—</span>
            Overview
          </NavLink>
          <NavLink to="/about" onClick={onClose} className={rowClass}>
            <span className="mono w-6 text-[11px] text-muted">—</span>
            About · syllabus map
          </NavLink>

          {MODULES.map((m) => (
            <div key={m.id} className="mt-5">
              <div className="eyebrow px-3 pb-2">{m.code}</div>
              <ul className="space-y-0.5">
                {experimentsByModule(m.id).map((e) => (
                  <li key={e.id}>
                    <NavLink to={e.route} onClick={onClose} className={rowClass}>
                      <span className="mono w-6 shrink-0 text-[11px] text-muted">{String(e.number).padStart(2, '0')}</span>
                      <span className="flex-1 truncate">{e.title}</span>
                      <span className="mono shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted">{e.co.split(',')[0].trim()}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="eyebrow border-t border-line px-6 py-3">
          {EXPERIMENTS.length} experiments · {MODULES.length} modules
        </div>
      </aside>
    </>
  );
}

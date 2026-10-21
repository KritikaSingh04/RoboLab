import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Experiment } from '../experiments/registry';
import Icon from './Icon';

/**
 * Standard lab write-up template. Every experiment renders inside this so the
 * structure (Aim → Theory → Simulation → Results → Conclusion) is identical.
 * A sticky section nav highlights the section currently in view.
 */
export interface ExperimentPageProps {
  experiment: Experiment;
  aim: ReactNode;
  theory: ReactNode;
  simulation: ReactNode;
  results: ReactNode;
  conclusion: ReactNode;
}

const SECTIONS = [
  { id: 'aim', label: 'Aim' },
  { id: 'theory', label: 'Theory' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'results', label: 'Results' },
  { id: 'conclusion', label: 'Conclusion' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function ExperimentPage({ experiment, aim, theory, simulation, results, conclusion }: ExperimentPageProps) {
  const [active, setActive] = useState<SectionId>('aim');
  const refs = useRef<Record<SectionId, HTMLElement | null>>({ aim: null, theory: null, simulation: null, results: null, conclusion: null });

  useEffect(() => {
    document.title = `${experiment.number}. ${experiment.title} — RoboLab`;
    return () => {
      document.title = 'RoboLab — Virtual Robotics & AI Lab';
    };
  }, [experiment]);

  // Highlight the last section whose heading has scrolled past the sticky nav.
  useEffect(() => {
    const root = document.getElementById('main');
    if (!root) return;
    const update = () => {
      const rootTop = root.getBoundingClientRect().top;
      let current: SectionId = 'aim';
      for (const s of SECTIONS) {
        const el = refs.current[s.id];
        if (el && el.getBoundingClientRect().top - rootTop <= 140) current = s.id;
      }
      // At the very bottom, the last section is the one being read.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = SECTIONS[SECTIONS.length - 1].id;
      setActive((a) => (a === current ? a : current));
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      root.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const jump = (id: SectionId) => {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const content: Record<SectionId, ReactNode> = { aim, theory, simulation, results, conclusion };

  return (
    <article className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <header className="pt-8 pb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-slate-300">Experiment {experiment.number}</span>
          <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300 ring-1 ring-sky-500/30">{experiment.tag}</span>
          <span className="text-slate-500">Syllabus {experiment.syllabus}</span>
        </div>
        <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          <Icon name={experiment.icon} className="h-8 w-8 text-sky-400" />
          {experiment.title}
        </h1>
      </header>

      <nav className="sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-label="Sections">
        <ul className="flex gap-1 overflow-x-auto">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => jump(s.id)}
                className={[
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                  active === s.id ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                ].join(' ')}
              >
                <span className="mr-1.5 font-mono text-xs opacity-60">{i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-10">
        {SECTIONS.map((s) => (
          <section
            key={s.id}
            id={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            className="scroll-mt-20"
          >
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-white">
              <span className="h-5 w-1 rounded-full bg-sky-500" aria-hidden />
              {s.label}
            </h2>
            <div className="text-[15px] leading-relaxed text-slate-300">{content[s.id]}</div>
          </section>
        ))}
      </div>
    </article>
  );
}

/** Two-column Simulation layout: controls on the left, visual on the right. */
export function SimulationLayout({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="card space-y-4 self-start">{controls}</div>
      <div className="card min-h-[360px]">{children}</div>
    </div>
  );
}

/** Placeholder shown by every experiment until it is implemented. */
export function ComingSoon({ what }: { what?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-4 py-6 text-slate-400">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 font-mono text-sm">…</span>
      <div>
        <div className="font-medium text-slate-300">Coming soon</div>
        {what && <div className="text-sm">{what}</div>}
      </div>
    </div>
  );
}

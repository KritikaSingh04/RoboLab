import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Experiment } from '../experiments/registry';
import Illustration from './Illustration';

/**
 * Standard lab write-up template. Every experiment renders inside this so the
 * structure (Aim → Theory → Simulation → Results → Conclusion) is identical.
 * A sticky section nav (mono tabs, underline on the active one) tracks scrolling.
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

  const jump = (id: SectionId) => refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const content: Record<SectionId, ReactNode> = { aim, theory, simulation, results, conclusion };
  const code = `${String(experiment.number).padStart(2, '0')}`;

  return (
    <article className="mx-auto max-w-[1400px] px-6 pb-16 lg:px-10">
      <header className="grid items-center gap-6 pb-4 pt-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-[13px] text-muted">EXPERIMENT {code}</span>
            <span className="eyebrow rounded-md bg-white px-2 py-0.5 ring-1 ring-line">{experiment.tag}</span>
            <span className="mono text-[12px] text-muted">§ {experiment.syllabus}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.05] text-ink">{experiment.title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">{experiment.description}</p>
        </div>
        <Illustration id={experiment.id} className="mx-auto h-36 w-full max-w-[220px] lg:h-40" alt="" />
      </header>

      <nav className="sticky top-0 z-20 -mx-6 mb-6 border-b border-line bg-paper/95 px-6 backdrop-blur lg:-mx-10 lg:px-10" aria-label="Sections">
        <ul className="flex gap-6 overflow-x-auto">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => jump(s.id)}
                className={['eyebrow -mb-px whitespace-nowrap border-b-2 py-3 transition', active === s.id ? 'border-ink text-ink' : 'border-transparent hover:text-ink'].join(' ')}
              >
                <span className="mr-1.5 opacity-60">{i + 1}</span>
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
            className="scroll-mt-16"
          >
            <h2 className="mb-3 text-[22px] text-ink">{s.label}</h2>
            <div className={['text-[15px] leading-relaxed text-ink/90', s.id === 'aim' || s.id === 'theory' || s.id === 'conclusion' ? 'card p-6' : ''].join(' ')}>{content[s.id]}</div>
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

/** Placeholder shown by an experiment until it is implemented. */
export function ComingSoon({ what }: { what?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-white px-4 py-6 text-muted">
      <span className="mono grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar text-sm">…</span>
      <div>
        <div className="font-medium text-ink">Coming soon</div>
        {what && <div className="text-sm">{what}</div>}
      </div>
    </div>
  );
}

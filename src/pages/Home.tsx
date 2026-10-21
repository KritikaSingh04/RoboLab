import { Link } from 'react-router-dom';
import { EXPERIMENTS, MODULES, experimentsByModule } from '../experiments/registry';
import Icon from '../components/Icon';

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="mb-10">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-sky-400">Robotics & AI Laboratory</p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          RoboLab — <span className="text-slate-300">Virtual Robotics & AI Lab</span>
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-400">
          Interactive, in-browser versions of the course experiments. Every page follows the lab write-up structure — Aim, Theory,
          Simulation, Results, Conclusion — and every number on screen is computed live from the maths shown in the theory section.
          Move the sliders, type exact values, and check the results yourself.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-400">
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">{EXPERIMENTS.length} experiments</span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">No installation</span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">Maths implemented from scratch</span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">SI units · angles shown in degrees</span>
          <Link to="/about" className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sky-300 hover:bg-sky-500/20">About · syllabus mapping →</Link>
        </div>
      </header>

      {MODULES.map((m) => {
        const list = experimentsByModule(m.id);
        if (list.length === 0) return null;
        return (
          <section key={m.id} className="mb-10">
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="text-xl font-semibold text-white">{m.title}</h2>
              <span className="text-sm text-slate-500">{m.blurb}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((e) => (
                <Link
                  key={e.id}
                  to={e.route}
                  className="group card flex flex-col gap-3 transition hover:-translate-y-0.5 hover:border-sky-500/50 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-sky-300 ring-1 ring-slate-700 group-hover:bg-sky-500/15 group-hover:ring-sky-500/40">
                      <Icon name={e.icon} />
                    </span>
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">#{e.number}</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold leading-snug text-white group-hover:text-sky-200">{e.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{e.description}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-xs">
                    <span className="rounded-md bg-sky-500/10 px-2 py-0.5 font-medium text-sky-300 ring-1 ring-sky-500/20">{e.tag}</span>
                    <span className="text-slate-500">§ {e.syllabus}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

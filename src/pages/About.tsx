import { Link } from 'react-router-dom';
import { EXPERIMENTS, MODULES } from '../experiments/registry';
import { PYODIDE_VERSION } from '../lib/py/pyodide';

/** Edit these names before submission. */
const TEAM = [
  { name: 'Team member 1', role: 'Kinematics & dynamics experiments', id: 'Roll no. ____' },
  { name: 'Team member 2', role: 'AI & machine-learning experiments', id: 'Roll no. ____' },
  { name: 'Team member 3', role: 'Mobile robotics & integration', id: 'Roll no. ____' },
  { name: 'Supervisor / instructor', role: 'Course: Robotics & AI laboratory', id: '' },
];

const STACK: { name: string; role: string }[] = [
  { name: 'Vite + React 18 + TypeScript (strict)', role: 'application framework and build' },
  { name: 'Tailwind CSS', role: 'dark, high-contrast styling' },
  { name: 'react-router-dom (HashRouter)', role: 'one route per experiment, works on static hosting' },
  { name: 'HTML5 Canvas 2D', role: 'all 2D simulations (arms, mobile robots, clustering)' },
  { name: 'three + @react-three/fiber + drei', role: '3D views only (screw transform, SCARA, fuzzy control surface)' },
  { name: 'recharts', role: 'plots and graphs' },
  { name: 'KaTeX', role: 'equations' },
  { name: `Pyodide ${PYODIDE_VERSION} + numpy (CDN)`, role: 'real Python for the linear-regression experiment, with a TypeScript fallback' },
  { name: 'CodeMirror', role: 'editable Python program' },
  { name: 'vitest', role: 'unit tests of every math and simulation module' },
];

export default function About() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-cobalt">About</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">RoboLab — Virtual Robotics & AI Lab</h1>
        <p className="mt-3 max-w-3xl text-muted">
          A browser-based implementation of the laboratory experiments of the Robotics & AI course. Every experiment follows the lab write-up
          structure (Aim, Theory, Simulation, Results, Conclusion), all mathematics is implemented from scratch in pure functions with unit tests,
          and nothing leaves the browser: there is no backend and no account.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold text-ink">Syllabus mapping</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-field text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Experiment</th>
                <th className="px-4 py-2 font-medium">Module</th>
                <th className="px-4 py-2 font-medium">Syllabus section</th>
                <th className="px-4 py-2 font-medium">Course outcome</th>
              </tr>
            </thead>
            <tbody>
              {EXPERIMENTS.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="mono px-4 py-2 text-muted">{e.number}</td>
                  <td className="px-4 py-2">
                    <Link to={e.route} className="text-cobalt hover:underline">{e.title}</Link>
                  </td>
                  <td className="px-4 py-2 text-ink/80">{MODULES.find((m) => m.id === e.module)?.title}</td>
                  <td className="mono px-4 py-2 text-ink/80">{e.syllabus}</td>
                  <td className="mono px-4 py-2 text-ink/80">{e.co}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Experiment 13 is an integration exercise beyond the syllabus list; it reuses experiments 4, 5 and 10.</p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-ink">Technology stack</h2>
          <ul className="card divide-y divide-line p-0">
            {STACK.map((s) => (
              <li key={s.name} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="mono shrink-0 text-sm text-ink sm:w-72">{s.name}</span>
                <span className="text-sm text-muted">{s.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">No machine-learning libraries are used: fuzzy inference, the neural network, k-means and regression are written from scratch, which is the point of the exercise.</p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-ink">Team</h2>
          <ul className="card divide-y divide-line p-0">
            {TEAM.map((t, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar font-semibold text-cobalt">{i + 1}</span>
                <span>
                  <span className="block text-ink">{t.name}</span>
                  <span className="block text-xs text-muted">{t.role}{t.id ? ` · ${t.id}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Placeholders — edit the names in src/pages/About.tsx.</p>

          <h2 className="mb-3 mt-8 text-xl font-semibold text-ink">Running it</h2>
          <pre className="mono rounded-lg border border-line bg-field p-4 text-xs leading-relaxed text-ink/80">{`npm install
npm run dev      # development server
npm run build    # production build in dist/
npm test         # vitest unit tests`}</pre>
          <p className="mt-2 text-xs text-muted">The built site is static; copy dist/ to any web server or open it from a folder. Only the Python experiment downloads the Pyodide runtime from a CDN, and it falls back to the TypeScript implementation when offline.</p>
        </section>
      </div>
    </div>
  );
}

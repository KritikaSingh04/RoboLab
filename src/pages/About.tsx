import { PYODIDE_VERSION } from '../lib/py/pyodide';

const STACK: string[] = [
  'Vite',
  'React 18',
  'TypeScript',
  'Tailwind CSS',
  'react-router-dom',
  'Canvas 2D',
  'three + react-three-fiber',
  'recharts',
  'KaTeX',
  `Pyodide ${PYODIDE_VERSION} + numpy`,
  'CodeMirror',
  'vitest',
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
        <h2 className="mb-3 text-xl font-semibold text-ink">Running it</h2>
        <pre className="mono rounded-lg border border-line bg-field p-4 text-xs leading-relaxed text-ink/80">{`npm install
npm run dev      # development server
npm run build    # production build in dist/
npm test         # vitest unit tests`}</pre>
        <p className="mt-2 text-xs text-muted">The built site is static; copy dist/ to any web server or open it from a folder. Only the Python experiment downloads the Pyodide runtime from a CDN, and it falls back to the TypeScript implementation when offline.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-ink">Technology stack</h2>
        <ul className="flex flex-wrap gap-2">
          {STACK.map((s) => (
            <li key={s} className="mono rounded-md border border-line bg-white px-2.5 py-1 text-[12px] text-ink/80">{s}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">No machine-learning libraries: fuzzy inference, the neural network, k-means and regression are written from scratch.</p>
      </section>
    </div>
  );
}

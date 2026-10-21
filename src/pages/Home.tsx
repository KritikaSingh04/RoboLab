import { Link } from 'react-router-dom';
import { EXPERIMENTS, MODULES, experimentsByModule } from '../experiments/registry';
import Illustration from '../components/Illustration';

export default function Home() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-10 lg:px-10">
      <header className="mb-8 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h1 className="text-[clamp(2.4rem,5vw,4.4rem)] leading-[1.02] text-ink">
            <span className="block font-heading font-semibold">Robotics &amp; AI lab,</span>
            <span className="mt-2 block font-pixel text-[0.78em] font-normal tracking-normal">from first principles.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">Every experiment of the course as an interactive simulation, with every number computed live from the maths on the page.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="eyebrow rounded-full border border-line bg-white px-3 py-1.5 normal-case tracking-normal text-ink">{EXPERIMENTS.length} experiments · runs in the browser</span>
            <Link to="/about" className="eyebrow rounded-full border border-line bg-white px-3 py-1.5 normal-case tracking-normal text-cobalt hover:border-cobalt/50">About · syllabus mapping →</Link>
          </div>
        </div>
        <Illustration id="hero" className="mx-auto h-56 w-full max-w-[320px] lg:h-64" alt="" />
      </header>

      <section className="card p-6 lg:p-8">
        <div className="eyebrow mb-5">Lab structure</div>
        {MODULES.map((m) => {
          const list = experimentsByModule(m.id);
          if (list.length === 0) return null;
          return (
            <div key={m.id} className="mb-8 last:mb-0">
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-lg text-ink">{m.title}</h2>
                <span className="eyebrow">{m.code}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((e) => (
                  <Link
                    key={e.id}
                    to={e.route}
                    className="group flex flex-col rounded-card border border-line bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="mono text-[12px] text-muted">{String(e.number).padStart(2, '0')}.{String(list.indexOf(e) + 1).padStart(2, '0')}</span>
                      <span className="text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-ink" aria-hidden>→</span>
                    </div>
                    <h3 className="mt-3 text-[19px] leading-snug text-ink">{e.title}</h3>
                    <div className="flex flex-1 items-center justify-center py-6">
                      <Illustration id={e.id} className="h-40 w-full max-w-[260px]" alt="" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="eyebrow">{e.tag}</span>
                      <span className="mono text-[11px] text-muted">§ {e.syllabus}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

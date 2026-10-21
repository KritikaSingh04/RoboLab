import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import { EXPERIMENTS } from './experiments/registry';

/** Per-route error boundary so one broken experiment never takes down the app (CLAUDE.md rule 8). */
class RouteErrorBoundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Experiment "${this.props.name}" crashed`, error, info);
  }
  componentDidUpdate(prev: { name: string }) {
    if (prev.name !== this.props.name && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-bold text-tomato">This experiment hit an error</h1>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-tomato/40 bg-field p-4 text-sm text-tomato">{String(this.state.error)}</pre>
          <p className="mt-4 text-muted">
            The other experiments are unaffected.{' '}
            <Link to="/" className="text-cobalt underline">
              Back to the home page
            </Link>
            .
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Loading() {
  return (
    <div className="flex h-64 items-center justify-center text-muted">
      <span className="mr-3 inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-cobalt" />
      Loading experiment…
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-muted">
        <Link to="/" className="text-cobalt underline">
          Back to the home page
        </Link>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/about" element={<About />} />
          {EXPERIMENTS.map((e) => {
            const Page = e.component;
            return (
              <Route
                key={e.id}
                path={e.route}
                element={
                  <RouteErrorBoundary name={e.id}>
                    <Suspense fallback={<Loading />}>
                      <Page />
                    </Suspense>
                  </RouteErrorBoundary>
                }
              />
            );
          })}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

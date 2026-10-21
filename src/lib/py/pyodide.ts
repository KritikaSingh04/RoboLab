/**
 * Lazy Pyodide loader (official CDN, with numpy). A single shared promise so
 * the runtime is downloaded once; `preloadPyodide()` is called on app start
 * so the runtime is usually ready by the time the Python experiment opens.
 */
export const PYODIDE_VERSION = '0.26.4';
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export interface PyodideLike {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (pkgs: string | string[]) => Promise<void>;
  setStdout: (opts: { batched: (s: string) => void }) => void;
  setStderr: (opts: { batched: (s: string) => void }) => void;
  globals: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
  version: string;
}

export type PyodideStatus = { state: 'idle' } | { state: 'loading'; stage: string } | { state: 'ready'; loadMs: number } | { state: 'error'; message: string };

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideLike>;
  }
}

let status: PyodideStatus = { state: 'idle' };
let promise: Promise<PyodideLike> | null = null;
const listeners = new Set<(s: PyodideStatus) => void>();

function setStatus(s: PyodideStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

export function getPyodideStatus(): PyodideStatus {
  return status;
}

export function subscribePyodide(fn: (s: PyodideStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not download ${src}`));
    document.head.appendChild(el);
  });
}

/** Start (or join) the download. Resolves with the ready runtime. */
export function loadPyodideRuntime(): Promise<PyodideLike> {
  if (promise) return promise;
  const t0 = performance.now();
  promise = (async () => {
    try {
      setStatus({ state: 'loading', stage: 'downloading Pyodide runtime' });
      await loadScript(`${PYODIDE_CDN}pyodide.js`);
      if (!window.loadPyodide) throw new Error('could not load Pyodide from the CDN (offline?)');
      setStatus({ state: 'loading', stage: 'starting the Python interpreter' });
      const py = await window.loadPyodide({ indexURL: PYODIDE_CDN });
      setStatus({ state: 'loading', stage: 'installing numpy' });
      await py.loadPackage('numpy');
      setStatus({ state: 'ready', loadMs: performance.now() - t0 });
      return py;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus({ state: 'error', message });
      promise = null; // allow a retry
      throw e;
    }
  })();
  return promise;
}

/** Kick off the download in the background once the page is idle. */
export function preloadPyodide(): void {
  if (typeof window === 'undefined' || promise) return;
  const start = () => {
    loadPyodideRuntime().catch(() => {
      /* status carries the error; the experiment falls back to JS */
    });
  };
  if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
}

export interface PythonRun {
  stdout: string[];
  /** Value of the last expression (e.g. a JSON string). */
  value: unknown;
  ms: number;
}

/** Run a program with the given globals; stdout/stderr are captured line by line. */
export async function runPython(code: string, globals: Record<string, unknown>): Promise<PythonRun> {
  const py = await loadPyodideRuntime();
  const stdout: string[] = [];
  py.setStdout({ batched: (s) => stdout.push(s) });
  py.setStderr({ batched: (s) => stdout.push(`[stderr] ${s}`) });
  for (const [k, v] of Object.entries(globals)) py.globals.set(k, v);
  const t0 = performance.now();
  const value = await py.runPythonAsync(code);
  return { stdout, value, ms: performance.now() - t0 };
}

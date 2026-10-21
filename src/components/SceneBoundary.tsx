import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown instead of the scene when it throws (e.g. WebGL unavailable). */
  fallback?: ReactNode;
}

/** Error boundary for 3D views: a missing WebGL context must not take the rest of the experiment down. */
export default class SceneBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D scene failed to render', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center text-muted">
            <div className="font-medium text-mustardInk">3D view unavailable</div>
            <div className="text-sm">{String(this.state.error.message || this.state.error)}</div>
            <div className="text-xs text-muted">WebGL could not be started in this browser. All numeric results on this page are unaffected.</div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

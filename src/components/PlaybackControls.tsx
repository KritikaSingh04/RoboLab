import type { FixedStepLoop } from './useFixedStepLoop';

/** Play / Pause / Step / Reset button row with the simulation clock. */
export default function PlaybackControls({ loop, label }: { loop: FixedStepLoop; label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <div className="label">{label}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={['btn', loop.running ? '' : 'btn-primary'].join(' ')} onClick={loop.toggle} aria-label={loop.running ? 'Pause' : 'Play'}>
          {loop.running ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button type="button" className="btn" onClick={loop.step} aria-label="Step one timestep">
          ⏭ Step
        </button>
        <button type="button" className="btn" onClick={loop.reset} aria-label="Reset">
          ↺ Reset
        </button>
        <span className="mono ml-auto text-sm text-muted">
          t = {loop.time.toFixed(3)} s · dt = {(1 / loop.dt).toFixed(0)} Hz
        </span>
      </div>
    </div>
  );
}

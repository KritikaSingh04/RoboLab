import Slider from '../../components/Slider';
import { ACTIVATIONS, type Activation } from '../../lib/ai/mlp';
import PlaybackControls from '../../components/PlaybackControls';
import type { Trainer } from './useTraining';

export interface NetSettings {
  hiddenLayers: number;
  neurons: number;
  activation: Activation;
  lr: number;
  batchSize: number;
  momentum: number;
  epochsPerFrame: number;
}

export const DEFAULT_SETTINGS: NetSettings = { hiddenLayers: 2, neurons: 8, activation: 'tanh', lr: 0.05, batchSize: 16, momentum: 0.9, epochsPerFrame: 3 };

export const hiddenOf = (s: NetSettings) => Array.from({ length: s.hiddenLayers }, () => s.neurons);

interface Props {
  settings: NetSettings;
  onChange: (s: NetSettings) => void;
  trainer: Trainer;
  seed: number;
  onSeed: (seed: number) => void;
  /** Hide the architecture controls (fixed networks). */
  fixedArchitecture?: boolean;
}

export default function NetControls({ settings, onChange, trainer, seed, onSeed, fixedArchitecture }: Props) {
  const set = (patch: Partial<NetSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="space-y-3">
      {!fixedArchitecture && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Architecture</div>
          <Slider label="Hidden layers" value={settings.hiddenLayers} min={1} max={3} step={1} decimals={0} onChange={(v) => set({ hiddenLayers: v })} />
          <Slider label="Neurons per hidden layer" value={settings.neurons} min={1} max={16} step={1} decimals={0} onChange={(v) => set({ neurons: v })} />
          <div>
            <div className="label mb-1">Activation</div>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-sidebar p-1">
              {ACTIVATIONS.map((a) => (
                <button key={a} type="button" onClick={() => set({ activation: a })} className={['rounded-md px-1 py-1 text-xs font-medium transition', settings.activation === a ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">Training</div>
      <Slider label="Learning rate η" value={settings.lr} min={0.001} max={1} step={0.001} decimals={3} onChange={(v) => set({ lr: v })} />
      <Slider label="Batch size" value={settings.batchSize} min={1} max={64} step={1} decimals={0} onChange={(v) => set({ batchSize: v })} />
      <Slider label="Momentum β" value={settings.momentum} min={0} max={0.99} step={0.01} decimals={2} onChange={(v) => set({ momentum: v })} />
      <Slider label="Epochs per frame" value={settings.epochsPerFrame} min={1} max={20} step={1} decimals={0} onChange={(v) => set({ epochsPerFrame: v })} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={['btn', trainer.running ? '' : 'btn-primary'].join(' ')} onClick={trainer.loop.toggle}>
          {trainer.running ? '❚❚ Pause' : '▶ Train'}
        </button>
        <button type="button" className="btn" onClick={trainer.loop.step}>⏭ Step</button>
        <button type="button" className="btn" onClick={() => trainer.reset()}>↺ Reset</button>
        <button type="button" className="btn" onClick={() => { onSeed(seed + 1); trainer.reset(seed + 1); }}>New seed</button>
      </div>
      <div className="mono text-xs text-muted">epoch {trainer.epoch} · loss {trainer.history.length ? trainer.history[trainer.history.length - 1].loss.toFixed(4) : '—'} · seed {seed}</div>
    </div>
  );
}

/** Thin wrapper so pages that need the standard playback row can reuse it. */
export { PlaybackControls };

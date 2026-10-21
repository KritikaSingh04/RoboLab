import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFixedStepLoop, type FixedStepLoop } from '../../components/useFixedStepLoop';
import { trainEpoch, type MLP, type TrainOptions } from '../../lib/ai/mlp';
import { mulberry32 } from '../../lib/ai/random';

export interface TrainingHistory {
  epoch: number;
  loss: number;
  /** Optional extra metric per epoch (accuracy, test loss…). */
  [key: string]: number;
}

export interface Trainer {
  net: MLP;
  epoch: number;
  history: TrainingHistory[];
  loop: FixedStepLoop;
  /** Rebuild the network (new seed if given) and clear the history. */
  reset: (seed?: number) => void;
  /** Bumps every time the weights change, for memoised consumers. */
  version: number;
  running: boolean;
}

/**
 * Incremental training inside the animation loop: `epochsPerFrame` epochs
 * are run per rendered frame so the UI (heat-maps, curves) updates live.
 */
export function useTraining(
  build: (seed: number) => MLP,
  X: number[][],
  Y: number[][],
  opts: TrainOptions & { epochsPerFrame?: number; maxEpochs?: number; seed?: number; extra?: (net: MLP, epoch: number) => Record<string, number> },
): Trainer {
  const seedRef = useRef(opts.seed ?? 1);
  const netRef = useRef<MLP>(build(seedRef.current));
  const rngRef = useRef(mulberry32(seedRef.current));
  const histRef = useRef<TrainingHistory[]>([]);
  const epochRef = useRef(0);
  const [version, setVersion] = useState(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const dataRef = useRef({ X, Y });
  dataRef.current = { X, Y };

  // Our "physics step" is one frame: run a few epochs per step at 30 Hz.
  const loop = useFixedStepLoop(
    () => {
      const o = optsRef.current;
      const per = o.epochsPerFrame ?? 2;
      for (let i = 0; i < per; i++) {
        if (o.maxEpochs && epochRef.current >= o.maxEpochs) {
          loop.pause();
          break;
        }
        const loss = trainEpoch(netRef.current, dataRef.current.X, dataRef.current.Y, { lr: o.lr, batchSize: o.batchSize, momentum: o.momentum, rng: rngRef.current });
        epochRef.current++;
        const extra = o.extra ? o.extra(netRef.current, epochRef.current) : {};
        histRef.current.push({ epoch: epochRef.current, loss, ...extra });
      }
      setVersion((v) => v + 1);
    },
    { dt: 1 / 30 },
  );

  const reset = useCallback(
    (seed?: number) => {
      if (seed !== undefined) seedRef.current = seed;
      netRef.current = build(seedRef.current);
      rngRef.current = mulberry32(seedRef.current);
      histRef.current = [];
      epochRef.current = 0;
      loop.reset();
      setVersion((v) => v + 1);
    },
    [build, loop],
  );

  // Rebuild when the architecture (build function) or data change.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, X, Y]);

  return useMemo(() => ({ net: netRef.current, epoch: epochRef.current, history: histRef.current, loop, reset, version, running: loop.running }), [loop, reset, version]);
}

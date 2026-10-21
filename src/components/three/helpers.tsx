import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { Matrix4 } from 'three';
import type { Mat4 } from '../../lib/math/matrix';

/** Row-major Mat4 → three.js Matrix4 (column-major storage). */
export function toThree(m: Mat4): Matrix4 {
  const a: number[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) a.push(m[i][j]);
  return new Matrix4().fromArray(a);
}

export const IDENTITY: Mat4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Coordinate frame (x red, y green, z blue) placed by a homogeneous transform. */
export function Frame({ matrix, label, size = 0.12, lineWidth = 2.5 }: { matrix: Mat4; label?: string; size?: number; lineWidth?: number }) {
  const m = useMemo(() => toThree(matrix), [matrix]);
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      <Line points={[[0, 0, 0], [size, 0, 0]]} color="#ef4444" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, size, 0]]} color="#22c55e" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, 0, size]]} color="#3b82f6" lineWidth={lineWidth} />
      {label && (
        <Html position={[size * 0.9, size * 0.9, 0]} center style={{ pointerEvents: 'none' }}>
          <span className="whitespace-nowrap rounded bg-slate-900/80 px-1 font-mono text-[11px] text-slate-200">{label}</span>
        </Html>
      )}
    </group>
  );
}

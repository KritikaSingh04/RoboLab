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
      <Line points={[[0, 0, 0], [size, 0, 0]]} color="#E5533D" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, size, 0]]} color="#3F9B57" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, 0, size]]} color="#2F5FD0" lineWidth={lineWidth} />
      {label && (
        <Html position={[size * 0.9, size * 0.9, 0]} center style={{ pointerEvents: 'none' }}>
          <span className="whitespace-nowrap rounded bg-white px-1 font-mono text-[11px] text-ink">{label}</span>
        </Html>
      )}
    </group>
  );
}

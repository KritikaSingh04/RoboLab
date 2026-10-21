import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { Frame, IDENTITY, toThree } from '../../components/three/helpers';
import type { Mat4, Vec3 } from '../../lib/math/matrix';
import { multiply, trans } from '../../lib/math/matrix';

interface Props {
  /** Unit axis direction and a point on it. */
  u: Vec3;
  p: Vec3;
  /** Transform currently applied to the object (partial screw during animation). */
  current: Mat4;
  /** Full helical path of the tracked point and how much of it has been traversed (0..1). */
  helix: Vec3[];
  progress: number;
  /** Body-frame origin (the chosen point) in the reference frame. */
  point: Vec3;
  /** Optional second transform shown as a ghost (composite panel). */
  ghost?: Mat4 | null;
  ghostLabel?: string;
}

function Body({ matrix, color, opacity = 1, label }: { matrix: Mat4; color: string; opacity?: number; label?: string }) {
  const m = useMemo(() => toThree(matrix), [matrix]);
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.16, 0.1]} />
        <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} metalness={0.2} roughness={0.5} />
      </mesh>
      {/* a notch so the orientation is unambiguous */}
      <mesh position={[0.1, 0, 0.06]}>
        <boxGeometry args={[0.04, 0.16, 0.02]} />
        <meshStandardMaterial color="#fde68a" transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <Frame matrix={IDENTITY} size={0.2} label={label} />
    </group>
  );
}

export default function ScrewScene({ u, p, current, helix, progress, point, ghost, ghostLabel }: Props) {
  // Body frame sits at the chosen point; the object is carried by the screw: T · Trans(point).
  const bodyStart = useMemo(() => trans(point[0], point[1], point[2]), [point]);
  const bodyNow = useMemo(() => multiply(current, bodyStart), [current, bodyStart]);
  const bodyGhost = useMemo(() => (ghost ? multiply(ghost, bodyStart) : null), [ghost, bodyStart]);
  const axisLine = useMemo<[Vec3, Vec3]>(() => [[p[0] - 1.6 * u[0], p[1] - 1.6 * u[1], p[2] - 1.6 * u[2]], [p[0] + 1.6 * u[0], p[1] + 1.6 * u[1], p[2] + 1.6 * u[2]]], [u, p]);
  const done = useMemo(() => helix.slice(0, Math.max(2, Math.ceil(progress * (helix.length - 1)) + 1)), [helix, progress]);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [1.9, 1.5, 2.1], fov: 40, near: 0.01, far: 50 }} className="rounded-lg">
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} />
      <gridHelper args={[4, 40, '#334155', '#1e293b']} position={[0, -0.001, 0]} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Frame matrix={IDENTITY} size={0.5} label="{0}" lineWidth={3} />
        {/* screw axis */}
        <Line points={axisLine} color="#a78bfa" lineWidth={2} dashed dashSize={0.06} gapSize={0.04} />
        <mesh position={p}>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshStandardMaterial color="#a78bfa" />
        </mesh>
        {/* helix: full path faint, traversed part bright */}
        {helix.length > 1 && <Line points={helix} color="#eab308" lineWidth={1.5} transparent opacity={0.35} />}
        {done.length > 1 && <Line points={done} color="#eab308" lineWidth={3} />}
        {/* start position of the object (ghost) and the object itself */}
        <Body matrix={bodyStart} color="#64748b" opacity={0.25} />
        <Body matrix={bodyNow} color="#38bdf8" label="{1}" />
        {bodyGhost && <Body matrix={bodyGhost} color="#c084fc" opacity={0.6} label={ghostLabel} />}
      </group>
      <OrbitControls makeDefault target={[0.2, 0.4, 0]} enableDamping dampingFactor={0.1} minDistance={0.5} maxDistance={10} />
    </Canvas>
  );
}

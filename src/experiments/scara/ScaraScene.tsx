import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { Quaternion, Vector3 } from 'three';
import { Frame, toThree, IDENTITY } from '../../components/three/helpers';
import type { Mat4, Vec3 } from '../../lib/math/matrix';
import { translationPart } from '../../lib/math/matrix';
import type { DHRow } from '../../lib/math/dh';

const COLORS = { link1: '#2F5FD0', link2: '#E5533D', link3: '#3F9B57', ee: '#E5533D', base: '#8A857A', column: '#8A857A' };

/** Box or cylinder between two points (coordinates in the robot's z-up frame). */
function Segment({ from, to, color, size = 0.05, shape = 'box' }: { from: Vec3; to: Vec3; color: string; size?: number; shape?: 'box' | 'cylinder' }) {
  const { position, quaternion, length } = useMemo(() => {
    const f = new Vector3(...from);
    const t = new Vector3(...to);
    const dir = t.clone().sub(f);
    const len = dir.length();
    const axis = shape === 'box' ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const q = new Quaternion().setFromUnitVectors(axis, len > 1e-9 ? dir.normalize() : axis);
    return { position: f.add(t).multiplyScalar(0.5), quaternion: q, length: Math.max(len, 1e-4) };
  }, [from, to, shape]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      {shape === 'box' ? <boxGeometry args={[length, size, size * 1.6]} /> : <cylinderGeometry args={[size, size, length, 28]} />}
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.5} />
    </mesh>
  );
}

function Gripper({ matrix, roll = 0.06 }: { matrix: Mat4; roll?: number }) {
  const m = useMemo(() => toThree(matrix), [matrix]);
  const w = roll;
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      {/* palm: flat plate in the tool xy plane, fingers open along the tool x axis */}
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[w * 2.2, 0.035, 0.02]} />
        <meshStandardMaterial color={COLORS.ee} />
      </mesh>
      <mesh position={[w, 0, 0.03]}>
        <boxGeometry args={[0.012, 0.03, 0.06]} />
        <meshStandardMaterial color={COLORS.ee} />
      </mesh>
      <mesh position={[-w, 0, 0.03]}>
        <boxGeometry args={[0.012, 0.03, 0.06]} />
        <meshStandardMaterial color={COLORS.ee} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshStandardMaterial color="#E5533D" emissive="#E5533D" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

interface Props {
  table: DHRow[];
  /** [T0_1 … T0_4] */
  frames: Mat4[];
  trail: Vec3[];
}

export default function ScaraScene({ table, frames, trail }: Props) {
  const d1 = table[0].d;
  const o0: Vec3 = [0, 0, d1];
  const o1 = translationPart(frames[0]);
  const o2 = translationPart(frames[1]);
  const o3 = translationPart(frames[2]);
  const o4 = translationPart(frames[3]);
  // Quill: vertical shaft through link 2, from a little above link 2 down to frame 3.
  const quillTop: Vec3 = [o2[0], o2[1], o2[2] + 0.16];

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [1.05, 1.0, 1.25], fov: 42, near: 0.01, far: 50 }} className="rounded-lg">
      <color attach="background" args={['#FBFAF7']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />
      {/* ground grid in three's xz plane = the robot's xy plane */}
      <gridHelper args={[3, 30, '#CFC8B8', '#E8E4DA']} position={[0, -0.001, 0]} />

      {/* Robot: z-up frame rotated so that z maps to three's y */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Frame matrix={IDENTITY} label="{0}" size={0.2} />
        {/* base plate + column */}
        <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.03, 40]} />
          <meshStandardMaterial color={COLORS.base} />
        </mesh>
        <Segment from={[0, 0, 0.03]} to={[0, 0, Math.max(d1, 0.03)]} color={COLORS.column} size={0.07} shape="cylinder" />
        {/* shoulder housing */}
        <Segment from={[0, 0, d1 - 0.04]} to={[0, 0, d1 + 0.05]} color={COLORS.link1} size={0.085} shape="cylinder" />
        {/* link 1 */}
        <Segment from={o0} to={o1} color={COLORS.link1} size={0.06} />
        <Segment from={[o1[0], o1[1], o1[2] - 0.03]} to={[o1[0], o1[1], o1[2] + 0.06]} color={COLORS.link2} size={0.065} shape="cylinder" />
        {/* link 2 */}
        <Segment from={o1} to={o2} color={COLORS.link2} size={0.05} />
        <Segment from={[o2[0], o2[1], o2[2] - 0.03]} to={[o2[0], o2[1], o2[2] + 0.1]} color={COLORS.link2} size={0.05} shape="cylinder" />
        {/* quill (prismatic joint) + tool shaft */}
        <Segment from={quillTop} to={o3} color={COLORS.link3} size={0.02} shape="cylinder" />
        <Segment from={o3} to={o4} color="#3F9B57" size={0.012} shape="cylinder" />
        <Gripper matrix={frames[3]} />

        {frames.map((f, i) => (
          <Frame key={i} matrix={f} label={`{${i + 1}}`} size={i === 3 ? 0.14 : 0.1} />
        ))}

        {trail.length > 1 && <Line points={trail} color="#F2B33D" lineWidth={2} />}
      </group>

      <OrbitControls makeDefault target={[0.3, 0.55, 0]} enableDamping dampingFactor={0.1} minDistance={0.4} maxDistance={6} />
    </Canvas>
  );
}

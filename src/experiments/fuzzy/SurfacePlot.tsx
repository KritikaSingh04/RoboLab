import { useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute } from 'three';
import Canvas2D, { type Transform } from '../../components/Canvas2D';
import SceneBoundary from '../../components/SceneBoundary';
import type { Surface } from '../../lib/ai/fuzzy';

/** Viridis-like colour ramp for t ∈ [0, 1]. */
export function ramp(t: number): [number, number, number] {
  // cobalt → leaf → mustard → tomato (no purple, readable on a light background)
  const stops: [number, number, number][] = [
    [0.184, 0.373, 0.816],
    [0.247, 0.608, 0.341],
    [0.949, 0.702, 0.239],
    [0.898, 0.325, 0.239],
  ];
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  return [0, 1, 2].map((k) => stops[i][k] + f * (stops[i + 1][k] - stops[i][k])) as [number, number, number];
}

interface Props {
  surface: Surface;
  aLabel: string;
  bLabel: string;
  zLabel: string;
  /** Current operating point to mark. */
  point?: { a: number; b: number; z: number };
  mode: '3d' | 'heatmap';
}

function Mesh({ surface }: { surface: Surface }) {
  const geometry = useMemo(() => {
    const n = surface.a.length;
    const m = surface.b.length;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const span = surface.max - surface.min || 1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const t = (surface.z[i][j] - surface.min) / span;
        pos.push(i / (n - 1) - 0.5, t * 0.6, j / (m - 1) - 0.5);
        const c = new Color(...ramp(t));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j;
        idx.push(a, a + 1, a + m, a + 1, a + m + 1, a + m);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [surface]);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial wireframe color="#1C1B19" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

export default function SurfacePlot({ surface, aLabel, bLabel, zLabel, point, mode }: Props) {
  const span = surface.max - surface.min || 1;
  const heat = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const n = surface.a.length;
      const m = surface.b.length;
      const w = t.width;
      const h = t.height;
      const left = 54;
      const bottom = h - 34;
      const top = 10;
      const right = w - 70;
      const cw = (right - left) / n;
      const ch = (bottom - top) / m;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          const [r, g, b] = ramp((surface.z[i][j] - surface.min) / span);
          ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
          ctx.fillRect(left + i * cw, bottom - (j + 1) * ch, cw + 0.5, ch + 0.5);
        }
      }
      // colour bar
      for (let k = 0; k < 100; k++) {
        const [r, g, b] = ramp(k / 99);
        ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
        ctx.fillRect(right + 16, bottom - ((k + 1) * (bottom - top)) / 100, 14, (bottom - top) / 100 + 0.5);
      }
      ctx.fillStyle = '#6B665C';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(surface.max.toFixed(1), right + 34, top + 10);
      ctx.fillText(surface.min.toFixed(1), right + 34, bottom);
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(aLabel, (left + right) / 2, h - 8);
      ctx.save();
      ctx.translate(14, (top + bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(bLabel, 0, 0);
      ctx.restore();
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(surface.a[0].toFixed(1), left, bottom + 12);
      ctx.fillText(surface.a[n - 1].toFixed(1), right, bottom + 12);
      ctx.textAlign = 'right';
      ctx.fillText(surface.b[0].toFixed(0), left - 4, bottom);
      ctx.fillText(surface.b[m - 1].toFixed(0), left - 4, top + 10);
      if (point) {
        const px = left + ((point.a - surface.a[0]) / (surface.a[n - 1] - surface.a[0])) * (right - left);
        const py = bottom - ((point.b - surface.b[0]) / (surface.b[m - 1] - surface.b[0])) * (bottom - top);
        ctx.strokeStyle = '#E5533D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#E5533D';
        ctx.textAlign = 'left';
        ctx.fillText(`${point.z.toFixed(2)}`, px + 10, py - 8);
      }
      ctx.fillStyle = '#1C1B19';
      ctx.font = 'bold 12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(zLabel, left, top + 12 - 14 + 12);
    },
    [surface, span, aLabel, bLabel, zLabel, point],
  );

  if (mode === 'heatmap') return <Canvas2D draw={heat} showGrid={false} showAxes={false} interactive={false} aspect={16 / 10} />;

  const n = surface.a.length;
  const m = surface.b.length;
  const pt = point
    ? ([(point.a - surface.a[0]) / (surface.a[n - 1] - surface.a[0]) - 0.5, ((point.z - surface.min) / span) * 0.6, (point.b - surface.b[0]) / (surface.b[m - 1] - surface.b[0]) - 0.5] as [number, number, number])
    : null;

  return (
    <div className="h-[380px] overflow-hidden rounded-lg border border-line bg-field">
      <SceneBoundary fallback={<Canvas2D draw={heat} showGrid={false} showAxes={false} interactive={false} aspect={16 / 10} />}>
        <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [1.3, 0.9, 1.3], fov: 40 }}>
          <color attach="background" args={['#FBFAF7']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[2, 3, 2]} intensity={0.9} />
          <directionalLight position={[-2, 1, -1]} intensity={0.3} />
          <Mesh surface={surface} />
          {/* axes */}
          <Line points={[[-0.5, 0, -0.5], [0.5, 0, -0.5]]} color="#6B665C" lineWidth={1.5} />
          <Line points={[[-0.5, 0, -0.5], [-0.5, 0, 0.5]]} color="#6B665C" lineWidth={1.5} />
          <Line points={[[-0.5, 0, -0.5], [-0.5, 0.6, -0.5]]} color="#6B665C" lineWidth={1.5} />
          <Html position={[0.55, 0, -0.5]} center style={{ pointerEvents: 'none' }}><span className="whitespace-nowrap rounded bg-white px-1 text-[11px] text-ink">{aLabel} → {surface.a[n - 1]}</span></Html>
          <Html position={[-0.5, 0, 0.6]} center style={{ pointerEvents: 'none' }}><span className="whitespace-nowrap rounded bg-white px-1 text-[11px] text-ink">{bLabel} → {surface.b[m - 1]}</span></Html>
          <Html position={[-0.5, 0.68, -0.5]} center style={{ pointerEvents: 'none' }}><span className="whitespace-nowrap rounded bg-white px-1 text-[11px] text-ink">{zLabel}: {surface.min.toFixed(1)} … {surface.max.toFixed(1)}</span></Html>
          <Html position={[-0.5, -0.06, -0.5]} center style={{ pointerEvents: 'none' }}><span className="whitespace-nowrap rounded bg-white px-1 text-[11px] text-muted">({surface.a[0]}, {surface.b[0]})</span></Html>
          {pt && (
            <mesh position={pt}>
              <sphereGeometry args={[0.018, 16, 16]} />
              <meshStandardMaterial color="#E5533D" emissive="#E5533D" emissiveIntensity={0.6} />
            </mesh>
          )}
          <OrbitControls makeDefault target={[0, 0.25, 0]} enableDamping dampingFactor={0.1} minDistance={0.6} maxDistance={5} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}

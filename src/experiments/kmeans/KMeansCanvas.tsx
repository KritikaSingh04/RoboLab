import { useCallback } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import { nearest, type KMeansState, type Metric, type Point } from '../../lib/ai/kmeans';
import type { LidarScan } from '../../lib/ai/datasets';

export const CLUSTER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#f43f5e'];

interface Props {
  points: Point[];
  state: KMeansState | null;
  metric: Metric;
  showVoronoi: boolean;
  /** Fuzzy memberships (n × c) to shade points instead of hard labels. */
  membership?: number[][] | null;
  fcmCentroids?: Point[] | null;
  scene?: LidarScan | null;
  onAddPoint?: (p: Point) => void;
}

function mixColors(weights: number[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  weights.forEach((w, j) => {
    const c = CLUSTER_COLORS[j % CLUSTER_COLORS.length];
    r += w * parseInt(c.slice(1, 3), 16);
    g += w * parseInt(c.slice(3, 5), 16);
    b += w * parseInt(c.slice(5, 7), 16);
  });
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export default function KMeansCanvas({ points, state, metric, showVoronoi, membership, fcmCentroids, scene, onAddPoint }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const centroids = fcmCentroids ?? state?.centroids ?? null;
      // Voronoi-style shading of the nearest-centroid regions
      if (showVoronoi && centroids && centroids.length > 1) {
        const cell = 6;
        ctx.save();
        ctx.globalAlpha = 0.13;
        for (let py = 0; py < t.height; py += cell) {
          for (let px = 0; px < t.width; px += cell) {
            const [wx, wy] = t.toWorld(px + cell / 2, py + cell / 2);
            const j = nearest([wx, wy], centroids, metric);
            ctx.fillStyle = CLUSTER_COLORS[j % CLUSTER_COLORS.length];
            ctx.fillRect(px, py, cell, cell);
          }
        }
        ctx.restore();
      }
      // LiDAR scene: room, obstacles, robot
      if (scene) {
        ctx.save();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        const [x0, y0] = t.toPixel(-scene.room.w / 2, scene.room.h / 2);
        const [x1, y1] = t.toPixel(scene.room.w / 2, -scene.room.h / 2);
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 1.5;
        for (const o of scene.obstacles) {
          const [cx, cy] = t.toPixel(o.x, o.y);
          ctx.beginPath();
          if (o.kind === 'circle') ctx.arc(cx, cy, o.r * t.scale, 0, Math.PI * 2);
          else ctx.rect(cx - o.r * t.scale, cy - o.r * t.scale, 2 * o.r * t.scale, 2 * o.r * t.scale);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        const [rx, ry] = t.toPixel(scene.robot[0], scene.robot[1]);
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(rx, ry, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.fillText('robot (LiDAR)', rx + 10, ry + 4);
        ctx.restore();
      }
      // Points
      ctx.save();
      points.forEach((p, i) => {
        const [px, py] = t.toPixel(p[0], p[1]);
        if (membership) ctx.fillStyle = mixColors(membership[i]);
        else if (state && state.phase !== 'init') ctx.fillStyle = CLUSTER_COLORS[state.labels[i] % CLUSTER_COLORS.length];
        else ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      // Centroid movement lines
      if (state && !fcmCentroids && state.phase === 'updated') {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        state.centroids.forEach((c, j) => {
          const [ax, ay] = t.toPixel(state.previous[j][0], state.previous[j][1]);
          const [bx, by] = t.toPixel(c[0], c[1]);
          ctx.strokeStyle = CLUSTER_COLORS[j % CLUSTER_COLORS.length];
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
      // Centroids as large X markers
      if (centroids) {
        ctx.save();
        centroids.forEach((c, j) => {
          const [cx, cy] = t.toPixel(c[0], c[1]);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(cx - 9, cy - 9);
          ctx.lineTo(cx + 9, cy + 9);
          ctx.moveTo(cx + 9, cy - 9);
          ctx.lineTo(cx - 9, cy + 9);
          ctx.stroke();
          ctx.strokeStyle = CLUSTER_COLORS[j % CLUSTER_COLORS.length];
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 12px ui-sans-serif, system-ui';
          ctx.fillText(`c${j + 1}`, cx + 11, cy - 8);
        });
        ctx.restore();
      }
      ctx.fillStyle = '#64748b';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(onAddPoint ? `${points.length} points · click to add a point` : `${points.length} points`, 10, t.height - 10);
    },
    [points, state, metric, showVoronoi, membership, fcmCentroids, scene, onAddPoint],
  );

  const onPointerUp = useCallback(
    (p: CanvasPointer) => {
      if (onAddPoint && (p.moved ?? 0) < 4 && !p.shiftKey) onAddPoint([p.x, p.y]);
    },
    [onAddPoint],
  );

  return <Canvas2D draw={draw} view={{ cx: 0, cy: 0, scale: 62 }} aspect={16 / 10} onPointerUp={onPointerUp} />;
}

import { useCallback } from 'react';
import Canvas2D, { type Transform } from '../../components/Canvas2D';
import type { Mat4, Vec3 } from '../../lib/math/matrix';
import { translationPart } from '../../lib/math/matrix';

interface Props {
  frames: Mat4[];
  workspace: { x: number; y: number }[];
  trail: Vec3[];
  reach: number;
}

/** Top view (world xy plane): reachable workspace, link skeleton, trail and end-effector. */
export default function ScaraTopView({ frames, workspace, trail, reach }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      // Workspace samples
      if (workspace.length) {
        ctx.fillStyle = 'rgba(47, 95, 208, 0.28)';
        for (const p of workspace) {
          const [px, py] = t.toPixel(p.x, p.y);
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        }
        // Outer reach circle for reference
        ctx.strokeStyle = 'rgba(47, 95, 208, 0.5)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const [cx, cy] = t.toPixel(0, 0);
        ctx.arc(cx, cy, reach * t.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = '#F2B33D';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        trail.forEach((p, i) => {
          const [px, py] = t.toPixel(p[0], p[1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      // Links
      const o0 = t.toPixel(0, 0);
      const o1 = translationPart(frames[0]);
      const o2 = translationPart(frames[1]);
      const o4 = translationPart(frames[3]);
      const p1 = t.toPixel(o1[0], o1[1]);
      const p2 = t.toPixel(o2[0], o2[1]);
      const p4 = t.toPixel(o4[0], o4[1]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#2F5FD0';
      ctx.beginPath();
      ctx.moveTo(o0[0], o0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
      ctx.strokeStyle = '#E5533D';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      // Joints and end effector
      for (const [p, c, r] of [
        [o0, '#6B665C', 7],
        [p1, '#FFFFFF', 5],
        [p2, '#3F9B57', 5],
      ] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tool x-axis direction shows the roll angle
      const r = frames[3];
      const ax = t.toPixel(o4[0] + 0.08 * r[0][0], o4[1] + 0.08 * r[1][0]);
      ctx.strokeStyle = '#E5533D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p4[0], p4[1]);
      ctx.lineTo(ax[0], ax[1]);
      ctx.stroke();
      ctx.fillStyle = '#E5533D';
      ctx.beginPath();
      ctx.arc(p4[0], p4[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1C1B19';
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillText(`EE (${o4[0].toFixed(3)}, ${o4[1].toFixed(3)})`, p4[0] + 10, p4[1] - 10);
    },
    [frames, workspace, trail, reach],
  );

  return <Canvas2D draw={draw} view={{ cx: 0.1, cy: 0, scale: 300 }} aspect={16 / 9} />;
}

import { useCallback, useRef } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import type { Branch, IKResult, PathPoint, PlanarLinks, PlanarPose } from '../../lib/math/planar';
import { reachableAnnulus, maxReach, nearestReachable, planarIK } from '../../lib/math/planar';

export type CanvasMode = 'target' | 'draw';

interface Props {
  links: PlanarLinks;
  pose: PlanarPose;
  ik: IKResult;
  active: Branch;
  showGhost: boolean;
  mode: CanvasMode;
  /** Raw drawn points (world) and the resampled path being followed. */
  drawing: { x: number; y: number }[];
  path: PathPoint[];
  /** Arc length reached while following, or null. */
  progress: number | null;
  onTarget: (x: number, y: number) => void;
  onDrawStart: (x: number, y: number) => void;
  onDrawMove: (x: number, y: number) => void;
  onDrawEnd: () => void;
}

const LINK_COLORS = ['#2F5FD0', '#E5533D', '#3F9B57'];

function drawArm(ctx: CanvasRenderingContext2D, t: Transform, joints: [number, number][], alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = t.toPixel(joints[i][0], joints[i][1]);
    const [bx, by] = t.toPixel(joints[i + 1][0], joints[i + 1][1]);
    ctx.strokeStyle = LINK_COLORS[i];
    ctx.lineWidth = 11 - i * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const [px, py] = t.toPixel(joints[i][0], joints[i][1]);
    ctx.fillStyle = i === 0 ? '#6B665C' : '#FFFFFF';
    ctx.strokeStyle = '#1C1B19';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, i === 0 ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const [ex, ey] = t.toPixel(joints[3][0], joints[3][1]);
  ctx.fillStyle = '#E5533D';
  ctx.beginPath();
  ctx.arc(ex, ey, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function IkCanvas({ links, pose, ik, active, showGhost, mode, drawing, path, progress, onTarget, onDrawStart, onDrawMove, onDrawEnd }: Props) {
  const dragging = useRef<null | 'target' | 'draw'>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      // Reachable annulus for the current φ (exact), plus the absolute outer reach (dashed).
      const ann = reachableAnnulus(links, pose.phi);
      const [cx, cy] = t.toPixel(ann.cx, ann.cy);
      ctx.save();
      ctx.fillStyle = 'rgba(47, 95, 208, 0.10)';
      ctx.beginPath();
      ctx.arc(cx, cy, ann.rMax * t.scale, 0, Math.PI * 2);
      ctx.arc(cx, cy, ann.rMin * t.scale, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(47, 95, 208, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ann.rMax * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      if (ann.rMin > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, ann.rMin * t.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      const [ox, oy] = t.toPixel(0, 0);
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(138, 133, 122, 0.5)';
      ctx.beginPath();
      ctx.arc(ox, oy, maxReach(links) * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8A857A';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`reachable for φ = ${((pose.phi * 180) / Math.PI).toFixed(1)}°`, cx + ann.rMax * t.scale * 0.72, cy - ann.rMax * t.scale * 0.72);
      ctx.restore();

      // Drawn path
      const poly = path.length > 1 ? path : drawing;
      if (poly.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#1F8A8A';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        poly.forEach((p, i) => {
          const [px, py] = t.toPixel(p.x, p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        if (progress !== null && path.length > 1) {
          ctx.strokeStyle = '#1F8A8A';
          ctx.lineWidth = 4;
          ctx.beginPath();
          let started = false;
          for (const p of path) {
            if (p.s > progress) break;
            const [px, py] = t.toPixel(p.x, p.y);
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // Arms: ghost branch first, then the active one.
      const other: Branch = active === 'up' ? 'down' : 'up';
      if (showGhost && ik.solutions[other]) drawArm(ctx, t, ik.solutions[other]!.fk.joints, 0.28);
      if (ik.solutions[active]) drawArm(ctx, t, ik.solutions[active]!.fk.joints, 1);
      if (!ik.reachable) {
        // Closest configuration the arm can take: shown ghosted so the examiner sees how far off the target is.
        const near = planarIK(links, nearestReachable(links, pose)).solutions[active];
        if (near) {
          drawArm(ctx, t, near.fk.joints, 0.35);
          const [ax, ay] = t.toPixel(near.fk.pose.x, near.fk.pose.y);
          const [bx, by] = t.toPixel(pose.x, pose.y);
          ctx.save();
          ctx.strokeStyle = '#E5533D';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Target
      const [tx, ty] = t.toPixel(pose.x, pose.y);
      const color = ik.reachable ? '#F2B33D' : '#E5533D';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx - 16, ty);
      ctx.lineTo(tx + 16, ty);
      ctx.moveTo(tx, ty - 16);
      ctx.lineTo(tx, ty + 16);
      ctx.stroke();
      // orientation tick
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 28 * Math.cos(pose.phi), ty - 28 * Math.sin(pose.phi));
      ctx.stroke();
      ctx.font = 'bold 13px ui-sans-serif, system-ui';
      ctx.fillText(ik.reachable ? 'target' : 'Target outside workspace', tx + 16, ty - 16);
      ctx.restore();

      // Mode hint
      ctx.fillStyle = '#8A857A';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(mode === 'target' ? 'click / drag anywhere to move the target' : 'drag to draw a path', 10, t.height - 10);
    },
    [links, pose, ik, active, showGhost, mode, drawing, path, progress],
  );

  const onPointerDown = useCallback(
    (p: CanvasPointer) => {
      if (mode === 'draw') {
        dragging.current = 'draw';
        onDrawStart(p.x, p.y);
      } else {
        dragging.current = 'target';
        onTarget(p.x, p.y);
      }
      return true;
    },
    [mode, onDrawStart, onTarget],
  );
  const onPointerMove = useCallback(
    (p: CanvasPointer) => {
      if (dragging.current === 'target') onTarget(p.x, p.y);
      else if (dragging.current === 'draw') onDrawMove(p.x, p.y);
    },
    [onTarget, onDrawMove],
  );
  const onPointerUp = useCallback(() => {
    if (dragging.current === 'draw') onDrawEnd();
    dragging.current = null;
  }, [onDrawEnd]);

  return <Canvas2D draw={draw} view={{ cx: 0.35, cy: 0.1, scale: 150 }} aspect={16 / 10} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />;
}

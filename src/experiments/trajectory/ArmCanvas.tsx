import { useCallback } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import type { JointSample, TwoLink } from '../../lib/math/trajectory';
import { twoLinkFK } from '../../lib/math/trajectory';

interface Props {
  title: string;
  links: TwoLink;
  samples: JointSample[];
  /** Current joint angles (null = unreachable at this instant). */
  q: [number, number] | null;
  /** Current time, to split the traced path into done / to-do. */
  t: number;
  pathColor: string;
  start: [number, number];
  end: [number, number];
  /** When set, a left click reports a world point instead of panning. */
  onPick?: (x: number, y: number) => void;
  pickLabel?: string;
}

export default function ArmCanvas({ title, links, samples, q, t, pathColor, start, end, onPick, pickLabel }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, tr: Transform) => {
      const [ox, oy] = tr.toPixel(0, 0);
      // Workspace annulus
      ctx.save();
      ctx.strokeStyle = 'rgba(47, 95, 208, 0.45)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, (links.l1 + links.l2) * tr.scale, 0, Math.PI * 2);
      ctx.stroke();
      if (Math.abs(links.l1 - links.l2) > 1e-9) {
        ctx.beginPath();
        ctx.arc(ox, oy, Math.abs(links.l1 - links.l2) * tr.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Traced tip path: faint for the whole motion, strong up to t.
      const drawPath = (filter: (s: JointSample) => boolean, alpha: number, width: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let pen = false;
        for (const s of samples) {
          if (!filter(s)) break;
          if (!s.reachable) {
            pen = false;
            continue;
          }
          const [px, py] = tr.toPixel(s.tip[0], s.tip[1]);
          if (!pen) {
            ctx.moveTo(px, py);
            pen = true;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      };
      drawPath(() => true, 0.3, 2);
      drawPath((s) => s.t <= t + 1e-9, 1, 3);
      // Unreachable parts of the path in red
      ctx.save();
      ctx.fillStyle = '#E5533D';
      for (const s of samples) {
        if (s.reachable) continue;
        const [px, py] = tr.toPixel(s.tip[0], s.tip[1]);
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      ctx.restore();

      // Start / end markers
      const marker = (p: [number, number], color: string, label: string) => {
        const [px, py] = tr.toPixel(p[0], p[1]);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.fillText(label, px + 12, py - 10);
        ctx.restore();
      };
      marker(start, '#3F9B57', 'start');
      marker(end, '#F2B33D', 'end');

      // Arm
      if (q) {
        const { elbow, tip } = twoLinkFK(links, q);
        const pts = [[0, 0], elbow, tip] as [number, number][];
        const colors = ['#2F5FD0', '#E5533D'];
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          const [ax, ay] = tr.toPixel(pts[i][0], pts[i][1]);
          const [bx, by] = tr.toPixel(pts[i + 1][0], pts[i + 1][1]);
          ctx.strokeStyle = colors[i];
          ctx.lineWidth = 11 - i * 2;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        for (let i = 0; i < 2; i++) {
          const [px, py] = tr.toPixel(pts[i][0], pts[i][1]);
          ctx.fillStyle = i === 0 ? '#6B665C' : '#FFFFFF';
          ctx.strokeStyle = '#1C1B19';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, i === 0 ? 8 : 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        const [ex, ey] = tr.toPixel(tip[0], tip[1]);
        ctx.fillStyle = '#E5533D';
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = '#E5533D';
        ctx.font = 'bold 13px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Target outside workspace', tr.width / 2, 40);
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = '#1C1B19';
      ctx.font = 'bold 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(title, 10, 18);
      if (pickLabel) {
        ctx.fillStyle = '#1F8A8A';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.fillText(pickLabel, 10, tr.height - 10);
      }
      ctx.restore();
    },
    [links, samples, q, t, pathColor, start, end, title, pickLabel],
  );

  const onPointerDown = useCallback(
    (p: CanvasPointer) => {
      if (!onPick) return false;
      onPick(p.x, p.y);
      return true;
    },
    [onPick],
  );

  return <Canvas2D draw={draw} view={{ cx: 0.4, cy: 0.3, scale: 120 }} aspect={1} onPointerDown={onPointerDown} />;
}

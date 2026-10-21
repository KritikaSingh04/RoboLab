import { useCallback, useRef } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import type { Track } from '../../lib/sim/tracks';
import { FLOOR } from '../../lib/sim/tracks';
import type { LFRun, LFState } from '../../lib/sim/lineFollower';
import { LF_ROBOT } from '../../lib/sim/lineFollower';
import type { Vec2 } from '../../lib/sim/geometry';

export const RUN_COLORS = ['#38bdf8', '#f97316', '#22c55e'];

interface Props {
  track: Track | null;
  sim: LFState | null;
  overlays: LFRun[] | null;
  drawing: boolean;
  onDrawn: (points: Vec2[]) => void;
}

export default function TrackCanvas({ track, sim, overlays, drawing, onDrawn }: Props) {
  const stroke = useRef<Vec2[]>([]);
  const previewRef = useRef<Vec2[]>([]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      // white floor
      const [fx, fy] = t.toPixel(0, FLOOR.h);
      const [gx, gy] = t.toPixel(FLOOR.w, 0);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(fx, fy, gx - fx, gy - fy);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, gx - fx, gy - fy);
      const path = (pts: Vec2[], close: boolean) => {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = t.toPixel(p[0], p[1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
      };
      // track line
      if (track) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(4, track.width * t.scale);
        ctx.lineJoin = 'round';
        path(track.points, true);
        ctx.stroke();
        // start marker
        const [sx, sy] = t.toPixel(track.points[0][0], track.points[0][1]);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#166534';
        ctx.font = 'bold 11px ui-sans-serif, system-ui';
        ctx.fillText('start / finish', sx + 8, sy - 8);
      }
      // freehand preview
      if (previewRef.current.length > 1) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        path(previewRef.current, false);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // comparison overlays
      if (overlays) {
        overlays.forEach((run, i) => {
          ctx.strokeStyle = RUN_COLORS[i % RUN_COLORS.length];
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9;
          path(run.trail, false);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }
      if (sim) {
        // trail
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.8)';
        ctx.lineWidth = 2;
        path(sim.trail, false);
        ctx.stroke();
        // robot body
        const r = LF_ROBOT.radius;
        const [rx, ry] = t.toPixel(sim.pose.x, sim.pose.y);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(-sim.pose.theta);
        ctx.fillStyle = sim.lost ? '#fca5a5' : '#cbd5e1';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * t.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1e293b';
        const L = LF_ROBOT.wheelBase * t.scale;
        ctx.fillRect(-0.02 * t.scale, -L / 2 - 3, 0.04 * t.scale, 6);
        ctx.fillRect(-0.02 * t.scale, L / 2 - 3, 0.04 * t.scale, 6);
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * t.scale, 0);
        ctx.stroke();
        // sensor bar
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        const bar = LF_ROBOT.sensorOffset * t.scale;
        const half = ((sim.sensors.positions.length - 1) / 2) * 0.012 * t.scale + 4;
        ctx.beginPath();
        ctx.moveTo(bar, -half);
        ctx.lineTo(bar, half);
        ctx.stroke();
        ctx.restore();
        sim.sensors.positions.forEach((p, i) => {
          const [x, y] = t.toPixel(p[0], p[1]);
          const v = sim.sensors.readings[i];
          ctx.fillStyle = v > 0 ? `rgba(239, 68, 68, ${0.4 + 0.6 * v})` : '#e2e8f0';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.fillStyle = '#475569';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(drawing ? 'draw a closed loop with the mouse, release to finish' : `${FLOOR.w} × ${FLOOR.h} m floor · red dots = sensors over the line`, fx + 8, gy - 8);
    },
    [track, sim, overlays, drawing],
  );

  const onPointerDown = useCallback(
    (p: CanvasPointer) => {
      if (!drawing) return false;
      stroke.current = [[p.x, p.y]];
      previewRef.current = stroke.current;
      return true;
    },
    [drawing],
  );
  const onPointerMove = useCallback((p: CanvasPointer) => {
    if (stroke.current.length) {
      stroke.current.push([p.x, p.y]);
      previewRef.current = [...stroke.current];
    }
  }, []);
  const onPointerUp = useCallback(() => {
    if (stroke.current.length) {
      const pts = stroke.current;
      stroke.current = [];
      previewRef.current = [];
      onDrawn(pts);
    }
  }, [onDrawn]);

  return <Canvas2D draw={draw} frame={previewRef.current.length} view={{ cx: FLOOR.w / 2, cy: FLOOR.h / 2, scale: 150 }} aspect={4 / 3} showGrid={false} showAxes={false} interactive={false} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />;
}

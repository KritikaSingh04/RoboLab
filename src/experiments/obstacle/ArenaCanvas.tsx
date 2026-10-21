import { useCallback, useRef } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import type { MapDef } from '../../lib/sim/maps';
import type { SimState } from '../../lib/sim/run';
import { pointInObstacle, type Obstacle, type Vec2 } from '../../lib/sim/geometry';
import { potentialForce, CONTROLLERS, type ControllerId } from '../../lib/sim/controllers';
import type { RunResult } from '../../lib/sim/run';
import { GOAL_RADIUS } from '../../lib/sim/run';
import { DEFAULT_ROBOT } from '../../lib/sim/diffDrive';

export type EditMode = 'select' | 'rect' | 'circle' | 'erase';

interface Props {
  map: MapDef;
  sim: SimState;
  controllerId: ControllerId;
  showField: boolean;
  overlays: RunResult[] | null;
  editMode: EditMode;
  onMapChange: (m: MapDef) => void;
}

export default function ArenaCanvas({ map, sim, controllerId, showField, overlays, editMode, onMapChange }: Props) {
  const drag = useRef<null | { kind: 'goal' } | { kind: 'start' } | { kind: 'shape'; from: Vec2; to: Vec2 }>(null);
  const preview = useRef<Obstacle | null>(null);
  const color = CONTROLLERS.find((c) => c.id === controllerId)?.color ?? '#38bdf8';

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const r = DEFAULT_ROBOT.radius;
      // arena floor + walls
      const [ax, ay] = t.toPixel(0, map.arena.h);
      const [bx, by] = t.toPixel(map.arena.w, 0);
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.strokeRect(ax, ay, bx - ax, by - ay);
      // potential field arrows
      if (showField) {
        ctx.save();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.lineWidth = 1.2;
        const n = 18;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const p: Vec2 = [((i + 0.5) * map.arena.w) / n, ((j + 0.5) * map.arena.h) / n];
            if (map.obstacles.some((o) => pointInObstacle(p, o))) continue;
            const f = potentialForce(p, map.goal, map.obstacles, map.arena, r);
            const m = Math.hypot(f[0], f[1]);
            if (m < 1e-6) continue;
            const len = 0.22 * Math.min(1, m / 1.0) + 0.05;
            const [x0, y0] = t.toPixel(p[0], p[1]);
            const [x1, y1] = t.toPixel(p[0] + (len * f[0]) / m, p[1] + (len * f[1]) / m);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            const a = Math.atan2(y1 - y0, x1 - x0);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - 5 * Math.cos(a - 0.5), y1 - 5 * Math.sin(a - 0.5));
            ctx.lineTo(x1 - 5 * Math.cos(a + 0.5), y1 - 5 * Math.sin(a + 0.5));
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }
      // obstacles
      const drawOb = (o: Obstacle, fill: string, stroke: string) => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (o.kind === 'rect') {
          const [x, y] = t.toPixel(o.x, o.y + o.h);
          ctx.rect(x, y, o.w * t.scale, o.h * t.scale);
        } else {
          const [x, y] = t.toPixel(o.x, o.y);
          ctx.arc(x, y, o.r * t.scale, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
      };
      for (const o of map.obstacles) drawOb(o, '#334155', '#94a3b8');
      if (preview.current) drawOb(preview.current, 'rgba(56,189,248,0.25)', '#38bdf8');
      // comparison overlays
      if (overlays) {
        for (const run of overlays) {
          const c = CONTROLLERS.find((k) => k.id === run.controller)?.color ?? '#fff';
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2.5;
          ctx.setLineDash(run.reached ? [] : [6, 4]);
          ctx.beginPath();
          run.trail.forEach((p, i) => {
            const [x, y] = t.toPixel(p[0], p[1]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          const last = run.trail[run.trail.length - 1];
          if (!run.reached && last) {
            const [x, y] = t.toPixel(last[0], last[1]);
            ctx.fillStyle = c;
            ctx.font = 'bold 11px ui-sans-serif, system-ui';
            ctx.fillText(run.stuck ? 'stuck' : 'timeout', x + 8, y - 6);
          }
        }
      }
      // trail
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      sim.trail.forEach((p, i) => {
        const [x, y] = t.toPixel(p[0], p[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // goal
      const [gx, gy] = t.toPixel(map.goal[0], map.goal[1]);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(gx, gy, GOAL_RADIUS * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 12px ui-sans-serif, system-ui';
      ctx.fillText('goal', gx + 12, gy - 10);
      // start pose
      const [sx, sy] = t.toPixel(map.start.x, map.start.y);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-map.start.theta);
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, 8);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.fillText('start', sx + 12, sy + 14);
      // sensor rays
      for (const s of sim.sensors) {
        const [ox, oy] = t.toPixel(s.origin[0], s.origin[1]);
        const end: Vec2 = s.hit ?? [s.origin[0] + s.range * s.dir[0], s.origin[1] + s.range * s.dir[1]];
        const [ex, ey] = t.toPixel(end[0], end[1]);
        ctx.strokeStyle = s.hit ? 'rgba(234,179,8,0.8)' : 'rgba(234,179,8,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (s.hit) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // robot
      const [rx, ry] = t.toPixel(sim.pose.x, sim.pose.y);
      ctx.fillStyle = sim.colliding ? '#ef4444' : color;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, r * t.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // wheels
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-sim.pose.theta);
      ctx.fillStyle = '#0f172a';
      const L = DEFAULT_ROBOT.wheelBase * t.scale;
      ctx.fillRect(-0.08 * t.scale, -L / 2 - 2, 0.16 * t.scale, 4);
      ctx.fillRect(-0.08 * t.scale, L / 2 - 2, 0.16 * t.scale, 4);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * t.scale, 0);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#64748b';
      ctx.font = '12px ui-sans-serif, system-ui';
      const hint = { select: 'drag the goal or the start marker', rect: 'drag to draw a rectangle', circle: 'drag to draw a circle', erase: 'click an obstacle to delete it' }[editMode];
      ctx.fillText(`${hint} · yellow rays = ultrasonic sensors, red = echoes`, 10, t.height - 10);
    },
    [map, sim, color, showField, overlays, editMode],
  );

  const near = (p: CanvasPointer, q: Vec2, tol = 0.45) => Math.hypot(p.x - q[0], p.y - q[1]) < tol;

  const onPointerDown = useCallback(
    (p: CanvasPointer) => {
      if (editMode === 'select') {
        if (near(p, map.goal)) drag.current = { kind: 'goal' };
        else if (near(p, [map.start.x, map.start.y])) drag.current = { kind: 'start' };
        else return false;
        return true;
      }
      if (editMode === 'erase') {
        const idx = map.obstacles.findIndex((o) => pointInObstacle([p.x, p.y], o));
        if (idx >= 0) onMapChange({ ...map, obstacles: map.obstacles.filter((_, i) => i !== idx) });
        return true;
      }
      drag.current = { kind: 'shape', from: [p.x, p.y], to: [p.x, p.y] };
      return true;
    },
    [editMode, map, onMapChange],
  );

  const clampPt = (x: number, y: number): Vec2 => [Math.min(map.arena.w - 0.3, Math.max(0.3, x)), Math.min(map.arena.h - 0.3, Math.max(0.3, y))];
  const shapeFrom = (from: Vec2, to: Vec2): Obstacle | null => {
    if (editMode === 'rect') {
      const x = Math.min(from[0], to[0]);
      const y = Math.min(from[1], to[1]);
      const w = Math.abs(to[0] - from[0]);
      const h = Math.abs(to[1] - from[1]);
      return w > 0.1 && h > 0.1 ? { kind: 'rect', x, y, w, h } : null;
    }
    const r = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return r > 0.1 ? { kind: 'circle', x: from[0], y: from[1], r } : null;
  };

  const onPointerMove = useCallback(
    (p: CanvasPointer) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'goal') onMapChange({ ...map, goal: clampPt(p.x, p.y) });
      else if (d.kind === 'start') {
        const [x, y] = clampPt(p.x, p.y);
        onMapChange({ ...map, start: { ...map.start, x, y } });
      } else {
        d.to = [p.x, p.y];
        preview.current = shapeFrom(d.from, d.to);
        onMapChange({ ...map }); // trigger redraw
      }
    },
    [map, onMapChange], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (d && d.kind === 'shape') {
      const ob = shapeFrom(d.from, d.to);
      preview.current = null;
      if (ob) onMapChange({ ...map, obstacles: [...map.obstacles, ob] });
      else onMapChange({ ...map });
    }
    drag.current = null;
  }, [map, onMapChange]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Canvas2D draw={draw} view={{ cx: map.arena.w / 2, cy: map.arena.h / 2, scale: 56 }} aspect={1} showGrid={false} showAxes={false} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />;
}

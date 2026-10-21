/** 2D geometry for the mobile-robot simulations. Pure functions, metres. */
export type Vec2 = [number, number];

export type Obstacle = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'circle'; x: number; y: number; r: number };

export interface Arena {
  w: number;
  h: number;
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Ray o + t·d (d unit) against a circle. Returns the smallest t > 0 or null. */
export function rayCircle(o: Vec2, d: Vec2, c: Vec2, r: number): number | null {
  const fx = o[0] - c[0];
  const fy = o[1] - c[1];
  const b = 2 * (fx * d[0] + fy * d[1]);
  const cc = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2;
  if (t1 > 1e-9) return t1;
  const t2 = (-b + s) / 2;
  return t2 > 1e-9 ? t2 : null;
}

/** Ray o + t·d against segment a–b. Returns t > 0 or null. */
export function raySegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number | null {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const ox = a[0] - o[0];
  const oy = a[1] - o[1];
  const t = (ox * ey - oy * ex) / den;
  const u = (ox * d[1] - oy * d[0]) / den;
  return t > 1e-9 && u >= 0 && u <= 1 ? t : null;
}

export function rectSegments(r: { x: number; y: number; w: number; h: number }): Segment[] {
  const p: Vec2[] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
  return p.map((a, i) => ({ a, b: p[(i + 1) % 4] }));
}

export function arenaSegments(arena: Arena): Segment[] {
  return rectSegments({ x: 0, y: 0, w: arena.w, h: arena.h });
}

/** Nearest hit of a ray against walls and obstacles, up to maxRange. */
export function castRay(o: Vec2, angle: number, obstacles: Obstacle[], arena: Arena, maxRange: number): { range: number; hit: Vec2 | null } {
  const d: Vec2 = [Math.cos(angle), Math.sin(angle)];
  let best = maxRange;
  let hit = false;
  for (const s of arenaSegments(arena)) {
    const t = raySegment(o, d, s.a, s.b);
    if (t !== null && t < best) {
      best = t;
      hit = true;
    }
  }
  for (const ob of obstacles) {
    if (ob.kind === 'circle') {
      const t = rayCircle(o, d, [ob.x, ob.y], ob.r);
      if (t !== null && t < best) {
        best = t;
        hit = true;
      }
    } else {
      for (const s of rectSegments(ob)) {
        const t = raySegment(o, d, s.a, s.b);
        if (t !== null && t < best) {
          best = t;
          hit = true;
        }
      }
    }
  }
  return { range: best, hit: hit ? [o[0] + best * d[0], o[1] + best * d[1]] : null };
}

/** Signed distance from a point to an obstacle's surface (negative inside) and the nearest surface point. */
export function obstacleDistance(p: Vec2, ob: Obstacle): { d: number; nearest: Vec2 } {
  if (ob.kind === 'circle') {
    const dx = p[0] - ob.x;
    const dy = p[1] - ob.y;
    const r = Math.hypot(dx, dy);
    const ux = r > 1e-12 ? dx / r : 1;
    const uy = r > 1e-12 ? dy / r : 0;
    return { d: r - ob.r, nearest: [ob.x + ob.r * ux, ob.y + ob.r * uy] };
  }
  const cx = Math.min(Math.max(p[0], ob.x), ob.x + ob.w);
  const cy = Math.min(Math.max(p[1], ob.y), ob.y + ob.h);
  const inside = p[0] > ob.x && p[0] < ob.x + ob.w && p[1] > ob.y && p[1] < ob.y + ob.h;
  if (!inside) return { d: Math.hypot(p[0] - cx, p[1] - cy), nearest: [cx, cy] };
  // inside: distance to the closest edge, negative
  const dl = p[0] - ob.x;
  const dr = ob.x + ob.w - p[0];
  const db = p[1] - ob.y;
  const dt = ob.y + ob.h - p[1];
  const m = Math.min(dl, dr, db, dt);
  const nearest: Vec2 = m === dl ? [ob.x, p[1]] : m === dr ? [ob.x + ob.w, p[1]] : m === db ? [p[0], ob.y] : [p[0], ob.y + ob.h];
  return { d: -m, nearest };
}

/** Distance from a point to the arena walls (negative outside). */
export function wallDistance(p: Vec2, arena: Arena): { d: number; nearest: Vec2 } {
  const cands: { d: number; nearest: Vec2 }[] = [
    { d: p[0], nearest: [0, p[1]] },
    { d: arena.w - p[0], nearest: [arena.w, p[1]] },
    { d: p[1], nearest: [p[0], 0] },
    { d: arena.h - p[1], nearest: [p[0], arena.h] },
  ];
  return cands.reduce((a, b) => (b.d < a.d ? b : a));
}

/** Clearance of a robot disc (centre p, radius r) from everything: negative means collision. */
export function clearance(p: Vec2, r: number, obstacles: Obstacle[], arena: Arena): { clearance: number; nearest: Vec2 } {
  let best = wallDistance(p, arena);
  for (const ob of obstacles) {
    const c = obstacleDistance(p, ob);
    if (c.d < best.d) best = c;
  }
  return { clearance: best.d - r, nearest: best.nearest };
}

export const pointInObstacle = (p: Vec2, ob: Obstacle): boolean => obstacleDistance(p, ob).d < 0;

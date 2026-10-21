import type { Arena, Obstacle, Vec2 } from './geometry';
import type { Pose } from './diffDrive';

export interface MapDef {
  id: string;
  name: string;
  description: string;
  arena: Arena;
  obstacles: Obstacle[];
  start: Pose;
  goal: Vec2;
}

const ARENA: Arena = { w: 10, h: 10 };

export const MAPS: MapDef[] = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'One box and one pillar between start and goal.',
    arena: ARENA,
    obstacles: [
      { kind: 'rect', x: 4.2, y: 4.0, w: 1.2, h: 2.2 },
      { kind: 'circle', x: 7, y: 7.2, r: 0.7 },
    ],
    start: { x: 1.5, y: 2, theta: 0 },
    goal: [8.5, 8],
  },
  {
    id: 'corridor',
    name: 'Corridor',
    description: 'A bent corridor: the robot must follow the walls round two corners.',
    arena: ARENA,
    obstacles: [
      { kind: 'rect', x: 0, y: 3.2, w: 6.5, h: 0.4 },
      { kind: 'rect', x: 3.5, y: 6.4, w: 6.5, h: 0.4 },
      { kind: 'rect', x: 1.5, y: 0, w: 0.4, h: 1.6 },
    ],
    start: { x: 0.8, y: 1.0, theta: 0 },
    goal: [1.2, 9.0],
  },
  {
    id: 'cluttered',
    name: 'Cluttered',
    description: 'Many pillars and boxes scattered across the arena.',
    arena: ARENA,
    obstacles: [
      { kind: 'circle', x: 2.5, y: 3.0, r: 0.5 },
      { kind: 'circle', x: 5.0, y: 2.0, r: 0.6 },
      { kind: 'circle', x: 7.5, y: 3.5, r: 0.5 },
      { kind: 'rect', x: 3.5, y: 4.5, w: 1.0, h: 1.0 },
      { kind: 'circle', x: 6.2, y: 5.6, r: 0.55 },
      { kind: 'rect', x: 1.5, y: 6.5, w: 1.6, h: 0.8 },
      { kind: 'circle', x: 4.5, y: 7.8, r: 0.5 },
      { kind: 'rect', x: 7.6, y: 7.2, w: 0.9, h: 1.4 },
    ],
    start: { x: 1.0, y: 1.0, theta: Math.PI / 4 },
    goal: [9.0, 9.0],
  },
  {
    id: 'utrap',
    name: 'U-trap',
    description: 'A U-shaped wall opens towards the robot: potential-field control is drawn in and gets stuck in a local minimum.',
    arena: ARENA,
    obstacles: [
      { kind: 'rect', x: 6.0, y: 3.4, w: 0.3, h: 3.2 },
      { kind: 'rect', x: 4.3, y: 3.4, w: 2.0, h: 0.3 },
      { kind: 'rect', x: 4.3, y: 6.3, w: 2.0, h: 0.3 },
    ],
    start: { x: 1.5, y: 5, theta: 0 },
    goal: [8.5, 5],
  },
];

export const findMap = (id: string): MapDef => MAPS.find((m) => m.id === id) ?? MAPS[0];

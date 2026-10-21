import { useCallback } from 'react';
import Canvas2D, { type Transform } from '../../components/Canvas2D';

interface Link {
  /** absolute angle from the horizontal (rad) */
  angle: number;
  length: number;
  color: string;
  /** draw a payload mass at the tip */
  payload?: boolean;
}

interface Props {
  links: Link[];
  /** torque at the base joint (N·m), drawn as an arc arrow */
  torque: number;
  torqueScale?: number;
  /** gravity arrow at the centre of mass of the first link */
  gravity: number;
  /** tip trace (world) */
  trace?: [number, number][];
  /** a second, semi-transparent arm (e.g. a perturbed run) */
  ghostLinks?: Link[];
  label?: string;
}

export default function LinkCanvas({ links, torque, torqueScale = 1, gravity, trace, ghostLinks, label }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const [ox, oy] = t.toPixel(0, 0);
      // trace
      if (trace && trace.length > 1) {
        ctx.strokeStyle = 'rgba(242,179,61,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        trace.forEach((p, i) => {
          const [x, y] = t.toPixel(p[0], p[1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      // wall / base
      ctx.fillStyle = '#CFC8B8';
      ctx.fillRect(ox - 14, oy - 14, 28, 28);
      // ghost arm
      if (ghostLinks) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        let gx0 = 0;
        let gy0 = 0;
        for (const l of ghostLinks) {
          const nx = gx0 + l.length * Math.cos(l.angle);
          const ny = gy0 + l.length * Math.sin(l.angle);
          const [ax, ay] = t.toPixel(gx0, gy0);
          const [bx, by] = t.toPixel(nx, ny);
          ctx.strokeStyle = l.color;
          ctx.lineCap = 'round';
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          gx0 = nx;
          gy0 = ny;
        }
        ctx.restore();
      }
      // links
      let x = 0;
      let y = 0;
      const joints: [number, number][] = [[0, 0]];
      links.forEach((l) => {
        const nx = x + l.length * Math.cos(l.angle);
        const ny = y + l.length * Math.sin(l.angle);
        const [ax, ay] = t.toPixel(x, y);
        const [bx, by] = t.toPixel(nx, ny);
        ctx.strokeStyle = l.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        // centre of mass
        const [cx, cy] = t.toPixel((x + nx) / 2, (y + ny) / 2);
        ctx.fillStyle = '#1C1B19';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        if (l.payload) {
          ctx.fillStyle = '#E5533D';
          ctx.beginPath();
          ctx.arc(bx, by, 10, 0, Math.PI * 2);
          ctx.fill();
        }
        x = nx;
        y = ny;
        joints.push([x, y]);
      });
      for (const [jx, jy] of joints.slice(0, -1)) {
        const [px, py] = t.toPixel(jx, jy);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#1C1B19';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // gravity arrow at the first link's centre of mass
      const l0 = links[0];
      const [gx, gy] = t.toPixel((l0.length / 2) * Math.cos(l0.angle), (l0.length / 2) * Math.sin(l0.angle));
      const gl = 18 + 4 * gravity;
      ctx.strokeStyle = '#2F5FD0';
      ctx.fillStyle = '#2F5FD0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx, gy + gl);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, gy + gl + 6);
      ctx.lineTo(gx - 5, gy + gl - 3);
      ctx.lineTo(gx + 5, gy + gl - 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('g', gx + 8, gy + gl);
      // torque arc at the base
      const mag = Math.abs(torque) * torqueScale;
      if (mag > 0.02) {
        const R = 26 + Math.min(40, 8 * mag);
        const span = Math.min(1.6 * Math.PI, 0.6 + 0.35 * mag);
        const ccw = torque > 0; // positive torque = counter-clockwise (screen: decreasing angle)
        const a0 = Math.PI / 2;
        const a1 = ccw ? a0 - span : a0 + span;
        ctx.strokeStyle = '#E5533D';
        ctx.fillStyle = '#E5533D';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ox, oy, R, a0, a1, ccw);
        ctx.stroke();
        const tx = ox + R * Math.cos(a1);
        const ty = oy + R * Math.sin(a1);
        const dir = ccw ? a1 - Math.PI / 2 : a1 + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(tx + 9 * Math.cos(dir), ty + 9 * Math.sin(dir));
        ctx.lineTo(tx + 6 * Math.cos(dir + 2.3), ty + 6 * Math.sin(dir + 2.3));
        ctx.lineTo(tx + 6 * Math.cos(dir - 2.3), ty + 6 * Math.sin(dir - 2.3));
        ctx.closePath();
        ctx.fill();
        ctx.fillText(`τ = ${torque.toFixed(2)} N·m`, ox + R + 8, oy - R + 4);
      }
      ctx.fillStyle = '#6B665C';
      ctx.font = '12px ui-sans-serif, system-ui';
      if (label) ctx.fillText(label, 10, t.height - 10);
    },
    [links, torque, torqueScale, gravity, trace, ghostLinks, label],
  );
  return <Canvas2D draw={draw} view={{ cx: 0, cy: -0.15, scale: 160 }} aspect={4 / 3} interactive={false} />;
}

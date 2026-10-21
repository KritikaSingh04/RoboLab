import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * World ↔ pixel transform for a 2D canvas.
 * World units are metres (or whatever the experiment states); +y is up.
 */
export interface View {
  /** World coordinate at the canvas centre. */
  cx: number;
  cy: number;
  /** Pixels per world unit. */
  scale: number;
}

export interface Transform {
  toPixel: (x: number, y: number) => [number, number];
  toWorld: (px: number, py: number) => [number, number];
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  scale: number;
}

export interface CanvasPointer {
  /** World coordinates. */
  x: number;
  y: number;
  /** Pixel coordinates (CSS px). */
  px: number;
  py: number;
  buttons: number;
  shiftKey: boolean;
  /** On pointer-up: pixels travelled since pointer-down (distinguishes a click from a drag). */
  moved?: number;
}

interface Props {
  /** Initial view. */
  view?: Partial<View>;
  /** Draw callback. Runs on every frame requested (see `frame`) and on resize. */
  draw: (ctx: CanvasRenderingContext2D, t: Transform) => void;
  /** Change this value (e.g. a counter or sim time) to request a redraw. */
  frame?: unknown;
  /** Aspect ratio when the height is not fixed (width / height). */
  aspect?: number;
  /** Fixed CSS height in px (overrides aspect). */
  height?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  /** Grid spacing in world units ('auto' picks a nice value from the zoom). */
  gridStep?: number | 'auto';
  /** Enable drag-to-pan (right button or shift+drag) and wheel zoom. */
  interactive?: boolean;
  /** Pointer callbacks in world coordinates (left button). Return true to consume the event (prevents panning). */
  onPointerDown?: (p: CanvasPointer) => boolean | void;
  onPointerMove?: (p: CanvasPointer) => void;
  onPointerUp?: (p: CanvasPointer) => void;
  className?: string;
}

const DEFAULT_VIEW: View = { cx: 0, cy: 0, scale: 80 };

function niceStep(scale: number): number {
  // Aim for ~80 px between grid lines.
  const raw = 80 / scale;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * pow;
}

export function makeTransform(view: View, width: number, height: number): Transform {
  return {
    width,
    height,
    scale: view.scale,
    toPixel: (x, y) => [width / 2 + (x - view.cx) * view.scale, height / 2 - (y - view.cy) * view.scale],
    toWorld: (px, py) => [view.cx + (px - width / 2) / view.scale, view.cy - (py - height / 2) / view.scale],
  };
}

/** Draw the background grid and axes. Exported so experiments can call it inside custom draws. */
export function drawGrid(ctx: CanvasRenderingContext2D, t: Transform, step: number, axes = true) {
  const [x0, y1] = t.toWorld(0, 0);
  const [x1, y0] = t.toWorld(t.width, t.height);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#8A857A';
  // Minor grid
  ctx.strokeStyle = '#E8E4DA';
  ctx.beginPath();
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    const [px] = t.toPixel(x, 0);
    ctx.moveTo(Math.round(px) + 0.5, 0);
    ctx.lineTo(Math.round(px) + 0.5, t.height);
  }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
    const [, py] = t.toPixel(0, y);
    ctx.moveTo(0, Math.round(py) + 0.5);
    ctx.lineTo(t.width, Math.round(py) + 0.5);
  }
  ctx.stroke();
  // Labels
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const [, axisPy] = t.toPixel(0, 0);
  const labelY = Math.min(Math.max(axisPy + 3, 2), t.height - 14);
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    if (Math.abs(x) < step / 2) continue;
    const [px] = t.toPixel(x, 0);
    ctx.fillText(x.toFixed(decimals), px, labelY);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const [axisPx] = t.toPixel(0, 0);
  const labelX = Math.min(Math.max(axisPx + 4, 2), t.width - 30);
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
    if (Math.abs(y) < step / 2) continue;
    const [, py] = t.toPixel(0, y);
    ctx.fillText(y.toFixed(decimals), labelX, py);
  }
  if (axes) {
    ctx.strokeStyle = '#6B665C';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(axisPy) + 0.5);
    ctx.lineTo(t.width, Math.round(axisPy) + 0.5);
    ctx.moveTo(Math.round(axisPx) + 0.5, 0);
    ctx.lineTo(Math.round(axisPx) + 0.5, t.height);
    ctx.stroke();
    ctx.fillStyle = '#6B665C';
    ctx.font = 'bold 13px ui-sans-serif, system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', t.width - 6, axisPy - 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('y', axisPx + 6, 6);
  }
  ctx.restore();
}

/**
 * Dark 2D canvas with a world→pixel transform, grid, axes and pan/zoom.
 * The canvas is HiDPI-aware: `ctx` is pre-scaled so drawing uses CSS pixels.
 */
export default function Canvas2D({
  view: initialView,
  draw,
  frame,
  aspect = 4 / 3,
  height,
  showGrid = true,
  showAxes = true,
  gridStep = 'auto',
  interactive = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ ...DEFAULT_VIEW, ...initialView });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ startPx: number; startPy: number; startCx: number; startCy: number; consumed: boolean } | null>(null);
  const homeView = useRef<View>({ ...DEFAULT_VIEW, ...initialView });

  // Track element size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: height ?? Math.round(w / aspect) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, height]);

  // Render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FBFAF7';
    ctx.fillRect(0, 0, size.w, size.h);
    const t = makeTransform(view, size.w, size.h);
    if (showGrid) drawGrid(ctx, t, gridStep === 'auto' ? niceStep(view.scale) : gridStep, showAxes);
    ctx.save();
    draw(ctx, t);
    ctx.restore();
  }, [draw, frame, size, view, showGrid, showAxes, gridStep]);

  const pointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): CanvasPointer => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const t = makeTransform(view, size.w, size.h);
      const [x, y] = t.toWorld(px, py);
      return { x, y, px, py, buttons: e.buttons, shiftKey: e.shiftKey };
    },
    [view, size],
  );

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // stops the browser from starting a text selection outside the canvas
    document.body.style.userSelect = 'none';
    window.getSelection()?.removeAllRanges();
    const p = pointer(e);
    const isPan = e.button === 1 || e.button === 2 || e.shiftKey;
    // The experiment "consumes" a left-click (e.g. starts dragging a target);
    // otherwise the drag pans the view when interactive.
    const consumed = !isPan && e.button === 0 && onPointerDown?.(p) === true;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startPx: p.px, startPy: p.py, startCx: view.cx, startCy: view.cy, consumed };
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointer(e);
    const d = dragRef.current;
    if (d && d.consumed) {
      onPointerMove?.(p);
      return;
    }
    if (d && interactive && (e.buttons & (1 | 2 | 4)) !== 0) {
      setView((v) => ({ ...v, cx: d.startCx - (p.px - d.startPx) / v.scale, cy: d.startCy + (p.py - d.startPy) / v.scale }));
      return;
    }
    onPointerMove?.(p);
  };

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    document.body.style.userSelect = '';
    const p = pointer(e);
    const d = dragRef.current;
    p.moved = d ? Math.hypot(p.px - d.startPx, p.py - d.startPy) : 0;
    onPointerUp?.(p);
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Wheel zoom around the cursor (non-passive listener so we can preventDefault).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const t = makeTransform(v, size.w, size.h);
        const [wx, wy] = t.toWorld(px, py);
        const factor = Math.exp(-e.deltaY * 0.0015);
        const scale = Math.min(5000, Math.max(5, v.scale * factor));
        // Keep the world point under the cursor fixed.
        const cx = wx - (px - size.w / 2) / scale;
        const cy = wy + (py - size.h / 2) / scale;
        return { cx, cy, scale };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [interactive, size]);

  return (
    <div ref={wrapRef} className={['relative w-full select-none', className].join(' ')}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, touchAction: 'none' }}
        className="block rounded-lg border border-line"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {interactive && (
        <div className="absolute right-2 top-2 flex gap-1">
          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setView((v) => ({ ...v, scale: v.scale * 1.25 }))} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setView((v) => ({ ...v, scale: v.scale / 1.25 }))} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setView({ ...homeView.current })} aria-label="Reset view">
            ⌂
          </button>
        </div>
      )}
      {interactive && <div className="pointer-events-none absolute bottom-2 right-2 text-[11px] text-muted">scroll to zoom · shift+drag or right-drag to pan</div>}
    </div>
  );
}

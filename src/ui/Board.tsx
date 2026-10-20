import { useEffect, useRef, useState } from 'react';
import type { NodeKind } from '../engine/types';
import { connectError, TILE } from '../game/rules';
import { useGame } from '../game/store';
import { bounds, distToPath, hitNode, hitOutPort, type Pt } from '../render/geometry';
import { Renderer, type Wiring } from '../render/renderer';

type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'drag'; id: string; ox: number; oy: number; before: any; moved: boolean }
  | { kind: 'wire'; wiring: Wiring };

export function Board() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const mode = useRef<Mode>({ kind: 'none' });
  const hover = useRef<{ node: string | null; edge: string | null }>({ node: null, edge: null });
  const ghost = useRef<{ kind: NodeKind; x: number; y: number } | null>(null);
  const logSeen = useRef(0);
  const [cursor, setCursor] = useState('default');
  const focusRequest = useGame((s) => s.focusRequest);

  // render loop
  useEffect(() => {
    const c = canvas.current!;
    const r = new Renderer(c);
    renderer.current = r;
    activeRenderer = r;
    if (import.meta.env.DEV) (window as any).__pfr = r;
    const ro = new ResizeObserver(() => {
      const b = wrap.current!.getBoundingClientRect();
      r.resize(b.width, b.height);
    });
    ro.observe(wrap.current!);
    let raf = 0;
    let last = performance.now();
    let lastBump = 0;
    let simRef: unknown = null;
    const loop = (ts: number) => {
      const st = useGame.getState();
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (st.sim !== simRef) {
        simRef = st.sim;
        logSeen.current = 0;
      }
      if (st.sim && st.phase === 'running') {
        st.sim.advance(dt * st.speed);
        if (st.sim.finished) st.finish();
      }
      // surface simulation log events as toasts
      if (st.sim) {
        const log = st.sim.log;
        const start = Math.max(logSeen.current, log.length - 3);
        for (let i = start; i < log.length; i++) if (log[i].level !== 'info') st.toast(log[i].msg, log[i].level);
        logSeen.current = log.length;
      }
      const now = ts / 1000;
      r.ensurePaths(st.design);
      r.ingest(st.sim, st.design, now, st.speed);
      const tut = st.level?.tutorial?.[st.tutorialStep];
      let highlight: string | null = null;
      if (tut?.check.type === 'edge') highlight = tut.check.from;
      if (tut?.check.type === 'select') highlight = tut.check.kind;
      r.draw({
        design: st.design,
        sim: st.sim,
        selection: st.selection,
        hoverNode: hover.current.node,
        hoverEdge: hover.current.edge,
        wiring: mode.current.kind === 'wire' ? mode.current.wiring : null,
        level: st.level,
        now,
        speed: st.speed,
        running: st.phase === 'running',
        ghost: ghost.current,
        highlight,
      });
      if (ts - lastBump > 120) {
        lastBump = ts;
        if (st.sim) st.bump();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // fit camera to design
  useEffect(() => {
    const r = renderer.current;
    if (!r || !wrap.current) return;
    const fit = () => {
      const b = wrap.current!.getBoundingClientRect();
      const d = useGame.getState().design;
      const lvl = useGame.getState().level;
      let bb = bounds(d);
      if (lvl?.board?.regions) {
        for (const reg of lvl.board.regions) {
          const x0 = Math.min(bb.x, reg.x * TILE);
          const y0 = Math.min(bb.y, reg.y * TILE);
          const x1 = Math.max(bb.x + bb.w, (reg.x + reg.w) * TILE);
          const y1 = Math.max(bb.y + bb.h, (reg.y + reg.h) * TILE);
          bb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
      }
      const padW = Math.max(bb.w + 150, 560);
      const padH = Math.max(bb.h + 130, 320);
      const z = Math.max(0.45, Math.min(1.3, Math.min(b.width / padW, b.height / padH)));
      r.cam.z = z;
      const cx = bb.x + bb.w / 2 + (bb.w < 300 ? 140 : 0);
      const cy = bb.y + bb.h / 2;
      r.cam.x = b.width / 2 - cx * z;
      r.cam.y = b.height / 2 - cy * z;
    };
    // wait for layout
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }, [focusRequest]);

  const world = (e: { clientX: number; clientY: number }): Pt => {
    const b = canvas.current!.getBoundingClientRect();
    return renderer.current!.toWorld(e.clientX - b.left, e.clientY - b.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useGame.getState();
    const p = world(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) {
      mode.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: renderer.current!.cam.x, cy: renderer.current!.cam.y };
      return;
    }
    const port = hitOutPort(st.design, p, 11 / Math.min(1, renderer.current!.cam.z));
    if (port) {
      mode.current = { kind: 'wire', wiring: { from: port, to: p, target: null, ok: false, all: e.shiftKey } };
      return;
    }
    const n = hitNode(st.design, p);
    if (n) {
      st.select({ type: 'node', id: n.id });
      if (!n.locked) mode.current = { kind: 'drag', id: n.id, ox: p.x - n.x * TILE, oy: p.y - n.y * TILE, before: st.design, moved: false };
      return;
    }
    // edge?
    const r = renderer.current!;
    let best: string | null = null;
    let bd = 8 / r.cam.z;
    for (const [id, path] of r.paths) {
      const d = distToPath(path, p);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    if (best) {
      st.select({ type: 'edge', id: best });
      return;
    }
    st.select(null);
    mode.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: r.cam.x, cy: r.cam.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useGame.getState();
    const p = world(e);
    const m = mode.current;
    if (m.kind === 'pan') {
      renderer.current!.cam.x = m.cx + (e.clientX - m.sx);
      renderer.current!.cam.y = m.cy + (e.clientY - m.sy);
      return;
    }
    if (m.kind === 'drag') {
      const x = Math.round((p.x - m.ox) / TILE);
      const y = Math.round((p.y - m.oy) / TILE);
      const n = st.design.nodes.find((q) => q.id === m.id);
      if (n && (n.x !== x || n.y !== y)) {
        st.moveNode(m.id, x, y);
        m.moved = true;
      }
      return;
    }
    if (m.kind === 'wire') {
      const target = hitNode(st.design, p);
      m.wiring.to = p;
      m.wiring.all = e.shiftKey;
      m.wiring.target = target && target.id !== m.wiring.from.id ? target : null;
      m.wiring.ok = m.wiring.target ? !connectError(st.design, m.wiring.from, m.wiring.target) : false;
      return;
    }
    // hover
    const port = hitOutPort(st.design, p, 11);
    const n = hitNode(st.design, p);
    hover.current.node = n?.id ?? port?.id ?? null;
    let he: string | null = null;
    if (!n && !port) {
      let bd = 8 / renderer.current!.cam.z;
      for (const [id, path] of renderer.current!.paths) {
        const d = distToPath(path, p);
        if (d < bd) {
          bd = d;
          he = id;
        }
      }
    }
    hover.current.edge = he;
    setCursor(port ? 'crosshair' : n ? (n.locked ? 'pointer' : 'grab') : he ? 'pointer' : 'default');
  };

  const onPointerUp = () => {
    const st = useGame.getState();
    const m = mode.current;
    mode.current = { kind: 'none' };
    if (m.kind === 'drag' && m.moved) st.commitMove(m.before);
    if (m.kind === 'wire' && m.wiring.target) {
      const err = st.connect(m.wiring.from.id, m.wiring.target.id, m.wiring.all);
      if (err) st.toast(err, 'warn');
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = renderer.current!;
    const b = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - b.left;
    const sy = e.clientY - b.top;
    const before = r.toWorld(sx, sy);
    const z = Math.max(0.3, Math.min(2.2, r.cam.z * Math.exp(-e.deltaY * 0.0012)));
    r.cam.z = z;
    r.cam.x = sx - before.x * z;
    r.cam.y = sy - before.y * z;
  };

  const onDragOver = (e: React.DragEvent) => {
    const kind = e.dataTransfer.types.includes('application/x-pf-kind');
    if (!kind) return;
    e.preventDefault();
    const p = world(e);
    const k = (window as any).__pfDragKind as NodeKind | undefined;
    if (k) ghost.current = { kind: k, x: Math.round(p.x / TILE - 4), y: Math.round(p.y / TILE - 2) };
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-pf-kind') as NodeKind;
    ghost.current = null;
    if (!kind) return;
    const p = world(e);
    useGame.getState().addNode(kind, Math.round(p.x / TILE - 4), Math.round(p.y / TILE - 2));
  };

  return (
    <div ref={wrap} className="board-canvas" onContextMenu={(e) => e.preventDefault()}>
      <canvas
        ref={canvas}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          hover.current = { node: null, edge: null };
        }}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDragLeave={() => (ghost.current = null)}
        onDrop={onDrop}
      />
    </div>
  );
}

let activeRenderer: Renderer | null = null;

/** Center of the current view in tile coordinates (for click-to-place). */
export function viewCenterTiles(): { x: number; y: number } {
  const r = activeRenderer;
  if (!r) return { x: 20, y: 10 };
  const p = r.toWorld(r.w / 2, r.h / 2);
  return { x: Math.round(p.x / TILE - 4), y: Math.round(p.y / TILE - 2) };
}

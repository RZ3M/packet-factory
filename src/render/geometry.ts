// Board geometry: node boxes, ports, belt routing, hit testing.

import type { Design, DesignEdge, DesignNode } from '../engine/types';
import { NODE_H, NODE_W, TILE } from '../game/rules';

export interface Pt {
  x: number;
  y: number;
}

export interface Path {
  pts: Pt[];
  cum: number[]; // cumulative length at each point
  len: number;
}

export const NW = NODE_W * TILE;
export const NH = NODE_H * TILE;

export function nodeRect(n: DesignNode) {
  return { x: n.x * TILE, y: n.y * TILE, w: NW, h: NH };
}

export function outPort(n: DesignNode): Pt {
  return { x: n.x * TILE + NW, y: n.y * TILE + NH / 2 };
}

export function inPort(n: DesignNode): Pt {
  return { x: n.x * TILE, y: n.y * TILE + NH / 2 };
}

function mkPath(pts: Pt[]): Path {
  // drop duplicate points
  const clean: Pt[] = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) clean.push(p);
  }
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  return { pts: clean, cum, len: cum[cum.length - 1] || 1 };
}

/** Orthogonal "belt" route from a's output port to b's input port. */
export function routeEdge(a: DesignNode, b: DesignNode, lane = 0): Path {
  const p0 = outPort(a);
  const p3 = inPort(b);
  if (a.kind === 'sql' && b.kind === 'sql') return replRoute(a, b);
  const gap = p3.x - p0.x;
  if (gap >= TILE * 2) {
    if (Math.abs(p0.y - p3.y) < 1) return mkPath([p0, p3]);
    const mid = Math.round((p0.x + gap / 2) / (TILE / 2)) * (TILE / 2) + lane * 6;
    return mkPath([p0, { x: mid, y: p0.y }, { x: mid, y: p3.y }, p3]);
  }
  // backwards: loop around
  const ra = nodeRect(a);
  const rb = nodeRect(b);
  const out = p0.x + TILE;
  const inn = p3.x - TILE;
  let laneY: number;
  if (ra.y + ra.h + TILE < rb.y) laneY = (ra.y + ra.h + rb.y) / 2;
  else if (rb.y + rb.h + TILE < ra.y) laneY = (rb.y + rb.h + ra.y) / 2;
  else laneY = Math.max(ra.y + ra.h, rb.y + rb.h) + TILE * 1.5;
  return mkPath([p0, { x: out, y: p0.y }, { x: out, y: laneY }, { x: inn, y: laneY }, { x: inn, y: p3.y }, p3]);
}

/** Replication links: short side-to-side connector between database boxes. */
function replRoute(a: DesignNode, b: DesignNode): Path {
  const ra = nodeRect(a);
  const rb = nodeRect(b);
  const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
  const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
  if (Math.abs(ca.x - cb.x) < ra.w) {
    // stacked vertically: run in a lane just right of the column so the link never crosses other boxes
    const down = cb.y > ca.y;
    const lane = Math.max(ra.x + ra.w, rb.x + rb.w) + 10 + (Math.abs(rb.y - ra.y) / TILE) * 0.6;
    const ya = ra.y + ra.h * (down ? 0.8 : 0.2);
    const yb = rb.y + rb.h * (down ? 0.2 : 0.8);
    return mkPath([
      { x: ra.x + ra.w, y: ya },
      { x: lane, y: ya },
      { x: lane, y: yb },
      { x: rb.x + rb.w, y: yb },
    ]);
  }
  const right = cb.x > ca.x;
  const y = ca.y + (right ? -10 : 10);
  const sx = right ? ra.x + ra.w : ra.x;
  const ex = right ? rb.x : rb.x + rb.w;
  const mid = (sx + ex) / 2;
  return mkPath([
    { x: sx, y },
    { x: mid, y },
    { x: mid, y: cb.y + (right ? -10 : 10) },
    { x: ex, y: cb.y + (right ? -10 : 10) },
  ]);
}

export function pointAt(p: Path, f: number): Pt {
  const d = Math.max(0, Math.min(1, f)) * p.len;
  for (let i = 1; i < p.pts.length; i++) {
    if (p.cum[i] >= d) {
      const seg = p.cum[i] - p.cum[i - 1] || 1;
      const t = (d - p.cum[i - 1]) / seg;
      const a = p.pts[i - 1];
      const b = p.pts[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return p.pts[p.pts.length - 1];
}

export function distToPath(p: Path, q: Pt): number {
  let best = Infinity;
  for (let i = 1; i < p.pts.length; i++) best = Math.min(best, distSeg(q, p.pts[i - 1], p.pts[i]));
  return best;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitNode(design: Design, q: Pt): DesignNode | null {
  for (let i = design.nodes.length - 1; i >= 0; i--) {
    const n = design.nodes[i];
    const r = nodeRect(n);
    if (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h) return n;
  }
  return null;
}

export function hitOutPort(design: Design, q: Pt, radius = 10): DesignNode | null {
  for (let i = design.nodes.length - 1; i >= 0; i--) {
    const n = design.nodes[i];
    if (!hasOutPort(n)) continue;
    const p = outPort(n);
    if (Math.hypot(p.x - q.x, p.y - q.y) <= radius) return n;
  }
  return null;
}

export function hasOutPort(n: DesignNode) {
  return !['kv', 'document', 'widecolumn', 'graphdb', 'search', 'objstore'].includes(n.kind);
}

export function hasInPort(n: DesignNode) {
  return n.kind !== 'users';
}

/** Compute every edge's path, spreading parallel lanes a little. */
export function edgePaths(design: Design): Map<string, Path> {
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Path>();
  const fromCount = new Map<string, number>();
  for (const e of design.edges) fromCount.set(e.from, (fromCount.get(e.from) ?? 0) + 1);
  const toIndex = new Map<string, number>();
  for (const e of design.edges as DesignEdge[]) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    // fan-in to one node from many sources: offset lanes so belts don't sit exactly on top of each other
    const k = `${e.to}`;
    const idx = toIndex.get(k) ?? 0;
    toIndex.set(k, idx + 1);
    const lane = (fromCount.get(e.from) ?? 1) > 1 ? 0 : ((idx % 3) - 1) * 0;
    out.set(e.id, routeEdge(a, b, lane));
  }
  return out;
}

export function bounds(design: Design) {
  if (!design.nodes.length) return { x: 0, y: 0, w: 800, h: 600 };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of design.nodes) {
    const r = nodeRect(n);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

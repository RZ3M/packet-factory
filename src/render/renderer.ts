// Canvas renderer: belts, packets, machines, effects.

import { CATALOG, tierOf } from '../engine/catalog';
import type { NodeView, Simulation } from '../engine/sim';
import type { Design, DesignNode, NodeKind, ReqType } from '../engine/types';
import { REGION_LABEL, REQ_META, REQ_TYPES } from '../engine/types';
import type { Level } from '../content/types';
import type { Selection } from '../game/store';
import { TILE } from '../game/rules';
import { NH, NW, edgePaths, hasInPort, hasOutPort, inPort, nodeRect, outPort, pointAt, type Path, type Pt } from './geometry';
import { iconImage } from './icons';

export interface Camera {
  x: number; // screen offset px
  y: number;
  z: number; // zoom
}

export interface Wiring {
  from: DesignNode;
  to: Pt;
  target: DesignNode | null;
  ok: boolean;
  all: boolean;
}

export interface RenderInput {
  design: Design;
  sim: Simulation | null;
  selection: Selection;
  hoverNode: string | null;
  hoverEdge: string | null;
  wiring: Wiring | null;
  level: Level | null;
  now: number; // real seconds
  speed: number;
  running: boolean;
  ghost: { kind: NodeKind; x: number; y: number } | null;
  highlight: string | null; // tutorial highlight
}

interface Particle {
  edge: string;
  born: number;
  type: ReqType;
  ghost: boolean;
  dur: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  text?: string;
  size: number;
}

const TYPE_COLOR: Record<ReqType, string> = Object.fromEntries(REQ_TYPES.map((t) => [t, REQ_META[t].color])) as any;
const REGION_TINT: Record<string, string> = { us: '56,189,248', eu: '167,139,250', ap: '45,212,191' };
const FONT = 'Inter, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0;
  h = 0;
  cam: Camera = { x: 40, y: 40, z: 1 };
  particles: Particle[] = [];
  sparks: Spark[] = [];
  paths = new Map<string, Path>();
  private pathsFor: Design | null = null;
  private spawnCount = 0;
  private spawnWindowStart = 0;
  private lastSim: Simulation | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  toWorld(sx: number, sy: number): Pt {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z };
  }

  ensurePaths(design: Design) {
    if (this.pathsFor !== design) {
      this.paths = edgePaths(design);
      this.pathsFor = design;
    }
  }

  /** Pull visual events out of the simulation into particles and sparks. */
  ingest(sim: Simulation | null, design: Design, now: number, speed: number) {
    if (sim !== this.lastSim) {
      this.particles = [];
      this.sparks = [];
      this.lastSim = sim;
    }
    if (!sim) return;
    const byId = new Map(design.nodes.map((n) => [n.id, n]));
    const vSpeed = 170 * Math.min(2.2, Math.sqrt(speed));
    for (const v of sim.vis) {
      const p = this.paths.get(v.edge);
      if (!p) continue;
      if (this.particles.length > 1600) break;
      this.particles.push({ edge: v.edge, born: now, type: v.type, ghost: v.ghost, dur: Math.max(0.25, p.len / vSpeed) });
      this.spawnCount++;
    }
    sim.vis.length = 0;
    for (const f of sim.fx) {
      const n = byId.get(f.node);
      if (!n) continue;
      const r = nodeRect(n);
      if (this.sparks.length > 500) break;
      switch (f.kind) {
        case 'fail': {
          for (let i = 0; i < 2; i++)
            this.sparks.push({ x: r.x + 6, y: r.y + r.h / 2, vx: -20 - Math.random() * 40, vy: -30 - Math.random() * 50, born: now, life: 0.8, color: '#f43f5e', size: 2.5 });
          if (Math.random() < 0.25) this.sparks.push({ x: r.x + r.w / 2 + (Math.random() - 0.5) * 30, y: r.y - 4, vx: 0, vy: -26, born: now, life: 1.1, color: '#fb7185', text: '✕', size: 12 });
          break;
        }
        case 'hit':
          if (Math.random() < 0.15) this.sparks.push({ x: r.x + r.w - 10, y: r.y + 8, vx: 10, vy: -20, born: now, life: 0.5, color: '#fde68a', size: 2 });
          break;
        case 'blocked':
          this.sparks.push({ x: r.x + r.w / 2, y: r.y - 2, vx: 0, vy: -24, born: now, life: 1, color: '#60a5fa', text: '⛨', size: 13 });
          break;
        case 'breach':
          this.sparks.push({ x: r.x + r.w / 2, y: r.y - 2, vx: 0, vy: -20, born: now, life: 1.6, color: '#f43f5e', text: '☠', size: 18 });
          break;
        case 'stale':
          if (Math.random() < 0.3) this.sparks.push({ x: r.x + r.w / 2 + (Math.random() - 0.5) * 40, y: r.y - 2, vx: 0, vy: -18, born: now, life: 1, color: '#fb923c', text: '≈', size: 13 });
          break;
        case 'ok':
          break;
      }
    }
    sim.fx.length = 0;
    // adapt sampling to keep ~240 new particles per real second
    if (now - this.spawnWindowStart >= 1) {
      const rate = this.spawnCount / (now - this.spawnWindowStart);
      const target = 240;
      if (rate > 0) sim.visSample = Math.max(0.002, Math.min(1, sim.visSample * Math.min(3, target / rate)));
      else sim.visSample = Math.min(1, sim.visSample * 2);
      sim.fxSample = Math.min(1, Math.max(0.05, sim.visSample * 4));
      this.spawnCount = 0;
      this.spawnWindowStart = now;
    }
  }

  draw(inp: RenderInput) {
    const { ctx } = this;
    this.ensurePaths(inp.design);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0e15';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.dpr * this.cam.z, 0, 0, this.dpr * this.cam.z, this.dpr * this.cam.x, this.dpr * this.cam.y);
    this.drawGrid();
    if (inp.level?.board?.regions) this.drawRegions(inp.level);
    const views = new Map<string, NodeView>();
    if (inp.sim) for (const [id, n] of inp.sim.nodes) views.set(id, n.view);
    this.drawEdges(inp, views);
    this.drawParticles(inp);
    for (const n of inp.design.nodes) this.drawNode(n, inp, views.get(n.id));
    this.drawSparks(inp.now);
    if (inp.wiring) this.drawWiring(inp.wiring);
    if (inp.ghost) this.drawGhost(inp.ghost);
  }

  private drawGrid() {
    const { ctx } = this;
    const z = this.cam.z;
    const x0 = -this.cam.x / z;
    const y0 = -this.cam.y / z;
    const x1 = x0 + this.w / z;
    const y1 = y0 + this.h / z;
    const step = TILE * 2;
    ctx.fillStyle = 'rgba(148,163,184,0.10)';
    const sx = Math.floor(x0 / step) * step;
    const sy = Math.floor(y0 / step) * step;
    const r = 1 / z;
    for (let x = sx; x < x1; x += step) for (let y = sy; y < y1; y += step) ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.strokeStyle = 'rgba(148,163,184,0.045)';
    ctx.lineWidth = 1 / z;
    const big = TILE * 16;
    ctx.beginPath();
    for (let x = Math.floor(x0 / big) * big; x < x1; x += big) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = Math.floor(y0 / big) * big; y < y1; y += big) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  }

  private drawRegions(level: Level) {
    const { ctx } = this;
    for (const r of level.board!.regions!) {
      const x = r.x * TILE;
      const y = r.y * TILE;
      const w = r.w * TILE;
      const h = r.h * TILE;
      const tint = REGION_TINT[r.region];
      ctx.fillStyle = `rgba(${tint},0.045)`;
      ctx.strokeStyle = `rgba(${tint},0.35)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      roundRect(ctx, x, y, w, h, 18);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${tint},0.85)`;
      ctx.font = `700 13px "Chakra Petch", ${FONT}`;
      ctx.fillText(`◉ ${REGION_LABEL[r.region].toUpperCase()}`, x + 14, y + 22);
    }
  }

  private drawEdges(inp: RenderInput, views: Map<string, NodeView>) {
    const { ctx } = this;
    const simEdges = inp.sim?.edgeById;
    for (const e of inp.design.edges) {
      const p = this.paths.get(e.id);
      if (!p) continue;
      const se = simEdges?.get(e.id);
      const from = inp.design.nodes.find((n) => n.id === e.from);
      const to = inp.design.nodes.find((n) => n.id === e.to);
      const repl = from?.kind === 'sql' && to?.kind === 'sql';
      const selected = inp.selection?.type === 'edge' && inp.selection.id === e.id;
      const hover = inp.hoverEdge === e.id;
      let rate = 0;
      if (se) for (let i = 0; i < se.rate.length; i++) rate += se.rate[i];
      const tv = views.get(e.to);
      const jam = tv && (tv.status === 'hot' || tv.status === 'down');
      if (repl) {
        ctx.lineCap = 'round';
        tracePath(ctx, p, 8);
        ctx.strokeStyle = selected ? '#f5a524' : 'rgba(167,139,250,0.25)';
        ctx.lineWidth = selected ? 7 : 5;
        ctx.stroke();
        tracePath(ctx, p, 8);
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -(inp.running ? inp.now * 30 : 0);
        ctx.stroke();
        ctx.setLineDash([]);
        const mid = pointAt(p, 0.5);
        ctx.font = `600 9px ${FONT}`;
        ctx.fillStyle = 'rgba(196,181,253,0.9)';
        ctx.fillText('replication', mid.x + 6, mid.y - 4);
        continue;
      }
      // belt base
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      tracePath(ctx, p, 10);
      ctx.strokeStyle = selected ? '#f5a524' : hover ? '#3b4a62' : '#253246';
      ctx.lineWidth = selected ? 14 : 12;
      ctx.stroke();
      tracePath(ctx, p, 10);
      ctx.strokeStyle = '#121a26';
      ctx.lineWidth = 8;
      ctx.stroke();
      // moving chevrons
      const active = rate > 0.01;
      const spd = active ? 18 + 22 * Math.log10(1 + rate) : 0;
      tracePath(ctx, p, 10);
      ctx.strokeStyle = jam ? 'rgba(244,63,94,0.55)' : active ? 'rgba(245,165,36,0.45)' : 'rgba(100,116,139,0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -(inp.running ? inp.now * spd : 0);
      ctx.stroke();
      ctx.setLineDash([]);
      // filter tag
      if (e.filter?.length) {
        const mid = pointAt(p, 0.5);
        const wTag = 8 + e.filter.length * 9;
        ctx.fillStyle = '#0f1620';
        ctx.strokeStyle = '#3b4a62';
        ctx.lineWidth = 1;
        roundRect(ctx, mid.x - wTag / 2, mid.y - 8, wTag, 16, 8);
        ctx.fill();
        ctx.stroke();
        e.filter.forEach((t, i) => {
          ctx.fillStyle = TYPE_COLOR[t];
          ctx.beginPath();
          ctx.arc(mid.x - wTag / 2 + 8.5 + i * 9, mid.y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // arrowhead at input port
      const end = p.pts[p.pts.length - 1];
      ctx.fillStyle = active ? '#f5a524' : '#3b4a62';
      ctx.beginPath();
      ctx.moveTo(end.x - 1, end.y);
      ctx.lineTo(end.x - 8, end.y - 5);
      ctx.lineTo(end.x - 8, end.y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawParticles(inp: RenderInput) {
    const { ctx } = this;
    const now = inp.now;
    const keep: Particle[] = [];
    for (const pt of this.particles) {
      const p = this.paths.get(pt.edge);
      if (!p) continue;
      const f = (now - pt.born) / pt.dur;
      if (f >= 1) continue;
      keep.push(pt);
      const pos = pointAt(p, f);
      const c = pt.ghost ? '#c4b5fd' : TYPE_COLOR[pt.type];
      const r = pt.ghost ? 2 : 3.2;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (pt.type === 'attack' && !pt.ghost) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    this.particles = keep;
  }

  private drawNode(n: DesignNode, inp: RenderInput, v?: NodeView) {
    const { ctx } = this;
    const spec = CATALOG[n.kind];
    const r = nodeRect(n);
    const selected = inp.selection?.type === 'node' && inp.selection.id === n.id;
    const hover = inp.hoverNode === n.id;
    const status = v?.status ?? 'ok';
    const t = inp.now;
    const instances = v?.instances ?? n.config.instances ?? 1;

    // instance stack
    if ((n.kind === 'app' || n.kind === 'worker') && instances > 1) {
      for (let i = Math.min(3, instances - 1); i >= 1; i--) {
        ctx.fillStyle = '#101722';
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 1;
        roundRect(ctx, r.x + i * 4, r.y - i * 4, r.w, r.h, 9);
        ctx.fill();
        ctx.stroke();
      }
    }
    // glow
    if (status === 'hot') {
      const a = 0.25 + 0.2 * Math.sin(t * 8);
      ctx.shadowColor = `rgba(244,63,94,${a + 0.3})`;
      ctx.shadowBlur = 22;
    } else if (selected) {
      ctx.shadowColor = 'rgba(245,165,36,0.55)';
      ctx.shadowBlur = 18;
    } else if (inp.highlight && inp.highlight === n.kind) {
      ctx.shadowColor = `rgba(56,189,248,${0.5 + 0.3 * Math.sin(t * 5)})`;
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = '#131b27';
    roundRect(ctx, r.x, r.y, r.w, r.h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = selected ? '#f5a524' : hover ? 'rgba(226,232,240,0.5)' : hexA(spec.color, 0.45);
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.stroke();
    // accent bar
    ctx.fillStyle = spec.color;
    roundRect(ctx, r.x, r.y + 8, 3, r.h - 16, 2);
    ctx.fill();

    // icon
    const icon = iconImage(spec.icon, spec.color);
    if (icon) ctx.drawImage(icon, r.x + 10, r.y + 9, 20, 20);
    // title
    ctx.fillStyle = '#e5edf7';
    ctx.font = `600 11.5px ${FONT}`;
    const name = n.name ?? spec.name;
    ctx.fillText(ellipsize(ctx, name, r.w - 44), r.x + 36, r.y + 18);
    // subtitle
    ctx.font = `500 9.5px ${FONT}`;
    ctx.fillStyle = '#8a9bb3';
    ctx.fillText(ellipsize(ctx, this.subtitle(n, v), r.w - 44), r.x + 36, r.y + 31);

    // stats line
    if (v && n.kind !== 'users') {
      ctx.font = `500 9px ${MONO}`;
      ctx.fillStyle = '#9fb0c8';
      const extra = this.statText(n, v);
      ctx.fillText(ellipsize(ctx, extra, r.w - 16), r.x + 10, r.y + 46);
    } else if (n.kind === 'users' && inp.sim) {
      ctx.font = `500 9px ${MONO}`;
      ctx.fillStyle = '#9fb0c8';
      ctx.fillText(`${fmtRate(inp.sim.stats.recent(2).rps)}/s out`, r.x + 10, r.y + 46);
    }

    // utilization bar
    if (n.kind !== 'users') {
      const u = Math.min(1, v?.util ?? 0);
      const bx = r.x + 10;
      const bw = r.w - 20;
      const by = r.y + r.h - 9;
      ctx.fillStyle = '#0b1119';
      roundRect(ctx, bx, by, bw, 4, 2);
      ctx.fill();
      if (v) {
        ctx.fillStyle = utilColor(v.util);
        roundRect(ctx, bx, by, Math.max(2, bw * u), 4, 2);
        ctx.fill();
      }
    }

    // ports
    if (hasInPort(n)) {
      const p = inPort(n);
      ctx.fillStyle = '#0a0e15';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (hasOutPort(n)) {
      const p = outPort(n);
      const pulse = hover || (inp.highlight === n.kind && n.kind === 'users') ? 1.5 + Math.sin(t * 6) * 0.8 : 0;
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0e15';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // queue pile (items backing up on the input belt)
    const q = n.kind === 'queue' ? 0 : v?.queue ?? 0;
    if (q > 0.5 && inp.sim) {
      const items = Math.min(18, Math.ceil(Math.log2(1 + q / inp.sim.scale) * 2.2));
      const p = inPort(n);
      for (let i = 0; i < items; i++) {
        const col = Math.floor(i / 3);
        const row = i % 3;
        ctx.fillStyle = i > 12 ? '#f43f5e' : '#f5a524';
        ctx.fillRect(p.x - 12 - col * 6, p.y - 8 + row * 6, 4.5, 4.5);
      }
      ctx.font = `600 9px ${MONO}`;
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'right';
      ctx.fillText(`Q ${fmtRate(q)}`, r.x - 4, r.y + 2);
      ctx.textAlign = 'left';
    }
    // message queue contents drawn inside
    if (n.kind === 'queue' && v) {
      const depth = v.queue;
      const cap = Number(n.config.maxDepth) || 200000;
      const f = Math.min(1, depth / cap);
      ctx.fillStyle = 'rgba(232,121,249,0.15)';
      roundRect(ctx, r.x + r.w - 26, r.y + 8, 16, r.h - 22, 3);
      ctx.fill();
      ctx.fillStyle = f > 0.9 ? '#f43f5e' : '#e879f9';
      const hh = (r.h - 22) * Math.max(depth > 0 ? 0.06 : 0, f);
      roundRect(ctx, r.x + r.w - 26, r.y + 8 + (r.h - 22) - hh, 16, hh, 3);
      ctx.fill();
    }

    // badges
    if ((n.kind === 'app' || n.kind === 'worker') && (instances > 1 || (v?.bootingInstances ?? 0) > 0)) {
      const txt = `×${instances}${v?.bootingInstances ? `+${v.bootingInstances}` : ''}`;
      badge(ctx, r.x + r.w - 6, r.y - 6, txt, '#34d399');
    }
    if (n.kind === 'lb' && n.config.ha) badge(ctx, r.x + r.w - 6, r.y - 6, 'HA', '#f59e0b');
    if (n.locked && n.kind !== 'users') {
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText('🔒', r.x + r.w - 16, r.y + 16);
    }
    if (n.region && inp.level?.board?.regions) {
      ctx.font = `700 8px ${MONO}`;
      ctx.fillStyle = `rgba(${REGION_TINT[n.region]},0.9)`;
      ctx.fillText(n.region.toUpperCase(), r.x + r.w - 22, r.y + r.h - 14);
    }

    // down / booting overlays
    if (status === 'down') {
      ctx.fillStyle = 'rgba(10,14,21,0.72)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 9);
      ctx.fill();
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate(-0.12);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      roundRect(ctx, -38, -11, 76, 22, 4);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.font = `700 12px "Chakra Petch", ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('OFFLINE', 0, 4.5);
      ctx.textAlign = 'left';
      ctx.restore();
      if (Math.random() < 0.15) this.sparks.push({ x: r.x + r.w * (0.3 + Math.random() * 0.4), y: r.y, vx: (Math.random() - 0.5) * 8, vy: -14, born: t, life: 1.8, color: 'rgba(148,163,184,0.5)', size: 5 });
    } else if (status === 'booting') {
      ctx.fillStyle = 'rgba(10,14,21,0.55)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 9);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = `700 10px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(`BOOTING ${Math.ceil(v?.bootLeft ?? 0)}s`, r.x + r.w / 2, r.y + r.h / 2 + 4);
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const a0 = t * 4;
      ctx.arc(r.x + r.w - 14, r.y + 14, 6, a0, a0 + 4);
      ctx.stroke();
    }
  }

  private subtitle(n: DesignNode, v?: NodeView): string {
    const spec = CATALOG[n.kind];
    const parts: string[] = [];
    const t = tierOf(n.kind, n.tier);
    if (t) parts.push(t.label);
    switch (n.kind) {
      case 'sql': {
        const role = v?.role ?? n.config.role ?? 'primary';
        parts.push(role === 'primary' ? 'primary' : role);
        if ((n.config.domain ?? 'all') !== 'all') parts.push(n.config.domain);
        break;
      }
      case 'lb':
        parts.push(n.config.layer === 'L7' ? 'L7' : 'L4', n.config.algorithm ?? 'round-robin');
        if (!n.config.healthChecks) parts.push('no HC');
        break;
      case 'cache':
        parts.push(n.config.policy ?? 'cache-aside');
        break;
      case 'cdn':
        parts.push(n.config.mode ?? 'pull');
        break;
      case 'kv':
      case 'document':
      case 'widecolumn':
      case 'graphdb':
        parts.push(`${n.config.nodes ?? 1} nodes`);
        break;
      case 'dns':
        parts.push(n.config.policy ?? 'geo', `TTL ${n.config.ttl ?? 60}s`);
        break;
      case 'shardrouter':
        parts.push(n.config.strategy ?? 'hash');
        break;
      case 'queue':
        parts.push(`max ${Number(n.config.maxDepth) ? fmtRate(Number(n.config.maxDepth)) : '∞'}`);
        break;
      case 'users':
        return 'traffic source';
      default:
        if (!parts.length) parts.push(spec.short.toLowerCase());
    }
    return parts.join(' · ');
  }

  private statText(n: DesignNode, v: NodeView): string {
    const u = `${Math.round(Math.min(1.5, v.util) * 100)}%`;
    const rps = `${fmtRate(v.rps)}/s`;
    switch (n.kind) {
      case 'cache':
      case 'cdn':
        return `${rps}  hit ${Math.round(v.hitRate * 100)}%`;
      case 'sql':
        if (v.role && v.role !== 'primary') return `${rps} ${u} lag ${v.lag < 1 ? `${Math.round(v.lag * 1000)}ms` : `${v.lag.toFixed(1)}s`}`;
        return `${rps}  ${u}`;
      case 'queue':
        return `depth ${fmtRate(v.queue)}`;
      default:
        return `${rps}  ${u}`;
    }
  }

  private drawSparks(now: number) {
    const { ctx } = this;
    const keep: Spark[] = [];
    for (const s of this.sparks) {
      const age = now - s.born;
      if (age > s.life) continue;
      keep.push(s);
      const a = 1 - age / s.life;
      const x = s.x + s.vx * age;
      const y = s.y + s.vy * age;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      if (s.text) {
        ctx.font = `700 ${s.size}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(s.text, x, y);
        ctx.textAlign = 'left';
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size * (s.size > 4 ? 1 + age : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.sparks = keep;
  }

  private drawWiring(w: Wiring) {
    const { ctx } = this;
    const p0 = outPort(w.from);
    const end = w.target ? inPort(w.target) : w.to;
    ctx.strokeStyle = w.target ? (w.ok ? '#34d399' : '#f43f5e') : '#f5a524';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    const mx = (p0.x + end.x) / 2;
    ctx.bezierCurveTo(mx, p0.y, mx, end.y, end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w.all) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = '#f5a524';
      ctx.fillText(`all ${CATALOG[w.from.kind].name}s`, end.x + 10, end.y - 10);
    }
  }

  private drawGhost(g: { kind: NodeKind; x: number; y: number }) {
    const { ctx } = this;
    const spec = CATALOG[g.kind];
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#131b27';
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    roundRect(ctx, g.x * TILE, g.y * TILE, NW, NH, 9);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    const icon = iconImage(spec.icon, spec.color);
    if (icon) ctx.drawImage(icon, g.x * TILE + 10, g.y * TILE + 9, 20, 20);
    ctx.fillStyle = '#e5edf7';
    ctx.font = `600 11.5px ${FONT}`;
    ctx.fillText(spec.name, g.x * TILE + 36, g.y * TILE + 18);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------

function tracePath(ctx: CanvasRenderingContext2D, p: Path, radius: number) {
  const pts = p.pts;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const prev = pts[i - 1];
    const r = Math.min(radius, Math.hypot(a.x - prev.x, a.y - prev.y) / 2, Math.hypot(b.x - a.x, b.y - a.y) / 2);
    ctx.arcTo(a.x, a.y, b.x, b.y, r);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function badge(ctx: CanvasRenderingContext2D, rx: number, y: number, text: string, color: string) {
  ctx.font = `700 9px ${MONO}`;
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = '#0a0e15';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundRect(ctx, rx - w, y, w, 14, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, rx - w + 5, y + 10);
}

function ellipsize(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function utilColor(u: number): string {
  if (u < 0.6) return '#34d399';
  if (u < 0.85) return '#fbbf24';
  return '#f43f5e';
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function fmtRate(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (n >= 10) return `${Math.round(n)}`;
  return n.toFixed(n > 0 && n < 1 ? 2 : 0);
}

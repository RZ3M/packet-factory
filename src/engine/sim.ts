// Discrete-event simulation of a distributed system.
//
// Every packet is a real request (or a sample of `scale` requests). Nodes have
// concurrency slots, service times and bounded queues, so latency, saturation,
// cache hit rates, replication lag and staleness all *emerge* from the design
// instead of being scripted.

import { CATALOG, nodeCost, tierOf, type ComponentSpec } from './catalog';
import { Deque, EventHeap } from './heap';
import { RunStats } from './metrics';
import { Rng, Zipf, hash32 } from './rng';
import type {
  ChaosEvent,
  Design,
  DesignNode,
  FailReason,
  NodeKind,
  Packet,
  Region,
  ReqType,
  SimLevel,
  TierId,
  TrafficSource,
} from './types';
import { REQ_TYPES } from './types';

const TYPE_INDEX: Record<ReqType, number> = Object.fromEntries(REQ_TYPES.map((t, i) => [t, i])) as any;
const READ_LIKE = new Set<ReqType>(['read', 'search', 'graph']);
const WRITE_LIKE = new Set<ReqType>(['write', 'ingest', 'txn']);
const DATA_KINDS = new Set<NodeKind>(['sql', 'kv', 'document', 'widecolumn', 'graphdb']);
const NOSQL_ANOMALY = new Set<NodeKind>(['kv', 'document', 'widecolumn']);
const L7_SENDERS = new Set<NodeKind>(['proxy', 'gateway', 'app', 'worker', 'cache', 'cdn', 'dns', 'users']);
const TYPE_KEY_OFFSET: Record<ReqType, number> = {
  read: 0,
  write: 0,
  static: 10_000_000,
  job: 20_000_000,
  search: 30_000_000,
  graph: 40_000_000,
  ingest: 0,
  txn: 0,
  attack: 50_000_000,
};

const INTER_REGION: Record<string, number> = {
  'us|eu': 0.085,
  'eu|us': 0.085,
  'us|ap': 0.19,
  'ap|us': 0.19,
  'eu|ap': 0.15,
  'ap|eu': 0.15,
};
export function interRegion(a: Region, b: Region): number {
  return a === b ? 0 : INTER_REGION[`${a}|${b}`] ?? 0.1;
}

interface CacheEntry {
  ver: number;
  exp: number;
  refreshing?: boolean;
}

interface Store {
  ver: Int32Array;
  prev: Int32Array;
  time: Float64Array;
  local: Float64Array; // last local write time (master-master conflict detection)
}

function newStore(n: number): Store {
  return { ver: new Int32Array(n), prev: new Int32Array(n), time: new Float64Array(n), local: new Float64Array(n) };
}

export interface NodeView {
  util: number;
  queue: number;
  inService: number;
  rps: number; // arrivals (real requests / s)
  drops: number; // failures caused here (/ s)
  hitRate: number;
  lag: number; // replication lag (s)
  status: 'ok' | 'hot' | 'down' | 'booting';
  role?: string;
  instances: number;
  bootingInstances: number;
  pending: number; // write-behind pending writes
  utilHist: number[];
  rpsHist: number[];
  capacity: number; // approx real rps for this node's main type
  cost: number;
  bootLeft: number;
  dropBy: Partial<Record<FailReason, number>>;
}

export class SimNode {
  spec: ComponentSpec;
  cfg: Record<string, any>;
  name: string;
  region: Region;
  tier?: TierId;

  up = true;
  bootUntil = 0;
  downAt = -1;
  haGapUntil = 0;
  removed = false;
  slowFactor = 1;
  slowUntil = 0;

  instances = 1;
  bootingInstances = 0;
  slots = 1;
  svcMul = 1;
  maxQueue = 64;
  inService = 0;
  reserved = 0;
  queue = new Deque<Packet>();
  inflight = new Set<Packet>();
  buffer = new Deque<Packet>(); // message queue contents

  out: SimEdge[] = [];
  inn: SimEdge[] = [];
  rr = 0;

  // accounting
  busyInt = 0;
  lastT = 0;
  arrAcc = 0;
  dropAcc = 0;
  hitAcc = 0;
  missAcc = 0;
  dropByAcc: Partial<Record<FailReason, number>> = {};
  view: NodeView;

  // cache / cdn
  cache?: Map<number, CacheEntry>;
  cacheCap = 0;
  pending?: Map<number, { ver: number; w: number }>;

  // data stores
  store?: Store;
  role: 'primary' | 'replica' | 'standby' = 'primary';
  primary?: SimNode;
  replicas: SimNode[] = [];
  peers: SimNode[] = [];
  appliedUpTo = 0;
  lagNow = 0;
  commitLog: number[] = [];
  backlog = new Map<string, Packet[]>();
  failoverPending = false;
  peerDelay = 0;

  // gateway rate limiting
  buckets?: Map<number, { tokens: number; t: number }>;

  // proxy static cache
  constructor(public id: string, public kind: NodeKind, d: DesignNode, defaultRegion: Region) {
    this.spec = CATALOG[kind];
    this.cfg = { ...d.config };
    this.tier = d.tier;
    this.name = d.name ?? this.spec.name;
    this.region = d.region ?? defaultRegion;
    this.instances = Math.max(1, d.config.instances ?? 1);
    if (kind === 'sql') this.role = (d.config.role ?? 'primary') as any;
    this.view = {
      util: 0,
      queue: 0,
      inService: 0,
      rps: 0,
      drops: 0,
      hitRate: 0,
      lag: 0,
      status: 'ok',
      role: kind === 'sql' ? this.role : undefined,
      instances: this.instances,
      bootingInstances: 0,
      pending: 0,
      utilHist: [],
      rpsHist: [],
      capacity: 0,
      cost: 0,
      bootLeft: 0,
      dropBy: {},
    };
  }

  ready(now: number) {
    return this.up && !this.removed && now >= this.bootUntil;
  }
}

export interface SimEdge {
  id: string;
  idx: number;
  from: SimNode;
  to: SimNode;
  filter?: Set<ReqType>;
  repl: boolean;
  flowAcc: Float64Array;
  rate: Float64Array; // EMA real requests / s per type
  ghostAcc: number;
  ghostRate: number;
  total: number;
}

export interface VisEvent {
  edge: string;
  type: ReqType;
  ghost: boolean;
}

export interface FxEvent {
  node: string;
  kind: 'fail' | 'ok' | 'hit' | 'miss' | 'blocked' | 'breach' | 'stale';
  reason?: FailReason;
}

export interface TraceRecord {
  id: number;
  type: ReqType;
  ok: boolean;
  reason?: FailReason;
  latency: number; // ms
  stale?: boolean;
  hops: { node: string; name: string; wait: number; svc: number; note?: string }[];
  t: number;
}

export interface LogEntry {
  t: number;
  msg: string;
  level: 'info' | 'warn' | 'bad' | 'good';
}

const TICK = 0.5;

export class Simulation {
  now = 0;
  rng: Rng;
  heap = new EventHeap();
  nodes = new Map<string, SimNode>();
  edges: SimEdge[] = [];
  edgeById = new Map<string, SimEdge>();
  stats = new RunStats();
  scale: number;
  zipf: Zipf;
  staticZipf: Zipf;
  keys: number;
  ack: Int32Array;
  verCounter: Int32Array;
  timeout: number;
  started = false;
  finished = false;
  vis: VisEvent[] = [];
  fx: FxEvent[] = [];
  visSample = 1;
  fxSample = 1;
  traces: TraceRecord[] = [];
  log: LogEntry[] = [];
  partitions: { a: Region; b: Region; until: number }[] = [];
  hotkey: { key: number; share: number; until: number } | null = null;
  sessionOwner = new Map<number, string>();
  lostSessions = new Set<string>();
  defaultRegion: Region;
  private pid = 0;
  private nextTraceAt = 2;
  private tickN = 0;
  private sourceNodes = new Map<string, TrafficSource>();
  private designNodes = new Map<string, DesignNode>();

  constructor(public level: SimLevel, design: Design) {
    this.rng = new Rng(level.seed ?? 1337);
    this.defaultRegion = level.defaultRegion ?? 'us';
    this.keys = level.keyspace.keys;
    this.zipf = new Zipf(level.keyspace.keys, level.keyspace.skew);
    this.staticZipf = new Zipf(level.keyspace.staticKeys ?? 2000, level.keyspace.staticSkew ?? 0.9);
    this.ack = new Int32Array(this.keys);
    this.verCounter = new Int32Array(this.keys);
    this.timeout = level.timeout ?? 3;
    this.scale = level.scale ?? autoScale(level);
    for (const s of level.sources) this.sourceNodes.set(s.id, s);
    this.applyDesign(design);
  }

  // -------------------------------------------------------------------------
  // Design → runtime graph

  applyDesign(design: Design) {
    const seen = new Set<string>();
    for (const d of design.nodes) {
      seen.add(d.id);
      const prev = this.designNodes.get(d.id);
      let n = this.nodes.get(d.id);
      if (!n) {
        n = new SimNode(d.id, d.kind, d, this.defaultRegion);
        this.initNodeState(n);
        if (this.started && this.now > 0) {
          n.bootUntil = this.now + n.spec.boot;
          this.logMsg(`${n.name} provisioning (${n.spec.boot}s boot)`, 'info');
        }
        this.nodes.set(d.id, n);
      } else if (prev) {
        const tierChanged = prev.tier !== d.tier;
        const changedKeys = Object.keys({ ...prev.config, ...d.config }).filter((k) => prev.config[k] !== d.config[k]);
        n.name = d.name ?? n.spec.name;
        n.region = d.region ?? this.defaultRegion;
        for (const k of changedKeys) n.cfg[k] = d.config[k];
        if (changedKeys.includes('instances')) n.instances = Math.max(1, d.config.instances ?? 1);
        if (changedKeys.includes('role') && n.kind === 'sql') n.role = d.config.role ?? 'primary';
        if (changedKeys.includes('nodes') && this.started && this.now > 0 && (d.config.nodes ?? 1) > (prev.config.nodes ?? 1)) {
          this.logMsg(`${n.name} rebalancing data onto new nodes`, 'info');
        }
        if (tierChanged) {
          n.tier = d.tier;
          if (this.started && this.now > 0 && n.kind !== 'cdn') {
            // Vertical scaling means a restart: the machine is resized.
            this.crash(n, { reason: 'resize', recoverAfter: 0.01 });
            this.logMsg(`${n.name} resizing to ${d.tier} — restart required (vertical scaling = downtime)`, 'warn');
          }
        }
        if (n.kind === 'cache' || n.kind === 'cdn') this.initNodeState(n, true);
      }
      this.designNodes.set(d.id, { ...d, config: { ...d.config } });
    }
    for (const [id, n] of this.nodes) {
      if (!seen.has(id)) {
        this.crash(n, { reason: 'removed' });
        n.removed = true;
        this.nodes.delete(id);
        this.designNodes.delete(id);
      }
    }

    // edges
    const oldEdges = this.edgeById;
    this.edges = [];
    this.edgeById = new Map();
    for (const n of this.nodes.values()) {
      n.out = [];
      n.inn = [];
    }
    for (const de of design.edges) {
      const from = this.nodes.get(de.from);
      const to = this.nodes.get(de.to);
      if (!from || !to) continue;
      const old = oldEdges.get(de.id);
      const repl = from.kind === 'sql' && to.kind === 'sql';
      const e: SimEdge = old && old.from === from && old.to === to
        ? old
        : {
            id: de.id,
            idx: 0,
            from,
            to,
            repl,
            flowAcc: new Float64Array(REQ_TYPES.length),
            rate: new Float64Array(REQ_TYPES.length),
            ghostAcc: 0,
            ghostRate: 0,
            total: 0,
          };
      e.filter = de.filter && de.filter.length ? new Set(de.filter) : undefined;
      e.repl = repl;
      e.idx = this.edges.length;
      this.edges.push(e);
      this.edgeById.set(e.id, e);
      from.out.push(e);
      to.inn.push(e);
    }
    this.rebuildReplication();
    for (const n of this.nodes.values()) this.recalcSlots(n);
  }

  private initNodeState(n: SimNode, resizeOnly = false) {
    if (n.kind === 'cache' || n.kind === 'cdn' || n.kind === 'proxy') {
      const t = tierOf(n.kind, n.tier);
      n.cacheCap = n.kind === 'proxy' ? 400 : t?.mem ?? 1000;
      if (!n.cache || !resizeOnly) n.cache = new Map();
      while (n.cache.size > n.cacheCap) n.cache.delete(n.cache.keys().next().value!);
      if (n.kind === 'cache' && !n.pending) n.pending = new Map();
    }
    if (DATA_KINDS.has(n.kind) && !n.store) n.store = newStore(this.keys);
    if (n.kind === 'gateway' && !n.buckets) n.buckets = new Map();
  }

  private rebuildReplication() {
    const sqls = [...this.nodes.values()].filter((n) => n.kind === 'sql');
    for (const n of sqls) {
      n.replicas = [];
      n.peers = [];
      if (n.role !== 'primary') n.primary = undefined;
    }
    const repl = this.edges.filter((e) => e.repl);
    for (const e of repl) {
      const a = e.from;
      const b = e.to;
      const mutual = repl.some((x) => x.from === b && x.to === a);
      if (a.role === 'primary' && b.role === 'primary' && mutual) {
        if (!a.peers.includes(b)) a.peers.push(b);
        continue;
      }
      if (a.role !== 'primary') continue; // chained replication not modelled
      if (b.role === 'primary') b.role = 'replica';
      b.primary = a;
      if (!a.replicas.includes(b)) a.replicas.push(b);
    }
    for (const n of sqls) n.view.role = n.role;
  }

  recalcSlots(n: SimNode) {
    const t = tierOf(n.kind, n.tier);
    let raw = t ? t.slots : n.spec.slots ?? 1;
    if (n.spec.perNode) raw *= Math.max(1, n.cfg.nodes ?? 1);
    if (n.kind === 'app' || n.kind === 'worker') raw *= this.balanced(n) ? n.instances : 1;
    raw /= this.scale;
    const slots = Math.max(1, Math.round(raw));
    n.slots = slots;
    n.svcMul = slots / raw;
    n.maxQueue = Math.max(24, slots * 40);
    if (n.kind === 'cache' || n.kind === 'cdn') {
      n.cacheCap = t?.mem ?? n.cacheCap;
    }
    const mainType = n.spec.svc.read !== undefined ? 'read' : (Object.keys(n.spec.svc)[0] as ReqType);
    const ms = n.spec.svc[mainType] ?? 1;
    n.view.capacity = ((raw * this.scale) / Math.max(0.05, ms)) * 1000;
    n.view.instances = n.instances;
  }

  /** A multi-instance group only spreads load when something balances in front of it. */
  balanced(n: SimNode): boolean {
    if (n.instances <= 1) return true;
    return n.inn.length > 0 && n.inn.every((e) => ['lb', 'proxy', 'gateway', 'queue', 'pubsub'].includes(e.from.kind));
  }

  // -------------------------------------------------------------------------
  // Run control

  start() {
    if (this.started) return;
    this.started = true;
    for (const s of this.level.sources) this.scheduleSpawn(s);
    for (const c of this.level.chaos ?? []) this.heap.push(c.at, () => this.chaos(c));
    this.heap.push(TICK, () => this.tick());
    this.stats.scoring = (this.level.warmup ?? 5) <= 0;
    this.heap.push(this.level.warmup ?? 5, () => (this.stats.scoring = true));
  }

  advance(dt: number) {
    if (!this.started || this.finished) return;
    const end = Math.min(this.now + dt, this.level.duration);
    let guard = 0;
    while (this.heap.peekTime() <= end && guard++ < 400000) {
      const e = this.heap.pop()!;
      this.now = e.t;
      e.fn();
    }
    this.now = end;
    if (this.now >= this.level.duration - 1e-9) {
      this.finished = true;
      this.stats.roll(this.now, this.costRate());
    }
  }

  // -------------------------------------------------------------------------
  // Traffic

  rateAt(s: TrafficSource, t: number): number {
    const ph = s.phases;
    if (!ph.length) return 0;
    if (t <= ph[0].at) return ph[0].rps;
    for (let i = 0; i < ph.length - 1; i++) {
      const a = ph[i];
      const b = ph[i + 1];
      if (t >= a.at && t < b.at) {
        if (b.at === a.at) return b.rps;
        return a.rps + ((b.rps - a.rps) * (t - a.at)) / (b.at - a.at);
      }
    }
    return ph[ph.length - 1].rps;
  }

  mixAt(s: TrafficSource, t: number): Partial<Record<ReqType, number>> {
    let mix = s.mix;
    for (const p of s.phases) if (p.at <= t && p.mix) mix = p.mix;
    return mix;
  }

  private scheduleSpawn(s: TrafficSource) {
    const rate = this.rateAt(s, this.now) / this.scale;
    if (rate <= 0) {
      this.heap.push(this.now + 0.1, () => this.scheduleSpawn(s));
      return;
    }
    const dt = this.rng.exp(1 / rate);
    this.heap.push(this.now + Math.min(dt, 0.25), () => {
      // When the rate changed a lot we re-draw; small bias accepted.
      if (dt <= 0.25) this.spawn(s);
      this.scheduleSpawn(s);
    });
  }

  private spawn(s: TrafficSource) {
    const src = this.nodes.get(s.id);
    if (!src) return;
    const type = this.rng.weighted(this.mixAt(s, this.now)) as ReqType;
    let key: number;
    if (type === 'static') key = this.staticZipf.sample(this.rng.next());
    else if (type === 'ingest') key = this.keys + this.rng.int(1_000_000); // append-only: a brand-new row
    else if (this.hotkey && this.now < this.hotkey.until && this.rng.next() < this.hotkey.share) key = this.hotkey.key;
    else key = this.zipf.sample(this.rng.next());
    const bot = !!s.bot;
    const user = bot ? 1_000_000 + this.rng.int(s.botUsers ?? 20) : this.rng.int(s.users ?? 50_000);
    const pkt: Packet = {
      id: ++this.pid,
      type,
      key,
      user,
      region: s.region ?? src.region,
      born: this.now,
      scale: this.scale,
      bot,
      ghost: false,
      ver: 0,
      returnLat: 0,
      enqAt: this.now,
      hops: 0,
      path: [src.id],
      tls: true,
    };
    if (s.domains) pkt.domain = this.rng.weighted(s.domains);
    if (WRITE_LIKE.has(type) && key < this.keys) pkt.ver = ++this.verCounter[key];
    if (!bot && this.now >= this.nextTraceAt) {
      pkt.trace = [];
      this.nextTraceAt = this.now + 1.2;
    }
    if (!this.forward(src, pkt)) this.fail(pkt, src.out.length ? 'down' : 'noroute', src);
  }

  // -------------------------------------------------------------------------
  // Routing

  private accepts(to: SimNode, pkt: Packet): boolean {
    if (!to.spec.accepts.includes(pkt.type)) {
      if (!(pkt.ghost && to.kind === 'cache' && (pkt.ghostKind === 'session' || pkt.ghostKind === 'fanout'))) return false;
    }
    if (to.kind === 'sql') {
      if (to.role === 'standby') return false;
      if (to.role === 'replica' && !READ_LIKE.has(pkt.type)) return false;
      const dom = to.cfg.domain ?? 'all';
      if (pkt.domain && dom !== 'all' && dom !== pkt.domain) return false;
    }
    return true;
  }

  /** Is `to` known to be unhealthy from `from`'s point of view? */
  private knownDown(from: SimNode, to: SimNode): boolean {
    if (to.ready(this.now) && this.now >= to.haGapUntil) return false;
    let detect = Infinity;
    switch (from.kind) {
      case 'lb':
        detect = from.cfg.healthChecks ? 2 : Infinity;
        break;
      case 'gateway':
      case 'proxy':
        detect = 3;
        break;
      case 'dns':
        detect = from.cfg.ttl ?? 60;
        break;
      case 'app':
      case 'worker':
      case 'cache':
      case 'queue':
      case 'shardrouter':
        // client libraries see "connection refused" almost immediately
        detect = 0.25;
        break;
      default:
        detect = Infinity;
    }
    if (!to.up) return this.now - to.downAt >= detect;
    // booting nodes fail health checks until ready
    return detect !== Infinity;
  }

  private rank(from: SimNode, to: SimNode, pkt: Packet): number {
    const ty = pkt.type;
    if (from.kind === 'users' || from.kind === 'dns') {
      if (to.kind === 'cdn') return ty === 'static' ? 0 : 1;
      return ty === 'static' ? 1 : 0;
    }
    if (!(from.kind === 'app' || from.kind === 'worker' || from.kind === 'cache')) return 0;
    switch (to.kind) {
      case 'cache': {
        if (from.kind === 'cache') return 0;
        if (READ_LIKE.has(ty)) return 0;
        if (ty === 'write') {
          const p = to.cfg.policy ?? 'cache-aside';
          const hasStore = to.out.some((e) => !e.repl && DATA_KINDS.has(e.to.kind));
          return (p === 'write-through' || p === 'write-behind') && hasStore ? 0 : 9;
        }
        return 9;
      }
      case 'queue':
      case 'pubsub':
        if (from.kind === 'worker') return 50; // workers do not re-enqueue
        return ty === 'job' || ty === 'ingest' ? 0.5 : 8;
      case 'worker':
        return 1;
      case 'shardrouter':
        return 1;
      case 'search':
        return 1;
      case 'objstore':
        return 0;
      default: {
        if (!DATA_KINDS.has(to.kind)) return 5;
        const ms = (to.spec.svc[ty] ?? 50) / 1000;
        let r = 2 + ms;
        if (ty === 'txn' && NOSQL_ANOMALY.has(to.kind)) r += 10;
        if (to.kind === 'sql' && to.role === 'replica') r -= 1e-6; // replicas absorb reads before the primary
        return r;
      }
    }
  }

  /** Choose and send to a downstream node. Returns false when nothing could take it. */
  forward(from: SimNode, pkt: Packet, opt?: { exclude?: NodeKind[]; extraDelay?: number; only?: SimEdge[] }): boolean {
    const honorFilter = L7_SENDERS.has(from.kind) || (from.kind === 'lb' && from.cfg.layer === 'L7');
    let cands: SimEdge[] = [];
    for (const e of opt?.only ?? from.out) {
      if (e.repl) continue;
      if (opt?.exclude?.includes(e.to.kind)) continue;
      if (honorFilter && e.filter && !e.filter.has(pkt.type)) continue;
      if (!this.accepts(e.to, pkt)) continue;
      cands.push(e);
    }
    if (!cands.length) return false;

    if (from.kind === 'shardrouter') {
      const e = this.pickShard(from, cands, pkt);
      return this.send(e, pkt, opt?.extraDelay);
    }

    // health filter
    const healthy = cands.filter((e) => !this.knownDown(from, e.to));
    if (healthy.length) cands = healthy;
    else {
      // everything we know of is down; non-health-aware senders still try
      if (cands.every((e) => this.knownDown(from, e.to))) {
        this.fail(pkt, 'down', from);
        return true;
      }
    }

    // preference
    let best = Infinity;
    const ranks = cands.map((e) => {
      const r = this.rank(from, e.to, pkt);
      if (r < best) best = r;
      return r;
    });
    if (best >= 50) return false;
    cands = cands.filter((_, i) => ranks[i] <= best + 1e-9);

    const e = this.choose(from, cands, pkt);
    return this.send(e, pkt, opt?.extraDelay);
  }

  private choose(from: SimNode, cands: SimEdge[], pkt: Packet): SimEdge {
    if (cands.length === 1) return cands[0];
    if (from.kind === 'dns') {
      const pol = from.cfg.policy ?? 'geo';
      if (pol === 'failover') return cands[0];
      if (pol === 'geo') {
        let bestD = Infinity;
        let pool: SimEdge[] = [];
        for (const e of cands) {
          const d = e.to.kind === 'cdn' ? 0 : interRegion(pkt.region, e.to.region);
          if (d < bestD - 1e-9) {
            bestD = d;
            pool = [e];
          } else if (Math.abs(d - bestD) < 1e-9) pool.push(e);
        }
        return pool[from.rr++ % pool.length];
      }
      return cands[from.rr++ % cands.length];
    }
    if (from.kind === 'users') return cands[this.rng.int(cands.length)];
    if (from.kind === 'lb') {
      switch (from.cfg.algorithm ?? 'round-robin') {
        case 'least-conn':
          return leastLoaded(cands);
        case 'random':
          return cands[this.rng.int(cands.length)];
        case 'ip-hash':
          return cands[hash32(pkt.user) % cands.length];
        default:
          return cands[from.rr++ % cands.length];
      }
    }
    if (from.kind === 'proxy' || from.kind === 'gateway') return cands[from.rr++ % cands.length];
    return leastLoaded(cands, this.rng);
  }

  private pickShard(from: SimNode, cands: SimEdge[], pkt: Packet): SimEdge {
    const shards = [...cands].sort((a, b) => (a.to.id < b.to.id ? -1 : 1));
    const n = shards.length;
    const strat = from.cfg.strategy ?? 'hash';
    let i: number;
    if (strat === 'range') i = Math.min(n - 1, Math.floor((pkt.key / this.keys) * n));
    else if (strat === 'consistent') i = jumpHash(hash32(pkt.key + 7919), n);
    else i = hash32(pkt.key) % n;
    return shards[i];
  }

  private linkRtt(from: SimNode, to: SimNode, pkt: Packet): number {
    const client = from.kind === 'users' || from.kind === 'dns';
    if (client && to.kind === 'dns') return 0;
    if (client && to.kind === 'cdn') return 0.012;
    if (client) return 0.02 + interRegion(pkt.region, to.region);
    if (from.kind === 'cdn') return 0.01 + interRegion(pkt.region, to.region);
    return from.region === to.region ? 0.001 : interRegion(from.region, to.region);
  }

  partitioned(a: Region, b: Region): boolean {
    if (a === b) return false;
    for (const p of this.partitions) {
      if (p.until > this.now && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) return true;
    }
    return false;
  }

  private send(e: SimEdge, pkt: Packet, extraDelay = 0): boolean {
    const client = e.from.kind === 'users' || e.from.kind === 'dns' || e.from.kind === 'cdn';
    if (!client && this.partitioned(e.from.region, e.to.region)) {
      this.fail(pkt, 'down', e.from);
      return true;
    }
    const rtt = this.linkRtt(e.from, e.to, pkt);
    if (pkt.ghost) e.ghostAcc += pkt.scale;
    else e.flowAcc[TYPE_INDEX[pkt.type]] += pkt.scale;
    e.total += pkt.scale;
    if (this.rng.next() < this.visSample * (pkt.ghost ? 0.5 : 1)) {
      this.vis.push({ edge: e.id, type: pkt.type, ghost: pkt.ghost });
    }
    pkt.returnLat += rtt / 2;
    if (e.from.kind === 'queue') e.to.reserved++;
    const to = e.to;
    this.heap.push(this.now + rtt / 2 + extraDelay, () => this.arrive(to, pkt, e.from.kind === 'queue'));
    return true;
  }

  // -------------------------------------------------------------------------
  // Node processing

  private arrive(node: SimNode, pkt: Packet, reserved = false) {
    if (reserved) node.reserved = Math.max(0, node.reserved - 1);
    pkt.path.push(node.id);
    pkt.hops++;
    if (pkt.trace) pkt.trace.push({ node: node.id, arrive: this.now });
    if (node.removed || !node.ready(this.now) || this.now < node.haGapUntil) {
      if (pkt.ghost && pkt.ghostKind === 'apply') return; // replica will resync
      this.fail(pkt, 'down', node);
      return;
    }
    if (!pkt.ghost) node.arrAcc += pkt.scale;
    if (node.kind === 'queue') return this.queueArrive(node, pkt);
    if (node.kind === 'pubsub') return this.pubsubArrive(node, pkt);
    pkt.enqAt = this.now;
    if (node.inService < node.slots) this.startSvc(node, pkt);
    else if (node.queue.length < node.maxQueue || (pkt.ghost && (pkt.ghostKind === 'apply' || pkt.ghostKind === 'flush'))) node.queue.push(pkt);
    else this.fail(pkt, 'overload', node);
  }

  private busy(node: SimNode) {
    node.busyInt += node.inService * (this.now - node.lastT);
    node.lastT = this.now;
  }

  private startSvc(node: SimNode, pkt: Packet) {
    this.busy(node);
    node.inService++;
    node.inflight.add(pkt);
    const ms = this.svcMs(node, pkt);
    if (pkt.trace) {
      const h = pkt.trace[pkt.trace.length - 1];
      if (h && h.node === node.id) h.start = this.now;
    }
    this.heap.push(this.now + ms / 1000, () => this.done(node, pkt));
  }

  private svcMs(node: SimNode, pkt: Packet): number {
    const spec = node.spec;
    const ty = pkt.type;
    let ms: number;
    if (pkt.ghost) {
      switch (pkt.ghostKind) {
        case 'apply':
          ms = (spec.svc.write ?? 10) * 0.5;
          break;
        case 'flush':
          ms = (spec.svc.write ?? 10) * (0.6 + 0.08 * (pkt.meta?.keys?.length ?? 1));
          break;
        case 'session':
          ms = 0.3;
          break;
        case 'fanout':
          ms = 0.5;
          break;
        default:
          ms = spec.svc[ty] ?? 1;
      }
    } else {
      ms = spec.svc[ty] ?? 1;
      if (node.kind === 'app') {
        if (ty === 'job') ms = this.hasDownstream(node, 'job') ? 5 : (this.level.jobMs ?? 1000) * 1.5; // web threads are slower at batch work
        if (ty === 'static' && this.hasDownstreamKind(node, 'objstore')) ms = 2;
        if (node.cfg.sanitize) ms *= 1.05;
        if (pkt.tls) {
          ms += 4;
          pkt.tls = false;
        }
      }
      if (node.kind === 'worker' && ty === 'job' && this.level.jobMs) ms = this.level.jobMs;
      if (node.kind === 'proxy') {
        if (pkt.tls && node.cfg.tls !== false) {
          ms += 1;
          pkt.tls = false;
        }
        if (ty === 'static' && node.cfg.compression !== false) ms += 0.2;
      }
      if (node.kind === 'lb' && node.cfg.layer === 'L7') {
        ms += 0.5;
        if (pkt.tls) {
          ms += 1;
          pkt.tls = false;
        }
      }
      if (node.kind === 'gateway') {
        if (node.cfg.waf !== false) ms += 0.5;
        if (pkt.tls) {
          ms += 1;
          pkt.tls = false;
        }
      }
      if (node.kind === 'dns') {
        const ttl = node.cfg.ttl ?? 60;
        const p = ttl <= 10 ? 0.25 : ttl <= 60 ? 0.06 : 0.015;
        if (this.rng.next() < p) ms += 30;
      }
      if (node.kind === 'sql') {
        if (READ_LIKE.has(ty)) {
          if (node.cfg.indexes === false && ty === 'read') ms *= 5;
          if (ty === 'read' && this.level.joinShare && this.rng.next() < this.level.joinShare && !node.cfg.denormalized) ms *= 4;
        } else if (WRITE_LIKE.has(ty)) {
          if (node.cfg.indexes === false) ms *= 0.8;
          if (node.cfg.denormalized) ms *= 1.6;
        }
      }
      if ((node.kind === 'kv' || node.kind === 'document' || node.kind === 'widecolumn') && READ_LIKE.has(ty) && node.cfg.consistency === 'strong') ms *= 2;
    }
    if (node.slowUntil > this.now) ms *= node.slowFactor;
    ms *= node.svcMul;
    return this.rng.svc(ms);
  }

  private hasDownstream(node: SimNode, ty: ReqType) {
    return node.out.some((e) => !e.repl && e.to.spec.accepts.includes(ty) && (e.to.kind === 'queue' || e.to.kind === 'pubsub' || e.to.kind === 'worker'));
  }

  private hasDownstreamKind(node: SimNode, kind: NodeKind) {
    return node.out.some((e) => e.to.kind === kind);
  }

  private done(node: SimNode, pkt: Packet) {
    if (!node.inflight.delete(pkt)) return; // node crashed meanwhile
    this.busy(node);
    node.inService--;
    if (pkt.trace) {
      const h = pkt.trace[pkt.trace.length - 1];
      if (h && h.node === node.id) h.end = this.now;
    }
    this.behave(node, pkt);
    this.pump(node);
  }

  private pump(node: SimNode) {
    while (node.inService < node.slots && node.queue.length) {
      const p = node.queue.shift()!;
      if (!p.ghost && !p.async && this.now - p.born > this.timeout) {
        this.fail(p, 'timeout', node);
        continue;
      }
      this.startSvc(node, p);
    }
    if (node.inService + node.queue.length < node.slots) {
      for (const e of node.inn) if (e.from.kind === 'queue' && e.from.buffer.length) this.dispatch(e.from);
    }
  }

  // -------------------------------------------------------------------------
  // Behaviours

  private behave(node: SimNode, pkt: Packet) {
    switch (node.kind) {
      case 'dns':
      case 'lb':
        if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
        return;
      case 'cdn':
        return this.cdn(node, pkt);
      case 'proxy':
        return this.proxy(node, pkt);
      case 'gateway':
        return this.gateway(node, pkt);
      case 'app':
        return this.app(node, pkt);
      case 'worker':
        return this.worker(node, pkt);
      case 'cache':
        return this.cacheNode(node, pkt);
      case 'shardrouter':
        if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
        return;
      case 'objstore':
      case 'search':
        return this.complete(pkt, node);
      default:
        if (DATA_KINDS.has(node.kind)) return this.dataStore(node, pkt);
        this.complete(pkt, node);
    }
  }

  private cacheKey(pkt: Packet) {
    return pkt.key + TYPE_KEY_OFFSET[pkt.type];
  }

  private cacheGet(node: SimNode, ck: number, ttl: number): CacheEntry | undefined {
    const m = node.cache!;
    const e = m.get(ck);
    if (!e) return undefined;
    if (ttl > 0 && e.exp > 0 && e.exp <= this.now) {
      m.delete(ck);
      return undefined;
    }
    m.delete(ck);
    m.set(ck, e);
    return e;
  }

  private cacheSet(node: SimNode, ck: number, ver: number, ttl: number) {
    const m = node.cache!;
    const old = m.get(ck);
    if (old && old.ver > ver) ver = old.ver; // never replace a newer value with an older one
    m.delete(ck);
    m.set(ck, { ver, exp: ttl > 0 ? this.now + ttl : 0 });
    while (m.size > node.cacheCap) m.delete(m.keys().next().value!);
  }

  private cdn(node: SimNode, pkt: Packet) {
    if (pkt.type !== 'static') {
      if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
      return;
    }
    const ttl = node.cfg.ttl ?? 300;
    const ck = this.cacheKey(pkt);
    if (node.cfg.mode === 'push' || this.cacheGet(node, ck, ttl)) {
      node.hitAcc += pkt.scale;
      this.emitFx(node, 'hit');
      return this.complete(pkt, node);
    }
    node.missAcc += pkt.scale;
    (pkt.fills ??= []).push(node.id);
    if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
  }

  private proxy(node: SimNode, pkt: Packet) {
    if (pkt.type === 'static' && node.cfg.cacheStatic !== false) {
      const ck = this.cacheKey(pkt);
      if (this.cacheGet(node, ck, 300)) {
        node.hitAcc += pkt.scale;
        return this.complete(pkt, node);
      }
      node.missAcc += pkt.scale;
      (pkt.fills ??= []).push(node.id);
    }
    if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
  }

  private gateway(node: SimNode, pkt: Packet) {
    if (pkt.type === 'attack' && node.cfg.waf !== false && this.rng.next() < 0.97) {
      this.stats.add('blocked', pkt.scale);
      this.emitFx(node, 'blocked');
      this.endTrace(pkt, true, undefined, 'blocked by WAF');
      return;
    }
    const limit = Number(node.cfg.rateLimit ?? 0);
    if (limit > 0) {
      const b = node.buckets!;
      let bk = b.get(pkt.user);
      const cap = Math.max(limit * 2, pkt.scale * 2);
      if (!bk) {
        bk = { tokens: cap, t: this.now };
        b.set(pkt.user, bk);
        if (b.size > 200_000) b.clear();
      }
      bk.tokens = Math.min(cap, bk.tokens + (this.now - bk.t) * limit);
      bk.t = this.now;
      if (bk.tokens < pkt.scale) {
        if (pkt.bot) {
          this.stats.add('blocked', pkt.scale);
          this.emitFx(node, 'blocked');
          return;
        }
        return this.fail(pkt, 'ratelimited', node);
      }
      bk.tokens -= pkt.scale;
    }
    if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
  }

  private app(node: SimNode, pkt: Packet) {
    if (this.level.sessions && !pkt.bot && !pkt.ghost) {
      if ((node.cfg.sessions ?? 'local') === 'external') {
        const store = node.out.find((e) => e.to.kind === 'cache' || e.to.kind === 'kv');
        if (!store || !store.to.ready(this.now)) return this.fail(pkt, 'session', node);
        this.ghost(store, 'session', pkt);
      } else {
        const owner = this.sessionOwner.get(pkt.user);
        this.sessionOwner.set(pkt.user, node.id);
        if (owner !== undefined && owner !== node.id) return this.fail(pkt, 'session', node);
      }
    }
    if (pkt.type === 'attack') {
      if (node.cfg.sanitize) {
        this.stats.add('blocked', pkt.scale);
        this.emitFx(node, 'blocked');
        this.endTrace(pkt, true, undefined, 'blocked by parameterized query');
      } else {
        this.stats.add('breaches', pkt.scale);
        this.emitFx(node, 'breach');
        this.logOnce(`breach-${node.id}`, `Breach! An injection payload executed on ${node.name}`, 'bad');
        this.endTrace(pkt, false, undefined, 'BREACH');
      }
      return;
    }
    // cache-aside invalidation happens after the write commits
    if (pkt.type === 'write') {
      const inv = node.out.filter((e) => e.to.kind === 'cache' && (e.to.cfg.policy ?? 'cache-aside') === 'cache-aside').map((e) => e.to.id);
      if (inv.length) pkt.meta = { ...(pkt.meta ?? {}), invalidate: inv };
    }
    if (this.forward(node, pkt)) return;
    const ty = pkt.type;
    if (this.level.appServes?.includes(ty)) return this.complete(pkt, node);
    if (ty === 'static') return this.complete(pkt, node);
    if (ty === 'job') return this.complete(pkt, node);
    if (WRITE_LIKE.has(ty)) return this.fail(pkt, 'notpersisted', node);
    this.fail(pkt, 'noroute', node);
  }

  private worker(node: SimNode, pkt: Packet) {
    if (pkt.type === 'job') return this.complete(pkt, node);
    // A worker waits on its database call: when every store is saturated or down, the
    // message goes back on the queue instead of piling onto the database (back pressure).
    const stores = node.out.filter((e) => !e.repl && DATA_KINDS.has(e.to.kind) && this.accepts(e.to, pkt));
    const q = pkt.meta?.queue ? this.nodes.get(pkt.meta.queue) : undefined;
    if (q && !q.removed && stores.length && stores.every((e) => !e.to.ready(this.now) || e.to.queue.length >= e.to.slots * 2)) {
      this.heap.push(this.now + 0.1, () => {
        if (q.removed) return;
        q.buffer.push(pkt);
        this.dispatch(q);
      });
      return;
    }
    // timeline fan-out: push the write into followers' cached timelines
    const fan = this.level.fanout ?? 0;
    if (fan > 0 && pkt.type === 'write') {
      const cacheEdges = node.out.filter((e) => e.to.kind === 'cache');
      if (cacheEdges.length) {
        const n = Math.max(1, Math.round(fan * (0.5 + this.rng.next())));
        for (let i = 0; i < Math.min(n, 30); i++) {
          const e = cacheEdges[this.rng.int(cacheEdges.length)];
          this.ghost(e, 'fanout', pkt, { key: this.zipf.sample(this.rng.next()) });
        }
      }
      const persist = node.out.filter((e) => e.to.kind !== 'cache');
      if (persist.length && this.forward(node, pkt, { only: persist })) return;
      if (!persist.length && cacheEdges.length) return this.complete(pkt, node);
    }
    if (!this.forward(node, pkt, { exclude: ['queue', 'pubsub'] })) this.fail(pkt, 'notpersisted', node);
  }

  private cacheNode(node: SimNode, pkt: Packet) {
    const ttl = node.cfg.ttl ?? 60;
    if (pkt.ghost) {
      if (pkt.ghostKind === 'fanout') this.cacheSet(node, pkt.key + 60_000_000, pkt.ver, ttl);
      return;
    }
    const ck = this.cacheKey(pkt);
    if (READ_LIKE.has(pkt.type)) {
      const e = this.cacheGet(node, ck, ttl);
      if (e) {
        node.hitAcc += pkt.scale;
        if (pkt.trace) this.noteTrace(pkt, 'HIT');
        if (node.cfg.refreshAhead && ttl > 0 && e.exp > 0 && e.exp - this.now < ttl * 0.3 && !e.refreshing) {
          e.refreshing = true;
          this.refreshAhead(node, pkt, ck);
        }
        return this.complete(pkt, node, { ver: e.ver });
      }
      node.missAcc += pkt.scale;
      if (pkt.trace) this.noteTrace(pkt, 'MISS');
      (pkt.fills ??= []).push(node.id);
      if (this.forward(node, pkt)) return;
      if (this.bounce(node, pkt)) return;
      return this.fail(pkt, 'noroute', node);
    }
    if (pkt.type === 'write') {
      const policy = node.cfg.policy ?? 'cache-aside';
      if (policy === 'write-behind') {
        this.cacheSet(node, ck, pkt.ver, ttl);
        const p = node.pending!.get(pkt.key);
        node.pending!.set(pkt.key, { ver: Math.max(pkt.ver, p?.ver ?? 0), w: (p?.w ?? 0) + pkt.scale });
        return this.complete(pkt, node, { write: true });
      }
      if (policy === 'write-through') pkt.wtCache = node.id;
      if (policy === 'cache-aside') {
        pkt.meta = { ...(pkt.meta ?? {}), invalidate: [...(pkt.meta?.invalidate ?? []), node.id] };
      }
      if (this.forward(node, pkt)) return;
      if (this.bounce(node, pkt)) return;
      return this.fail(pkt, 'notpersisted', node);
    }
    if (!this.forward(node, pkt)) this.fail(pkt, 'noroute', node);
  }

  /** Cache-aside: on a miss with nothing behind the cache, the app goes to the DB itself. */
  private bounce(node: SimNode, pkt: Packet): boolean {
    const upId = pkt.path[pkt.path.length - 2];
    const up = upId ? this.nodes.get(upId) : undefined;
    if (!up || !(up.kind === 'app' || up.kind === 'worker')) return false;
    const rtt = this.linkRtt(node, up, pkt);
    pkt.returnLat += rtt / 2;
    return this.forward(up, pkt, { exclude: ['cache', 'queue', 'pubsub'], extraDelay: rtt / 2 });
  }

  private refreshAhead(node: SimNode, pkt: Packet, ck: number) {
    const e = node.out.find((x) => !x.repl && x.to.spec.accepts.includes(pkt.type));
    if (!e) return;
    this.ghost(e, 'refresh', pkt, { cache: node.id, ck });
  }

  private ghost(e: SimEdge, kind: NonNullable<Packet['ghostKind']>, base: Packet, meta?: any) {
    const g: Packet = {
      id: ++this.pid,
      type: kind === 'session' || kind === 'refresh' ? (kind === 'refresh' ? base.type : 'read') : 'write',
      key: meta?.key ?? base.key,
      user: base.user,
      region: base.region,
      born: this.now,
      scale: base.scale,
      bot: false,
      ghost: true,
      ghostKind: kind,
      ver: base.ver,
      returnLat: 0,
      enqAt: this.now,
      hops: 0,
      path: [e.from.id],
      tls: false,
      meta,
    };
    this.send(e, g);
  }

  private dataStore(node: SimNode, pkt: Packet) {
    const k = pkt.key;
    if (pkt.ghost) {
      switch (pkt.ghostKind) {
        case 'apply':
          return this.applyRepl(node, pkt);
        case 'flush': {
          for (const [key, ver, w] of pkt.meta.keys as [number, number, number][]) {
            this.commitKey(node, key, ver);
            for (const r of node.replicas) this.replicate(node, r, { ...pkt, key, ver, scale: w });
          }
          const c = this.nodes.get(pkt.meta.cache);
          if (c?.pending) {
            for (const [key, ver] of pkt.meta.keys as [number, number, number][]) {
              const p = c.pending.get(key);
              if (p && p.ver <= ver) c.pending.delete(key);
            }
          }
          return;
        }
        case 'refresh': {
          const c = this.nodes.get(pkt.meta.cache);
          if (c?.cache && c.ready(this.now)) this.cacheSet(c, pkt.meta.ck, this.readVer(node, k), c.cfg.ttl ?? 60);
          return;
        }
        default:
          return;
      }
    }
    if (k >= this.keys) return this.complete(pkt, node);
    if (READ_LIKE.has(pkt.type)) {
      return this.complete(pkt, node, { ver: this.readVer(node, k) });
    }
    if (WRITE_LIKE.has(pkt.type)) {
      if (node.kind === 'sql' && node.role !== 'primary') return this.fail(pkt, 'readonly', node);
      const anomaly = pkt.type === 'txn' && NOSQL_ANOMALY.has(node.kind);
      // Semi-synchronous: a write needs at least one reachable copy to acknowledge it
      // (every peer, for master-master). No reachable copy → refuse rather than risk loss.
      const sync = node.cfg.replication === 'sync';
      const reachable = (r: SimNode) => r.ready(this.now) && !this.partitioned(node.region, r.region);
      const syncTargets = sync ? [...node.replicas, ...node.peers].filter(reachable) : [];
      // Master-master peers are strict (CP): no peer, no write.
      if (sync && node.peers.some((p) => !syncTargets.includes(p))) return this.fail(pkt, 'unavailable', node);
      // Semi-sync replicas: with none reachable, degrade to async rather than refuse.
      if (sync && node.replicas.length && !syncTargets.length) {
        this.logOnce(`semisync-${node.id}`, `${node.name}: no replica reachable — semi-sync falls back to async (writes now at risk)`, 'warn');
      }
      this.commitKey(node, k, pkt.ver, true);
      for (const r of node.replicas) this.replicate(node, r, pkt);
      for (const p of node.peers) this.replicate(node, p, pkt);
      if (syncTargets.length) {
        // acknowledge only once the copies have it
        let extra = 0;
        for (const r of syncTargets) extra = Math.max(extra, this.linkRtt(node, r, pkt) + 0.004);
        const commitT = this.now;
        this.heap.push(this.now + extra, () => {
          for (const r of syncTargets) {
            if (r.role !== 'primary') r.appliedUpTo = Math.max(r.appliedUpTo, commitT);
            else if (r.store) this.commitKey(r, k, pkt.ver);
          }
          this.complete(pkt, node, { write: true, anomaly });
        });
        return;
      }
      return this.complete(pkt, node, { write: true, anomaly });
    }
    this.complete(pkt, node);
  }

  private commitKey(node: SimNode, k: number, ver: number, local = false) {
    const st = node.store!;
    if (ver >= st.ver[k]) {
      st.prev[k] = st.ver[k];
      st.ver[k] = ver;
      st.time[k] = this.now;
    }
    if (local) st.local[k] = this.now;
    if (node.kind === 'sql') {
      node.commitLog.push(this.now);
      if (node.commitLog.length > 4000) node.commitLog.splice(0, 2000);
    }
  }

  private readVer(node: SimNode, k: number): number {
    if (node.kind === 'sql' && node.role !== 'primary' && node.primary) {
      const src = node.primary.store!;
      return src.time[k] <= node.appliedUpTo ? src.ver[k] : src.prev[k];
    }
    const st = node.store!;
    if (node.kind !== 'sql' && node.cfg.consistency !== 'strong') {
      const lag = 0.08 + node.view.util * 0.4;
      if (this.now - st.time[k] < lag) return st.prev[k];
    }
    return st.ver[k];
  }

  private replicate(src: SimNode, dst: SimNode, base: Packet) {
    const g: Packet = {
      id: ++this.pid,
      type: 'write',
      key: base.key,
      user: 0,
      region: src.region,
      born: this.now,
      scale: base.scale,
      bot: false,
      ghost: true,
      ghostKind: 'apply',
      ver: base.ver,
      returnLat: 0,
      enqAt: this.now,
      hops: 0,
      path: [src.id],
      tls: false,
      meta: { commitT: this.now, src: src.id },
    };
    const ship = () => {
      if (!src.up || src.removed) return; // primary died before this batch left: lost
      if (!dst.ready(this.now) || this.partitioned(src.region, dst.region)) {
        const bl = src.backlog.get(dst.id) ?? [];
        if (bl.length < 50_000) bl.push(g);
        src.backlog.set(dst.id, bl);
        return;
      }
      const e = src.out.find((x) => x.repl && x.to === dst);
      if (e) this.send(e, g);
      else this.heap.push(this.now + this.linkRtt(src, dst, g) / 2, () => this.arrive(dst, g));
    };
    // Async replication ships the log in small batches; sync ships immediately.
    if (src.cfg.replication === 'sync') ship();
    else this.heap.push((Math.floor(this.now / 0.1) + 1) * 0.1, ship);
  }

  private applyRepl(node: SimNode, g: Packet) {
    const commitT = g.meta.commitT as number;
    const src = this.nodes.get(g.meta.src);
    if (node.kind === 'sql' && node.role === 'primary' && src && node.peers.includes(src)) {
      // master-master: detect concurrent writes to the same key
      const st = node.store!;
      const window = this.now - commitT;
      // synchronous multi-master certifies writes, so only async replication can diverge
      if (src.cfg.replication !== 'sync' && st.local[g.key] > 0 && st.local[g.key] > commitT - window && st.local[g.key] !== commitT) {
        this.stats.add('conflicts', g.scale);
        this.logOnce(`conflict-${node.id}`, `Write conflict on ${node.name}: the same record changed on two primaries`, 'warn');
      }
      this.commitKey(node, g.key, g.ver);
      return;
    }
    node.appliedUpTo = Math.max(node.appliedUpTo, commitT);
    node.lagNow = this.now - commitT;
  }

  private flushBacklogs() {
    for (const src of this.nodes.values()) {
      if (!src.backlog.size) continue;
      for (const [dstId, list] of src.backlog) {
        const dst = this.nodes.get(dstId);
        if (!dst) {
          src.backlog.delete(dstId);
          continue;
        }
        if (!dst.ready(this.now) || this.partitioned(src.region, dst.region)) continue;
        src.backlog.delete(dstId);
        const e = src.out.find((x) => x.repl && x.to === dst);
        // catch-up is paced: a replica replays its backlog at a bounded rate
        for (let i = 0; i < list.length; i += 150) {
          const chunk = list.slice(i, i + 150);
          this.heap.push(this.now + (i / 150) * 0.1, () => {
            for (const g of chunk) {
              if (e) this.send(e, g);
              else this.arrive(dst, g);
            }
          });
        }
      }
    }
  }

  private queueArrive(q: SimNode, pkt: Packet) {
    const maxDepth = Number(q.cfg.maxDepth ?? 10000);
    if (maxDepth > 0 && q.buffer.length * this.scale >= maxDepth && !pkt.meta?.retry) {
      return this.fail(pkt, 'rejected', q);
    }
    if (!pkt.async) {
      pkt.returnLat += 0.002;
      this.ackUser(pkt, q);
      pkt.async = true;
      pkt.jobBorn = pkt.born;
    }
    pkt.meta = { ...(pkt.meta ?? {}), queue: q.id };
    q.buffer.push(pkt);
    this.dispatch(q);
  }

  private dispatch(q: SimNode) {
    let guard = 0;
    while (q.buffer.length && guard++ < 10000) {
      const pkt = q.buffer.peek()!;
      let best: SimEdge | undefined;
      let bestLoad = Infinity;
      for (const e of q.out) {
        const t = e.to;
        if (!t.ready(this.now) || !this.accepts(t, pkt)) continue;
        if (e.filter && !e.filter.has(pkt.type)) continue;
        const load = t.inService + t.queue.length + t.reserved;
        if (load >= t.slots) continue;
        const rel = load / t.slots;
        if (rel < bestLoad) {
          bestLoad = rel;
          best = e;
        }
      }
      if (!best) return;
      q.buffer.shift();
      this.send(best, pkt);
    }
  }

  private pubsubArrive(t: SimNode, pkt: Packet) {
    if (!pkt.async) {
      pkt.returnLat += 0.001;
      this.ackUser(pkt, t);
      pkt.async = true;
      pkt.jobBorn = pkt.born;
    }
    const subs = t.out.filter((e) => !e.repl && this.accepts(e.to, pkt));
    if (!subs.length) {
      this.stats.add('jobsFailed', pkt.scale);
      return;
    }
    subs.forEach((e, i) => {
      const copy: Packet = i === 0 ? pkt : { ...pkt, id: ++this.pid, path: [...pkt.path], trace: undefined, meta: { ...(pkt.meta ?? {}) } };
      this.send(e, copy);
    });
  }

  // -------------------------------------------------------------------------
  // Completion & failure

  private ackUser(pkt: Packet, node: SimNode) {
    if (pkt.bot) return;
    const ms = (this.now - pkt.born + pkt.returnLat) * 1000;
    if (ms > this.timeout * 1000) {
      this.stats.recordFail(pkt.type, 'timeout', pkt.scale, node.id);
      return;
    }
    this.stats.recordOk(pkt.type, ms, pkt.scale, node.kind);
    if (WRITE_LIKE.has(pkt.type) && pkt.key < this.keys) this.ack[pkt.key] = Math.max(this.ack[pkt.key], pkt.ver);
    this.endTrace(pkt, true, undefined, 'accepted (async)');
  }

  complete(pkt: Packet, node: SimNode, info?: { ver?: number; write?: boolean; anomaly?: boolean }) {
    if (pkt.ghost) return;
    if (info?.write) {
      if (pkt.wtCache) {
        const c = this.nodes.get(pkt.wtCache);
        if (c?.cache && c.ready(this.now)) this.cacheSet(c, this.cacheKey(pkt), pkt.ver, c.cfg.ttl ?? 60);
      }
      const inv = pkt.meta?.invalidate as string[] | undefined;
      if (inv) for (const id of inv) this.nodes.get(id)?.cache?.delete(this.cacheKey(pkt));
    }
    if (pkt.fills) {
      const ver = info?.ver ?? 0;
      for (const id of pkt.fills) {
        const c = this.nodes.get(id);
        if (c?.cache && c.ready(this.now)) this.cacheSet(c, this.cacheKey(pkt), ver, c.kind === 'cache' ? c.cfg.ttl ?? 60 : c.kind === 'cdn' ? c.cfg.ttl ?? 300 : 300);
      }
    }
    if (info?.anomaly) this.stats.add('anomalies', pkt.scale);
    if (pkt.async) {
      if (pkt.type === 'job' || pkt.type === 'write' || pkt.type === 'ingest') this.stats.recordJob((this.now - (pkt.jobBorn ?? pkt.born)) * 1000, pkt.scale);
      return;
    }
    if (pkt.bot) {
      this.stats.add('botServed', pkt.scale);
      return;
    }
    const ms = (this.now - pkt.born + pkt.returnLat) * 1000;
    if (ms > this.timeout * 1000) return this.fail(pkt, 'timeout', node);
    this.stats.recordOk(pkt.type, ms, pkt.scale, node.kind);
    if (pkt.type === 'job') this.stats.recordJob(ms, pkt.scale); // done inline, in the request
    let stale = false;
    if (pkt.key < this.keys) {
      if (WRITE_LIKE.has(pkt.type)) this.ack[pkt.key] = Math.max(this.ack[pkt.key], pkt.ver);
      else if (pkt.type === 'read' && info?.ver !== undefined) {
        stale = info.ver < this.ack[pkt.key];
        this.stats.recordRead(stale, pkt.scale);
        if (stale) this.emitFx(node, 'stale');
      }
    }
    if (this.rng.next() < this.fxSample * 0.15) this.emitFx(node, 'ok');
    this.endTrace(pkt, true, undefined, stale ? 'STALE' : undefined, ms, stale);
  }

  fail(pkt: Packet, reason: FailReason, node: SimNode) {
    if (pkt.ghost) {
      if (pkt.ghostKind === 'flush') {
        // re-queue lost flush back into pending so it is retried
        const c = this.nodes.get(pkt.meta?.cache);
        if (c?.pending && c.up) for (const [key, ver, w] of pkt.meta.keys) c.pending.set(key, { ver, w });
      }
      return;
    }
    node.dropAcc += pkt.scale;
    node.dropByAcc[reason] = (node.dropByAcc[reason] ?? 0) + pkt.scale;
    if (pkt.async) {
      const qid = pkt.meta?.queue as string | undefined;
      const q = qid ? this.nodes.get(qid) : undefined;
      const tries = (pkt.meta?.tries ?? 0) + 1;
      if (q && tries <= 5 && !q.removed) {
        pkt.meta = { ...pkt.meta, tries, retry: true };
        pkt.path = [q.id];
        this.heap.push(this.now + 0.5 * tries, () => {
          if (q.removed) return;
          q.buffer.push(pkt);
          this.dispatch(q);
        });
        return;
      }
      this.stats.add('jobsFailed', pkt.scale);
      if (WRITE_LIKE.has(pkt.type)) {
        this.stats.add('dataLoss', pkt.scale);
        this.logOnce('async-loss', 'Acknowledged async writes were dropped after retries — data loss!', 'bad');
      }
      return;
    }
    if (pkt.bot) return;
    this.stats.recordFail(pkt.type, reason, pkt.scale, node.id);
    if (this.rng.next() < this.fxSample) this.emitFx(node, 'fail', reason);
    this.endTrace(pkt, false, reason);
  }

  private emitFx(node: SimNode, kind: FxEvent['kind'], reason?: FailReason) {
    if (this.fx.length < 400) this.fx.push({ node: node.id, kind, reason });
  }

  private noteTrace(pkt: Packet, note: string) {
    const h = pkt.trace?.[pkt.trace.length - 1];
    if (h) h.note = note;
  }

  private endTrace(pkt: Packet, ok: boolean, reason?: FailReason, note?: string, ms?: number, stale?: boolean) {
    if (!pkt.trace) return;
    const tr = pkt.trace;
    pkt.trace = undefined;
    if (note) {
      const h = tr[tr.length - 1];
      if (h && !h.note) h.note = note;
    }
    const hops = tr.map((h) => {
      const n = this.nodes.get(h.node);
      const start = h.start ?? h.arrive;
      const end = h.end ?? start;
      return { node: h.node, name: n?.name ?? h.node, wait: (start - h.arrive) * 1000, svc: (end - start) * 1000, note: h.note };
    });
    this.traces.push({
      id: pkt.id,
      type: pkt.type,
      ok,
      reason,
      latency: ms ?? (this.now - pkt.born + pkt.returnLat) * 1000,
      stale,
      hops,
      t: this.now,
    });
    if (this.traces.length > 24) this.traces.shift();
  }

  // -------------------------------------------------------------------------
  // Failures, chaos, failover

  crash(node: SimNode, opt: { reason: string; recoverAfter?: number }) {
    if (!node.up && opt.reason !== 'removed') return;
    if (node.kind === 'lb' && node.cfg.ha && opt.reason === 'chaos') {
      node.haGapUntil = this.now + 1;
      this.logMsg(`${node.name} failed — standby LB took over (~1s failover)`, 'warn');
      return;
    }
    if ((node.kind === 'app' || node.kind === 'worker') && node.instances > 1 && opt.reason === 'chaos') {
      node.instances--;
      const lose = Math.ceil(node.inflight.size / (node.instances + 1));
      let i = 0;
      for (const p of [...node.inflight]) {
        if (i++ >= lose) break;
        node.inflight.delete(p);
        node.inService--;
        this.fail(p, 'down', node);
      }
      this.recalcSlots(node);
      this.logMsg(`One instance of ${node.name} died (${node.instances} left)`, 'warn');
      if (opt.recoverAfter) {
        this.heap.push(this.now + opt.recoverAfter + node.spec.boot, () => {
          if (node.removed) return;
          node.instances++;
          this.recalcSlots(node);
          this.logMsg(`${node.name} instance replaced`, 'good');
        });
      }
      return;
    }
    this.busy(node);
    node.up = false;
    node.downAt = this.now;
    for (const p of [...node.inflight]) this.fail(p, 'down', node);
    node.inflight.clear();
    node.inService = 0;
    for (const p of node.queue.drain()) this.fail(p, 'down', node);
    if (node.kind === 'cache') {
      let lost = 0;
      for (const p of node.pending?.values() ?? []) lost += p.w;
      if (lost > 0) {
        this.stats.add('dataLoss', lost);
        this.logMsg(`${node.name} lost ${Math.round(lost)} unflushed write-behind writes!`, 'bad');
      }
      node.pending?.clear();
      node.cache?.clear();
    }
    if (node.kind === 'cdn' || node.kind === 'proxy') node.cache?.clear();
    if (node.kind === 'app' && this.level.sessions) {
      for (const [u, owner] of this.sessionOwner) if (owner === node.id) this.sessionOwner.set(u, `lost:${node.id}`);
    }
    if (opt.reason === 'chaos' || opt.reason === 'region') this.logMsg(`${node.name} crashed`, 'bad');
    if (node.kind === 'sql' && node.role === 'primary' && opt.reason !== 'removed' && opt.reason !== 'resize') {
      if (node.cfg.autoFailover && (node.replicas.length || node.peers.length)) {
        node.failoverPending = true;
        this.logMsg(`Heartbeats to ${node.name} failing — failover in ~8s`, 'warn');
        this.heap.push(this.now + 8, () => this.promote(node));
      } else if (node.replicas.length) {
        this.logOnce(`nofailover-${node.id}`, `${node.name} is down and nothing will promote a replica. Writes will fail.`, 'bad');
      }
    }
    if (opt.recoverAfter !== undefined) this.heap.push(this.now + opt.recoverAfter, () => this.recover(node));
  }

  recover(node: SimNode) {
    if (node.removed || node.up) return;
    node.up = true;
    node.lastT = this.now;
    node.bootUntil = this.now + Math.min(5, Math.max(1, node.spec.boot * 0.3)); // a restart, not a fresh provision
    if (node.kind === 'sql' && node.role !== 'primary') node.appliedUpTo = this.now;
    this.logMsg(`${node.name} restarting`, 'info');
    this.heap.push(node.bootUntil + 0.01, () => this.flushBacklogs());
  }

  /** Promote a replica of a failed primary. Also callable manually from the UI. */
  promote(old: SimNode, chosen?: SimNode) {
    old.failoverPending = false;
    if (old.up && !chosen) return;
    const cands = old.replicas.filter((r) => r.ready(this.now));
    const cand = chosen ?? cands.find((r) => r.role === 'standby') ?? cands[0];
    if (!cand) {
      this.logMsg(`Failover failed: no healthy replica of ${old.name}`, 'bad');
      return;
    }
    // async replication: anything committed after the replica's applied point is gone
    let lost = 0;
    if (old.cfg.replication !== 'sync') {
      for (const t of old.commitLog) if (t > cand.appliedUpTo) lost++;
      lost *= this.scale;
    }
    const st = newStore(this.keys);
    const src = old.store!;
    for (let k = 0; k < this.keys; k++) {
      const visible = src.time[k] <= cand.appliedUpTo || old.cfg.replication === 'sync';
      st.ver[k] = visible ? src.ver[k] : src.prev[k];
      st.prev[k] = src.prev[k];
      st.time[k] = src.time[k];
    }
    cand.store = st;
    cand.role = 'primary';
    cand.primary = undefined;
    cand.cfg.replication = old.cfg.replication;
    cand.cfg.autoFailover = old.cfg.autoFailover;
    cand.replicas = old.replicas.filter((r) => r !== cand);
    for (const r of cand.replicas) r.primary = cand;
    cand.replicas.push(old);
    old.replicas = [];
    old.role = 'replica';
    old.primary = cand;
    old.store = undefined;
    old.store = newStore(this.keys);
    cand.view.role = 'primary';
    old.view.role = 'replica';
    if (lost > 0) {
      this.stats.add('dataLoss', lost);
      this.logMsg(`Promoted ${cand.name} to primary — ${Math.round(lost)} recent writes were never replicated and are LOST`, 'bad');
    } else this.logMsg(`Promoted ${cand.name} to primary with no data loss`, 'good');
    const appsWired = [...this.nodes.values()].some((n) => n.out.some((e) => e.to === cand && !e.repl));
    if (!appsWired) this.logOnce(`unwired-${cand.id}`, `Nothing is wired to ${cand.name}, so apps cannot reach the new primary!`, 'bad');
  }

  private chaos(c: ChaosEvent) {
    if (c.note) this.logMsg(c.note, c.type === 'notice' ? 'info' : 'warn');
    switch (c.type) {
      case 'crash': {
        for (const n of this.resolveTargets(c.target)) this.crash(n, { reason: 'chaos', recoverAfter: c.recoverAfter });
        break;
      }
      case 'partition':
        this.partitions.push({ a: c.regions[0], b: c.regions[1], until: this.now + c.duration });
        this.logMsg(`Network partition between ${c.regions[0].toUpperCase()} and ${c.regions[1].toUpperCase()} for ${c.duration}s`, 'bad');
        this.heap.push(this.now + c.duration + 0.01, () => {
          this.logMsg('Partition healed — replication catching up', 'good');
          this.flushBacklogs();
        });
        break;
      case 'region-outage':
        for (const n of this.nodes.values()) {
          if (n.region === c.region && n.kind !== 'users' && n.kind !== 'dns' && n.kind !== 'cdn') this.crash(n, { reason: 'region', recoverAfter: c.duration });
        }
        this.logMsg(`Region ${c.region.toUpperCase()} is down!`, 'bad');
        break;
      case 'slow':
        for (const n of this.resolveTargets(c.target)) {
          n.slowFactor = c.factor;
          n.slowUntil = this.now + c.duration;
          this.logMsg(`${n.name} is degraded (${c.factor}x slower)`, 'warn');
        }
        break;
      case 'hotkey':
        this.hotkey = { key: c.key, share: c.share, until: this.now + c.duration };
        break;
      case 'flush':
        for (const n of this.resolveTargets(c.target)) n.cache?.clear();
        break;
      case 'notice':
        break;
    }
  }

  resolveTargets(target: string): SimNode[] {
    // "id", "kind:app", "kind:sql:primary", "random:app"
    const all = [...this.nodes.values()].filter((n) => n.kind !== 'users');
    if (target.startsWith('kind:')) {
      const [, kind, role] = target.split(':');
      return all.filter((n) => n.kind === kind && (!role || n.role === role));
    }
    if (target.startsWith('random:')) {
      const [, kind, role] = target.split(':');
      const pool = all.filter((n) => n.kind === kind && n.up && (!role || n.role === role));
      if (!pool.length) return [];
      // deterministic: busiest node of that kind
      pool.sort((a, b) => b.view.rps - a.view.rps || (a.id < b.id ? -1 : 1));
      return [pool[0]];
    }
    const n = this.nodes.get(target);
    return n ? [n] : [];
  }

  // -------------------------------------------------------------------------
  // Periodic housekeeping

  costRate(): number {
    let c = 0;
    for (const n of this.nodes.values()) {
      const cfg = { ...n.cfg, instances: n.instances + n.bootingInstances };
      c += nodeCost(n.kind, n.tier, cfg, { staticKeys: this.level.keyspace.staticKeys });
    }
    return c;
  }

  private tick() {
    this.tickN++;
    const dt = TICK;
    for (const n of this.nodes.values()) {
      this.busy(n);
      const util = n.slots ? n.busyInt / (n.slots * dt) : 0;
      n.busyInt = 0;
      const v = n.view;
      v.util = v.util * 0.5 + Math.min(1.5, util) * 0.5;
      v.queue = n.kind === 'queue' ? n.buffer.length * this.scale : n.queue.length * this.scale;
      v.inService = n.inService;
      v.rps = v.rps * 0.5 + (n.arrAcc / dt) * 0.5;
      v.drops = v.drops * 0.5 + (n.dropAcc / dt) * 0.5;
      for (const r in n.dropByAcc) {
        const k = r as FailReason;
        v.dropBy[k] = (v.dropBy[k] ?? 0) + (n.dropByAcc[k] ?? 0);
      }
      n.dropByAcc = {};
      const hm = n.hitAcc + n.missAcc;
      if (hm > 0) v.hitRate = v.hitRate * 0.7 + (n.hitAcc / hm) * 0.3;
      n.arrAcc = 0;
      n.dropAcc = 0;
      n.hitAcc = 0;
      n.missAcc = 0;
      if (n.kind === 'sql' && n.role !== 'primary' && n.primary) {
        const lastCommit = n.primary.commitLog[n.primary.commitLog.length - 1] ?? 0;
        v.lag = lastCommit > n.appliedUpTo ? this.now - n.appliedUpTo : 0;
        if (!n.primary.up) v.lag = 0;
      } else v.lag = 0;
      v.status = !n.up ? 'down' : this.now < n.bootUntil ? 'booting' : v.util > 0.9 || n.queue.length > n.slots * 4 ? 'hot' : 'ok';
      v.bootLeft = Math.max(0, n.bootUntil - this.now);
      v.instances = n.instances;
      v.bootingInstances = n.bootingInstances;
      v.pending = 0;
      if (n.pending) for (const p of n.pending.values()) v.pending += p.w;
      v.cost = nodeCost(n.kind, n.tier, { ...n.cfg, instances: n.instances + n.bootingInstances }, { staticKeys: this.level.keyspace.staticKeys });
      if (this.tickN % 2 === 0) {
        v.utilHist.push(v.util);
        v.rpsHist.push(v.rps);
        if (v.utilHist.length > 90) v.utilHist.shift();
        if (v.rpsHist.length > 90) v.rpsHist.shift();
      }
    }
    for (const e of this.edges) {
      for (let i = 0; i < e.rate.length; i++) {
        e.rate[i] = e.rate[i] * 0.6 + (e.flowAcc[i] / dt) * 0.4;
        e.flowAcc[i] = 0;
      }
      e.ghostRate = e.ghostRate * 0.6 + (e.ghostAcc / dt) * 0.4;
      e.ghostAcc = 0;
    }
    // write-behind flush
    for (const n of this.nodes.values()) {
      if (n.kind !== 'cache' || !n.pending?.size || !n.ready(this.now)) continue;
      const e = n.out.find((x) => !x.repl && DATA_KINDS.has(x.to.kind) && this.accepts(x.to, { type: 'write' } as Packet));
      if (!e) continue;
      const entries = [...n.pending.entries()];
      n.pending.clear(); // in flight now; a failed flush re-adds its keys
      for (let i = 0; i < entries.length; i += 40) {
        const chunk = entries.slice(i, i + 40).map(([k, p]) => [k, p.ver, p.w]);
        const g: Packet = {
          id: ++this.pid,
          type: 'write',
          key: chunk[0][0],
          user: 0,
          region: n.region,
          born: this.now,
          scale: this.scale,
          bot: false,
          ghost: true,
          ghostKind: 'flush',
          ver: 0,
          returnLat: 0,
          enqAt: this.now,
          hops: 0,
          path: [n.id],
          tls: false,
          meta: { keys: chunk, cache: n.id },
        };
        this.send(e, g);
      }
    }
    // dispatch any queues (new workers may have come online)
    for (const n of this.nodes.values()) if (n.kind === 'queue' && n.buffer.length) this.dispatch(n);
    if (this.tickN % 2 === 0) {
      this.autoscale();
      this.randomFailures();
      this.flushBacklogs();
      const c = this.costRate();
      if (this.stats.scoring) {
        this.stats.costInt += c;
        this.stats.costT += 1;
      }
      this.stats.roll(this.now, c);
    }
    if (this.now + TICK <= this.level.duration + 1e-9) this.heap.push(this.now + TICK, () => this.tick());
  }

  private autoscale() {
    for (const n of this.nodes.values()) {
      if (!(n.kind === 'app' || n.kind === 'worker') || !n.cfg.autoscale || !n.ready(this.now)) continue;
      const max = Math.max(n.cfg.instances ?? 1, n.cfg.maxInstances ?? 8);
      const min = Math.max(1, n.cfg.instances ?? 1);
      let pressure = n.view.util;
      if (n.kind === 'worker') {
        const backlog = n.inn.reduce((s, e) => s + (e.from.kind === 'queue' ? e.from.buffer.length : 0), 0);
        if (backlog > n.slots * 4) pressure = Math.max(pressure, 1);
      }
      if (pressure > 0.72 && n.instances + n.bootingInstances < max) {
        n.bootingInstances++;
        this.logMsg(`Autoscaler: launching instance for ${n.name} (${n.spec.boot}s boot)`, 'info');
        this.heap.push(this.now + n.spec.boot, () => {
          if (n.removed) return;
          n.bootingInstances--;
          n.instances++;
          this.recalcSlots(n);
          this.pump(n);
        });
      } else if (pressure < 0.3 && n.instances > min && n.bootingInstances === 0) {
        n.instances--;
        this.recalcSlots(n);
      }
    }
  }

  private randomFailures() {
    const f = this.level.failures;
    if (!f) return;
    for (const n of this.nodes.values()) {
      if (!f.kinds.includes(n.kind) || !n.up || n.removed) continue;
      if (this.rng.next() < 1 / f.mtbf) this.crash(n, { reason: 'chaos', recoverAfter: f.mttr });
    }
  }

  // -------------------------------------------------------------------------
  // Logging helpers

  private logged = new Set<string>();
  logMsg(msg: string, level: LogEntry['level']) {
    this.log.push({ t: this.now, msg, level });
    if (this.log.length > 200) this.log.shift();
  }
  logOnce(key: string, msg: string, level: LogEntry['level']) {
    if (this.logged.has(key)) return;
    this.logged.add(key);
    this.logMsg(msg, level);
  }
}

function leastLoaded(cands: SimEdge[], rng?: Rng): SimEdge {
  let best = cands[0];
  let bl = Infinity;
  const off = rng ? rng.int(cands.length) : 0;
  for (let i = 0; i < cands.length; i++) {
    const e = cands[(i + off) % cands.length];
    const l = (e.to.inService + e.to.queue.length + e.to.reserved) / e.to.slots;
    if (l < bl) {
      bl = l;
      best = e;
    }
  }
  return best;
}

/** Jump consistent hash (Lamping & Veach). */
function jumpHash(key: number, buckets: number): number {
  let b = -1;
  let j = 0;
  let k = BigInt(key);
  while (j < buckets) {
    b = j;
    k = (k * 2862933555777941757n + 1n) & 0xffffffffffffffffn;
    j = Math.floor((b + 1) * (Number(1n << 31n) / Number((k >> 33n) + 1n)));
  }
  return b;
}

export function autoScale(level: SimLevel): number {
  let peak = 0;
  const totals = new Map<number, number>();
  for (const s of level.sources) for (const p of s.phases) totals.set(p.at, 0);
  for (const t of totals.keys()) {
    let sum = 0;
    for (const s of level.sources) {
      // rate of source s at time t
      const ph = s.phases;
      let r = ph[0]?.rps ?? 0;
      for (let i = 0; i < ph.length; i++) if (ph[i].at <= t) r = ph[i].rps;
      sum += r;
    }
    peak = Math.max(peak, sum);
  }
  return Math.max(1, Math.ceil(peak / 3000));
}

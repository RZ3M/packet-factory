// Core data types shared by the simulation, renderer, UI, and level content.

export type ReqType =
  | 'read'
  | 'write'
  | 'static'
  | 'job'
  | 'search'
  | 'graph'
  | 'ingest'
  | 'txn'
  | 'attack';

export const REQ_TYPES: ReqType[] = ['read', 'write', 'static', 'job', 'search', 'graph', 'ingest', 'txn', 'attack'];

export const REQ_META: Record<ReqType, { label: string; color: string; desc: string }> = {
  read: { label: 'Read', color: '#38bdf8', desc: 'GET a page or record (needs data from a store)' },
  write: { label: 'Write', color: '#fb923c', desc: 'Create/update a record (must be durably stored)' },
  static: { label: 'Static', color: '#4ade80', desc: 'Images, CSS, JS — files that rarely change' },
  job: { label: 'Job', color: '#c084fc', desc: 'Heavy background work: encode video, send email, crunch data' },
  search: { label: 'Search', color: '#facc15', desc: 'Full-text query over many records' },
  graph: { label: 'Graph', color: '#f472b6', desc: 'Relationship traversal: friends-of-friends' },
  ingest: { label: 'Ingest', color: '#2dd4bf', desc: 'High-volume append-only events: logs, clicks, transactions' },
  txn: { label: 'Txn', color: '#a3e635', desc: 'Multi-row ACID transaction: payments, inventory' },
  attack: { label: 'Attack', color: '#f43f5e', desc: 'Malicious payload: SQL injection, XSS' },
};

export type Region = 'us' | 'eu' | 'ap';
export const REGIONS: Region[] = ['us', 'eu', 'ap'];
export const REGION_LABEL: Record<Region, string> = { us: 'US-East', eu: 'EU-West', ap: 'AP-South' };

export type NodeKind =
  | 'users'
  | 'dns'
  | 'cdn'
  | 'lb'
  | 'proxy'
  | 'gateway'
  | 'app'
  | 'worker'
  | 'queue'
  | 'pubsub'
  | 'cache'
  | 'sql'
  | 'kv'
  | 'document'
  | 'widecolumn'
  | 'graphdb'
  | 'search'
  | 'objstore'
  | 'shardrouter';

export type TierId = 'S' | 'M' | 'L' | 'XL';

export interface DesignNode {
  id: string;
  kind: NodeKind;
  x: number; // tile coordinates (top-left)
  y: number;
  name?: string;
  tier?: TierId;
  region?: Region;
  config: Record<string, any>;
  locked?: boolean; // placed by the level; cannot be deleted or moved
}

export interface DesignEdge {
  id: string;
  from: string;
  to: string;
  filter?: ReqType[]; // allowed request types; undefined = all (only honored by L7-aware senders)
}

export interface Design {
  nodes: DesignNode[];
  edges: DesignEdge[];
}

// ---------------------------------------------------------------------------
// Traffic

export interface TrafficPhase {
  at: number; // seconds from start
  rps: number; // target rate at this point (linearly interpolated to next phase)
  mix?: Partial<Record<ReqType, number>>; // overrides source mix from this phase on
  label?: string;
}

export interface TrafficSource {
  id: string; // must match a DesignNode of kind 'users'
  region?: Region;
  phases: TrafficPhase[];
  mix: Partial<Record<ReqType, number>>;
  users?: number; // distinct user ids
  bot?: boolean; // traffic from a botnet — not counted as legit
  botUsers?: number; // number of distinct bot identities (small = easy to rate limit)
  domains?: Record<string, number>; // federation / microservice domain weights
}

export interface KeyspaceConfig {
  keys: number; // distinct data keys
  skew: number; // zipf exponent: 0 = uniform, 1 = classic web skew, 1.3 = very hot
  staticKeys?: number;
  staticSkew?: number;
}

// ---------------------------------------------------------------------------
// Chaos

export type ChaosEvent =
  | { at: number; type: 'crash'; target: string; recoverAfter?: number; note?: string }
  | { at: number; type: 'partition'; regions: [Region, Region]; duration: number; note?: string }
  | { at: number; type: 'region-outage'; region: Region; duration?: number; note?: string }
  | { at: number; type: 'slow'; target: string; factor: number; duration: number; note?: string }
  | { at: number; type: 'hotkey'; key: number; share: number; duration: number; note?: string }
  | { at: number; type: 'flush'; target: string; note?: string }
  | { at: number; type: 'notice'; note: string };

// ---------------------------------------------------------------------------
// Objectives

export type ObjectiveKind =
  | 'success' // % legit requests OK
  | 'p50'
  | 'p95'
  | 'p99'
  | 'cost' // avg $/mo
  | 'stale' // % of reads that returned stale data
  | 'dataLoss' // acknowledged writes lost
  | 'breaches'
  | 'conflicts'
  | 'anomalies'
  | 'jobP95' // background job completion p95 (ms)
  | 'availability' // % of seconds with >= 99% success
  | 'offload'; // % of `types` requests served by `by` kinds

export interface Objective {
  kind: ObjectiveKind;
  target: number;
  types?: ReqType[]; // restrict latency / success objectives to these types
  by?: NodeKind[]; // for offload
  star?: 1 | 2 | 3; // 1 = required to pass, 2/3 = bonus stars
  label?: string;
}

/** The parts of a level the simulation needs. */
export interface SimLevel {
  duration: number; // seconds of simulated time
  warmup?: number; // seconds excluded from scoring
  sources: TrafficSource[];
  keyspace: KeyspaceConfig;
  chaos?: ChaosEvent[];
  timeout?: number; // client timeout (s)
  appServes?: ReqType[]; // app may answer these with no data tier (tutorial levels)
  joinShare?: number; // fraction of reads that are multi-table joins
  jobMs?: number; // override worker job time
  fanout?: number; // timeline fan-out factor for writes processed by workers
  failures?: { kinds: NodeKind[]; mtbf: number; mttr: number }; // random failures (seconds)
  scale?: number; // requests per packet (auto when omitted)
  seed?: number;
  defaultRegion?: Region;
  sessions?: boolean; // model login sessions on app servers
}

// ---------------------------------------------------------------------------
// Packets (runtime)

export interface Packet {
  id: number;
  type: ReqType;
  key: number;
  user: number;
  region: Region;
  domain?: string;
  born: number;
  scale: number; // real requests represented by this packet
  bot: boolean;
  ghost: boolean; // internal traffic (replication, flushes) — not counted in user metrics
  ghostKind?: 'apply' | 'flush' | 'refresh' | 'session' | 'fanout' | 'migrate' | 'job';
  ver: number; // write version
  returnLat: number; // accumulated one-way return latency (s)
  enqAt: number;
  hops: number;
  path: string[]; // node ids visited (for upstream bounce + traces)
  fills?: string[]; // caches to populate when the read is answered
  wtCache?: string; // write-through cache to update on commit
  tls: boolean; // still encrypted (needs termination)
  async?: boolean; // background part of a request already acknowledged
  jobBorn?: number;
  trace?: TraceHop[];
  sticky?: number;
  meta?: any;
}

export interface TraceHop {
  node: string;
  arrive: number;
  start?: number;
  end?: number;
  note?: string;
}

export type FailReason =
  | 'overload' // queue full -> 503
  | 'timeout'
  | 'down' // connection refused / node crashed
  | 'noroute' // nothing downstream can handle this type
  | 'session' // session lost (stateful servers)
  | 'rejected' // back pressure rejection
  | 'readonly' // write sent to a replica
  | 'unavailable' // CP system refusing during partition
  | 'notpersisted' // write never reached durable storage
  | 'ratelimited';

export const FAIL_LABEL: Record<FailReason, string> = {
  overload: 'Overloaded (503)',
  timeout: 'Timed out',
  down: 'Server down',
  noroute: 'No route',
  session: 'Session lost',
  rejected: 'Rejected (back pressure)',
  readonly: 'Write to read-only replica',
  unavailable: 'Unavailable (no quorum)',
  notpersisted: 'Not persisted',
  ratelimited: 'Rate limited',
};

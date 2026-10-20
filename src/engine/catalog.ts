// Component catalog: every buildable thing, its tiers, costs, speeds and settings.
// Numbers are simplified but keep real-world *ratios* (memory << SSD << disk << network hops).

import type { NodeKind, ReqType, TierId } from './types';

export interface TierSpec {
  id: TierId;
  label: string;
  cost: number; // $/month
  slots: number; // concurrent requests (threads / connections / cores)
  mem?: number; // cache objects held (cache, cdn)
}

export interface FieldOption {
  value: string | number | boolean;
  label: string;
  hint?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'select' | 'toggle' | 'number';
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  default: any;
  help: string;
  feature?: string; // only shown when the level unlocks this feature
  showIf?: (cfg: Record<string, any>) => boolean;
}

export type Category = 'edge' | 'compute' | 'async' | 'data' | 'storage';

export interface ComponentSpec {
  kind: NodeKind;
  name: string;
  short: string;
  category: Category;
  icon: string; // lucide icon name (PascalCase)
  color: string;
  blurb: string;
  codex: string;
  tiers?: TierSpec[];
  cost?: number; // flat $/month when no tiers
  slots?: number; // when no tiers
  perNode?: boolean; // nosql: cost & slots multiply by `nodes`
  boot: number; // seconds to provision when added mid-run
  svc: Partial<Record<ReqType, number>>; // ms of work this node does per request
  accepts: ReqType[];
  fields: ConfigField[];
  placeable?: boolean;
}

const ALL: ReqType[] = ['read', 'write', 'static', 'job', 'search', 'graph', 'ingest', 'txn', 'attack'];

const instancesFields = (unit: string): ConfigField[] => [
  {
    key: 'instances',
    label: 'Instances',
    type: 'number',
    min: 1,
    max: 20,
    step: 1,
    default: 1,
    feature: 'instances',
    help: `How many identical ${unit} run in this group. Capacity and cost scale linearly. Needs a load balancer (or queue) in front to spread traffic — otherwise everyone hits the first instance.`,
  },
  {
    key: 'autoscale',
    label: 'Autoscaling',
    type: 'toggle',
    default: false,
    feature: 'autoscale',
    help: 'Add instances when utilization stays above ~70% and remove them when it drops. New instances take time to boot — autoscaling reacts, it does not predict.',
  },
  {
    key: 'maxInstances',
    label: 'Max instances',
    type: 'number',
    min: 1,
    max: 20,
    step: 1,
    default: 8,
    feature: 'autoscale',
    showIf: (c) => !!c.autoscale,
    help: 'Upper bound for the autoscaler — protects your budget from runaway scaling.',
  },
];

export const CATALOG: Record<NodeKind, ComponentSpec> = {
  users: {
    kind: 'users',
    name: 'Users',
    short: 'USERS',
    category: 'edge',
    icon: 'Users',
    color: '#94a3b8',
    blurb: 'Real people (and sometimes bots) sending requests to your system.',
    codex: 'latency-throughput',
    cost: 0,
    slots: 1,
    boot: 0,
    svc: {},
    accepts: [],
    fields: [],
    placeable: false,
  },
  dns: {
    kind: 'dns',
    name: 'DNS',
    short: 'DNS',
    category: 'edge',
    icon: 'Signpost',
    color: '#a78bfa',
    blurb: 'Translates your domain into an IP. Smart DNS steers users to the nearest healthy region.',
    codex: 'dns',
    cost: 10,
    slots: 5000,
    boot: 2,
    svc: Object.fromEntries(ALL.map((t) => [t, 0.05])) as any,
    accepts: ALL,
    fields: [
      {
        key: 'policy',
        label: 'Routing policy',
        type: 'select',
        default: 'geo',
        options: [
          { value: 'geo', label: 'Geo / latency', hint: 'Send users to the closest healthy region' },
          { value: 'round-robin', label: 'Round robin', hint: 'Rotate through targets regardless of location' },
          { value: 'failover', label: 'Failover', hint: 'Primary target only; secondary when primary is unhealthy' },
        ],
        help: 'How DNS picks which target IP to hand back to each user.',
      },
      {
        key: 'ttl',
        label: 'Record TTL',
        type: 'select',
        default: 60,
        options: [
          { value: 10, label: '10 s', hint: 'Fast failover, more lookups (latency)' },
          { value: 60, label: '60 s' },
          { value: 300, label: '5 min', hint: 'Few lookups, slow failover' },
        ],
        help: 'Resolvers cache answers for this long. Low TTL = faster failover but more DNS lookups (each adds ~30 ms). High TTL = users keep hitting a dead region until it expires.',
      },
    ],
  },
  cdn: {
    kind: 'cdn',
    name: 'CDN',
    short: 'CDN',
    category: 'edge',
    icon: 'Globe',
    color: '#22d3ee',
    blurb: 'Edge servers near every user cache static files. Cuts latency and origin load.',
    codex: 'cdn',
    tiers: [
      { id: 'S', label: 'Starter', cost: 40, slots: 20, mem: 4000 },
      { id: 'M', label: 'Business', cost: 120, slots: 80, mem: 20000 },
      { id: 'L', label: 'Enterprise', cost: 320, slots: 300, mem: 100000 },
    ],
    boot: 15,
    svc: { static: 2, read: 0.5, write: 0.5, job: 0.5, search: 0.5, graph: 0.5, ingest: 0.5, txn: 0.5, attack: 0.5 },
    accepts: ALL,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        default: 'pull',
        feature: 'cdnPush',
        options: [
          { value: 'pull', label: 'Pull', hint: 'Fetch from origin on first request, cache until TTL' },
          { value: 'push', label: 'Push', hint: 'You upload everything up front; storage billed for the whole catalog' },
        ],
        help: 'Pull CDNs fill lazily (first request is slow, nothing to manage). Push CDNs are pre-loaded (no origin traffic) but you pay to store every file and must re-push on change.',
      },
      {
        key: 'ttl',
        label: 'Cache TTL',
        type: 'select',
        default: 300,
        options: [
          { value: 30, label: '30 s' },
          { value: 300, label: '5 min' },
          { value: 3600, label: '1 hour' },
        ],
        help: 'How long edges keep a file before re-checking origin. Longer = higher hit rate, slower to pick up changes.',
      },
    ],
  },
  lb: {
    kind: 'lb',
    name: 'Load Balancer',
    short: 'LB',
    category: 'edge',
    icon: 'Split',
    color: '#f59e0b',
    blurb: 'Spreads traffic across many servers and routes around dead ones.',
    codex: 'load-balancer',
    cost: 25,
    slots: 400,
    boot: 5,
    svc: Object.fromEntries(ALL.map((t) => [t, 0.3])) as any,
    accepts: ALL,
    fields: [
      {
        key: 'algorithm',
        label: 'Algorithm',
        type: 'select',
        default: 'round-robin',
        options: [
          { value: 'round-robin', label: 'Round robin', hint: 'Each server in turn' },
          { value: 'least-conn', label: 'Least connections', hint: 'Server with the fewest active requests' },
          { value: 'random', label: 'Random' },
          { value: 'ip-hash', label: 'IP hash (sticky)', hint: 'Same user always hits the same server' },
        ],
        help: 'Least-connections adapts to uneven servers; IP hash gives "sticky sessions" but breaks when a server dies.',
      },
      {
        key: 'layer',
        label: 'Layer',
        type: 'select',
        default: 'L4',
        feature: 'l7',
        options: [
          { value: 'L4', label: 'Layer 4 (TCP)', hint: 'Fast; sees only IPs and ports' },
          { value: 'L7', label: 'Layer 7 (HTTP)', hint: 'Reads the request; can route by type/path; terminates TLS' },
        ],
        help: 'Layer 7 can honor per-belt request filters (e.g. send /static to one pool, /api to another) and terminate TLS, at slightly higher cost per request.',
      },
      {
        key: 'healthChecks',
        label: 'Health checks',
        type: 'toggle',
        default: true,
        help: 'Ping each server every couple of seconds and stop sending traffic to dead or booting ones.',
      },
      {
        key: 'ha',
        label: 'HA pair (active-passive)',
        type: 'toggle',
        default: false,
        feature: 'ha',
        help: 'A standby load balancer takes over if this one dies (≈2 s of failover). Doubles cost. Without it, the LB is a single point of failure.',
      },
    ],
  },
  proxy: {
    kind: 'proxy',
    name: 'Reverse Proxy',
    short: 'PROXY',
    category: 'edge',
    icon: 'Shield',
    color: '#60a5fa',
    blurb: 'A web server (nginx) in front of your apps: terminates TLS, caches and compresses static files.',
    codex: 'reverse-proxy',
    cost: 30,
    slots: 120,
    boot: 4,
    svc: { ...(Object.fromEntries(ALL.map((t) => [t, 0.5])) as any), static: 1 },
    accepts: ALL,
    fields: [
      {
        key: 'tls',
        label: 'TLS termination',
        type: 'toggle',
        default: true,
        help: 'Decrypt HTTPS here so app servers do not spend CPU on encryption.',
      },
      {
        key: 'cacheStatic',
        label: 'Cache static files',
        type: 'toggle',
        default: true,
        help: 'Keep a small in-memory cache of popular static files (web server caching).',
      },
      {
        key: 'compression',
        label: 'Compression',
        type: 'toggle',
        default: true,
        help: 'gzip/brotli responses — smaller payloads transfer faster, at a little CPU.',
      },
    ],
  },
  gateway: {
    kind: 'gateway',
    name: 'API Gateway',
    short: 'GATE',
    category: 'edge',
    icon: 'ShieldCheck',
    color: '#f87171',
    blurb: 'Front door for APIs: WAF filtering, rate limiting, auth and L7 routing to services.',
    codex: 'security',
    cost: 60,
    slots: 200,
    boot: 5,
    svc: Object.fromEntries(ALL.map((t) => [t, 1])) as any,
    accepts: ALL,
    fields: [
      {
        key: 'waf',
        label: 'Web application firewall',
        type: 'toggle',
        default: true,
        help: 'Inspect payloads and block known attack patterns (SQL injection, XSS). Catches most, not all.',
      },
      {
        key: 'rateLimit',
        label: 'Rate limit per client',
        type: 'select',
        default: 0,
        options: [
          { value: 0, label: 'Off' },
          { value: 50, label: '50 req/s' },
          { value: 10, label: '10 req/s' },
          { value: 2, label: '2 req/s', hint: 'Strict — may throttle real users' },
        ],
        help: 'Token bucket per client identity. Stops floods from a handful of abusive clients; too strict and you throttle real users.',
      },
    ],
  },
  app: {
    kind: 'app',
    name: 'App Server',
    short: 'APP',
    category: 'compute',
    icon: 'Server',
    color: '#34d399',
    blurb: 'Runs your application code. Handles each request, then talks to data stores.',
    codex: 'scaling',
    tiers: [
      { id: 'S', label: '2 vCPU', cost: 40, slots: 8 },
      { id: 'M', label: '4 vCPU', cost: 85, slots: 16 },
      { id: 'L', label: '8 vCPU', cost: 190, slots: 32 },
      { id: 'XL', label: '16 vCPU', cost: 450, slots: 64 },
    ],
    boot: 10,
    svc: { read: 8, write: 10, static: 5, job: 1500, search: 10, graph: 10, ingest: 4, txn: 12, attack: 8 },
    accepts: ALL,
    fields: [
      {
        key: 'sessions',
        label: 'Session storage',
        type: 'select',
        default: 'local',
        feature: 'sessions',
        options: [
          { value: 'local', label: 'Local memory', hint: 'Stateful: session lives on this server' },
          { value: 'external', label: 'External store', hint: 'Stateless: sessions in a shared cache' },
        ],
        help: 'Local sessions are fast but tie each user to one server. External sessions (in a cache wired to this app) make every server interchangeable.',
      },
      {
        key: 'sanitize',
        label: 'Parameterized queries',
        type: 'toggle',
        default: false,
        feature: 'sanitize',
        help: 'Sanitize all user input and never build SQL by string concatenation. Defense in depth — blocks injection even if it slips past the edge. ~5% CPU.',
      },
      ...instancesFields('servers'),
    ],
  },
  worker: {
    kind: 'worker',
    name: 'Worker',
    short: 'WORK',
    category: 'async',
    icon: 'Cog',
    color: '#c084fc',
    blurb: 'Background processor. Pulls jobs from a queue and grinds through them.',
    codex: 'asynchronism',
    tiers: [
      { id: 'S', label: '2 vCPU', cost: 35, slots: 4 },
      { id: 'M', label: '4 vCPU', cost: 75, slots: 8 },
      { id: 'L', label: '8 vCPU', cost: 170, slots: 16 },
    ],
    boot: 10,
    svc: { job: 1000, write: 5, ingest: 3 },
    accepts: ['job', 'write', 'ingest'],
    fields: [...instancesFields('workers')],
  },
  queue: {
    kind: 'queue',
    name: 'Message Queue',
    short: 'QUEUE',
    category: 'async',
    icon: 'ListOrdered',
    color: '#e879f9',
    blurb: 'Accepts work instantly and holds it until workers are free. Smooths bursts.',
    codex: 'message-queues',
    cost: 30,
    slots: 2000,
    boot: 4,
    svc: { job: 2, write: 2, ingest: 1 },
    accepts: ['job', 'write', 'ingest'],
    fields: [
      {
        key: 'maxDepth',
        label: 'Max depth',
        type: 'select',
        default: 10000,
        options: [
          { value: 500, label: '500' },
          { value: 10000, label: '10k' },
          { value: 200000, label: '200k' },
          { value: 0, label: 'Unbounded', hint: 'Never rejects — jobs may wait forever' },
        ],
        help: 'When the queue is full new work is rejected (back pressure) so clients can retry later, instead of letting the backlog grow without limit.',
      },
    ],
  },
  pubsub: {
    kind: 'pubsub',
    name: 'Pub/Sub Topic',
    short: 'TOPIC',
    category: 'async',
    icon: 'RadioTower',
    color: '#f0abfc',
    blurb: 'Publishes each event to every subscriber. One producer, many independent consumers.',
    codex: 'message-queues',
    cost: 30,
    slots: 2000,
    boot: 4,
    svc: { job: 1, write: 1, ingest: 1 },
    accepts: ['job', 'write', 'ingest'],
    fields: [],
  },
  cache: {
    kind: 'cache',
    name: 'Cache',
    short: 'CACHE',
    category: 'data',
    icon: 'Zap',
    color: '#fbbf24',
    blurb: 'In-memory key-value store (Redis/Memcached). Memory is ~100x faster than disk.',
    codex: 'cache',
    tiers: [
      { id: 'S', label: '1 GB', cost: 45, slots: 40, mem: 1000 },
      { id: 'M', label: '4 GB', cost: 110, slots: 60, mem: 4000 },
      { id: 'L', label: '16 GB', cost: 260, slots: 80, mem: 16000 },
      { id: 'XL', label: '64 GB', cost: 600, slots: 120, mem: 64000 },
    ],
    boot: 6,
    svc: { read: 0.6, write: 0.6, search: 0.6, graph: 0.6 },
    accepts: ['read', 'write', 'search', 'graph'],
    fields: [
      {
        key: 'policy',
        label: 'Update strategy',
        type: 'select',
        default: 'cache-aside',
        feature: 'cachePolicy',
        options: [
          { value: 'cache-aside', label: 'Cache-aside', hint: 'Read: check cache, else DB then fill. Write: update DB, delete cache key' },
          { value: 'write-through', label: 'Write-through', hint: 'Writes go through the cache to the DB synchronously' },
          { value: 'write-behind', label: 'Write-behind', hint: 'Writes ack from cache; flushed to DB later in batches' },
          { value: 'ttl-only', label: 'TTL only', hint: 'Never invalidate; entries just expire' },
        ],
        help: 'When and how the cache learns about writes. This is the classic speed vs. freshness vs. durability trade-off.',
      },
      {
        key: 'ttl',
        label: 'TTL',
        type: 'select',
        default: 60,
        options: [
          { value: 5, label: '5 s' },
          { value: 30, label: '30 s' },
          { value: 60, label: '60 s' },
          { value: 600, label: '10 min' },
          { value: 0, label: 'Never expire' },
        ],
        help: 'Time-to-live per entry. Long TTL = more hits but staler data.',
      },
      {
        key: 'refreshAhead',
        label: 'Refresh-ahead',
        type: 'toggle',
        default: false,
        feature: 'cachePolicy',
        help: 'Proactively reload hot entries shortly before they expire, so popular keys never miss. Costs extra DB reads for keys that are not re-read.',
      },
    ],
  },
  sql: {
    kind: 'sql',
    name: 'SQL Database',
    short: 'SQL',
    category: 'data',
    icon: 'Database',
    color: '#818cf8',
    blurb: 'Relational database (Postgres/MySQL). ACID, joins, indexes. Hard to scale writes.',
    codex: 'rdbms',
    tiers: [
      { id: 'S', label: '2 vCPU', cost: 70, slots: 10 },
      { id: 'M', label: '4 vCPU', cost: 160, slots: 20 },
      { id: 'L', label: '8 vCPU', cost: 380, slots: 40 },
      { id: 'XL', label: '32 vCPU', cost: 950, slots: 80 },
    ],
    boot: 25,
    svc: { read: 10, write: 20, search: 250, graph: 120, ingest: 15, txn: 25 },
    accepts: ['read', 'write', 'search', 'graph', 'ingest', 'txn'],
    fields: [
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        default: 'primary',
        feature: 'replication',
        options: [
          { value: 'primary', label: 'Primary (master)', hint: 'Accepts reads and writes' },
          { value: 'replica', label: 'Read replica', hint: 'Read-only copy, slightly behind' },
          { value: 'standby', label: 'Hot standby', hint: 'Receives replication, serves nothing, promoted on failure' },
        ],
        help: 'Wire primary → replica to replicate. Replicas scale reads (not writes) and lag slightly behind the primary.',
      },
      {
        key: 'replication',
        label: 'Replication',
        type: 'select',
        default: 'async',
        feature: 'replication',
        showIf: (c) => (c.role ?? 'primary') === 'primary',
        options: [
          { value: 'async', label: 'Asynchronous', hint: 'Fast writes; recent writes can be lost on failover' },
          { value: 'sync', label: 'Synchronous', hint: 'Writes wait for replicas; no loss, slower, fails if replicas unreachable' },
        ],
        help: 'Async: commit locally, ship later. Sync: a write is acknowledged only after replicas have it.',
      },
      {
        key: 'autoFailover',
        label: 'Automatic failover',
        type: 'toggle',
        default: false,
        feature: 'failover',
        showIf: (c) => (c.role ?? 'primary') === 'primary',
        help: 'If this primary dies, promote a standby (or replica) after ~8 s of failed heartbeats. Apps must be wired to the promoted node.',
      },
      {
        key: 'indexes',
        label: 'Indexes',
        type: 'toggle',
        default: true,
        feature: 'tuning',
        help: 'B-tree indexes turn full-table scans into lookups (reads ~5x faster) but every write must update them (~20% slower writes).',
      },
      {
        key: 'denormalized',
        label: 'Denormalized schema',
        type: 'toggle',
        default: false,
        feature: 'tuning',
        help: 'Store redundant copies of data so reads avoid expensive joins. Writes get slower (update every copy).',
      },
      {
        key: 'domain',
        label: 'Holds data for',
        type: 'select',
        default: 'all',
        feature: 'federation',
        options: [
          { value: 'all', label: 'Everything' },
          { value: 'users', label: 'Users' },
          { value: 'products', label: 'Products' },
          { value: 'orders', label: 'Orders' },
        ],
        help: 'Federation: split databases by function. Each DB only gets its own domain\'s traffic.',
      },
    ],
  },
  kv: {
    kind: 'kv',
    name: 'Key-Value Store',
    short: 'KV',
    category: 'data',
    icon: 'KeyRound',
    color: '#fb7185',
    blurb: 'Dynamo-style hash map at scale. Blazing get/put by key; no joins, no multi-key transactions.',
    codex: 'nosql-kv',
    cost: 90,
    slots: 30,
    perNode: true,
    boot: 12,
    svc: { read: 2, write: 3, ingest: 2, graph: 30, txn: 4 },
    accepts: ['read', 'write', 'ingest', 'graph', 'txn'],
    fields: [
      { key: 'nodes', label: 'Nodes', type: 'number', min: 1, max: 16, step: 1, default: 3, help: 'Data is partitioned across nodes automatically. Add nodes to scale linearly.' },
      {
        key: 'consistency',
        label: 'Read consistency',
        type: 'select',
        default: 'eventual',
        feature: 'consistency',
        options: [
          { value: 'eventual', label: 'Eventual', hint: 'Read any replica: fast, may be stale' },
          { value: 'strong', label: 'Strong (quorum)', hint: 'Read a majority: ~2x slower, never stale' },
        ],
        help: 'Tunable consistency: quorum reads see the latest write at the cost of latency.',
      },
    ],
  },
  document: {
    kind: 'document',
    name: 'Document Store',
    short: 'DOC',
    category: 'data',
    icon: 'FileBraces',
    color: '#4ade80',
    blurb: 'MongoDB-style JSON documents. Flexible schema, secondary indexes, scales out.',
    codex: 'nosql-document',
    cost: 100,
    slots: 20,
    perNode: true,
    boot: 15,
    svc: { read: 5, write: 6, search: 40, ingest: 5, graph: 60, txn: 8 },
    accepts: ['read', 'write', 'search', 'ingest', 'graph', 'txn'],
    fields: [
      { key: 'nodes', label: 'Nodes', type: 'number', min: 1, max: 12, step: 1, default: 3, help: 'Shards documents across nodes.' },
      {
        key: 'consistency',
        label: 'Read consistency',
        type: 'select',
        default: 'eventual',
        feature: 'consistency',
        options: [
          { value: 'eventual', label: 'Eventual' },
          { value: 'strong', label: 'Strong (majority)' },
        ],
        help: 'Majority reads never return stale data but cost more.',
      },
    ],
  },
  widecolumn: {
    kind: 'widecolumn',
    name: 'Wide-Column Store',
    short: 'WIDE',
    category: 'data',
    icon: 'Columns3',
    color: '#2dd4bf',
    blurb: 'Cassandra/Bigtable. Log-structured writes are dirt cheap — built for massive write volume.',
    codex: 'nosql-widecolumn',
    cost: 110,
    slots: 30,
    perNode: true,
    boot: 15,
    svc: { read: 8, write: 2, ingest: 1.5, graph: 80, txn: 5 },
    accepts: ['read', 'write', 'ingest', 'graph', 'txn'],
    fields: [
      { key: 'nodes', label: 'Nodes', type: 'number', min: 1, max: 16, step: 1, default: 3, help: 'Peer-to-peer ring; capacity grows linearly with nodes.' },
      {
        key: 'consistency',
        label: 'Read consistency',
        type: 'select',
        default: 'eventual',
        feature: 'consistency',
        options: [
          { value: 'eventual', label: 'ONE (eventual)' },
          { value: 'strong', label: 'QUORUM (strong)' },
        ],
        help: 'Read from one replica (fast, maybe stale) or a quorum (slower, consistent).',
      },
    ],
  },
  graphdb: {
    kind: 'graphdb',
    name: 'Graph Database',
    short: 'GRAPH',
    category: 'data',
    icon: 'Share2',
    color: '#f472b6',
    blurb: 'Neo4j-style nodes & edges. Traversals are pointer-chasing, not joins. Hard to shard.',
    codex: 'nosql-graph',
    cost: 180,
    slots: 20,
    perNode: true,
    boot: 20,
    svc: { graph: 6, read: 6, write: 15, txn: 30, ingest: 20 },
    accepts: ['graph', 'read', 'write', 'txn', 'ingest'],
    fields: [{ key: 'nodes', label: 'Nodes', type: 'number', min: 1, max: 3, step: 1, default: 1, help: 'Graphs are hard to partition — most graph DBs scale up, not out.' }],
  },
  search: {
    kind: 'search',
    name: 'Search Index',
    short: 'SEARCH',
    category: 'data',
    icon: 'Search',
    color: '#facc15',
    blurb: 'Inverted index (Elasticsearch/Lucene). Full-text queries in milliseconds instead of table scans.',
    codex: 'search-index',
    tiers: [
      { id: 'S', label: '2 shards', cost: 120, slots: 20 },
      { id: 'M', label: '4 shards', cost: 280, slots: 40 },
      { id: 'L', label: '8 shards', cost: 640, slots: 80 },
    ],
    boot: 20,
    svc: { search: 8 },
    accepts: ['search'],
    fields: [],
  },
  objstore: {
    kind: 'objstore',
    name: 'Object Storage',
    short: 'S3',
    category: 'storage',
    icon: 'Archive',
    color: '#a3e635',
    blurb: 'S3-style blob storage. Practically infinite, cheap, durable — and a bit slow per request.',
    codex: 'object-storage',
    cost: 15,
    slots: 3000,
    boot: 3,
    svc: { static: 25 },
    accepts: ['static'],
    fields: [],
  },
  shardrouter: {
    kind: 'shardrouter',
    name: 'Shard Router',
    short: 'SHARD',
    category: 'data',
    icon: 'Network',
    color: '#93c5fd',
    blurb: 'Routes each key to the shard that owns it. Wire it to several databases — or several caches to build a cache cluster.',
    codex: 'sharding',
    cost: 40,
    slots: 400,
    boot: 4,
    svc: { read: 0.4, write: 0.4, search: 0.4, graph: 0.4, ingest: 0.4, txn: 0.4 },
    accepts: ['read', 'write', 'search', 'graph', 'ingest', 'txn'],
    fields: [
      {
        key: 'strategy',
        label: 'Partitioning',
        type: 'select',
        default: 'hash',
        options: [
          { value: 'hash', label: 'Hash (key mod N)', hint: 'Even spread; adding a shard moves most keys' },
          { value: 'range', label: 'Range', hint: 'Keys 0..k on shard 1, etc. Simple, but hot ranges overload one shard' },
          { value: 'consistent', label: 'Consistent hashing', hint: 'Even spread; adding a shard moves only ~1/N keys' },
        ],
        help: 'How keys map to shards. This decides balance and how painful resharding is.',
      },
    ],
  },
};

export const PLACEABLE: NodeKind[] = (Object.keys(CATALOG) as NodeKind[]).filter((k) => CATALOG[k].placeable !== false);

export function tierOf(kind: NodeKind, tier?: TierId): TierSpec | undefined {
  const spec = CATALOG[kind];
  if (!spec.tiers) return undefined;
  return spec.tiers.find((t) => t.id === tier) ?? spec.tiers[0];
}

/** Monthly cost of a design node with its current config. */
export function nodeCost(kind: NodeKind, tier: TierId | undefined, cfg: Record<string, any>, extra?: { staticKeys?: number }): number {
  const spec = CATALOG[kind];
  const t = tierOf(kind, tier);
  let cost = t ? t.cost : spec.cost ?? 0;
  if (spec.perNode) cost *= cfg.nodes ?? 1;
  if (kind === 'app' || kind === 'worker') cost *= cfg.instances ?? 1;
  if (kind === 'lb' && cfg.ha) cost *= 2;
  if (kind === 'cdn' && cfg.mode === 'push') cost += Math.ceil((extra?.staticKeys ?? 2000) / 1000) * 12;
  if (kind === 'sql' && cfg.replication === 'sync') cost += 0;
  return cost;
}

/** Nominal capacity in requests/second for the most common request type. */
export function nominalCapacity(kind: NodeKind, tier: TierId | undefined, cfg: Record<string, any>, type?: ReqType): number {
  const spec = CATALOG[kind];
  const t = tierOf(kind, tier);
  let slots = t ? t.slots : spec.slots ?? 1;
  if (spec.perNode) slots *= cfg.nodes ?? 1;
  if (kind === 'app' || kind === 'worker') slots *= cfg.instances ?? 1;
  const ty = type ?? (spec.svc.read !== undefined ? 'read' : (Object.keys(spec.svc)[0] as ReqType));
  const ms = spec.svc[ty] ?? 1;
  return (slots / ms) * 1000;
}

export function defaultConfig(kind: NodeKind): Record<string, any> {
  const cfg: Record<string, any> = {};
  for (const f of CATALOG[kind].fields) cfg[f.key] = f.default;
  return cfg;
}

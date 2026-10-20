import type { Track } from '../types';
import { C, code, compare, diagram, fr, l, n, steps } from './dsl';

const U = (y = 1, extra = {}) => n('u', 'Users', 'user', 0, y, extra);

export const TRACKS_2: Track[] = [
  // =========================================================================
  {
    id: 'edge',
    title: 'Traffic & Edge',
    icon: 'Globe',
    color: '#22d3ee',
    blurb: 'DNS, CDNs, load balancers and reverse proxies.',
    lectures: [
      {
        id: 'dns',
        title: 'DNS',
        blurb: 'Names to addresses, with caching and routing.',
        minutes: 3,
        codex: 'dns',
        slides: [
          {
            t: 'How a lookup works',
            v: steps(['Browser / OS cache', 'Recently resolved? Use it.'], ['Resolver (ISP)', 'Asks the hierarchy if it doesn\'t know.'], ['Root → .com → authoritative', 'Each level points to the next.'], ['Answer cached for the TTL', 'Everyone along the way remembers it.']),
          },
          { t: 'Record types', pts: ['A — name → IP address', 'CNAME — name → another name', 'NS — the authoritative servers', 'MX — the mail servers'] },
          {
            t: 'Smart routing',
            v: diagram(fr('Geo-DNS sends each user to the nearest healthy region.', [n('eu', 'Users EU', 'user', 0, 0.3), n('ap', 'Users Asia', 'user', 0, 1.7), n('d', 'Geo-DNS', 'dns', 1.4, 1), n('r1', 'EU region', 'region', 3, 0.3), n('r2', 'Asia region', 'region', 3, 1.7)], [l('eu', 'd', { rate: 1 }), l('ap', 'd', { rate: 1 }), l('d', 'r1'), l('d', 'r2')])),
            b: 'Also weighted round robin, latency-based routing and health-checked failover.',
          },
          { t: 'The TTL trade-off', v: compare('Short TTL', ['Fast failover', 'More lookups (latency, cost)'], 'Long TTL', ['Fewer lookups', 'Users stuck on a dead region']) },
        ],
      },
      {
        id: 'cdn',
        title: 'CDNs',
        blurb: 'Serve files from next door.',
        minutes: 3,
        codex: 'cdn',
        slides: [
          {
            t: 'Without vs with a CDN',
            v: diagram(
              fr('Every image crosses the ocean to your origin.', [n('u', 'Users Asia', 'user', 0, 1), n('o', 'Origin US', 'app', 3, 1)], [l('u', 'o', { color: C.static, speed: 3, back: true })]),
              fr('An edge in the same city serves cached copies.', [n('u', 'Users Asia', 'user', 0, 1), n('e', 'CDN edge', 'cdn', 1.4, 1, { state: 'new' }), n('o', 'Origin US', 's3', 3, 1)], [l('u', 'e', { color: C.static, speed: 0.6, back: true }), l('e', 'o', { color: C.static, rate: 1, speed: 3 })]),
            ),
          },
          { t: 'Push vs pull', v: compare('Push CDN', ['You upload ahead of time', 'No first-request miss', 'Pay to store everything', 'Small, stable catalogs'], 'Pull CDN', ['Fetches on first request', 'Cached until TTL', 'Stores only what\'s used', 'Heavy traffic, big catalogs']) },
          { t: 'Downsides', pts: ['Cost scales with traffic', 'Stale content until TTL expires', 'URLs must point at the CDN'] },
        ],
      },
      {
        id: 'lb',
        title: 'Load balancers',
        blurb: 'Spread load, route around failure.',
        minutes: 4,
        codex: 'load-balancer',
        slides: [
          {
            t: 'What they do',
            v: diagram(
              fr('Distribute requests across servers.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a', 'App 1', 'app', 2.6, 0), n('b', 'App 2', 'app', 2.6, 1), n('c', 'App 3', 'app', 2.6, 2)], [l('u', 'lb', { rate: 3 }), l('lb', 'a'), l('lb', 'b'), l('lb', 'c')]),
              fr('Health checks route around dead servers.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a', 'App 1', 'app', 2.6, 0), n('b', 'App 2', 'app', 2.6, 1, { state: 'down' }), n('c', 'App 3', 'app', 2.6, 2)], [l('u', 'lb', { rate: 3 }), l('lb', 'a', { rate: 3 }), l('lb', 'c', { rate: 3 })]),
            ),
            pts: ['Prevent requests to unhealthy servers', 'Prevent overloading', 'Remove a single point of failure', 'SSL termination, session persistence'],
          },
          { t: 'Algorithms', pts: ['Round robin / weighted', 'Least connections (adapts to slow servers)', 'Random', 'IP hash / cookies (sticky)'] },
          { t: 'Layer 4 vs Layer 7', v: compare('Layer 4', ['Sees IPs and ports', 'Forwards packets (NAT)', 'Fast, simple'], 'Layer 7', ['Reads HTTP: path, headers, cookies', 'Route /video vs /billing', 'More flexible, more CPU']) },
          { t: 'Watch out', pts: ['An under-resourced LB is a bottleneck', 'One LB is a SPOF → active-passive pair'] },
        ],
      },
      {
        id: 'proxy',
        title: 'Reverse proxies',
        blurb: 'A web server in front of your apps.',
        minutes: 2,
        codex: 'reverse-proxy',
        slides: [
          {
            t: 'One front door',
            v: diagram(fr('nginx terminates TLS, caches static files, forwards the rest.', [U(), n('p', 'nginx', 'proxy', 1.4, 1), n('a', 'App', 'app', 3, 0.4), n('b', 'App', 'app', 3, 1.6)], [l('u', 'p', { rate: 3 }), l('p', 'a', { rate: 1 }), l('p', 'b', { rate: 1 })])),
            pts: ['Security: hide backends, block IPs, limit connections', 'SSL termination', 'Compression and caching', 'Serve static content'],
          },
          { t: 'LB vs reverse proxy', b: 'A **load balancer** helps when you have many servers doing the same job. A **reverse proxy** helps even with one server. nginx and HAProxy do both.' },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'applayer',
    title: 'Application Layer',
    icon: 'Boxes',
    color: '#2dd4bf',
    blurb: 'Microservices, service discovery and search.',
    lectures: [
      {
        id: 'microservices',
        title: 'Microservices',
        blurb: 'Small services, independent scaling.',
        minutes: 3,
        codex: 'microservices',
        slides: [
          { t: 'Separate web from platform', b: 'Splitting the web layer from the application (platform) layer lets you scale each independently — a new API means more app servers, not more web servers.' },
          {
            t: 'One app, many services',
            v: diagram(fr('Each service owns one job and scales on its own.', [n('g', 'Gateway', 'gateway', 0, 1), n('s1', 'Users', 'service', 1.6, 0), n('s2', 'Feed', 'service', 1.6, 1), n('s3', 'Search', 'service', 1.6, 2), n('d1', 'Users DB', 'db', 3, 0), n('i', 'Index', 'search', 3, 2)], [l('g', 's1', { rate: 1 }), l('g', 's2'), l('g', 's3', { color: C.search }), l('s1', 'd1', { rate: 1 }), l('s3', 'i', { color: C.search, rate: 1 })])),
          },
          { t: 'Trade-offs', v: compare('Benefits', ['Independent scaling', 'Failure isolation', 'Independent deploys', 'Small focused teams'], 'Costs', ['Many moving parts', 'Network calls everywhere', 'Harder ops and debugging']) },
        ],
      },
      {
        id: 'discovery',
        title: 'Service discovery',
        blurb: 'Finding healthy instances by name.',
        minutes: 2,
        codex: 'microservices',
        slides: [
          {
            t: 'A registry of the living',
            v: diagram(fr('Services register; clients ask "where is feed?"', [n('r', 'Consul', 'router', 1.6, 0), n('a', 'Feed #1', 'service', 0.4, 1.6), n('b', 'Feed #2', 'service', 2.8, 1.6), n('c', 'Client', 'app', 1.6, 2.4)], [l('a', 'r', { rate: 1, dashed: true }), l('b', 'r', { rate: 1, dashed: true }), l('c', 'r', { rate: 1, color: C.search })])),
            b: 'Consul, etcd and ZooKeeper track registered names, addresses and ports, run health checks, and store shared config.',
          },
        ],
      },
      {
        id: 'search',
        title: 'Search indexes',
        blurb: 'Inverted indexes beat table scans.',
        minutes: 2,
        codex: 'search-index',
        slides: [
          { t: 'Inverted index', v: code('text', `"cache"    → [doc3, doc7, doc42]\n"replica"  → [doc7, doc19]\n"shard"    → [doc2, doc7]\n\nquery: cache AND shard → doc7`), b: 'Each term maps to the documents containing it. Queries become set intersections instead of scanning every row.' },
          { t: 'At scale', pts: ['Shard the index across nodes', 'Scatter-gather queries, merge results', 'Replicate shards for throughput', 'Cache popular queries'] },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'databases',
    title: 'Databases',
    icon: 'Database',
    color: '#818cf8',
    blurb: 'ACID, federation, sharding, denormalization, tuning and NoSQL.',
    lectures: [
      {
        id: 'acid',
        title: 'Relational databases & ACID',
        blurb: 'The default choice, and its guarantees.',
        minutes: 2,
        codex: 'rdbms',
        slides: [
          { t: 'ACID', v: steps(['Atomicity', 'Each transaction is all or nothing.'], ['Consistency', 'Moves the DB from one valid state to another.'], ['Isolation', 'Concurrent transactions behave as if serial.'], ['Durability', 'Committed means committed — even after a crash.']) },
          { t: 'Scaling a relational DB', pts: ['Master-slave replication', 'Master-master replication', 'Federation', 'Sharding', 'Denormalization', 'SQL tuning'] },
        ],
      },
      {
        id: 'federation',
        title: 'Federation',
        blurb: 'Split databases by function.',
        minutes: 2,
        codex: 'federation',
        slides: [
          {
            t: 'One database per domain',
            v: diagram(fr('Each DB only sees its own traffic.', [n('a', 'App', 'app', 0, 1), n('u', 'Users DB', 'db', 2.4, 0), n('p', 'Products DB', 'db', 2.4, 1), n('f', 'Forums DB', 'db', 2.4, 2)], [l('a', 'u', { rate: 1 }), l('a', 'p', { rate: 3 }), l('a', 'f', { rate: 1 })])),
            pts: ['Less traffic & replication lag per DB', 'More data fits in memory → more cache hits', 'Parallel writes'],
          },
          { t: 'Costs', pts: ['App must know which DB to use', 'Joins across databases are hard', 'Not effective for huge single tables'] },
        ],
      },
      {
        id: 'sharding',
        title: 'Sharding',
        blurb: 'Split the same data by key.',
        minutes: 3,
        codex: 'sharding',
        slides: [
          {
            t: 'Each shard owns a slice',
            v: diagram(fr('A router sends each key to its shard — reads AND writes scale.', [n('a', 'App', 'app', 0, 1), n('r', 'Router', 'router', 1.3, 1), n('s1', 'Shard A–H', 'db', 2.8, 0), n('s2', 'Shard I–P', 'db', 2.8, 1), n('s3', 'Shard Q–Z', 'db', 2.8, 2)], [l('a', 'r', { color: C.write, rate: 3 }), l('r', 's1', { color: C.write }), l('r', 's2', { color: C.write }), l('r', 's3', { color: C.write })])),
          },
          { t: 'Choosing a shard key', pts: ['High cardinality, even distribution', 'Matches the access pattern (e.g. user_id)', 'Beware hot keys (celebrities)', 'Range keys cluster popular data → hot spots'] },
          { t: 'Costs', pts: ['Cross-shard joins and transactions', 'Rebalancing when adding shards', 'More complex app logic'] },
        ],
      },
      {
        id: 'consistent-hashing',
        title: 'Consistent hashing',
        blurb: 'Add nodes without reshuffling everything.',
        minutes: 2,
        codex: 'consistent-hashing',
        slides: [
          { t: 'The ring', v: { kind: 'widget', id: 'hashring' }, b: 'With `hash mod N`, changing N moves most keys. On a ring, a new node only steals keys from its neighbours (~1/N).' },
        ],
      },
      {
        id: 'denorm',
        title: 'Denormalization & SQL tuning',
        blurb: 'Faster reads, deliberately.',
        minutes: 3,
        codex: 'denormalization',
        slides: [
          { t: 'Denormalization', v: compare('Normalized', ['Each fact stored once', 'Reads need JOINs'], 'Denormalized', ['Redundant copies', 'Reads skip JOINs', 'Writes update every copy']), b: 'Worth it because reads often outnumber writes 100:1.' },
          { t: 'Indexes', v: code('sql', `-- full scan without an index\nSELECT * FROM users WHERE email = ?;\n\nCREATE INDEX idx_users_email ON users(email);\n-- now a B-tree lookup: O(log n)`), b: 'Faster reads, slightly slower writes, more memory.' },
          { t: 'Tuning checklist', pts: ['Benchmark & profile first (slow query log, EXPLAIN)', 'CHAR for fixed-length, TEXT for large text', 'DECIMAL for money, INT up to 2³²', 'Avoid big BLOBs — store a path', 'NOT NULL where possible', 'Partition hot data into its own table'] },
        ],
      },
      {
        id: 'nosql',
        title: 'NoSQL families',
        blurb: 'Key-value, document, wide-column, graph.',
        minutes: 4,
        codex: 'sql-vs-nosql',
        slides: [
          { t: 'Key-value', b: 'A giant hash map: O(1) get/put. Sessions, carts, caches. Redis, DynamoDB.', v: diagram(fr('', [n('a', 'App', 'app', 0.4, 0), n('k', 'Key-value', 'kv', 2.6, 0)], [l('a', 'k', { back: true })])) },
          { t: 'Document', b: 'Key → JSON document, queryable by field. Flexible schemas. MongoDB, CouchDB.' },
          { t: 'Wide-column', b: 'Row key → column families, sorted keys, timestamps. Massive write throughput, time series. Bigtable, HBase, Cassandra.' },
          { t: 'Graph', b: 'Nodes and edges stored directly; traversals are pointer-chasing. Social graphs. Neo4j. Hard to shard.' },
          { t: 'ACID vs BASE', v: compare('SQL (ACID)', ['Relational, strict schema', 'Joins & transactions', 'Mature tooling'], 'NoSQL (BASE)', ['Basically Available', 'Soft state', 'Eventual consistency', 'Scales out easily']) },
          { t: 'When to pick which', v: compare('Pick SQL for', ['Structured, relational data', 'Complex joins', 'Transactions'], 'Pick NoSQL for', ['Semi-structured data', 'Huge volume, high IOPS', 'Simple access patterns']) },
        ],
      },
      {
        id: 'object-storage',
        title: 'Object storage',
        blurb: 'Blobs belong in S3, not in your database.',
        minutes: 2,
        codex: 'object-storage',
        slides: [
          {
            t: 'Split metadata from blobs',
            v: diagram(
              fr('Small rows (who, when, where) in SQL; the bytes in an object store.', [U(), n('a', 'App', 'app', 1.2, 1), n('d', 'Metadata', 'db', 2.8, 0.3), n('s', 'Object store', 's3', 2.8, 1.7)], [l('u', 'a'), l('a', 'd', { rate: 1 }), l('a', 's', { color: C.static })]),
              fr('Clients upload straight to storage with a pre-signed URL; a CDN serves downloads.', [U(), n('a', 'App', 'app', 1.2, 0.3), n('s', 'Object store', 's3', 2.8, 1.7), n('c', 'CDN', 'cdn', 1.2, 1.7)], [l('u', 'a', { rate: 1, label: 'get URL' }), l('u', 's', { color: C.write, label: 'PUT' }), l('c', 's', { color: C.static, rate: 1 }), l('u', 'c', { color: C.static, back: true })]),
            ),
          },
          { t: 'Why', pts: ['Practically unlimited, cheap, 11 nines durability', 'Keeps the database small and fast', 'Objects are immutable — perfect for CDN caching', 'Higher latency than a disk: not for hot small reads'] },
        ],
      },
    ],
  },
];

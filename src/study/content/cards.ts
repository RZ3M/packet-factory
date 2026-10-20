import type { Flashcard } from '../types';
import { ARCHITECTURES, COMPANIES } from './library';
import { OOD } from './ood';
import { EXTRA_QUESTIONS } from './interview';

export const DECKS: { id: string; title: string; color: string; icon: string }[] = [
  { id: 'fundamentals', title: 'Fundamentals', color: '#34d399', icon: 'Scale' },
  { id: 'availability', title: 'Availability & CAP', color: '#38bdf8', icon: 'ShieldCheck' },
  { id: 'edge', title: 'DNS, CDN, LB, proxy', color: '#22d3ee', icon: 'Globe' },
  { id: 'databases', title: 'Databases', color: '#818cf8', icon: 'Database' },
  { id: 'caching', title: 'Caching', color: '#fbbf24', icon: 'Zap' },
  { id: 'async', title: 'Async & communication', color: '#c084fc', icon: 'ListOrdered' },
  { id: 'numbers', title: 'Numbers to know', color: '#f5a524', icon: 'Calculator' },
  { id: 'interview', title: 'Interview playbook', color: '#f87171', icon: 'GraduationCap' },
  { id: 'questions', title: 'Design questions', color: '#fb923c', icon: 'Target' },
  { id: 'architectures', title: 'Real-world systems', color: '#2dd4bf', icon: 'Building2' },
  { id: 'ood', title: 'OOD', color: '#f472b6', icon: 'Boxes' },
];

const c = (deck: string, q: string, a: string): Omit<Flashcard, 'id'> => ({ deck, q, a });

const HAND: Omit<Flashcard, 'id'>[] = [
  // fundamentals
  c('fundamentals', 'Performance problem vs scalability problem?', 'Performance: slow for **one** user. Scalability: fast for one user but slow **under load**.'),
  c('fundamentals', 'Latency vs throughput?', 'Latency = time for one action. Throughput = actions per unit time. Aim for max throughput with acceptable latency.'),
  c('fundamentals', 'Vertical vs horizontal scaling?', 'Vertical: a bigger machine (simple, has a ceiling, single point of failure). Horizontal: more machines (needs load balancing and stateless servers).'),
  c('fundamentals', 'Why must web servers be stateless to scale out?', 'Any server can then handle any request; sessions live in a shared store (cache/DB), so the LB can add, remove or fail over servers freely.'),
  c('fundamentals', 'What does autoscaling react to, and what\'s its weakness?', 'Metrics like CPU or queue depth. It lags: new instances take time to boot, so sudden spikes still need headroom or queues.'),
  c('fundamentals', 'Little\'s Law?', '`L = λ × W` — items in system = arrival rate × time in system. E.g. 1,000 req/s × 0.2 s = 200 concurrent requests.'),
  c('fundamentals', 'Why does latency explode near 100% utilization?', 'Queueing: wait time ∝ ρ/(1−ρ). At 50% load waits are small; at 95% they\'re ~20× service time. Keep headroom.'),
  c('fundamentals', 'What is p99 latency and why care?', 'The latency 99% of requests beat. Averages hide tail latency; with fan-out, one slow call delays the whole page.'),

  // availability
  c('availability', 'State the CAP theorem.', 'Under a network **Partition**, a distributed system must choose **Consistency** (reject/err) or **Availability** (serve possibly stale data).'),
  c('availability', 'CP vs AP — examples?', 'CP: bank balances, inventory locks (ZooKeeper, HBase). AP: carts, feeds, likes (Cassandra, Dynamo).'),
  c('availability', 'Weak vs eventual vs strong consistency?', 'Weak: reads may never see the write (VoIP, games). Eventual: reads see it soon (DNS, email). Strong: reads see it immediately (RDBMS, transactions).'),
  c('availability', 'Active-passive vs active-active failover?', 'Active-passive: standby takes over on heartbeat loss (simple, idle capacity, failover downtime). Active-active: all nodes serve traffic (needs load balancing and shared state).'),
  c('availability', 'Downside of failover?', 'More hardware and complexity; data written to the active but not yet replicated can be lost.'),
  c('availability', 'Availability of two components in sequence? In parallel?', 'Sequence: A × B (lower). Parallel: 1 − (1−A)(1−B) (higher). Two 99.9% servers in parallel ≈ 99.9999%.'),
  c('availability', 'Downtime per year at 99.9% and 99.99%?', '99.9% ≈ 8h 46m/yr. 99.99% ≈ 52.6 min/yr. 99.999% ≈ 5.3 min/yr.'),
  c('availability', 'Master-slave vs master-master replication?', 'Master-slave: one writer, replicas serve reads; promote on failure. Master-master: both write; needs conflict resolution, often loosely consistent.'),
  c('availability', 'Disadvantage of async replication?', 'Replication lag: reads from replicas may be stale, and a master crash can lose unreplicated writes.'),

  // edge
  c('edge', 'What does DNS do, and how is it cached?', 'Translates names to IPs. Answers are cached by browsers, OS and resolvers for the record\'s **TTL**.'),
  c('edge', 'A vs CNAME vs NS vs MX records?', 'A: name → IP. CNAME: name → another name. NS: which servers are authoritative. MX: mail servers.'),
  c('edge', 'Push CDN vs pull CDN?', 'Push: you upload content when it changes (good for small, rarely changing sites). Pull: CDN fetches on first request and caches by TTL (good for heavy traffic).'),
  c('edge', 'Layer 4 vs layer 7 load balancing?', 'L4 routes by IP/port (fast, content-blind). L7 reads the request (path, headers, cookies) to route, e.g. /api vs /static.'),
  c('edge', 'Load balancing algorithms?', 'Round robin, weighted round robin, least connections, random, hash of IP/session (sticky).'),
  c('edge', 'Load balancer vs reverse proxy?', 'An LB spreads traffic over many servers. A reverse proxy fronts even one server: TLS termination, compression, caching, hiding backends.'),
  c('edge', 'Why put a CDN in front of static assets?', 'Edges near users cut latency and absorb most traffic, so origin servers handle only dynamic work.'),

  // databases
  c('databases', 'What does ACID stand for?', 'Atomicity (all or nothing), Consistency (valid state to valid state), Isolation (as if serial), Durability (committed stays committed).'),
  c('databases', 'Federation?', 'Split databases **by function** (users, forums, products). Less load and contention per DB, but cross-DB joins move to the app.'),
  c('databases', 'Sharding?', 'Split one dataset **by key** across databases (users A–M, N–Z). Scales writes and size; hot keys, rebalancing and cross-shard joins are hard.'),
  c('databases', 'Why consistent hashing?', 'Adding or removing a node only moves ~1/N of keys, instead of nearly all keys with `hash % N`.'),
  c('databases', 'Denormalization — what and when?', 'Store redundant copies to avoid joins. For read-heavy workloads; writes must update every copy.'),
  c('databases', 'SQL tuning basics?', 'Index columns you filter/join on, avoid SELECT *, use the right types (CHAR vs VARCHAR), partition hot tables, check EXPLAIN plans.'),
  c('databases', 'Key-value store — good for?', 'O(1) lookups by key: sessions, caches, carts. Redis, DynamoDB.'),
  c('databases', 'Document store — good for?', 'Self-contained, nested records with flexible schema: profiles, catalogs. MongoDB, CouchDB.'),
  c('databases', 'Wide-column store — good for?', 'Huge write volumes and time-series: rows keyed by (partition, sort). Cassandra, HBase, Bigtable.'),
  c('databases', 'Graph database — good for?', 'Many-to-many relationships and traversals: social graphs, recommendations. Neo4j.'),
  c('databases', 'Reasons to pick SQL over NoSQL?', 'Structured data, strict schema, relational joins, transactions, mature tooling, fast index lookups.'),
  c('databases', 'Reasons to pick NoSQL?', 'Semi-structured data, flexible schema, very high throughput, TB–PB scale, no need for complex joins.'),
  c('databases', 'What is BASE?', 'Basically Available, Soft state, Eventual consistency — the NoSQL counterpart to ACID.'),

  // caching
  c('caching', 'Where can you cache?', 'Client, CDN, web server/reverse proxy, database buffer, application cache (Redis/Memcached).'),
  c('caching', 'Cache-aside flow?', 'Read cache → on miss read DB → write to cache → return. Only requested data is cached; first reads are slow.'),
  c('caching', 'Write-through?', 'App writes to cache, cache writes to DB synchronously. Never stale; slow writes; may cache unread data.'),
  c('caching', 'Write-behind (write-back)?', 'Write to cache, flush to DB asynchronously. Fast writes; data loss if the cache dies first.'),
  c('caching', 'Refresh-ahead?', 'Refresh hot entries before they expire. Lower latency if predictions are right; wasted work if not.'),
  c('caching', 'Why does a small cache give a high hit rate?', 'Traffic is skewed (Zipf): a small fraction of keys gets most requests.'),
  c('caching', 'Thundering herd / cache stampede?', 'A hot key expires and many requests hit the DB at once. Fix: request coalescing, leases, jittered TTLs, refresh-ahead.'),
  c('caching', 'Query-level vs object-level caching?', 'Query-level keys on the query hash (hard to invalidate). Object-level caches assembled objects (invalidate when the object changes).'),

  // async + communication
  c('async', 'Message queue vs task queue?', 'Message queue: holds messages for consumers (RabbitMQ, SQS, Kafka). Task queue: runs jobs with workers (Celery).'),
  c('async', 'What is back pressure?', 'Limit queue size; when full, reject with 503 so clients back off — instead of growing until everything slows down.'),
  c('async', 'At-least-once delivery means handlers must be…?', '**Idempotent** — processing a message twice has the same effect as once.'),
  c('async', 'Exponential backoff with jitter?', 'Retry after base × 2^n plus randomness, so clients don\'t retry in lockstep.'),
  c('async', 'Idempotent HTTP methods?', 'GET, PUT, DELETE (and HEAD, OPTIONS). POST and PATCH are not.'),
  c('async', 'TCP vs UDP?', 'TCP: connection, ordered, reliable, congestion control. UDP: connectionless, may drop/reorder, low latency — VoIP, games, DNS.'),
  c('async', 'RPC vs REST?', 'RPC exposes actions (`POST /sendMessage`), compact and fast, great internally. REST exposes resources (`GET /users/1`) with uniform verbs, cacheable, good for public APIs.'),
  c('async', 'Top security basics to mention?', 'Encrypt in transit and at rest, sanitize input (XSS/injection), parameterized queries, least privilege, rate limiting.'),

  // numbers
  c('numbers', 'L1 cache vs main memory reference?', 'L1 ≈ 0.5 ns. Main memory ≈ 100 ns.'),
  c('numbers', 'Read 1 MB sequentially: memory vs SSD vs HDD?', 'Memory ≈ 250 µs. SSD ≈ 1 ms. HDD ≈ 20–30 ms.'),
  c('numbers', 'Round trip within a data center? Across the ocean?', 'Same DC ≈ 0.5 ms. California ↔ Netherlands ≈ 150 ms.'),
  c('numbers', 'HDD seek time?', '≈ 10 ms.'),
  c('numbers', 'Seconds in a month (napkin)?', '≈ 2.5 million. So 1M requests/month ≈ 0.4 req/s.'),
  c('numbers', '2^10, 2^20, 2^30, 2^40?', 'KB (thousand), MB (million), GB (billion), TB (trillion).'),
  c('numbers', '100M requests/day ≈ ? req/s', '≈ 1,160 req/s average (100M / 86,400). Peak ≈ 2–3× average.'),
  c('numbers', 'Memory is roughly how much faster than disk for reads?', 'Random reads: ~100,000× faster than HDD seeks. Sequential: ~4× faster than SSD, ~80× faster than HDD.'),

  // interview
  c('interview', 'The 4-step interview framework?', '1) Use cases, constraints, assumptions. 2) High-level design. 3) Core components. 4) Scale the design.'),
  c('interview', 'Questions to ask in step 1?', 'Who uses it? How many users? Read:write ratio? Data size? Latency targets? What\'s out of scope?'),
  c('interview', 'How do you scale a design in step 4?', 'Find bottlenecks with numbers, then iterate: LB + horizontal app tier, cache, read replicas, CDN, sharding, queues. Discuss trade-offs.'),
  c('interview', 'What should a high-level design include?', 'Main components and connections: clients, LB, services, data stores, caches, queues — justified by the use cases.'),
  c('interview', 'Why do back-of-the-envelope estimates?', 'They decide the design: storage size, QPS and bandwidth tell you whether one box works or you need sharding, caching, CDN.'),
  c('interview', 'Common interview mistake?', 'Jumping straight into components without clarifying requirements or doing estimates.'),
];

const AUTO: Omit<Flashcard, 'id'>[] = [
  ...ARCHITECTURES.map((a) => c('architectures', `${a.name} (${a.from}) — key idea?`, a.idea)),
  ...ARCHITECTURES.map((a) => c('architectures', `Lesson from ${a.name}?`, a.lesson)),
  ...COMPANIES.map((co) => c('architectures', `${co.name}: what's notable about its architecture?`, `**${co.headline}.** ${co.lessons.slice(0, 2).join('. ')}.`)),
  ...EXTRA_QUESTIONS.map((q) => c('questions', `Core idea: design ${q.title}?`, q.core)),
  ...OOD.flatMap((o) => o.why.map((w) => c('ood', `${o.title}: ${w.title}?`, w.text))),
];

// Stable ids (hash of the question) so review history survives content edits.
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

export const CARDS: Flashcard[] = [...HAND, ...AUTO].map((card) => ({ ...card, id: `${card.deck}-${hash(card.q)}` }));

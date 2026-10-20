import type { Track } from '../types';
import { C, code, compare, diagram, fr, l, n, steps } from './dsl';

const U = (y = 1, extra = {}) => n('u', 'Users', 'user', 0, y, extra);

export const TRACKS_3: Track[] = [
  // =========================================================================
  {
    id: 'caching',
    title: 'Caching',
    icon: 'Zap',
    color: '#fbbf24',
    blurb: 'Where to cache, what to cache, and how to keep it fresh.',
    lectures: [
      {
        id: 'why-cache',
        title: 'Why caches work',
        blurb: 'Memory speed + skewed traffic.',
        minutes: 3,
        codex: 'cache',
        slides: [
          { t: 'Skew does the work', v: { kind: 'widget', id: 'zipf' }, b: 'A few items get most requests. Cache the head of the distribution and you cover most reads.' },
          {
            t: 'Cache-aside',
            v: diagram(
              fr('Hit: answered from memory.', [n('a', 'App', 'app', 0.2, 1), n('c', 'Cache', 'cache', 1.8, 0.3), n('d', 'Database', 'db', 1.8, 1.7)], [l('a', 'c', { back: true, color: C.read })]),
              fr('Miss: read the DB, then fill the cache.', [n('a', 'App', 'app', 0.2, 1), n('c', 'Cache', 'cache', 1.8, 0.3), n('d', 'Database', 'db', 1.8, 1.7)], [l('a', 'c', { color: C.err, rate: 1 }), l('a', 'd', { back: true, color: C.read, rate: 1 })]),
            ),
          },
          { t: 'Where caches live', pts: ['Client (browser, OS)', 'CDN', 'Web server / reverse proxy', 'Database buffer cache', 'Application cache: Redis, Memcached'] },
          { t: 'What to cache', v: compare('Query-level', ['Key = hash of the query', 'Hard to invalidate'], 'Object-level', ['Users, pages, timelines', 'Invalidate when the object changes']) },
        ],
      },
      {
        id: 'update-strategies',
        title: 'Cache update strategies',
        blurb: 'Cache-aside, write-through, write-behind, refresh-ahead.',
        minutes: 4,
        codex: 'cache-update',
        slides: [
          { t: 'Cache-aside (lazy)', b: 'App checks cache → on miss reads DB → fills cache. Only requested data is cached. Each miss is 3 trips; data can go stale.' },
          {
            t: 'Write-through',
            v: diagram(fr('Writes go through the cache to the DB, synchronously.', [n('a', 'App', 'app', 0, 1), n('c', 'Cache', 'cache', 1.5, 1), n('d', 'Database', 'db', 3, 1)], [l('a', 'c', { color: C.write }), l('c', 'd', { color: C.write })])),
            b: 'Never stale, slower writes, may cache data nobody reads.',
          },
          {
            t: 'Write-behind (write-back)',
            v: diagram(
              fr('Writes are acknowledged from the cache, flushed later.', [n('a', 'App', 'app', 0, 1), n('c', 'Cache', 'cache', 1.5, 1, { badge: '9 pending' }), n('d', 'Database', 'db', 3, 1)], [l('a', 'c', { color: C.write, rate: 3 }), l('c', 'd', { color: C.write, rate: 1, speed: 3 })]),
              fr('If the cache dies first, those writes are gone.', [n('a', 'App', 'app', 0, 1), n('c', 'Cache', 'cache', 1.5, 1, { state: 'down' }), n('d', 'Database', 'db', 3, 1)], []),
            ),
          },
          { t: 'Refresh-ahead', b: 'Reload hot entries shortly before they expire so popular keys never miss. Wasted work if you predict wrong.' },
          { t: 'Cache downsides', pts: ['Consistency with the source of truth', 'Invalidation is hard', 'Cold cache after restarts (thundering herd)', 'More code and infrastructure'] },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'async',
    title: 'Asynchronism',
    icon: 'ListOrdered',
    color: '#c084fc',
    blurb: 'Queues, workers and back pressure.',
    lectures: [
      {
        id: 'queues',
        title: 'Message & task queues',
        blurb: 'Do slow work somewhere else.',
        minutes: 3,
        codex: 'message-queues',
        slides: [
          {
            t: 'Move work off the request path',
            v: diagram(
              fr('Inline: the user waits for the slow job.', [U(), n('a', 'App', 'app', 1.6, 1, { state: 'hot' })], [l('u', 'a', { color: C.job, speed: 3 })]),
              fr('Async: acknowledge instantly, workers do the job.', [U(), n('a', 'App', 'app', 1, 1), n('q', 'Queue', 'queue', 2.1, 1, { state: 'new' }), n('w', 'Workers', 'worker', 3.2, 1)], [l('u', 'a', { color: C.job, back: true, speed: 0.8 }), l('a', 'q', { color: C.job }), l('q', 'w', { color: C.job, speed: 2 })]),
            ),
          },
          { t: 'Popular options', pts: ['Redis — simple, can lose messages', 'RabbitMQ — AMQP, you operate it', 'Amazon SQS — hosted, may deliver twice', 'Kafka — durable, replayable log', 'Celery — task queue with scheduling'] },
          { t: 'Delivery semantics', b: 'Most queues are **at-least-once**: a job may run twice. Make handlers **idempotent**, and send poison messages to a dead-letter queue.' },
          { t: 'When not to', b: 'Cheap operations or anything the user needs **now** — queues add delay and complexity.' },
        ],
      },
      {
        id: 'backpressure',
        title: 'Back pressure',
        blurb: 'Say no before you fall over.',
        minutes: 2,
        codex: 'back-pressure',
        slides: [
          {
            t: 'Bounded queues',
            v: diagram(fr('When the queue is full, new work gets 503 Busy.', [U(), n('q', 'Queue FULL', 'queue', 1.6, 1, { state: 'hot', badge: 'max' }), n('w', 'Workers', 'worker', 3.1, 1)], [l('u', 'q', { color: C.err, rate: 3 }), l('q', 'w', { color: C.job })])),
            b: 'Queued jobs stay fast; clients retry later instead of the queue growing past memory.',
          },
          { t: 'Retrying well', v: code('text', `wait = base × 2^attempt  + random jitter\n1s → 2s → 4s → 8s …`), b: 'Jitter stops thousands of clients retrying in sync (retry storms).' },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'communication',
    title: 'Communication',
    icon: 'Route',
    color: '#60a5fa',
    blurb: 'HTTP, TCP vs UDP, RPC vs REST.',
    lectures: [
      {
        id: 'http',
        title: 'HTTP',
        blurb: 'Verbs, idempotency, caching.',
        minutes: 2,
        codex: 'http',
        slides: [
          { t: 'Request / response', b: 'A verb + a resource + headers + optional body. Self-contained, so proxies, caches and load balancers can sit in between.' },
          { t: 'Verbs', pts: ['GET — read · idempotent · safe · cacheable', 'POST — create / process · not idempotent', 'PUT — create or replace · idempotent', 'PATCH — partial update · not idempotent', 'DELETE — delete · idempotent'] },
        ],
      },
      {
        id: 'tcp-udp',
        title: 'TCP vs UDP',
        blurb: 'Reliable and ordered, or fast and lossy.',
        minutes: 2,
        codex: 'tcp-udp',
        slides: [
          { t: 'Compare', v: compare('TCP', ['Handshake, sequence numbers, ACKs', 'Retransmits lost packets', 'In-order, flow & congestion control', 'Web, DBs, SSH, email'], 'UDP', ['Connectionless datagrams', 'No retries, no ordering', 'Lower, steadier latency', 'VoIP, video, games, DNS, DHCP']) },
          { t: 'Head-of-line blocking', b: 'With TCP one lost packet stalls everything behind it until it\'s retransmitted. For live media a late frame is worse than a missing one — use UDP.' },
        ],
      },
      {
        id: 'rpc-rest',
        title: 'RPC vs REST',
        blurb: 'Behaviours vs resources.',
        minutes: 2,
        codex: 'rpc-rest',
        slides: [
          { t: 'Compare', v: compare('RPC', ['Exposes actions', 'Compact, fast (gRPC, Thrift)', 'Great for internal calls', 'Tighter coupling'], 'REST', ['Exposes resources', 'Uniform verbs, stateless', 'Cacheable, public APIs', 'Many round trips for nested data']) },
          { t: 'Same operation, two styles', v: code('http', `RPC:  POST /updatePerson\nREST: PUT  /persons/1234\n\nRPC:  GET  /readPerson?personid=1234\nREST: GET  /persons/1234`) },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'security',
    title: 'Security',
    icon: 'ShieldCheck',
    color: '#f87171',
    blurb: 'The basics every design should mention.',
    lectures: [
      {
        id: 'security-basics',
        title: 'Security essentials',
        blurb: 'Encrypt, sanitize, parameterize, least privilege.',
        minutes: 3,
        codex: 'security',
        slides: [
          { t: 'The four basics', v: steps(['Encrypt', 'In transit (TLS) and at rest.'], ['Sanitize input', 'Prevent XSS and injection.'], ['Parameterize queries', 'Input is data, never code.'], ['Least privilege', 'Each component gets only what it needs.']) },
          { t: 'SQL injection', v: code('js', `// ❌ vulnerable\ndb.query("... WHERE name = '" + name + "'")\n\n// ✅ parameterized\ndb.query("... WHERE name = $1", [name])`) },
          {
            t: 'Rate limiting',
            v: diagram(fr('A token bucket per client throttles floods at the edge.', [n('b', 'Botnet', 'user', 0, 0.4, { state: 'hot' }), n('u', 'Users', 'user', 0, 1.6), n('g', 'Gateway', 'gateway', 1.6, 1, { badge: '10/s' }), n('a', 'App', 'app', 3, 1)], [l('b', 'g', { color: C.err, rate: 4 }), l('u', 'g'), l('g', 'a')])),
          },
          { t: 'Defense in depth', b: 'No control is perfect. Layer a WAF, rate limits, auth checks on every request, parameterized queries and audit logs.' },
        ],
      },
    ],
  },
];

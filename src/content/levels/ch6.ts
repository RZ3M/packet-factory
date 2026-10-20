import type { TierId } from '../../engine/types';
import { COL, D, E, N, ROW, USERS, fan } from '../dsl';
import type { Level } from '../types';

const app = (id: string, row: number, tier: TierId = 'M', cfg: Record<string, any> = {}, name?: string) => N('app', COL[2], ROW(row), { id, tier, cfg, name });

export const ch6: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '6-1',
    chapter: 6,
    title: 'The Front Desk',
    tagline: 'Your app servers are doing chores a web server does better.',
    brief: `Look at what your app servers spend CPU on:
- **TLS** — every request arrives encrypted, and the handshake + decryption costs real CPU.
- **Static files** — 30% of requests are CSS/JS/images that never change.

A **reverse proxy** (nginx, HAProxy) is a web server that sits in front of your apps and handles exactly these chores:
- **TLS termination** — decrypt once at the edge; apps get plain HTTP.
- **Caching & compression** — serve popular static files straight from memory.
- It can also **balance load** across several backends.

Budget is tight: you can't just add another app server. Put a proxy in front and let it take the load off.`,
    learn: ['Reverse proxies (web servers)', 'TLS/SSL termination', 'Load balancer vs reverse proxy'],
    concepts: ['reverse-proxy', 'load-balancer', 'security'],
    palette: ['app', 'sql', 'lb', 'cache', 'proxy'],
    features: ['ha', 'cachePolicy', 'replication'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 20000, skew: 1, staticKeys: 300, staticSkew: 0.8 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 3000 }], mix: { static: 30, read: 60, write: 10 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 600, star: 2 },
      { kind: 'p50', target: 37, star: 3 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), app('a1', 1), app('a2', 3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1'])],
    ),
    solution: D(
      [USERS({ y: ROW(2) }), N('proxy', COL[1], ROW(2), { id: 'px', name: 'nginx' }), app('a1', 1), app('a2', 3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
      [E('users', 'px'), ...fan(['px'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1'])],
    ),
    traps: [
      {
        name: 'add a third app server',
        maxStars: 1,
        design: D(
          [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), app('a1', 1), app('a2', 2), app('a3', 3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
        ),
      },
    ],
    hints: [
      'Click an App Server during a run: TLS and static files are eating its capacity.',
      'Replace the load balancer with a Reverse Proxy (it balances too), or put one in front of it.',
      'Make sure TLS termination and static caching are on in the proxy\'s settings.',
    ],
    debrief: `### What just happened
The proxy decrypted TLS once and served most static files from its own memory. Your app servers only saw plain, dynamic requests — so two of them were enough.

### Reverse proxy (primer)
A web server that centralizes internal services and provides unified interfaces to the public. Requests from clients are forwarded to a server that can fulfil them, and the proxy returns the server's response.
- **Increased security** — hide information about backend servers, blacklist IPs, limit connections per client.
- **Scalability and flexibility** — clients only see the proxy's IP, so you can scale servers or change their configuration freely.
- **SSL termination** — decrypt incoming requests and encrypt responses so backends don't have to; no need to install X.509 certificates on every server.
- **Compression** — compress responses.
- **Caching** — return the response for cached requests.
- **Static content** — serve HTML/CSS/JS, photos, videos directly.

### Load balancer vs reverse proxy
Deploying a load balancer is useful when you have **multiple** servers that serve the same function. Reverse proxies can be useful even with **just one** web server or application server. Solutions such as NGINX and HAProxy support both layer 7 reverse proxying and load balancing.

**Disadvantages:** increased complexity, and a single reverse proxy is a single point of failure (configuring multiple proxies — failover — further increases complexity).`,
    quiz: [
      {
        q: 'What does TLS termination at a reverse proxy buy you?',
        options: [
          'End-to-end encryption to the database',
          'Backends skip encryption work and do not need certificates installed',
          'Faster DNS resolution',
          'Automatic sharding',
        ],
        answer: 1,
        explain: 'The proxy decrypts once at the edge; backends handle plain HTTP inside the trusted network.',
      },
      {
        q: 'You have exactly one app server. Is a reverse proxy still useful?',
        options: ['No, proxies only balance load', 'Yes — TLS termination, caching, compression, security and a stable public endpoint', 'Only with a CDN', 'Only for databases'],
        answer: 1,
        explain: 'A reverse proxy adds value even in front of a single server; a load balancer only helps with multiple servers.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '6-2',
    chapter: 6,
    title: 'Under Attack',
    tagline: 'A botnet floods you while someone probes for SQL injection.',
    brief: `Two threats arrive at once:
1. **A botnet** (a few thousand compromised machines, but only ~25 distinct identities) floods your site with requests from 20 s to 45 s — more than **4× your normal traffic**.
2. Hidden among real users, an attacker sends **SQL injection** payloads (red-ringed dots). Each one that reaches application code that builds SQL by string concatenation is a **breach**.

Defense in depth:
- An **API Gateway** at the edge with a **WAF** blocks known attack patterns (most, not all) and **rate-limits per client** — a legitimate user makes a request every few seconds; a bot makes hundreds per second.
- **Parameterized queries** in the app make injection harmless even if a payload slips through.

Throttle too aggressively and you'll block real users. Zero breaches is non-negotiable.`,
    learn: ['Security fundamentals: least privilege, input sanitization', 'WAFs and rate limiting', 'Defense in depth'],
    concepts: ['security', 'reverse-proxy'],
    palette: ['app', 'sql', 'lb', 'cache', 'proxy', 'gateway'],
    features: ['ha', 'cachePolicy', 'replication', 'sanitize', 'l7'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 20000, skew: 1 },
    sources: [
      { id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 85, write: 12, attack: 3 }, users: 60000 },
      { id: 'users', bot: true, botUsers: 25, phases: [{ at: 0, rps: 0 }, { at: 19.9, rps: 0 }, { at: 20, rps: 6500 }, { at: 45, rps: 6500 }, { at: 45.1, rps: 0 }], mix: { read: 100 } },
    ],
    chaos: [{ at: 20, type: 'notice', note: '🤖 Botnet flood incoming!' }],
    objectives: [
      { kind: 'breaches', target: 0, star: 1 },
      { kind: 'success', target: 99, star: 1 },
      { kind: 'p95', target: 120, star: 1 },
      { kind: 'cost', target: 760, star: 2 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), app('a1', 1), app('a2', 2), app('a3', 3), N('cache', COL[4], ROW(1), { id: 'c1' }), N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' })],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'c1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('gateway', COL[1], ROW(2), { id: 'gw', cfg: { waf: true, rateLimit: 10 } }),
        app('a1', 1, 'M', { sanitize: true }),
        app('a2', 2, 'M', { sanitize: true }),
        app('a3', 3, 'M', { sanitize: true }),
        N('cache', COL[4], ROW(1), { id: 'c1' }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'gw'), ...fan(['gw'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'c1'])],
    ),
    traps: [
      {
        name: 'WAF + rate limit, but string-built SQL',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('gateway', COL[1], ROW(2), { id: 'gw', cfg: { waf: true, rateLimit: 10 } }),
            app('a1', 1),
            app('a2', 2),
            app('a3', 3),
            N('cache', COL[4], ROW(1), { id: 'c1' }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' }),
          ],
          [E('users', 'gw'), ...fan(['gw'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'c1'])],
        ),
      },
      {
        name: 'parameterized queries, no rate limiting',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1' }),
            app('a1', 1, 'M', { sanitize: true }),
            app('a2', 2, 'M', { sanitize: true }),
            app('a3', 3, 'M', { sanitize: true }),
            N('cache', COL[4], ROW(1), { id: 'c1' }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'c1'])],
        ),
      },
    ],
    hints: [
      'Put an API Gateway in front (it can replace the load balancer — it balances too). Enable the WAF.',
      'Bots hammer from a few identities. A per-client rate limit of ~10 req/s stops them without touching real users.',
      'The WAF misses ~3% of payloads. Turn on parameterized queries on every App Server.',
    ],
    debrief: `### What just happened
- The **rate limiter** cut each bot identity down to a trickle, so the flood never reached your app servers.
- The **WAF** stopped most injection payloads at the edge, and **parameterized queries** neutralized the few that got through. Neither alone was enough — that's **defense in depth**.

### Security (primer)
Security is a broad topic; for interviews, know the basics:
- **Encrypt** in transit and at rest.
- **Sanitize all user inputs** or any input parameters exposed to users to prevent **XSS** and **SQL injection**.
- Use **parameterized queries** to prevent SQL injection.
- Use the principle of **least privilege**.

### Also worth knowing
- **DDoS**: absorb volumetric attacks at the edge (CDNs / scrubbing services), rate-limit by client, and keep expensive endpoints behind authentication.
- **Rate limiting algorithms**: token bucket (bursty but bounded — what the gateway here uses), leaky bucket, fixed and sliding windows.
- Return **429 Too Many Requests** with a \`Retry-After\` header so well-behaved clients back off.`,
    quiz: [
      {
        q: 'What is the most reliable defense against SQL injection?',
        options: ['A web application firewall', 'Parameterized queries / prepared statements', 'Hiding the database port', 'Rate limiting'],
        answer: 1,
        explain: 'Parameterized queries keep data separate from SQL code, so input can never change the query. WAFs are a helpful extra layer, not a guarantee.',
      },
      {
        q: 'A per-client token bucket allows 10 req/s with a burst of 20. A client sends 100 requests in one second. Roughly how many pass?',
        options: ['10', '~20–30', '100', '0'],
        answer: 1,
        explain: 'The bucket starts full (20 tokens) and refills at 10/s, so about 20 + ~10 get through; the rest receive 429s.',
      },
      {
        q: 'The principle of least privilege means…',
        options: ['Give every service admin rights to avoid permission errors', 'Grant each component only the permissions it needs', 'Encrypt everything twice', 'Run as root in containers'],
        answer: 1,
        explain: 'Limit blast radius: a compromised component can only do what it was allowed to do.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '6-3',
    chapter: 6,
    title: 'Bulkheads',
    tagline: 'A search spike is taking the whole site down with it.',
    brief: `Everything runs as one **monolith**: the same app servers handle page views, writes and **search** (yellow). Mid-run a viral topic makes **search traffic explode ~8×** — and because everything shares one pool, page views drown too.

Split the monolith into **services** with their own pools — like watertight **bulkheads** in a ship: if one floods, the others stay dry.

1. Switch the load balancer to **Layer 7** — only an L7 balancer can see what kind of request it's holding.
2. Create a separate pool of app servers for search, wired to the **Search Index**.
3. Click each belt out of the load balancer and **filter** which request types may travel on it: search → the search pool; reads and writes → the core pool.

Page views must stay fast even while search is on fire — **within the same budget**. A bigger shared pool would cost more than you have.`,
    learn: ['Microservices', 'Layer 7 routing', 'Bulkheads and failure isolation', 'Service discovery'],
    concepts: ['microservices', 'load-balancer', 'search-index'],
    palette: ['app', 'sql', 'lb', 'cache', 'search', 'proxy'],
    features: ['ha', 'cachePolicy', 'replication', 'l7'],
    duration: 70,
    warmup: 5,
    keyspace: { keys: 20000, skew: 1 },
    sources: [
      {
        id: 'users',
        phases: [
          { at: 0, rps: 2500 },
          { at: 25, rps: 2500 },
          { at: 27, rps: 6000, mix: { read: 27, write: 3, search: 70 } },
          { at: 47, rps: 6000 },
          { at: 49, rps: 2500, mix: { read: 70, write: 10, search: 20 } },
        ],
        mix: { read: 70, write: 10, search: 20 },
      },
    ],
    chaos: [{ at: 26, type: 'notice', note: '🔥 A topic is trending — everyone is searching!' }],
    objectives: [
      { kind: 'success', target: 99.5, types: ['read', 'write'], star: 1, label: 'Page views & writes ≥ 99.5% success' },
      { kind: 'p95', target: 100, types: ['read'], star: 1 },
      { kind: 'cost', target: 1150, star: 1 },
      { kind: 'success', target: 85, star: 2, label: 'Overall success ≥ 85% (search may degrade)' },
      { kind: 'p99', target: 220, types: ['read'], star: 3 },
    ],
    start: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        app('a1', 1),
        app('a2', 2),
        app('a3', 3),
        N('sql', COL[4], ROW(1), { id: 'db1', tier: 'L' }),
        N('search', COL[4], ROW(3), { id: 'idx', name: 'Search Index', tier: 'M' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'idx'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { layer: 'L7' } }),
        app('a1', 0, 'M', {}, 'Core 1'),
        app('a2', 1, 'M', {}, 'Core 2'),
        app('s1', 3, 'M', {}, 'Search Svc 1'),
        app('s2', 4, 'M', {}, 'Search Svc 2'),
        app('s3', 5, 'M', {}, 'Search Svc 3'),
        N('sql', COL[4], ROW(1), { id: 'db1', tier: 'L' }),
        N('search', COL[4], ROW(4), { id: 'idx', name: 'Search Index', tier: 'M' }),
      ],
      [
        E('users', 'lb1'),
        E('lb1', 'a1', ['read', 'write']),
        E('lb1', 'a2', ['read', 'write']),
        E('lb1', 's1', ['search']),
        E('lb1', 's2', ['search']),
        E('lb1', 's3', ['search']),
        ...fan(['a1', 'a2'], ['db1']),
        ...fan(['s1', 's2', 's3'], ['idx']),
      ],
    ),
    traps: [
      {
        name: 'one shared pool of five servers (same budget)',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1' }),
            app('a1', 0),
            app('a2', 1),
            app('a3', 2),
            app('a4', 3),
            app('a5', 4),
            N('sql', COL[4], ROW(1), { id: 'db1', tier: 'L' }),
            N('search', COL[4], ROW(3), { id: 'idx', tier: 'M' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3', 'a4', 'a5']), ...fan(['a1', 'a2', 'a3', 'a4', 'a5'], ['db1', 'idx'])],
        ),
      },
      {
        name: 'separate pools behind an L4 balancer',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { layer: 'L4' } }),
            app('a1', 0),
            app('a2', 1),
            app('s1', 3),
            app('s2', 4),
            N('sql', COL[4], ROW(1), { id: 'db1', tier: 'L' }),
            N('search', COL[4], ROW(4), { id: 'idx', tier: 'M' }),
          ],
          [E('users', 'lb1'), E('lb1', 'a1', ['read', 'write']), E('lb1', 'a2', ['read', 'write']), E('lb1', 's1', ['search']), E('lb1', 's2', ['search']), ...fan(['a1', 'a2'], ['db1']), ...fan(['s1', 's2'], ['idx'])],
        ),
      },
    ],
    hints: [
      'Run it once: when search spikes, read latency explodes too because they share servers.',
      'Click the load balancer → Layer 7. Then click a belt out of it and uncheck types to filter what may ride it.',
      'Core pool: read + write, wired to the database. Search pool: search only, wired to the Search Index.',
    ],
    debrief: `### What just happened
Search melted down in its own pool; page views kept flowing through theirs. **Failure isolation** is one of the best arguments for splitting services — along with **independent scaling** (you can size the search pool for search) and **independent deployment**.

### Application layer & microservices (primer)
Separating the web layer from the application layer (platform layer) lets you scale and configure both independently. Adding a new API means adding application servers without necessarily adding web servers. The **single responsibility principle** advocates small, autonomous services that work together.

**Microservices** are a suite of independently deployable, small, modular services, each running a unique process and communicating through a well-defined lightweight mechanism. Pinterest, for example, could have a user profile service, follower service, feed service, search service, photo upload service…

### Service discovery
Systems like **Consul**, **etcd** and **ZooKeeper** help services find each other by tracking registered names, addresses and ports. **Health checks** verify service integrity (often via an HTTP endpoint). Consul and etcd also have a key-value store for config.

**Disadvantages:** adding an application layer with loosely coupled services requires a different approach from an architectural, operations and process viewpoint (vs a monolithic system); microservices add complexity in deployments and operations.

### Layer 7 vs layer 4
Layer 4 balancers see only IPs and ports — they cannot tell a search from a page view. Layer 7 balancers read the request (URL, headers, cookies) and can route by content, at the cost of more CPU and time per request.`,
    quiz: [
      {
        q: 'Why couldn\'t a Layer 4 load balancer separate search traffic from page views?',
        options: ['It is too slow', 'It only sees IPs/ports, not the HTTP request path or headers', 'It does not support health checks', 'It cannot use round robin'],
        answer: 1,
        explain: 'Content-based routing needs to parse the request — that is Layer 7.',
      },
      {
        q: 'What does a service registry like Consul, etcd or ZooKeeper provide?',
        options: ['Object storage', 'Service discovery: names → healthy instances, plus config', 'SQL joins across services', 'A CDN'],
        answer: 1,
        explain: 'Services register themselves; clients look up healthy instances by name instead of hard-coding addresses.',
      },
      {
        q: 'Which is a real downside of microservices?',
        options: ['You cannot scale components independently', 'More operational complexity: deployments, networking, observability', 'Failures always cascade', 'They require a single database'],
        answer: 1,
        explain: 'Many small services mean more deployments, network calls, monitoring and failure modes to manage.',
      },
    ],
  },
];

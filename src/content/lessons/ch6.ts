import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

export const LESSONS_CH6: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '6-1': [
    {
      title: 'What a reverse proxy does',
      body: `A **reverse proxy** is a web server (nginx, HAProxy, Envoy) that sits in front of your application servers and handles HTTP chores so they don't have to:

- **TLS termination** — decrypting HTTPS costs real CPU. Do it once at the edge; backends get plain HTTP over the private network, and you don't install certificates on every server.
- **Caching & static files** — serve CSS/JS/images and other cacheable responses straight from memory.
- **Compression** — gzip/brotli responses.
- **Security** — hide backend servers, block IPs, limit connections per client.
- **Load balancing** — spread requests across several backends.

Both scenes: 1,650 req/s, 40% static files, two small app servers. Watch **App busy**.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 1650 }], mix: { static: 40, read: 60 } }], keyspace: { keys: 5000, skew: 1, staticKeys: 200, staticSkew: 0.8 } },
        stats: ['success', 'p95', { node: 'a1', metric: 'util', label: 'App busy' }, { node: 'px', metric: 'hit', label: 'Proxy hit rate' }],
        scenes: [
          {
            label: 'Load balancer → apps',
            design: D([users(), node('lb', 1, 1, 'px', { name: 'Load balancer (L4)' }), node('app', 2, 0, 'a1'), node('app', 2, 2, 'a2')], [E('users', 'px'), ...fan(['px'], ['a1', 'a2'])]),
            note: 'Apps decrypt TLS and serve every static file themselves.',
            expect: [{ stat: 'success', op: '<', value: 97 }],
          },
          {
            label: 'nginx → apps',
            design: D([users(), node('proxy', 1, 1, 'px', { name: 'nginx' }), node('app', 2, 0, 'a1'), node('app', 2, 2, 'a2')], [E('users', 'px'), ...fan(['px'], ['a1', 'a2'])]),
            note: 'TLS is terminated at the proxy and static files come from its cache.',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Load balancer vs reverse proxy',
      body: `They overlap a lot — nginx and HAProxy do both — but the primer draws the distinction:

- A **load balancer** is useful when you have **multiple servers** doing the same job.
- A **reverse proxy** is useful even with **a single server**: TLS, caching, compression, security and a stable public address.

Common real-world layering: CDN → (cloud) load balancer → reverse proxy / API gateway → app servers.

**Downsides:** one more hop and more complexity, and a single proxy is a single point of failure — run several, which adds yet more complexity.`,
      tip: `Place a **Reverse Proxy** in front of your app servers (it balances too, so it can replace the load balancer). Check **TLS termination**, **Cache static files** and **Compression** in its settings.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '6-2': [
    {
      title: 'SQL injection',
      body: `If your code builds SQL by **concatenating user input**, an attacker can rewrite the query:

\`\`\`js
// ❌ vulnerable: name = "x' OR '1'='1"
db.query("SELECT * FROM users WHERE name = '" + name + "'");

// ✅ parameterized: input is always data, never code
db.query("SELECT * FROM users WHERE name = $1", [name]);
\`\`\`

The same idea applies to **XSS** (cross-site scripting): never render user content as HTML without escaping it.

In the scenes, 5% of requests carry injection payloads (red-ringed dots). Each one that reaches string-built SQL is a **breach**.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 300 }], mix: { read: 95, attack: 5 } }] },
        stats: ['rps', 'success', 'breaches'],
        scenes: [
          { label: 'String-built SQL', design: D([users(), node('app', 2, 1, 'a1', { tier: 'M' })], [E('users', 'a1')]), expect: [{ stat: 'breaches', op: '>', value: 0 }] },
          {
            label: 'Parameterized queries',
            design: D([users(), node('app', 2, 1, 'a1', { tier: 'M', cfg: { sanitize: true }, name: 'App (parameterized)' })], [E('users', 'a1')]),
            expect: [{ stat: 'breaches', op: '<', value: 1 }],
          },
        ],
      },
    },
    {
      title: 'Rate limiting floods',
      body: `A **botnet flood** sends far more traffic than real users ever would, often from relatively few identities. If it reaches your app servers, real users get crowded out.

A **rate limiter** at the edge gives each client a **token bucket**: tokens refill at, say, 10 per second, and each request spends one. Bursts up to the bucket size are fine; sustained floods run dry and get **429 Too Many Requests**. A real user making a request every few seconds never notices.

An **API gateway** bundles this with a **WAF** (web application firewall, which blocks known attack patterns), authentication and L7 routing.

Both scenes: 400 req/s of real users plus a 4,000 req/s botnet.`,
      demo: {
        level: {
          appServes: ['read'],
          sources: [
            { id: 'users', phases: [{ at: 0, rps: 400 }], mix: { read: 100 }, users: 30000 },
            { id: 'users', bot: true, botUsers: 25, phases: [{ at: 0, rps: 4000 }], mix: { read: 100 } },
          ],
        },
        stats: ['success', 'p95', { node: 'a1', metric: 'util', label: 'App busy' }],
        scenes: [
          {
            label: 'No rate limit',
            design: D([users(), node('lb', 1, 1, 'gw', { name: 'Load balancer' }), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })], [E('users', 'gw'), ...fan(['gw'], ['a1', 'a2'])]),
            note: 'Bots soak up the app servers; real users time out.',
            expect: [{ stat: 'success', op: '<', value: 90 }],
          },
          {
            label: 'Gateway · 10 req/s per client',
            design: D([users(), node('gateway', 1, 1, 'gw', { name: 'API gateway', cfg: { rateLimit: 10 } }), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })], [E('users', 'gw'), ...fan(['gw'], ['a1', 'a2'])]),
            note: 'Each bot identity is throttled to a trickle at the edge (blue shield marks).',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Defense in depth',
      body: `No single control is perfect: a WAF misses novel payloads, rate limits can be evaded with more identities. Layer them so each catches what the others miss.

The primer's security basics for interviews:
- **Encrypt** in transit (TLS) and at rest.
- **Sanitize all user input** to prevent XSS and SQL injection.
- Use **parameterized queries**.
- Apply the principle of **least privilege** — each component gets only the permissions it needs.

Also worth mentioning: authentication vs authorization (check permissions server-side on every request), secrets in a secret manager, audit logs, and absorbing volumetric DDoS at the edge (CDN / scrubbing services).`,
      tip: `Put an **API Gateway** in front (it balances too) with the **WAF** on and a per-client **rate limit**. Then turn on **Parameterized queries** on every App Server.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '6-3': [
    {
      title: 'Monoliths and services',
      body: `A **monolith** runs every feature in one application on one pool of servers. Simple to build and deploy — until features start hurting each other.

**Microservices** split the system into small, independently deployable services (users, feed, search, payments…), each with its own servers and often its own data. The primer's benefits:
- **Scale independently** — give search more servers without touching checkout.
- **Isolate failures** — a meltdown in one service doesn't sink the rest.
- **Deploy independently** — small teams own small services.

**Service discovery**: with servers coming and going, services find each other through a registry (**Consul, etcd, ZooKeeper**) that tracks healthy instances by name and holds shared config.

**The cost:** many more moving parts — deployments, network calls, monitoring, failure modes.`,
    },
    {
      title: 'Bulkheads with L7 routing',
      body: `Ships have **bulkheads** — watertight walls — so one flooded compartment doesn't sink the ship. Same idea here: give each workload its **own pool**.

To route by request type you need a **Layer 7** load balancer: it reads the request (path, headers) before choosing a backend. Then each belt can carry only certain request types.

Both scenes get a surge of **search** traffic (yellow) far beyond plan:
- **Shared pool** — searches occupy every server, and page views (blue) drown with them.
- **Separate pools** — the search pool is overwhelmed, but page views flow through their own pool untouched. Watch **Read p95**.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 2500 }], mix: { read: 40, search: 60 } }] },
        stats: ['success', 'readP95', { node: 's1', metric: 'util', label: 'Search pool busy' }],
        scenes: [
          {
            label: 'Shared pool',
            design: D(
              [users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1'), node('app', 2, 1, 's1'), node('app', 2, 2, 'a2'), node('search', 4, 1, 'idx', { tier: 'M', name: 'Search index' })],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 's1', 'a2']), ...fan(['a1', 's1', 'a2'], ['idx'])],
            ),
            expect: [{ stat: 'readP95', op: '>', value: 200 }],
          },
          {
            label: 'Separate pools (L7)',
            design: D(
              [
                users(),
                node('lb', 1, 1, 'lb', { cfg: { layer: 'L7' }, name: 'L7 load balancer' }),
                node('app', 2, 0, 'a1', { name: 'Pages 1' }),
                node('app', 2, 1, 'a2', { name: 'Pages 2' }),
                node('app', 2, 2, 's1', { name: 'Search service' }),
                node('search', 4, 2, 'idx', { tier: 'M', name: 'Search index' }),
              ],
              [E('users', 'lb'), E('lb', 'a1', ['read']), E('lb', 'a2', ['read']), E('lb', 's1', ['search']), E('s1', 'idx')],
            ),
            note: 'The coloured tags on the belts are filters: page views and searches travel separately.',
            expect: [{ stat: 'readP95', op: '<', value: 100 }],
          },
        ],
      },
      tip: `Set the load balancer's **Layer** to **L7**. Click a belt leaving it and uncheck request types to filter what may travel on it. Wire the search pool to the **Search Index** and the core pool to the database.`,
    },
  ],
};

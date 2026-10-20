import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH6: Record<string, SolutionExplain> = {
  '6-1': {
    idea: `Two medium app servers (32 threads) were doing three jobs: TLS for every request, serving static files, and the real work. At 3,000 req/s that's ~34 busy threads — overloaded.

A **reverse proxy** in front takes two of those jobs:
- **TLS termination**: apps receive plain HTTP, saving ~4 ms per request.
- **Static caching**: the 300 static files fit in nginx's memory cache, so ~30% of requests never reach an app.

App load drops to ~1,800 reads × 8 ms + 300 writes × 10 ms ≈ **17 busy threads → ~54%**.`,
    choices: [
      {
        node: 'px',
        title: 'nginx reverse proxy (replaces the load balancer)',
        why: `A reverse proxy also balances load across backends, so it can take the LB's place — $30 instead of $25 + another $85 app server. TLS, static caching and compression all happen at the edge.`,
      },
      {
        node: 'a1',
        title: 'Still two medium app servers',
        why: `They now only do dynamic work. Lower per-request cost also means lower latency: no TLS handshake work on the app, and static hits answered in ~1 ms at the proxy.`,
      },
    ],
    whyNot: {
      'add a third app server': `More capacity fixes the overload, but each server still decrypts TLS and serves files. It costs more ($660 vs $580) and median latency is worse.`,
    },
    takeaway: `A load balancer helps when you have many servers; a reverse proxy helps even with one. In practice nginx/HAProxy/Envoy do both.`,
  },

  '6-2': {
    idea: `Two attacks need two defences — defence in depth:
1. **Flood**: 25 bot identities sending ~260 req/s each. A per-client token bucket of 10 req/s throttles each bot to a trickle at the edge, while real users (one request every few seconds) never notice.
2. **SQL injection**: the WAF blocks ~97% of payloads. **Parameterized queries** make the remaining 3% harmless.`,
    choices: [
      {
        node: 'gw',
        title: 'API gateway: WAF on, rate limit 10 req/s per client',
        why: `The rate limit drops the flood before it reaches app servers, so they only see real traffic. The WAF inspects payloads and filters known attack patterns. The gateway also balances across the app servers, so it replaces the load balancer.`,
      },
      {
        node: 'a1',
        title: 'Parameterized queries on every App Server',
        why: `Input is always passed as data, never spliced into SQL, so an injection payload can't change the query. It costs ~5% CPU and guarantees zero breaches even when the WAF misses.`,
      },
    ],
    whyNot: {
      'WAF + rate limit, but string-built SQL': `The edge stops the flood and most payloads, but ~3% of injection attempts get through the WAF and execute: ~96 breaches. A WAF is a filter, not a guarantee.`,
      'parameterized queries, no rate limiting': `Injections are harmless, but the botnet's ~6,500 req/s reaches the app servers and drowns real users: ~76% success.`,
    },
    takeaway: `Primer basics: encrypt in transit and at rest, sanitize all input, use parameterized queries, apply least privilege — and layer controls so each covers the others' gaps.`,
  },

  '6-3': {
    idea: `The search surge (~4,200 searches/s at 14 ms each ≈ 59 busy threads) is bigger than any pool you can afford. In a shared pool it drags page views down with it.

**Bulkheads**: an **L7** load balancer routes by request type, so page views and searches run on **separate pools**. The search pool is overwhelmed during the surge — but page views run untouched on their own servers. Same budget, very different outcome.`,
    choices: [
      {
        node: 'lb1',
        title: 'Load balancer on Layer 7, with filtered belts',
        why: `Only an L7 balancer reads the request, so only L7 can route by type. The belt filters send read/write to the core pool and search to the search pool.`,
      },
      {
        node: 'a1',
        title: 'Core pool: two medium servers',
        why: `Page views + writes ≈ 1,800 req/s at the surge × ~12 ms ≈ 22 busy threads of 32. They never see a search, so their latency stays flat.`,
      },
      {
        node: 's1',
        title: 'Search pool: three medium servers',
        why: `Sized for normal search load with some surge headroom. During the extreme surge it saturates and some searches fail, which is acceptable — what matters is that the damage stays inside this pool.`,
      },
      {
        node: 'idx',
        title: 'Search index (M)',
        why: `Full-text search on an inverted index takes ~8 ms instead of a ~250 ms table scan. The medium tier has the throughput for the surge.`,
      },
    ],
    whyNot: {
      'one shared pool of five servers (same budget)': `Five shared servers have the same total capacity as the bulkheaded pools, but searches occupy every thread during the surge, so page-view latency triples (read p95 ~270 ms).`,
      'separate pools behind an L4 balancer': `Layer 4 can't see request types, so the belt filters are ignored. Searches land on the core servers (no index wired) and page views land on the search servers (no database wired). Nearly everything fails.`,
    },
    takeaway: `Split services when you need independent scaling or failure isolation, and say what it costs: more moving parts, service discovery, network hops.`,
  },
};

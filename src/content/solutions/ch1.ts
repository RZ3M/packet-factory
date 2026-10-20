import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH1: Record<string, SolutionExplain> = {
  '1-1': {
    idea: `One small App Server is plenty. Traffic peaks at **120 requests/s**; a small server has 8 threads and spends ~12 ms per request (8 ms of work + 4 ms of TLS), so it can finish about **8 ÷ 0.012 ≈ 660 requests/s**.

At peak it's only ~18% busy, so requests almost never queue. Latency is just network (~20 ms round trip) plus the work itself — comfortably under the 100 ms p95 target.`,
    choices: [
      {
        node: 'app1',
        title: 'A single small (S) App Server',
        why: `Capacity ~660/s vs a peak of 120/s gives **5× headroom**. A bigger tier would also pass, but cost more than the $50 budget star for capacity you'd never use. Right-sizing — enough headroom, no waste — is the habit to build from level one.`,
      },
      {
        title: 'Users → App Server, directly',
        why: `With one server there's nothing to balance, so no load balancer yet. Every extra hop adds latency and cost; add components when a measured need appears, not before.`,
      },
    ],
    takeaway: `Start every design with **load**: requests per second at peak, and what each request costs. Throughput ≈ threads ÷ time per request. Keep peak utilization well below 100%.`,
  },

  '1-2': {
    idea: `Writes need **durable storage**, and reads need the data those writes created. Separating the database from the App Server creates the classic two-tier architecture.

Load check at 150 req/s (75% reads, 25% writes):
- **App** — 112 reads × 12 ms + 38 writes × 14 ms ≈ 1.9 busy threads of 8 → **~23%**.
- **Database** — 112 reads × 10 ms + 38 writes × 20 ms ≈ 1.9 busy connections of 10 → **~19%**.`,
    choices: [
      {
        node: 'db1',
        title: 'A small SQL Database',
        why: `Relational databases make writes durable (write-ahead log, fsync) and let any number of app servers share the same data. The small tier has ~5× headroom at this load and keeps the total at $110 — under the $120 star.`,
      },
      {
        node: 'app1',
        title: 'The App Server stays small',
        why: `It now only runs code and talks to the database. Its work per request didn't change, so neither does its size.`,
      },
    ],
    takeaway: `Ask for the **read-to-write ratio** early: it decides whether you'll need caches and replicas (read-heavy) or write-optimized storage (write-heavy).`,
  },

  '1-3': {
    idea: `Traffic climbs to **1,800 req/s**. Size each tier for the peak, aiming for **≤ ~70% utilization** so queues stay short.

- **App** work ≈ 0.9 × 12 ms + 0.1 × 14 ms ≈ 12.2 ms per request → 1,800 × 0.0122 ≈ **22 busy threads**.
  - M (16 threads) → 137% — overloaded. **L (32) → ~69%** ✓. XL (64) → 34% (wasteful).
- **Database** work ≈ 0.9 × 10 ms + 0.1 × 20 ms = 11 ms → 1,800 × 0.011 ≈ **20 busy connections**.
  - M (20) → ~99% — technically under capacity, but queueing at 99% is brutal. **L (40) → ~50%** ✓.`,
    choices: [
      {
        node: 'app1',
        title: 'App Server → L (8 vCPU)',
        why: `The smallest tier that keeps peak utilization near 70%. Per the queueing curve, response time ≈ work × 1/(1−ρ): at 69% that's ~3× the work, at 99% it would be ~100×.`,
      },
      {
        node: 'db1',
        title: 'Database → L',
        why: `A medium database would sit at ~99% at peak — the queue would explode and requests time out. L halves its utilization for $220/mo more. Note the database and app need *different* sizes: they do different work per request.`,
      },
      {
        title: 'Sized before pressing Run',
        why: `Resizing a running machine restarts it. Planning sizes ahead means zero downtime; resizing reactively mid-ramp would cost failed requests during each reboot.`,
      },
    ],
    takeaway: `Vertical scaling is the fastest fix, but cost grows faster than capacity, there's a ceiling, and every box remains a single point of failure — which is where the next level starts.`,
  },

  '1-4': {
    idea: `At **5,500 req/s** the app tier needs ~5,500 × 12.1 ms ≈ **67 busy threads**. The biggest box (XL) has 64 — it can't keep up, and it's a single point of failure anyway.

**Scale out**: three L servers give 96 threads → ~**70%** at peak, behind a load balancer that spreads requests evenly. The load balancer itself barely notices the traffic (0.3 ms per request).`,
    choices: [
      {
        node: 'lb1',
        title: 'Load Balancer in front',
        why: `It turns three servers into one logical service: users hit one address, the LB hands each request to a server. Round robin is fine here because the servers are identical.`,
      },
      {
        node: 'a1',
        title: 'Three identical L servers',
        why: `3 × 32 threads = 96 → ~69% at peak, with room to absorb a burst. **Identical** matters: round robin gives every server the same share, so a smaller server in the pool would saturate first. Three L ($570) are also cheaper than two XL ($900).`,
      },
      {
        node: 'db1',
        title: 'The XL database stays',
        why: `5,225 reads × 10 ms + 275 writes × 20 ms ≈ 58 busy connections of 80 → ~72%. The data tier is fine this time; the bottleneck was the app tier.`,
      },
    ],
    takeaway: `Horizontal scaling: many commodity machines behind a load balancer. It needs **stateless** servers and pushes more connections onto downstream systems.`,
  },

  '1-5': {
    idea: `Two failures are coming: an app server at 20 s and the load balancer at 45 s. Survive both with three moves:
1. **Health checks** so the LB stops sending traffic to the dead server within ~2 s.
2. **N+1 capacity** so the survivors can carry the load: 2,000 req/s needs ~24 busy threads; 2 medium servers = 32 threads (76%) — fine *after* losing one of three.
3. An **HA load-balancer pair** so losing the LB costs ~1 s, not an outage.`,
    choices: [
      {
        node: 'lb1',
        title: 'Health checks + HA pair on the load balancer',
        why: `Without health checks the LB keeps sending a third of all requests to a dead machine forever. The HA pair (active-passive) means a standby LB takes over the virtual IP after ~1 s of missed heartbeats instead of the site being down for 15+ seconds.`,
      },
      {
        node: 'a3',
        title: 'A third app server (N+1)',
        why: `Before the crash: 3 × 16 threads = 48 → 51% busy. After: 2 × 16 = 32 → 76%. Busy, but stable. With only two, the survivor would need 24 threads out of 16 — 150% — and collapse.`,
      },
      {
        node: 'db1',
        title: 'Database L',
        why: `2,000 × ~11 ms ≈ 22 busy connections of 40 → 55%. Not part of this level's failures, but it needs the same headroom thinking.`,
      },
    ],
    whyNot: {
      'health checks + HA but no spare server': `Routing around the dead server works, but the lone survivor gets 2,000 req/s — about 150% of its capacity. Its queue fills and requests fail with 503s for the rest of the run. Redundancy without spare capacity just moves the outage.`,
      'three servers, no health checks': `There's enough capacity, but the LB doesn't know a server died, so it keeps sending it a third of the traffic — every one of those requests fails.`,
    },
    takeaway: `Name the single points of failure, then remove each one: health checks + N+1 for the app tier, an active-passive pair for the load balancer.`,
  },

  '1-6': {
    idea: `Sessions stored in each server's memory tie every user to one machine. Round robin sends users to random servers, so most requests hit a server that has never seen them.

The fix is a **stateless web tier**: every App Server reads sessions from one shared **cache**. Now any server can serve anyone, and a server crashing just removes capacity — nobody gets logged out.`,
    choices: [
      {
        node: 'sess',
        title: 'A shared Session Cache',
        why: `An in-memory key-value store (Redis-style) every server can reach. A session lookup costs ~0.3 ms, trivial next to the request itself, and the small tier handles tens of thousands per second.`,
      },
      {
        node: 'a1',
        title: 'Session storage = External store on every App Server',
        why: `This is what actually makes servers interchangeable. When App Server 2 crashes, the load balancer moves its users elsewhere and their sessions are still in the cache — no "Session lost" errors.`,
      },
      {
        node: 'lb1',
        title: 'Plain round robin stays',
        why: `No need for sticky sessions once servers are stateless — the simplest balancing algorithm works, and load stays even.`,
      },
    ],
    whyNot: {
      'sticky sessions (IP hash)': `Sticky routing works until App Server 2 dies. Its users lose their sessions, and with \`hash(user) mod N\` going from 3 to 2 servers, about **two thirds of all users** are re-mapped to a server that doesn't know them. It happens again when the server comes back.`,
    },
    takeaway: `"Make the web tier stateless" is step one of scaling: sessions, uploads and carts live in shared stores, never on the server handling the request.`,
  },
};

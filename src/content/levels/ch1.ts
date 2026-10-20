import { COL, D, E, N, ROW, USERS, fan } from '../dsl';
import type { Level } from '../types';

const BASE_PALETTE = ['app', 'sql'] as const;

export const ch1: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '1-1',
    chapter: 1,
    title: 'Hello, Production',
    tagline: 'Your first server meets its first users.',
    brief: `You just shipped a tiny landing page. A handful of people are about to visit.

Every visitor sends a **request**. Something has to receive it, do a little work, and send back a **response**. That something is an **App Server**.

**Your job:** place an App Server and connect your Users to it.

Watch the belts: each dot is a request. Blue dots are **reads** (someone viewing a page).`,
    learn: ['Requests and responses', 'Latency: how long one request takes', 'Throughput: how many requests per second you can handle'],
    concepts: ['latency-throughput'],
    palette: ['app'],
    features: [],
    duration: 30,
    warmup: 3,
    keyspace: { keys: 1000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 40 }, { at: 30, rps: 120 }], mix: { read: 1 } }],
    appServes: ['read'],
    objectives: [
      { kind: 'success', target: 99, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 50, star: 2 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D([USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1' })], [E('users', 'app1')]),
    hints: [
      'Drag an App Server from the left palette onto the board.',
      'Drag from the small glowing port on the right edge of Users onto the App Server to connect them.',
      'Press Run (or Space). Faster speeds are in the top bar.',
    ],
    tutorial: [
      { text: 'Drag an **App Server** from the palette on the left onto the board.', check: { type: 'node', kind: 'app' } },
      { text: 'Now connect them: drag from the **output port** (the glowing dot on the right of *Users*) onto your App Server.', check: { type: 'edge', from: 'users', to: 'app' } },
      { text: 'Click your App Server to inspect it. The right panel shows its capacity, cost and settings.', check: { type: 'select', kind: 'app' } },
      { text: 'Hit **Run** (or press Space). Watch the requests flow and the metrics climb.', check: { type: 'running' } },
      { text: 'Each dot riding the belt is a request. The ring around the server shows **utilization** — how busy it is. Let the run finish to see your score.', check: { type: 'manual' } },
    ],
    debrief: `### What just happened
- **Latency** is the time for one request: network round trip (~20 ms from a user to a data center) + time in the server's queue + time doing the work.
- **Throughput** is how many requests per second the system completes. A server with 8 worker threads that spends 12 ms per request tops out around 8 / 0.012 ≈ **660 req/s**.
- The server was only ~20% busy, so requests almost never waited in line. That headroom is why latency stayed low.

### Interview angle
When an interviewer says "design X", the first thing to pin down is **load**: how many requests per second, and what do they do? Everything else follows from that.`,
    quiz: [
      {
        q: 'A server has 8 threads and each request takes 20 ms of CPU. Roughly what is its maximum throughput?',
        options: ['40 req/s', '160 req/s', '400 req/s', '8,000 req/s'],
        answer: 2,
        explain: 'Each thread completes 1 / 0.020 = 50 requests per second. 8 threads × 50 = 400 req/s.',
      },
      {
        q: 'Which best describes latency vs throughput?',
        options: [
          'They are the same thing measured differently',
          'Latency is time per request; throughput is requests completed per unit time',
          'Throughput is time per request; latency is requests per second',
          'Latency only matters for databases',
        ],
        answer: 1,
        explain: 'Generally you aim for maximal throughput with acceptable latency. They interact: as you push throughput toward capacity, latency rises.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '1-2',
    chapter: 1,
    title: 'Remember Me',
    tagline: 'Data has to live somewhere that survives a restart.',
    brief: `Your landing page grew into an app: people now **create accounts and post things**. Orange dots are **writes**.

An App Server keeps things in memory — restart it and everything is gone. Writes must be stored **durably** in a **database**, and reads need to fetch that data.

**Your job:** give your app a database so writes are persisted and reads can find them.`,
    learn: ['Why the web tier and data tier are separated', 'Reads vs writes', 'Durable storage'],
    concepts: ['rdbms', 'scaling-aws'],
    palette: [...BASE_PALETTE],
    features: [],
    duration: 40,
    warmup: 3,
    keyspace: { keys: 5000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 150 }], mix: { read: 75, write: 25 } }],
    objectives: [
      { kind: 'success', target: 99, star: 1 },
      { kind: 'p95', target: 150, star: 1 },
      { kind: 'cost', target: 120, star: 2 },
    ],
    start: D([USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1' })], [E('users', 'app1')]),
    solution: D(
      [USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1' }), N('sql', COL[4], ROW(2), { id: 'db1' })],
      [E('users', 'app1'), E('app1', 'db1')],
    ),
    hints: ['Run it once as-is and watch the writes fail with "Not persisted".', 'Place a SQL Database and wire App Server → Database.'],
    debrief: `### What just happened
Your system now has two **tiers**: a stateless **web/app tier** that runs code, and a **data tier** that stores state. This is the very first step in the primer's *"scaling to millions of users"* walkthrough: move the database off the web server so each can scale independently.

- **Reads** fetch data (≈10 ms on a database — it may touch disk).
- **Writes** are more expensive (≈20 ms): the database must make them durable (write-ahead log, fsync) and update indexes.

### Interview angle
Always ask for the **read:write ratio**. A 100:1 read-heavy system (news feed) and a 1:10 write-heavy one (logging, metrics) lead to completely different designs.`,
    quiz: [
      {
        q: 'Why are writes typically slower than reads in a relational database?',
        options: [
          'Writes are sent over a slower network',
          'Writes must be made durable (log + fsync) and update indexes',
          'Databases deliberately throttle writes',
          'Reads are always served from CPU cache',
        ],
        answer: 1,
        explain: 'Durability (write-ahead logging, flushing to disk) and index maintenance add work to every write.',
      },
      {
        q: 'What is the main benefit of separating the app server from the database?',
        options: ['It is cheaper to run one machine', 'Each tier can be scaled and tuned independently', 'It removes the need for backups', 'It makes reads strongly consistent'],
        answer: 1,
        explain: 'Stateless app servers scale horizontally by adding copies; the stateful database scales with very different techniques (replication, sharding).',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '1-3',
    chapter: 1,
    title: 'Going Viral',
    tagline: 'Traffic is climbing fast. Bigger machines, now.',
    brief: `Someone famous shared your app. Traffic will climb from **100 to 1,800 requests/second** over the next minute.

The simplest way to handle more load is **vertical scaling** ("scaling up"): replace a machine with a bigger one. Click a server and pick a larger **tier** in the inspector.

⚠️ Resizing a running machine requires a **restart** — it will be down while it reboots. Plan your sizes *before* you press Run.

**Keep an eye on utilization.** Queueing theory says latency stays flat until a server is ~70% busy, then shoots up as it nears 100%.`,
    learn: ['Vertical scaling (scale up)', 'Utilization and queueing: why latency explodes near 100%', 'Performance vs scalability'],
    concepts: ['scaling', 'performance-scalability', 'latency-throughput'],
    palette: [...BASE_PALETTE],
    features: [],
    duration: 75,
    warmup: 3,
    keyspace: { keys: 10000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 100 }, { at: 60, rps: 1800 }, { at: 75, rps: 1800 }], mix: { read: 90, write: 10 } }],
    objectives: [
      { kind: 'success', target: 99, star: 1 },
      { kind: 'p95', target: 200, star: 1 },
      { kind: 'cost', target: 600, star: 2 },
      { kind: 'p99', target: 150, star: 3 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1' }), N('sql', COL[4], ROW(2), { id: 'db1' })],
      [E('users', 'app1'), E('app1', 'db1')],
    ),
    solution: D(
      [USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1', tier: 'L' }), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
      [E('users', 'app1'), E('app1', 'db1')],
    ),
    hints: [
      'Click each component and look at "Capacity" in the inspector. Compare it to the 1,800 req/s peak.',
      'Aim for ~70% utilization at peak, not 100%. A server at 99% has huge queues.',
      'The database does a different amount of work per request than the app. Size them separately.',
    ],
    debrief: `### What just happened
You scaled **vertically**: same architecture, bigger boxes. It's the fastest fix and needs no code changes — but notice:

- **Cost grows faster than capacity** at the top end. The 16-vCPU app server costs >10x the 2-vCPU one.
- There's a **ceiling**: you can't buy an infinitely large machine.
- Each box is still a **single point of failure**, and resizing means downtime.

### Utilization and latency
At utilization ρ, a queue's waiting time grows roughly like ρ / (1 − ρ). At 50% that's 1x the service time, at 90% it's 9x, at 99% it's 99x. That's why engineers provision for **peak**, with headroom.

### Performance vs scalability
A service is *scalable* if adding resources increases performance proportionally. If your system is slow for a single user, you have a **performance** problem; if it's fast for one user but slow under heavy load, you have a **scalability** problem.`,
    quiz: [
      {
        q: 'A server is at 95% utilization. What happens to request latency if load increases 5% more?',
        options: ['It rises about 5%', 'It roughly doubles', 'It explodes — queues grow without bound', 'Nothing until 100%'],
        answer: 2,
        explain: 'At 100% utilization arrivals exceed service rate; the queue grows forever and latency is unbounded. Near saturation tiny load increases cause huge latency jumps.',
      },
      {
        q: 'Which is NOT a drawback of vertical scaling?',
        options: ['Hardware ceiling', 'Superlinear cost', 'Requires a load balancer', 'Single point of failure'],
        answer: 2,
        explain: 'Vertical scaling needs no load balancer — that is horizontal scaling. Its drawbacks are cost, a hard ceiling, and keeping a single point of failure.',
      },
      {
        q: 'Your service is fast for one user but slow under heavy load. That is a…',
        options: ['Performance problem', 'Scalability problem', 'Consistency problem', 'Security problem'],
        answer: 1,
        explain: 'Straight from the primer: slow for a single user = performance problem; fast for one but slow under load = scalability problem.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '1-4',
    chapter: 1,
    title: 'Scale Out',
    tagline: 'There is no bigger box. Use more boxes.',
    brief: `Traffic is heading to **5,500 req/s**. Even the biggest App Server (16 vCPU, ~5,200 req/s) can't keep up — and if it dies, you're completely down.

Time for **horizontal scaling** ("scaling out"): run several smaller servers and put a **Load Balancer** in front to spread requests across them.

- Place a Load Balancer between Users and your app servers.
- Add more App Servers and wire LB → each server → database.

**Tip:** select a server and press **Ctrl+D** (or the *Duplicate* button) to clone it *with its wires*. Hold **Shift** while dragging a wire to connect *every* server of that kind at once.`,
    learn: ['Horizontal scaling (scale out)', 'Load balancers and balancing algorithms', 'Commodity machines vs big iron'],
    concepts: ['load-balancer', 'scaling'],
    palette: ['app', 'sql', 'lb'],
    features: [],
    duration: 70,
    warmup: 4,
    keyspace: { keys: 10000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }, { at: 40, rps: 5500 }, { at: 70, rps: 5500 }], mix: { read: 95, write: 5 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 150, star: 1 },
      { kind: 'cost', target: 1700, star: 2 },
      { kind: 'p99', target: 120, star: 3 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('app', COL[2], ROW(2), { id: 'app1', tier: 'XL' }), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL', locked: true })],
      [E('users', 'app1'), E('app1', 'db1')],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'L' }),
        N('app', COL[2], ROW(2), { id: 'a2', tier: 'L' }),
        N('app', COL[2], ROW(3), { id: 'a3', tier: 'L' }),
        N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL', locked: true }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
    ),
    hints: [
      'Users → Load Balancer → several App Servers → Database.',
      'Total capacity is the sum of the servers behind the LB. You need ~5,500 req/s plus headroom.',
      'Smaller servers are cheaper per request than one huge one. With round robin, keep the pool identical — a smaller server gets the same share and melts.',
    ],
    debrief: `### What just happened
A **load balancer** distributes requests across a pool of identical servers. Benefits from the primer:
- Prevents requests from going to unhealthy servers and prevents overloading any single one
- Removes a single point of failure in the web tier
- Lets you scale with **commodity machines**, which are cheaper per unit of capacity than big iron

### Balancing algorithms
- **Round robin** — each server in turn. Simple, but ignores differences in load.
- **Least connections** — send to the server with the fewest in-flight requests. Adapts to slow servers.
- **Random** — surprisingly decent at scale.
- **IP hash / sticky** — the same client always lands on the same server (useful for stateful apps; brittle when servers change).

### Disadvantages of horizontal scaling
It adds complexity: servers must be **stateless** (no local sessions or uploads), and downstream systems (databases, caches) must handle more simultaneous connections.`,
    quiz: [
      {
        q: 'Which load balancing algorithm best handles servers that become temporarily slow?',
        options: ['Round robin', 'Least connections', 'IP hash', 'DNS round robin'],
        answer: 1,
        explain: 'A slow server accumulates in-flight requests, so least-connections automatically sends it less new work.',
      },
      {
        q: 'What must be true about app servers for horizontal scaling to work cleanly?',
        options: ['They must be identical in size', 'They must be stateless — any server can handle any request', 'They must share a disk', 'They must each have their own database'],
        answer: 1,
        explain: 'If any request can go to any server, user state (sessions, uploads) must live outside the servers — in a shared cache, database or object store.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '1-5',
    chapter: 1,
    title: 'Things Break',
    tagline: 'Servers die. Design for it.',
    brief: `At scale, hardware failure isn't an *if*, it's a *when*. During this run **one of your app servers will crash** — and later, **your load balancer will die too**.

You inherited a setup with two app servers and a load balancer whose **health checks are switched off**.

- Without health checks, the LB keeps sending a share of traffic to the dead server.
- With only two servers, losing one means the survivor gets **double the load**. Do you have **N+1** capacity?
- A single load balancer is itself a **single point of failure**. An **active-passive pair** survives losing one.`,
    learn: ['Health checks', 'N+1 redundancy and capacity headroom', 'Single points of failure', 'Active-passive failover'],
    concepts: ['availability', 'failover', 'load-balancer'],
    palette: ['app', 'sql', 'lb'],
    features: ['ha'],
    duration: 70,
    warmup: 4,
    keyspace: { keys: 10000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2000 }], mix: { read: 90, write: 10 } }],
    chaos: [
      { at: 20, type: 'crash', target: 'a1', note: '💥 Kernel panic on App Server 1!' },
      { at: 45, type: 'crash', target: 'kind:lb', recoverAfter: 15, note: '💥 The load balancer hit a hardware fault!' },
    ],
    objectives: [
      { kind: 'success', target: 96.5, star: 1 },
      { kind: 'p95', target: 200, star: 1 },
      { kind: 'cost', target: 700, star: 2 },
      { kind: 'availability', target: 93, star: 3 },
    ],
    start: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { healthChecks: false } }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M', name: 'App Server 1' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'M', name: 'App Server 2' }),
        N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { healthChecks: true, ha: true } }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M', name: 'App Server 1' }),
        N('app', COL[2], ROW(2), { id: 'a3', tier: 'M', name: 'App Server 3' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'M', name: 'App Server 2' }),
        N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
    ),
    traps: [
      {
        name: 'health checks + HA but no spare server',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { healthChecks: true, ha: true } }),
            N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
            N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
            N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1'])],
        ),
      },
      {
        name: 'three servers, no health checks',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { healthChecks: false, ha: true } }),
            N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
            N('app', COL[2], ROW(2), { id: 'a3', tier: 'M' }),
            N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
            N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
        ),
      },
    ],
    hints: [
      'Click the Load Balancer and turn on Health checks.',
      'After one server dies, can the remaining servers carry 2,000 req/s at a sane utilization? Add one more.',
      'When the load balancer dies, everything behind it is unreachable. Enable its HA pair (active-passive).',
    ],
    debrief: `### What just happened
- **Health checks** let the load balancer detect a dead server within seconds and stop routing to it.
- **N+1 redundancy**: if you need N servers to carry peak load, run N+1 so losing one doesn't overload the rest.
- The single load balancer was a **single point of failure (SPOF)**. An **active-passive** pair has a standby that takes over the virtual IP when heartbeats stop.

### Fail-over patterns (from the primer)
- **Active-passive**: heartbeats between an active and a standby server. If the heartbeat stops, the passive takes over the active's IP. Downtime depends on whether the passive is "hot" or must boot.
- **Active-active**: both servers serve traffic and share load. If one fails, the other carries everything — so each must have spare capacity.

**Disadvantages:** fail-over adds hardware and complexity, and there's a risk of data loss if the active fails before newly written data is replicated.`,
    quiz: [
      {
        q: 'You need 4 servers to handle peak traffic. Following N+1, how many do you run?',
        options: ['4', '5', '8', '3'],
        answer: 1,
        explain: 'N+1: one extra so a single failure leaves you with enough capacity.',
      },
      {
        q: 'In active-passive fail-over, what triggers the passive server to take over?',
        options: ['A human operator', 'Missing heartbeats from the active server', 'High CPU on the passive server', 'A DNS TTL expiring'],
        answer: 1,
        explain: 'The pair exchange heartbeats; when the active stops responding, the passive assumes its IP address and resumes service.',
      },
      {
        q: 'Which component in a typical web stack is most often overlooked as a single point of failure?',
        options: ['The app servers', 'The load balancer itself', 'The users', 'The CDN edge'],
        answer: 1,
        explain: 'Teams add many app servers behind one load balancer — which is then the SPOF. Use redundant LBs (active-passive or active-active).',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '1-6',
    chapter: 1,
    title: 'Who Am I Again?',
    tagline: 'Logged out at random? Your servers have amnesia.',
    brief: `Users log in, and your app servers remember each user's **session** in local memory. Support tickets are flooding in: *"I keep getting logged out!"*

With round-robin balancing, a user's next request often lands on a **different server** that has never heard of them.

Two ways out:
1. **Sticky sessions** — make the LB send each user to the same server (IP hash). Quick… but what happens when a server dies?
2. **Stateless servers** — move sessions into a **shared cache** every server can read. Wire each App Server to a Cache and switch *Session storage* to **External store**.

A server **will crash** mid-run. Choose wisely.`,
    learn: ['Stateful vs stateless services', 'Sticky sessions and their failure mode', 'Externalizing session state'],
    concepts: ['stateless', 'load-balancer', 'cache'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['sessions', 'ha'],
    sessions: true,
    duration: 70,
    warmup: 4,
    keyspace: { keys: 10000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 90, write: 10 }, users: 4000 }],
    chaos: [{ at: 30, type: 'crash', target: 'a2', recoverAfter: 15, note: '💥 App Server 2 crashed!' }],
    objectives: [
      { kind: 'success', target: 98.5, star: 1 },
      { kind: 'p95', target: 200, star: 1 },
      { kind: 'cost', target: 800, star: 2 },
    ],
    start: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M', name: 'App Server 1' }),
        N('app', COL[2], ROW(2), { id: 'a2', tier: 'M', name: 'App Server 2' }),
        N('app', COL[2], ROW(3), { id: 'a3', tier: 'M', name: 'App Server 3' }),
        N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M', name: 'App Server 1', cfg: { sessions: 'external' } }),
        N('app', COL[2], ROW(2), { id: 'a2', tier: 'M', name: 'App Server 2', cfg: { sessions: 'external' } }),
        N('app', COL[2], ROW(3), { id: 'a3', tier: 'M', name: 'App Server 3', cfg: { sessions: 'external' } }),
        N('cache', COL[4], ROW(0), { id: 'sess', name: 'Session Cache' }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'sess'])],
    ),
    traps: [
      {
        name: 'sticky sessions (IP hash)',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { algorithm: 'ip-hash' } }),
            N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
            N('app', COL[2], ROW(2), { id: 'a2', tier: 'M' }),
            N('app', COL[2], ROW(3), { id: 'a3', tier: 'M' }),
            N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1'])],
        ),
      },
    ],
    hints: [
      'Run it once and look at the failure reason: "Session lost".',
      'IP-hash sticky sessions fix the steady state — but watch what happens when App Server 2 dies and every user gets re-hashed.',
      'Add a Cache, wire every App Server to it, and set each App Server\'s Session storage to "External store".',
    ],
    debrief: `### What just happened
A **stateful** server holds data that only it knows (sessions, uploads, in-memory carts). That couples users to machines:
- Load balancers must use **sticky sessions**, which unbalance load.
- When a server dies, everyone pinned to it loses their state.
- With hash-based stickiness, *changing the number of servers re-maps most users* (hash mod N changes for almost every key).

A **stateless** web tier keeps no user state locally — sessions live in a shared store like Redis. Now any server can handle any request, servers can be added or killed freely, and autoscaling just works.

### Interview angle
"Make the web tier stateless" is one of the first moves in the primer's *scale to millions of users* solution: *"Move session data out of the web servers into a cache/NoSQL store."*`,
    quiz: [
      {
        q: 'Why do sticky sessions using hash(user) mod N break badly when a server is removed?',
        options: [
          'The hash function becomes slower',
          'Changing N re-maps most users to different servers, losing their sessions',
          'Only users on the removed server are affected, which is fine',
          'Load balancers cannot hash IP addresses',
        ],
        answer: 1,
        explain: 'With mod-N hashing, going from 3 to 2 servers moves roughly 2/3 of all keys. Consistent hashing reduces this to ~1/N.',
      },
      {
        q: 'Where should session state live in a horizontally scaled web tier?',
        options: ['In each app server\'s memory', 'In a shared store such as Redis or a database', 'In the load balancer', 'In DNS'],
        answer: 1,
        explain: 'A shared session store makes servers interchangeable, so any server can serve any user.',
      },
    ],
  },
];

import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

const appOnly = (tier: 'S' | 'M' | 'L' | 'XL' = 'S') => D([users(), node('app', 2, 1, 'app', { tier, name: 'App Server' })], [E('users', 'app')]);

export const LESSONS_CH1: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '1-1': [
    {
      title: 'Every click is a request',
      body: `When someone opens your site, their browser sends a **request** across the internet to one of your servers. The server does some work — runs your code, builds a page — and sends back a **response**.

That round trip has three parts:
1. **Network time** — getting there and back. Even nearby users pay ~20 ms; the other side of the planet costs ~200 ms.
2. **Waiting time** — if the server is busy, the request waits in a **queue**.
3. **Work time** — the actual CPU work, here about 12 ms.

On the right, the grey box is your users and the green box is an **App Server**. Each blue dot riding the belt is one request. Watch the **p95** stat: 95% of requests finish faster than that.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 60 }], mix: { read: 100 } }], appServes: ['read'] },
        stats: ['rps', 'success', 'p95', { node: 'app', metric: 'util', label: 'App busy' }],
        scenes: [{ label: 'One server, light traffic', design: appOnly(), expect: [{ stat: 'success', op: '>', value: 99 }] }],
      },
    },
    {
      title: 'Latency vs throughput',
      body: `Two numbers describe how a system performs:

- **Latency** — how long *one* request takes (milliseconds).
- **Throughput** — how many requests you finish *per second*.

A server has a fixed number of worker threads. If each request needs **S** seconds of work and the server has **N** threads, it can finish at most **N ÷ S** requests per second. A small App Server here has 8 threads and spends ~12 ms per request → about **660 requests/second**.

Switch between the two scenes. Under light load requests sail through. Push past capacity and requests start **piling up** in front of the server (the amber squares) — latency shoots up, and eventually requests time out.

> Aim for maximal throughput with *acceptable* latency. The two are linked: the closer you run to capacity, the worse latency gets.`,
      demo: {
        level: { appServes: ['read'] },
        stats: ['rps', 'success', 'p95', { node: 'app', metric: 'util', label: 'App busy' }],
        scenes: [
          {
            label: 'Light load · 100/s',
            design: appOnly(),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 100 }], mix: { read: 100 } }] },
            note: 'The server is ~15% busy. Requests almost never wait.',
            expect: [{ stat: 'p95', op: '<', value: 80 }],
          },
          {
            label: 'Overloaded · 750/s',
            design: appOnly(),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 750 }], mix: { read: 100 } }] },
            note: 'More arrive than the server can finish. The queue grows, latency explodes, then requests fail.',
            expect: [{ stat: 'p95', op: '>', value: 300 }],
          },
        ],
      },
    },
    {
      title: 'Reading the factory floor',
      body: `Everything you'll see in the game:

- **Dots on belts** are requests. Colour = type: <span style="color:#38bdf8">● read</span>, <span style="color:#fb923c">● write</span>, <span style="color:#4ade80">● static file</span>, <span style="color:#c084fc">● background job</span>… The legend lives in the right-hand panel.
- **Belt chevrons** move faster when more traffic flows, and turn **red** when the machine they feed is overloaded.
- The bar at the bottom of each machine is **utilization** — green is relaxed, amber is busy, red is near saturation.
- **Amber squares** stacking up at a machine's input are its **queue**.
- **Red ✕ sparks** are failed requests. **OFFLINE** means the machine crashed.

The top bar shows live **traffic, success rate, p95 latency and cost**. The charts at the bottom show them over time.`,
      tip: `Drag an **App Server** from the palette onto the board, then drag from the glowing **output port** on the right of *Users* onto it. Press **Space** to run, and use **1–4** to change speed.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 200 }, { at: 8, rps: 720 }, { at: 16, rps: 720 }], mix: { read: 100 } }] },
        stats: ['rps', 'success', 'p95', { node: 'app', metric: 'queue', label: 'Queued' }],
        scenes: [{ label: 'Traffic ramps up', design: appOnly(), note: 'Watch the utilization bar turn red and the queue pile form as traffic ramps past capacity.' }],
      },
    },
  ],

  // ---------------------------------------------------------------------------
  '1-2': [
    {
      title: 'Where does the data live?',
      body: `An App Server keeps things **in memory**. Memory is fast but **volatile**: restart the process — a deploy, a crash, a resize — and it's gone. Worse, with several servers each one would hold a *different* copy.

Anything that must survive goes into a **database**: a separate system built to store data **durably** (on disk, with a write-ahead log) and let many app servers share it.

Compare the scenes: without a database, **writes** (orange) have nowhere to go and fail, and **reads** have no data to return.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 150 }], mix: { read: 75, write: 25 } }] },
        stats: ['rps', 'success', 'p95', { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          { label: 'App only', design: appOnly(), note: 'Every request fails: reads find no data, writes are never persisted.', expect: [{ stat: 'success', op: '<', value: 5 }] },
          {
            label: 'App + database',
            design: D([users(), node('app', 2, 1, 'app', { name: 'App Server' }), node('sql', 4, 1, 'db', { name: 'SQL Database' })], [E('users', 'app'), E('app', 'db')]),
            note: 'The app does its work, then reads or writes the database before answering.',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Reads vs writes',
      body: `Databases treat reads and writes very differently:

| | Read | Write |
|---|---|---|
| What happens | Find rows (ideally via an index) | Log it, fsync to disk, update every index |
| Typical cost here | ~10 ms | ~20 ms |
| Scales with | Caches, replicas | Sharding (hard) |

That's why the first question in any design interview is the **read-to-write ratio**. A news site might be 100:1 reads, a metrics pipeline 1:10. The ratio decides whether you reach for caches and replicas or for write-optimized storage.

Your App Server routes automatically: reads go to whatever can serve them, writes go to durable storage.`,
    },
    {
      title: 'Two tiers',
      body: `You've just built the classic **two-tier** architecture — the first step in the primer's *"scaling to millions of users"* walkthrough:

- **Web/app tier** — stateless code. Easy to copy and scale out.
- **Data tier** — state. Hard to scale, so you protect it.

Separating them means each can be sized, tuned, and scaled on its own. From now on most levels are about protecting that data tier from too much load.`,
      tip: `Place a **SQL Database** and drag a wire from the App Server's output port to it. Click any component to see its capacity and cost in the inspector on the right.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '1-3': [
    {
      title: 'Why "90% busy" is a problem',
      body: `Requests don't arrive in a neat line — they arrive **randomly**. Sometimes three show up at once. If the server is still busy, they wait.

Queueing theory gives a famous result: waiting time grows roughly like **ρ ÷ (1 − ρ)**, where ρ is utilization.

| Utilization | Response time vs. pure work |
|---|---|
| 50% | ~2× |
| 80% | ~5× |
| 90% | ~10× |
| 99% | ~100× |

Drag the slider and watch the queue. This is why engineers plan for **~60–70% utilization at peak**, not 100%.`,
      widget: 'queueing',
    },
    {
      title: 'Scaling up',
      body: `The quickest fix for an overloaded server is **vertical scaling** ("scaling up"): replace it with a bigger machine with more CPU cores, so more requests run in parallel.

Both scenes get the same **900 requests/second**. The small server is past its limit; the large one coasts at ~40% busy.

Sizes in this game:

| Tier | vCPU | App capacity | Cost |
|---|---|---|---|
| S | 2 | ~660/s | $40/mo |
| M | 4 | ~1,300/s | $85/mo |
| L | 8 | ~2,600/s | $190/mo |
| XL | 16 | ~5,200/s | $450/mo |

The **database** has its own sizes, and does a different amount of work per request. Size each component for its own load.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 900 }], mix: { read: 90, write: 10 } }] },
        stats: ['rps', 'success', 'p95', { node: 'app', metric: 'util', label: 'App busy' }, { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'Small app server',
            design: D([users(), node('app', 2, 1, 'app', { tier: 'S', name: 'App (S)' }), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database (M)' })], [E('users', 'app'), E('app', 'db')]),
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Large app server',
            design: D([users(), node('app', 2, 1, 'app', { tier: 'L', name: 'App (L)' }), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database (M)' })], [E('users', 'app'), E('app', 'db')]),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'The catch with bigger boxes',
      body: `Vertical scaling is simple — no code changes — but it has limits:

- **Cost grows faster than capacity** at the top end. XL is 11× the price of S.
- There's a **ceiling**: you can't buy an infinitely large machine.
- **Resizing means a restart.** Changing a running server's size takes it offline while it reboots.
- It's still **one machine**. If it dies, you're down.

### Performance vs scalability
If your system is slow for a *single* user, that's a **performance** problem (fix the code). If it's fast for one user but slow under load, that's a **scalability** problem (add or rearrange capacity).`,
      tip: `Click a component and pick a **Size** in the inspector. Plan sizes *before* you press Run — resizing mid-run causes downtime.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '1-4': [
    {
      title: 'Scaling out',
      body: `When one machine isn't enough — or is too expensive — use **many** machines. This is **horizontal scaling** ("scaling out").

A **load balancer** sits in front of a pool of identical servers and hands each incoming request to one of them. Capacity adds up: three servers ≈ three times the throughput.

Both scenes get **6,000 requests/second**. The biggest single server tops out around 5,200/s. Three medium-large servers behind a load balancer cruise.

Other benefits: smaller **commodity** machines are cheaper per request, and losing one server no longer takes you down.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 6000 }], mix: { read: 100 } }] },
        stats: ['rps', 'success', 'p95', 'cost'],
        scenes: [
          {
            label: 'One XL server',
            design: D([users(), node('app', 2, 1, 'app', { tier: 'XL', name: 'App (XL)' })], [E('users', 'app')]),
            note: 'Even the biggest box saturates.',
            expect: [{ stat: 'success', op: '<', value: 97 }],
          },
          {
            label: 'Load balancer + 3 servers',
            design: D(
              [users(), node('lb', 1, 1, 'lb', { name: 'Load Balancer' }), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 1, 'a2', { tier: 'L' }), node('app', 2, 2, 'a3', { tier: 'L' })],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])],
            ),
            note: 'Each server gets a third of the traffic and runs comfortably.',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'How a load balancer chooses',
      body: `Common balancing algorithms:

- **Round robin** — server 1, 2, 3, 1, 2, 3… Simple, but it ignores how busy each server is.
- **Least connections** — send to the server with the fewest requests in flight. Adapts automatically to slow or small servers.
- **Random** — surprisingly good at scale.
- **IP hash / sticky** — the same client always lands on the same server. Useful for stateful apps (but see level 1-6).

The scenes use a pool with **two large servers and one small one**. Round robin gives the small server the same share as the big ones, so it melts while the others idle. Least connections notices and sends it less.`,
      demo: {
        level: { appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 4000 }], mix: { read: 100 } }] },
        stats: ['rps', 'success', { node: 'a3', metric: 'util', label: 'Small server busy' }, { node: 'a1', metric: 'util', label: 'Big server busy' }],
        scenes: [
          {
            label: 'Round robin',
            design: D(
              [users(), node('lb', 1, 1, 'lb', { name: 'LB · round robin' }), node('app', 2, 0, 'a1', { tier: 'L', name: 'App (L)' }), node('app', 2, 1, 'a2', { tier: 'L', name: 'App (L)' }), node('app', 2, 2, 'a3', { tier: 'S', name: 'App (S)' })],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])],
            ),
            expect: [{ stat: 'success', op: '<', value: 98 }],
          },
          {
            label: 'Least connections',
            design: D(
              [users(), node('lb', 1, 1, 'lb', { name: 'LB · least conn', cfg: { algorithm: 'least-conn' } }), node('app', 2, 0, 'a1', { tier: 'L', name: 'App (L)' }), node('app', 2, 1, 'a2', { tier: 'L', name: 'App (L)' }), node('app', 2, 2, 'a3', { tier: 'S', name: 'App (S)' })],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Building a pool',
      body: `Horizontal scaling isn't free:
- Servers must be **interchangeable** — no user data stored on any one of them (more in level 1-6).
- **Downstream** systems — the database — now see connections from *every* server.
- The load balancer itself can become a **bottleneck** or a **single point of failure**.

**Layer 4 vs Layer 7**: an L4 balancer only sees IP addresses and ports (fast, simple). An L7 balancer reads the HTTP request and can route by URL, header or cookie (more flexible, a bit more work). You'll use L7 routing later.`,
      tip: `Place a **Load Balancer** between Users and your servers. Select a server and press **Ctrl+D** to clone it *with its wires*. Hold **Shift** while dragging a wire to connect **every** server of that type at once.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '1-5': [
    {
      title: 'Everything fails, eventually',
      body: `At scale, failure is routine: disks die, kernels panic, deploys go wrong. Good systems assume it.

A load balancer finds out a server died through **health checks**: every couple of seconds it pings each server and stops sending traffic to any that don't answer.

Both scenes have three servers, and one **crashes 5 seconds in**. Without health checks the load balancer keeps sending a third of all traffic into the void. With them, it notices within ~2 s and routes around the dead server.`,
      demo: {
        level: { appServes: ['read'], duration: 18, sources: [{ id: 'users', phases: [{ at: 0, rps: 1200 }], mix: { read: 100 } }], chaos: [{ at: 5, type: 'crash', target: 'a2' }] },
        stats: ['rps', 'success', 'failed'],
        scenes: [
          {
            label: 'No health checks',
            design: D([users(), node('lb', 1, 1, 'lb', { cfg: { healthChecks: false }, name: 'LB (no checks)' }), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 1, 'a2', { tier: 'M' }), node('app', 2, 2, 'a3', { tier: 'M' })], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])]),
            expect: [{ stat: 'success', op: '<', value: 85 }],
          },
          {
            label: 'Health checks on',
            design: D([users(), node('lb', 1, 1, 'lb', { name: 'LB (health checks)' }), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 1, 'a2', { tier: 'M' }), node('app', 2, 2, 'a3', { tier: 'M' })], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])]),
            expect: [{ stat: 'success', op: '>', value: 94 }],
          },
        ],
      },
    },
    {
      title: 'N+1: spare capacity',
      body: `Routing around a dead server only helps if the **survivors can carry the load**.

If you need *N* servers to handle peak traffic, run **N+1**. Then losing one leaves you with exactly enough.

Both scenes take 2,000 req/s with health checks on, and one server dies. With two servers, the survivor gets *double* its load and drowns. With three, the remaining two run busy but fine.`,
      demo: {
        level: { appServes: ['read'], duration: 18, sources: [{ id: 'users', phases: [{ at: 0, rps: 2000 }], mix: { read: 100 } }], chaos: [{ at: 5, type: 'crash', target: 'a1' }] },
        stats: ['rps', 'success', { node: 'a2', metric: 'util', label: 'Survivor busy' }],
        scenes: [
          {
            label: '2 servers',
            design: D([users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2'])]),
            expect: [{ stat: 'success', op: '<', value: 90 }],
          },
          {
            label: '3 servers (N+1)',
            design: D([users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 1, 'a3', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])]),
            expect: [{ stat: 'success', op: '>', value: 94 }],
          },
        ],
      },
    },
    {
      title: 'Fail-over patterns',
      body: `A **single point of failure (SPOF)** is any component whose death takes everything down. Notice that adding app servers moved the SPOF to… the load balancer.

The primer's two fail-over patterns:

- **Active-passive** — a standby watches the active one through **heartbeats**. When heartbeats stop, the standby takes over the active's IP address. Downtime depends on whether the standby is *hot* (already running) or *cold*.
- **Active-active** — both serve traffic and share the load. If one dies, the other carries everything, so each needs spare capacity.

Downsides: more hardware, more complexity, and a risk of losing data the active had not yet copied to the standby.`,
      tip: `Click the **Load Balancer**: turn on **Health checks**, and turn on the **HA pair** to give it an active-passive standby.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '1-6': [
    {
      title: 'Stateful servers',
      body: `When a user logs in, the server creates a **session**: "this browser belongs to Alice". If the session lives in *that server's memory*, the server is **stateful** — only it knows Alice.

With a load balancer, Alice's next request may land on a **different** server, which has never heard of her: she's logged out.

In the first scene each server keeps its own sessions and the load balancer uses round robin — most requests fail with **Session lost**. In the second, every server reads sessions from one **shared cache**, so any server can serve anyone.`,
      demo: {
        level: { sessions: true, appServes: ['read'], sources: [{ id: 'users', phases: [{ at: 0, rps: 600 }], mix: { read: 100 }, users: 1500 }] },
        stats: ['rps', 'success', 'failed'],
        scenes: [
          {
            label: 'Local sessions',
            design: D([users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1'), node('app', 2, 1, 'a2'), node('app', 2, 2, 'a3')], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])]),
            expect: [{ stat: 'success', op: '<', value: 70 }],
          },
          {
            label: 'Shared session store',
            design: D(
              [
                users(),
                node('lb', 1, 1, 'lb'),
                node('app', 2, 0, 'a1', { cfg: { sessions: 'external' } }),
                node('app', 2, 1, 'a2', { cfg: { sessions: 'external' } }),
                node('app', 2, 2, 'a3', { cfg: { sessions: 'external' } }),
                node('cache', 4, 0, 'sess', { name: 'Session cache' }),
                node('sql', 4, 2, 'db', { name: 'Database' }),
              ],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['sess', 'db'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Sticky sessions: a tempting patch',
      body: `One fix: make the load balancer **sticky** — hash each client's IP so Alice always lands on the same server.

It works… until a server dies. Everyone pinned to it loses their session. And with \`hash(user) mod N\`, changing *N* from 3 to 2 re-maps about **two thirds of all users**, so they're logged out too.

Watch what happens when a server crashes 6 seconds in.`,
      demo: {
        level: { sessions: true, appServes: ['read'], duration: 18, sources: [{ id: 'users', phases: [{ at: 0, rps: 600 }], mix: { read: 100 }, users: 1500 }], chaos: [{ at: 6, type: 'crash', target: 'a2' }] },
        stats: ['rps', 'success', 'failed'],
        scenes: [
          {
            label: 'Sticky (IP hash) + crash',
            design: D([users(), node('lb', 1, 1, 'lb', { cfg: { algorithm: 'ip-hash' }, name: 'LB · IP hash' }), node('app', 2, 0, 'a1'), node('app', 2, 1, 'a2'), node('app', 2, 2, 'a3')], [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3'])]),
            note: 'Fine at first. After the crash, a wave of users is re-hashed onto servers that do not know them.',
            expect: [{ stat: 'success', op: '<', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'The stateless web tier',
      body: `The robust answer: keep **no user state on web/app servers at all**.

- Sessions → a shared store (Redis/Memcached) or signed tokens.
- Uploads → object storage.
- Carts, drafts → a database.

Now servers are **cattle, not pets**: add them, remove them, autoscale, deploy, crash — users never notice. This is one of the first moves in the primer's *scale to millions* walkthrough.`,
      tip: `Add a **Cache** and Shift-wire every App Server to it. Then click each App Server and set **Session storage** to **External store**.`,
    },
  ],
};

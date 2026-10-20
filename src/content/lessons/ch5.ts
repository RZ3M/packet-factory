import type { BoardRegion, LessonStep } from '../types';
import { D, E, N, fan, node } from './kit';

const REG2: BoardRegion[] = [
  { region: 'us', x: 0, y: 0, w: 60, h: 13 },
  { region: 'eu', x: 0, y: 14, w: 60, h: 13 },
];
const REG_UA: BoardRegion[] = [
  { region: 'us', x: 0, y: 0, w: 48, h: 9 },
  { region: 'ap', x: 0, y: 10, w: 48, h: 9 },
];

const cap = (mode: 'sync' | 'async') =>
  D(
    [
      N('users', 2, 4, { id: 'users_us', name: 'Users · US', region: 'us', locked: true }),
      N('users', 2, 18, { id: 'users_eu', name: 'Users · EU', region: 'eu', locked: true }),
      N('app', 14, 4, { id: 'a_us', tier: 'M', region: 'us', name: 'App (US)' }),
      N('app', 14, 18, { id: 'a_eu', tier: 'M', region: 'eu', name: 'App (EU)' }),
      N('sql', 28, 4, { id: 'db_us', tier: 'L', region: 'us', name: 'Primary (US)', cfg: { replication: mode } }),
      N('sql', 28, 18, { id: 'db_eu', tier: 'L', region: 'eu', name: 'Primary (EU)', cfg: { replication: mode } }),
    ],
    [E('users_us', 'a_us'), E('users_eu', 'a_eu'), E('a_us', 'db_us'), E('a_eu', 'db_eu'), E('db_us', 'db_eu'), E('db_eu', 'db_us')],
  );

const capDemo = {
  regions: REG2,
  level: {
    duration: 22,
    keyspace: { keys: 2000, skew: 1.1 },
    sources: [
      { id: 'users_us', region: 'us' as const, phases: [{ at: 0, rps: 500 }], mix: { read: 70, write: 30 } },
      { id: 'users_eu', region: 'eu' as const, phases: [{ at: 0, rps: 500 }], mix: { read: 70, write: 30 } },
    ],
    chaos: [{ at: 6, type: 'partition' as const, regions: ['us', 'eu'] as ['us', 'eu'], duration: 9 }],
  },
  stats: ['success', 'conflicts', 'stale', 'p95'] as const,
};

export const LESSONS_CH5: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '5-1': [
    {
      title: 'Availability in numbers',
      body: `Availability is the share of time a system works, usually written in **nines**:

| | Downtime / year | / month | / day |
|---|---|---|---|
| 99% | 3.65 days | 7.3 hours | 14.4 min |
| 99.9% (three 9s) | 8h 46m | 43m 50s | 1m 26s |
| 99.99% (four 9s) | 52m 36s | 4m 23s | 8.6 s |

**Components in sequence multiply.** A request passes through LB → app → database; if each is 99.9% available, together they are 0.999³ ≈ **99.7%**. The chain is weaker than any link.

**Components in parallel protect each other.** The tier is only down if *every* copy is down: two 99.9% copies give 1 − 0.001² = **99.9999%**.

So: find every **single point of failure** and give it a twin. (Try the *Counting Nines* lab to play with the math.)`,
    },
    {
      title: 'Chaos monkey',
      body: `Netflix famously runs a **chaos monkey** that kills servers in production on purpose, so engineers *must* build systems that survive it.

Both scenes suffer the **same three failures** — the load balancer at 4 s, an app server at 12 s, the database primary at 19 s — each rebooting a few seconds later. (Time is compressed: weeks of bad luck in 30 seconds.)

- **Single everything**: one LB, one app server, one database. Every failure is an outage.
- **Redundant**: an HA load-balancer pair, three app servers behind health checks, and a database with a standby, automatic failover and a replica.`,
      demo: {
        level: {
          duration: 30,
          sources: [{ id: 'users', phases: [{ at: 0, rps: 600 }], mix: { read: 85, write: 15 } }],
          chaos: [
            { at: 4, type: 'crash', target: 'kind:lb', recoverAfter: 6, note: 'Load balancer fails' },
            { at: 12, type: 'crash', target: 'a1', recoverAfter: 6, note: 'An app server fails' },
            { at: 19, type: 'crash', target: 'db', recoverAfter: 12, note: 'The database primary fails' },
          ],
        },
        stats: ['success', 'failed', 'p95'],
        scenes: [
          {
            label: 'Single everything',
            design: D(
              [N('users', 2, 7, { id: 'users', name: 'Users', locked: true }), node('lb', 1, 1, 'lb'), node('app', 2, 1, 'a1', { tier: 'M' }), node('sql', 3, 1, 'db', { name: 'Database' })],
              [E('users', 'lb'), E('lb', 'a1'), E('a1', 'db')],
            ),
            note: 'Every failure takes the whole site down until that component reboots.',
            expect: [{ stat: 'success', op: '<', value: 50 }],
          },
          {
            label: 'Redundant',
            design: D(
              [
                N('users', 2, 7, { id: 'users', name: 'Users', locked: true }),
                node('lb', 1, 1, 'lb', { cfg: { ha: true }, name: 'LB (HA pair)' }),
                node('app', 2, 0, 'a1'),
                node('app', 2, 1, 'a2'),
                node('app', 2, 2, 'a3'),
                node('sql', 4, 0, 'db', { name: 'Primary', cfg: { autoFailover: true, replication: 'sync' } }),
                node('sql', 4, 1, 'sb', { name: 'Standby', cfg: { role: 'standby' } }),
                node('sql', 4, 2, 'r1', { name: 'Replica', cfg: { role: 'replica' } }),
              ],
              [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db', 'sb', 'r1']), E('db', 'sb'), E('db', 'r1')],
            ),
            note: 'Each failure is a blip, not an outage. The biggest dip is the ~8 s database failover when writes pause — that window is your RTO.',
            expect: [{ stat: 'success', op: '>', value: 85 }],
          },
        ],
      },
    },
    {
      title: 'MTBF and MTTR',
      body: `Availability ≈ **MTBF ÷ (MTBF + MTTR)**:
- **MTBF** — mean time between failures. Better hardware and fewer risky changes push it up.
- **MTTR** — mean time to recovery. Health checks, automatic failover, fast restarts and good alerts push it **down**.

You usually can't stop failures, but you can make recovery automatic and fast. That's why this chapter is full of health checks and failover rather than "better servers".

**Independence matters:** the parallel formula assumes copies fail independently. Two servers in the same rack, on the same power feed, or running the same bad deploy fail **together**. Spread copies across availability zones and regions (next level).`,
      tip: `Remove every single point of failure: **HA pair** on the load balancer, **N+1** app servers with **health checks**, and a database **standby + automatic failover** plus a **read replica**. Wire every app to every database node.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '5-2': [
    {
      title: 'How DNS works',
      body: `Before a browser can connect, it has to turn **example.com** into an IP address. That's **DNS**: a hierarchical lookup (root → \`.com\` → your authoritative servers), with answers **cached** along the way by resolvers, the OS and the browser for the record's **TTL** (time to live).

Record types worth knowing:
- **A** — name → IP address.
- **CNAME** — name → another name (www.example.com → example.com).
- **NS** — which servers are authoritative for a domain.
- **MX** — where to deliver email.

Managed DNS (Route 53, Cloudflare) can do more than return one IP: **weighted round robin**, **latency-based** or **geolocation** routing, and **health-checked failover**.`,
    },
    {
      title: 'Serving users from nearby',
      body: `A CDN fixed *static* files for far-away users. For **dynamic** requests you need servers in more regions, and something to send each user to the nearest one: **geo-DNS**.

Both scenes serve **users in Asia**. With a single US region, every request crosses the Pacific. With geo-DNS and a stack in Asia, users get answered locally.

Data is the hard part: a common middle ground is **one write primary** plus a **read replica in each region**. Reads stay local; writes cross the ocean.`,
      demo: {
        regions: REG_UA,
        level: { appServes: ['read'], sources: [{ id: 'users', region: 'ap', phases: [{ at: 0, rps: 500 }], mix: { read: 100 } }] },
        stats: ['rps', 'success', 'p95', 'p50'],
        scenes: [
          {
            label: 'One region (US)',
            design: D(
              [N('users', 2, 13, { id: 'users', name: 'Users · Asia', region: 'ap', locked: true }), N('lb', 14, 3, { id: 'lb_us', region: 'us', name: 'LB (US)' }), N('app', 26, 3, { id: 'a_us', region: 'us', tier: 'M', name: 'App (US)' })],
              [E('users', 'lb_us'), E('lb_us', 'a_us')],
            ),
            expect: [{ stat: 'p95', op: '>', value: 200 }],
          },
          {
            label: 'Geo-DNS + Asia stack',
            design: D(
              [
                N('users', 2, 13, { id: 'users', name: 'Users · Asia', region: 'ap', locked: true }),
                N('dns', 14, 9, { id: 'dns', region: 'ap', name: 'Geo-DNS' }),
                N('lb', 26, 3, { id: 'lb_us', region: 'us', name: 'LB (US)' }),
                N('app', 38, 3, { id: 'a_us', region: 'us', tier: 'M', name: 'App (US)' }),
                N('lb', 26, 13, { id: 'lb_ap', region: 'ap', name: 'LB (Asia)' }),
                N('app', 38, 13, { id: 'a_ap', region: 'ap', tier: 'M', name: 'App (Asia)' }),
              ],
              [E('users', 'dns'), E('dns', 'lb_us'), E('dns', 'lb_ap'), E('lb_us', 'a_us'), E('lb_ap', 'a_ap')],
            ),
            expect: [{ stat: 'p95', op: '<', value: 100 }],
          },
        ],
      },
    },
    {
      title: 'Regional failover and TTL',
      body: `When a whole region fails, health-checked DNS stops handing out its addresses and sends users to the next-closest healthy region.

But resolvers **cache** answers for the TTL. Users keep trying the dead region until their cached answer expires:
- **Long TTL** (minutes) — fewer lookups, but slow failover.
- **Short TTL** (seconds) — fast failover, but more lookups (each adds latency) and more DNS cost.

**DNS downsides (primer):** lookups add a little latency (mitigated by caching), managing DNS is complex, and DNS providers are juicy DDoS targets.`,
      tip: `Place a **DNS** node: wire every Users group → DNS, and DNS → each region's load balancer. Components dropped inside a region band belong to that region. Set **TTL** in the DNS settings.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '5-3': [
    {
      title: 'The CAP theorem',
      body: `A distributed system can guarantee at most two of:
- **Consistency** — every read gets the most recent write (or an error).
- **Availability** — every request gets a non-error response (maybe not the latest data).
- **Partition tolerance** — it keeps working when the network between nodes fails.

Networks *do* fail, so partition tolerance isn't optional. The real question is what you do **during a partition**:

- **CP** — refuse requests you can't make consistent. Some users get errors; nobody sees wrong data. Banks, inventory, leader election.
- **AP** — keep answering on both sides, accept that they disagree for a while, reconcile later. Social feeds, likes, shopping carts.

(The Consistency & CAP lab lets you poke at this on three replicas.)`,
    },
    {
      title: 'A partition, live',
      body: `Two regions, each with its own primary, replicating to each other (**master-master**). Six seconds in, the transatlantic link **fails for 9 seconds**.

- **Async replication (AP)**: both sides keep accepting writes. When the link heals, the same records were changed on both sides → **conflicts** (for a bank: double spends). Reads on each side were stale meanwhile.
- **Sync replication (CP)**: a write needs the other side's acknowledgement. During the partition, writes are **refused** — errors, but **zero conflicts**.

Normal operation differs too: sync replication pays a transatlantic round trip on **every** write (watch p95).`,
      demo: {
        ...capDemo,
        stats: [...capDemo.stats],
        scenes: [
          { label: 'Async (AP)', design: cap('async'), expect: [{ stat: 'conflicts', op: '>', value: 0 }, { stat: 'success', op: '>', value: 98 }] },
          { label: 'Sync (CP)', design: cap('sync'), expect: [{ stat: 'conflicts', op: '<', value: 1 }, { stat: 'success', op: '<', value: 97 }] },
        ],
      },
      tip: `Click each primary and set **Replication** to **Synchronous** for CP, **Asynchronous** for AP. Wiring two primaries to each other in both directions makes them master-master.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '5-4': [
    {
      title: 'Consistency patterns',
      body: `Between "always correct" and "anything goes" there's a spectrum:

- **Weak consistency** — after a write, reads may or may not see it. Best effort. *Memcached, VoIP, video chat, live games*: if you lose signal for a few seconds, that audio is just gone.
- **Eventual consistency** — after a write, reads **will** see it, typically within milliseconds. Data replicates asynchronously. *DNS, email, most NoSQL defaults.* Great for highly available systems.
- **Strong consistency** — after a write, reads **always** see it. Data replicates synchronously. *Relational databases, file systems.* Needed for transactions.

Useful in-betweens: **read-your-writes** (you always see your own changes), **monotonic reads** (you never go back in time).`,
    },
    {
      title: 'Choosing AP — and cleaning up',
      body: `For a like button, refusing a like is worse than a count that's briefly off. That's **AP**: accept writes on both sides, replicate asynchronously, and reconcile.

How conflicts get resolved:
- **Last-write-wins** — keep the newest timestamp. Simple, but silently drops the other update.
- **Version vectors + app logic** — detect concurrent edits and merge them (or ask the user).
- **CRDTs** — data types that merge automatically. A like counter is the textbook case: increments from both sides just add up.

Same partition as the previous level — this time the **AP** behaviour is what you want.`,
      demo: {
        ...capDemo,
        stats: [...capDemo.stats],
        scenes: [
          { label: 'Async (AP)', design: cap('async'), note: 'Always available. Conflicts are merged (last write wins) when the partition heals.', expect: [{ stat: 'success', op: '>', value: 98 }] },
          { label: 'Sync (CP)', design: cap('sync'), note: 'Consistent — but users see errors during the partition, and every write is slower.' },
        ],
      },
      tip: `Set both primaries to **Asynchronous** replication. Conflicts are allowed here; availability and write latency are what's scored.`,
    },
  ],
};

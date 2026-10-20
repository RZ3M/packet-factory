import type { BoardRegion, Level } from '../types';
import type { Region } from '../../engine/types';
import { COL, D, E, N, ROW, USERS, fan } from '../dsl';

// Multi-region layouts: horizontal bands, one per region.
const BAND = 17;
const bandY = (r: number) => r * BAND;
const REGIONS3: BoardRegion[] = [
  { region: 'us', x: 0, y: bandY(0), w: 84, h: BAND - 1 },
  { region: 'eu', x: 0, y: bandY(1), w: 84, h: BAND - 1 },
  { region: 'ap', x: 0, y: bandY(2), w: 84, h: BAND - 1 },
];
const REGIONS2: BoardRegion[] = REGIONS3.slice(0, 2);
const rIdx: Record<Region, number> = { us: 0, eu: 1, ap: 2 };
const y0 = (r: Region) => bandY(rIdx[r]) + 3;

const regionUsers = (r: Region, name: string) => USERS({ id: `users_${r}`, x: 2, y: y0(r) + 4, name, region: r });

export const ch5: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '5-1',
    chapter: 5,
    title: 'Counting Nines',
    tagline: 'Chaos monkey is loose. Everything fails, constantly.',
    brief: `Your SLA promises **"three nines"**. To prove it, the SRE team unleashed a **chaos monkey**: during this run, *any* app server, load balancer, cache or database can die at random and come back ~10 s later. (Time is compressed — this is a month of bad luck in two minutes.)

Remember the math:
- Components **in sequence** multiply: LB × app × DB — the chain is weaker than any link.
- Components **in parallel** protect each other: the tier only fails if *every* copy fails at once.

So every tier needs redundancy: a **HA load balancer pair**, **N+1 app servers behind health checks**, and a database with a **standby, automatic failover and a read replica**.

Availability here = the share of seconds in which ≥ 99% of requests succeeded.`,
    learn: ['Availability in sequence vs parallel', 'Eliminating single points of failure', 'MTBF and MTTR'],
    concepts: ['availability', 'failover', 'replication'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy', 'replication', 'failover', 'instances'],
    duration: 120,
    warmup: 5,
    seed: 7,
    keyspace: { keys: 20000, skew: 0.9 },
    failures: { kinds: ['app', 'lb', 'sql', 'cache'], mtbf: 90, mttr: 8 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 85, write: 15 } }],
    objectives: [
      { kind: 'success', target: 95, star: 1 },
      { kind: 'availability', target: 80, star: 1 },
      { kind: 'dataLoss', target: 0, star: 2 },
      { kind: 'cost', target: 1700, star: 2 },
      { kind: 'availability', target: 83, star: 3 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), N('app', COL[2], ROW(1), { id: 'a1', tier: 'L' }), N('app', COL[2], ROW(3), { id: 'a2', tier: 'L' }), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { ha: true } }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
        N('app', COL[2], ROW(2), { id: 'a2', tier: 'M' }),
        N('app', COL[2], ROW(3), { id: 'a3', tier: 'M' }),
        N('sql', COL[4], ROW(0), { id: 'db1', tier: 'M', name: 'Primary', cfg: { replication: 'sync', autoFailover: true } }),
        N('sql', COL[5], ROW(1), { id: 'sb', tier: 'M', name: 'Standby', cfg: { role: 'standby' } }),
        N('sql', COL[5], ROW(3), { id: 'r1', tier: 'M', name: 'Replica A', cfg: { role: 'replica' } }),
        N('sql', COL[4], ROW(4), { id: 'r2', tier: 'M', name: 'Replica B', cfg: { role: 'replica' } }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2', 'a3']), ...fan(['a1', 'a2', 'a3'], ['db1', 'sb', 'r1', 'r2']), E('db1', 'sb'), E('db1', 'r1'), E('db1', 'r2')],
    ),
    traps: [
      {
        name: 'redundant apps, single database',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1', cfg: { ha: true } }),
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
      'Turn on the load balancer\'s HA pair. Add a third app server so one can die without overloading the rest.',
      'The database is the big single point of failure: add a hot standby with automatic failover, plus read replicas so reads survive failovers.',
      'Use synchronous replication so failovers lose nothing. Wire every app to every database node.',
    ],
    debrief: `### What just happened
Every tier failed at some point, and the system kept serving because nothing was a **single point of failure**.

### Availability in numbers (primer)
| | Downtime / year | / month | / day |
|---|---|---|---|
| 99.9% (three 9s) | 8h 45m 57s | 43m 49.7s | 1m 26.4s |
| 99.99% (four 9s) | 52m 35.7s | 4m 23s | 8.6s |

- **In sequence:** \`A = A_lb × A_app × A_db\` — two 99.9% parts in sequence give 99.8%.
- **In parallel:** \`A = 1 − (1 − A₁)(1 − A₂)\` — two 99.9% copies in parallel give 99.9999%.

Availability is also a function of **MTBF / (MTBF + MTTR)**: fail less often, or recover faster. Health checks, automatic failover and fast reboots all shrink MTTR.

**Caveat:** the parallel formula assumes independent failures. Copies sharing a rack, power feed, region or a bad deploy fail together — that's why the next level spreads across regions.

Try the **Counting Nines** lab to play with the math.`,
    quiz: [
      {
        q: 'Three components, each 99.9% available, are in sequence. Total availability is about…',
        options: ['99.9%', '99.7%', '99.99%', '97%'],
        answer: 1,
        explain: '0.999³ ≈ 0.997. Each extra hop in the chain lowers availability.',
      },
      {
        q: 'Two independent copies, each 99%, behind a health-checking load balancer. The pair is about…',
        options: ['98%', '99%', '99.99%', '99.9999%'],
        answer: 2,
        explain: '1 − 0.01 × 0.01 = 0.9999 → four nines.',
      },
      {
        q: 'Which change improves availability WITHOUT reducing how often things fail?',
        options: ['Buying more reliable hardware', 'Reducing MTTR with health checks and automatic failover', 'Removing redundancy', 'Longer DNS TTLs'],
        answer: 1,
        explain: 'Availability ≈ MTBF / (MTBF + MTTR). Faster detection and recovery shrinks MTTR.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '5-2',
    chapter: 5,
    title: 'Going Global',
    tagline: 'Every user deserves a server nearby. And one region will burn.',
    brief: `Your users are now spread across **three continents** and everyone hits a single US region. Reads from Asia take a ~**190 ms** trip before any work happens.

Deploy **in every region**:
- A **DNS** service with **geo routing** sends each user to the closest healthy region. Wire every Users group → DNS → each region's load balancer.
- Each region gets its own load balancer and app servers. Components dropped inside a region band belong to that region.
- Data: keep **one primary** (US) for writes, and put a **read replica in each region** so reads stay local. Wire each region's apps to their local replica *and* to the primary.

Then, mid-run, **Europe goes dark**. DNS must notice and steer European users elsewhere — how fast depends on the record's **TTL**.`,
    learn: ['DNS and geo routing', 'Multi-region active-active web tiers', 'Cross-region replication', 'TTL vs failover speed'],
    concepts: ['dns', 'availability', 'replication', 'latency-throughput'],
    palette: ['app', 'sql', 'lb', 'cache', 'dns', 'cdn', 'objstore'],
    features: ['ha', 'cachePolicy', 'replication', 'failover', 'instances'],
    duration: 80,
    warmup: 6,
    keyspace: { keys: 20000, skew: 1 },
    board: { regions: REGIONS3 },
    sources: [
      { id: 'users_us', region: 'us', phases: [{ at: 0, rps: 1200 }], mix: { read: 90, write: 10 } },
      { id: 'users_eu', region: 'eu', phases: [{ at: 0, rps: 1000 }], mix: { read: 90, write: 10 } },
      { id: 'users_ap', region: 'ap', phases: [{ at: 0, rps: 800 }], mix: { read: 90, write: 10 } },
    ],
    chaos: [{ at: 40, type: 'region-outage', region: 'eu', duration: 25, note: '🔥 A fiber cut takes the entire EU region offline!' }],
    objectives: [
      { kind: 'success', target: 90, star: 1 },
      { kind: 'p95', target: 150, types: ['read'], star: 1 },
      { kind: 'cost', target: 2000, star: 2 },
      { kind: 'p50', target: 60, types: ['read'], star: 3 },
    ],
    start: D(
      [
        regionUsers('us', 'Users · US'),
        regionUsers('eu', 'Users · EU'),
        regionUsers('ap', 'Users · Asia'),
        N('lb', COL[2], y0('us') + 4, { id: 'lb_us', region: 'us' }),
        N('app', COL[3], y0('us'), { id: 'a_us1', tier: 'M', region: 'us' }),
        N('app', COL[3], y0('us') + 6, { id: 'a_us2', tier: 'M', region: 'us' }),
        N('app', COL[4], y0('us') + 3, { id: 'a_us3', tier: 'M', region: 'us' }),
        N('sql', COL[5], y0('us') + 4, { id: 'db', tier: 'L', region: 'us', name: 'Primary (US)' }),
      ],
      [E('users_us', 'lb_us'), E('users_eu', 'lb_us'), E('users_ap', 'lb_us'), ...fan(['lb_us'], ['a_us1', 'a_us2', 'a_us3']), ...fan(['a_us1', 'a_us2', 'a_us3'], ['db'])],
    ),
    solution: D(
      [
        regionUsers('us', 'Users · US'),
        regionUsers('eu', 'Users · EU'),
        regionUsers('ap', 'Users · Asia'),
        N('dns', COL[1], y0('eu') + 4, { id: 'dns', region: 'eu', cfg: { policy: 'geo', ttl: 10 } }),
        N('lb', COL[2], y0('us') + 4, { id: 'lb_us', region: 'us' }),
        N('lb', COL[2], y0('eu') + 4, { id: 'lb_eu', region: 'eu' }),
        N('lb', COL[2], y0('ap') + 4, { id: 'lb_ap', region: 'ap' }),
        N('app', COL[3], y0('us'), { id: 'a_us1', tier: 'M', region: 'us' }),
        N('app', COL[3], y0('us') + 6, { id: 'a_us2', tier: 'M', region: 'us' }),
        N('app', COL[3], y0('eu'), { id: 'a_eu1', tier: 'M', region: 'eu' }),
        N('app', COL[3], y0('eu') + 6, { id: 'a_eu2', tier: 'M', region: 'eu' }),
        N('app', COL[3], y0('ap') + 3, { id: 'a_ap1', tier: 'M', region: 'ap' }),
        N('sql', COL[5], y0('us') + 1, { id: 'db', tier: 'M', region: 'us', name: 'Primary (US)' }),
        N('sql', COL[5], y0('us') + 7, { id: 'r_us', tier: 'L', region: 'us', name: 'Replica (US)', cfg: { role: 'replica' } }),
        N('sql', COL[5], y0('eu') + 3, { id: 'r_eu', tier: 'L', region: 'eu', name: 'Replica (EU)', cfg: { role: 'replica' } }),
        N('sql', COL[5], y0('ap') + 3, { id: 'r_ap', tier: 'M', region: 'ap', name: 'Replica (Asia)', cfg: { role: 'replica' } }),
      ],
      [
        E('users_us', 'dns'),
        E('users_eu', 'dns'),
        E('users_ap', 'dns'),
        E('dns', 'lb_us'),
        E('dns', 'lb_eu'),
        E('dns', 'lb_ap'),
        ...fan(['lb_us'], ['a_us1', 'a_us2']),
        ...fan(['lb_eu'], ['a_eu1', 'a_eu2']),
        E('lb_ap', 'a_ap1'),
        ...fan(['a_us1', 'a_us2'], ['db', 'r_us']),
        ...fan(['a_eu1', 'a_eu2'], ['db', 'r_eu']),
        ...fan(['a_ap1'], ['db', 'r_ap']),
        E('db', 'r_us'),
        E('db', 'r_eu'),
        E('db', 'r_ap'),
      ],
    ),
    traps: [
      {
        name: 'multi-region, but DNS TTL of 5 minutes',
        maxStars: 2,
        design: D(
          [
            regionUsers('us', 'Users · US'),
            regionUsers('eu', 'Users · EU'),
            regionUsers('ap', 'Users · Asia'),
            N('dns', COL[1], y0('eu') + 4, { id: 'dns', region: 'eu', cfg: { policy: 'geo', ttl: 300 } }),
            N('lb', COL[2], y0('us') + 4, { id: 'lb_us', region: 'us' }),
            N('lb', COL[2], y0('eu') + 4, { id: 'lb_eu', region: 'eu' }),
            N('lb', COL[2], y0('ap') + 4, { id: 'lb_ap', region: 'ap' }),
            N('app', COL[3], y0('us'), { id: 'a_us1', tier: 'M', region: 'us' }),
            N('app', COL[3], y0('us') + 6, { id: 'a_us2', tier: 'M', region: 'us' }),
            N('app', COL[3], y0('eu'), { id: 'a_eu1', tier: 'M', region: 'eu' }),
            N('app', COL[3], y0('eu') + 6, { id: 'a_eu2', tier: 'M', region: 'eu' }),
            N('app', COL[3], y0('ap') + 3, { id: 'a_ap1', tier: 'M', region: 'ap' }),
            N('sql', COL[5], y0('us') + 1, { id: 'db', tier: 'M', region: 'us' }),
            N('sql', COL[5], y0('us') + 7, { id: 'r_us', tier: 'M', region: 'us', cfg: { role: 'replica' } }),
            N('sql', COL[5], y0('eu') + 3, { id: 'r_eu', tier: 'M', region: 'eu', cfg: { role: 'replica' } }),
            N('sql', COL[5], y0('ap') + 3, { id: 'r_ap', tier: 'M', region: 'ap', cfg: { role: 'replica' } }),
          ],
          [
            E('users_us', 'dns'),
            E('users_eu', 'dns'),
            E('users_ap', 'dns'),
            E('dns', 'lb_us'),
            E('dns', 'lb_eu'),
            E('dns', 'lb_ap'),
            ...fan(['lb_us'], ['a_us1', 'a_us2']),
            ...fan(['lb_eu'], ['a_eu1', 'a_eu2']),
            E('lb_ap', 'a_ap1'),
            ...fan(['a_us1', 'a_us2'], ['db', 'r_us']),
            ...fan(['a_eu1', 'a_eu2'], ['db', 'r_eu']),
            ...fan(['a_ap1'], ['db', 'r_ap']),
            E('db', 'r_us'),
            E('db', 'r_eu'),
            E('db', 'r_ap'),
          ],
        ),
      },
    ],
    hints: [
      'Place a DNS node. Wire all three Users groups → DNS, and DNS → each region\'s load balancer (geo routing picks the closest).',
      'Build a small stack in EU and Asia: load balancer + app servers + a read replica of the US primary. Wire regional apps to their local replica and to the US primary.',
      'When EU fails, DNS only reroutes after its TTL expires. Lower the TTL for faster failover.',
    ],
    debrief: `### What just happened
Each user resolved your domain through **geo-DNS** and landed in the nearest region. Reads were served by a local replica; only writes crossed the ocean to the primary. When Europe went dark, DNS noticed after its TTL and sent European users to the next-closest region.

### DNS (primer)
DNS translates a name like www.example.com into an IP address, hierarchically: your router or ISP asks a resolver, which asks root → TLD → authoritative servers. Answers are **cached** for the record's **TTL**.
- **NS** records: the DNS servers for a domain. **MX**: mail servers. **A**: name → IP. **CNAME**: name → another name.
- Managed DNS (Route 53, Cloudflare) can route by **weighted round robin**, **latency**, or **geolocation**, and fail over unhealthy endpoints.

**Disadvantages:** a slight delay for lookups (mitigated by caching); management complexity; DNS services have been DDoS targets. And **TTL is a trade-off** — long TTLs mean fewer lookups but clients keep hitting a dead region until the cached answer expires.

### Multi-region
- **Active-active web tiers** with a single write primary is a common middle ground: reads are fast everywhere, writes pay the round trip.
- Cross-region replicas lag more (ocean latency), so stale reads go up.
- Going fully multi-primary is the next level of difficulty — and the next two levels.`,
    quiz: [
      {
        q: 'You lower a DNS record\'s TTL from 300 s to 10 s. What changes?',
        options: ['Lookups become cheaper', 'Clients pick up changes and failovers faster, at the cost of more DNS queries', 'Nothing', 'Records become permanent'],
        answer: 1,
        explain: 'Resolvers cache answers for the TTL. Shorter TTL = faster failover but more lookups (latency + cost).',
      },
      {
        q: 'Which DNS record maps a name to another name?',
        options: ['A', 'MX', 'CNAME', 'NS'],
        answer: 2,
        explain: 'CNAME points one name at another (e.g. example.com → www.example.com). A records map a name to an IP.',
      },
      {
        q: 'With one write primary in the US and replicas in each region, which requests stay fast for an Asian user?',
        options: ['Writes', 'Reads', 'Both', 'Neither'],
        answer: 1,
        explain: 'Reads hit the local replica; writes must cross the Pacific to the primary.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '5-3',
    chapter: 5,
    title: 'The Bank',
    tagline: 'Two regions, one ledger. The network is about to split.',
    brief: `You run a bank in two regions, each with its own primary database, replicating to each other (**master-master**). Customers move money all day — and some accounts are very busy.

Mid-run, the **transatlantic link fails** for 20 seconds: a **network partition**. Each side can still serve its own users, but can't talk to the other.

The **CAP theorem** says during a partition you must choose:
- **Consistency (CP)**: refuse writes you can't safely replicate. Some customers see errors.
- **Availability (AP)**: accept writes on both sides and reconcile later. The same account may be changed on both sides → **conflicts** (double spends!).

Banks pick **C**. Configure replication so **no conflicting writes** ever happen — even if that means refusing some requests. Check the database's *Replication* setting.`,
    learn: ['CAP theorem: choosing CP', 'Master-master replication and conflicts', 'Synchronous replication across regions'],
    concepts: ['cap', 'consistency', 'replication'],
    palette: ['app', 'sql', 'lb', 'dns'],
    features: ['ha', 'replication', 'failover'],
    duration: 70,
    warmup: 5,
    keyspace: { keys: 3000, skew: 1.1 },
    board: { regions: REGIONS2 },
    sources: [
      { id: 'users_us', region: 'us', phases: [{ at: 0, rps: 900 }], mix: { read: 70, write: 30 } },
      { id: 'users_eu', region: 'eu', phases: [{ at: 0, rps: 900 }], mix: { read: 70, write: 30 } },
    ],
    chaos: [{ at: 30, type: 'partition', regions: ['us', 'eu'], duration: 20, note: '✂️ The transatlantic link is down!' }],
    objectives: [
      { kind: 'conflicts', target: 0, star: 1 },
      { kind: 'success', target: 88, star: 1 },
      { kind: 'p95', target: 250, star: 2 },
      { kind: 'stale', target: 1, star: 3 },
    ],
    ...twoRegionBankDesigns('async'),
    hints: [
      'Run it once and watch the conflict counter after the partition heals.',
      'Click each primary and set Replication to Synchronous. A write is only accepted once the other side has it.',
      'During the partition, writes will be refused — that is the point. Reads keep working.',
    ],
    debrief: `### What just happened
With **synchronous** master-master replication, every write needed the other region's acknowledgment. Normally that only costs a transatlantic round trip. During the partition the acknowledgment couldn't arrive, so writes were **refused** — customers saw errors, but no account was ever changed on both sides at once.

That's **CP**: consistent and partition tolerant, sacrificing availability during the partition.

### CAP theorem (primer)
In a distributed system you can only guarantee two of:
- **Consistency** — every read receives the most recent write or an error.
- **Availability** — every request receives a response, without guarantee that it contains the most recent information.
- **Partition tolerance** — the system keeps operating despite arbitrary network partitions.

*Networks aren't reliable, so you need to support partition tolerance — the real trade-off is between consistency and availability.*

**CP** — waiting for a response from the partitioned node might result in a timeout error. A good choice when the business needs **atomic reads and writes**.

### Master-master replication
Both masters serve reads and writes and coordinate on writes; if either goes down the other keeps operating. Downsides: you need a load balancer or app logic to decide where to write; most master-master systems are either **loosely consistent** (violating ACID) or have **higher write latency** due to synchronization; **conflict resolution** gets harder as you add write nodes.`,
    quiz: [
      {
        q: 'During a network partition, a CP system will…',
        options: ['Accept all writes and merge later', 'Refuse or time out some requests rather than return inconsistent data', 'Become a single-region system automatically', 'Disable reads'],
        answer: 1,
        explain: 'CP systems choose consistency: if they cannot confirm a write is safe, they return an error.',
      },
      {
        q: 'Why is partition tolerance usually considered non-negotiable?',
        options: ['It is free', 'Networks fail in practice, so the system must handle partitions somehow', 'Because of DNS', 'Databases require it'],
        answer: 1,
        explain: 'Partitions happen. The real choice is what you give up while one is happening: consistency or availability.',
      },
      {
        q: 'What is a typical cost of synchronous cross-region master-master replication even without partitions?',
        options: ['Lower read latency', 'Higher write latency (a cross-region round trip per write)', 'Data loss', 'Stale reads'],
        answer: 1,
        explain: 'Each write waits for the remote region, adding ~100 ms+ of latency.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '5-4',
    chapter: 5,
    title: 'The Like Button',
    tagline: 'Same split brain. Very different business.',
    brief: `Same two-region, master-master setup — but this time it's a **social app**. People like posts, a lot. The link between regions is going to fail again.

Here, nobody cares if a like count is briefly off or two likes get merged. What they *do* care about: **the app must never say no**. A refused like is a lost user.

Choose **AP**: stay available on both sides of the partition, accept that replicas disagree for a while (**eventual consistency**), and reconcile when the network heals.

Hint: what you did for the bank is exactly the wrong answer here.`,
    learn: ['CAP theorem: choosing AP', 'Eventual consistency', 'Conflict resolution (last-write-wins)'],
    concepts: ['cap', 'consistency', 'replication'],
    palette: ['app', 'sql', 'lb', 'dns'],
    features: ['ha', 'replication', 'failover'],
    duration: 70,
    warmup: 5,
    keyspace: { keys: 3000, skew: 1.1 },
    board: { regions: REGIONS2 },
    sources: [
      { id: 'users_us', region: 'us', phases: [{ at: 0, rps: 900 }], mix: { read: 70, write: 30 } },
      { id: 'users_eu', region: 'eu', phases: [{ at: 0, rps: 900 }], mix: { read: 70, write: 30 } },
    ],
    chaos: [{ at: 30, type: 'partition', regions: ['us', 'eu'], duration: 20, note: '✂️ The transatlantic link is down!' }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 120, types: ['write'], star: 1 },
      { kind: 'p95', target: 110, star: 2 },
      { kind: 'p99', target: 150, star: 3 },
    ],
    ...twoRegionBankDesigns('sync', true),
    hints: [
      'Set both primaries to Asynchronous replication: each side commits locally and ships changes later.',
      'Conflicts will happen on hot keys — here they are acceptable (last write wins).',
    ],
    debrief: `### What just happened
Each region accepted writes locally and replicated asynchronously. During the partition, both sides kept working; afterwards the backlog replayed and conflicting updates were resolved by **last-write-wins**.

That's **AP**: available and partition tolerant, sacrificing consistency — reads on one side didn't see writes from the other for a while.

### AP (primer)
Responses return the most readily available version of the data on any node, which might not be the latest. Writes might take some time to propagate when the partition is resolved. AP is a good choice if the business needs allow for **eventual consistency** or when the system needs to continue working despite external errors.

### Consistency patterns
- **Weak** — after a write, reads may or may not see it (memcached, VoIP, video chat).
- **Eventual** — after a write, reads will eventually see it, typically within milliseconds; data is replicated asynchronously (DNS, email). Works well in highly available systems.
- **Strong** — after a write, reads will see it; data is replicated synchronously (file systems, RDBMSes). Works well in systems that need transactions.

### Resolving conflicts
Last-write-wins is simple but silently drops data. Alternatives: version vectors and app-level merges, or **CRDTs** — data types (like counters) that merge automatically. A like counter is a perfect CRDT: increments from both sides just add up.`,
    quiz: [
      {
        q: 'Which system is the better fit for AP?',
        options: ['Bank ledger', 'Inventory of the last item in stock', 'Social media like counts', 'Password changes'],
        answer: 2,
        explain: 'Like counts tolerate temporary disagreement; refusing a like is worse than a briefly wrong count.',
      },
      {
        q: 'What is "eventual consistency"?',
        options: ['Reads never see writes', 'After a write, reads will see it eventually — usually quickly', 'Writes are synchronous', 'Consistency only during partitions'],
        answer: 1,
        explain: 'Replicas converge over time once updates propagate; until then they may disagree.',
      },
      {
        q: 'Last-write-wins conflict resolution has which downside?',
        options: ['It is slow', 'Concurrent updates can be silently discarded', 'It requires synchronous replication', 'It only works with SQL'],
        answer: 1,
        explain: 'If two sides update the same record, one update simply disappears. CRDTs or app-level merges avoid that for suitable data.',
      },
    ],
  },
];

/** Shared two-region master-master topology. `bad` is the start config; the solution flips it. */
function twoRegionBankDesigns(startMode: 'sync' | 'async', ap = false) {
  const solMode = startMode === 'sync' ? 'async' : 'sync';
  const build = (mode: 'sync' | 'async') =>
    D(
      [
        regionUsers('us', 'Users · US'),
        regionUsers('eu', 'Users · EU'),
        N('dns', COL[1], y0('us') + 12, { id: 'dns', region: 'us', cfg: { policy: 'geo', ttl: 10 } }),
        N('lb', COL[2], y0('us') + 4, { id: 'lb_us', region: 'us' }),
        N('lb', COL[2], y0('eu') + 4, { id: 'lb_eu', region: 'eu' }),
        N('app', COL[3], y0('us') + 1, { id: 'a_us1', tier: 'M', region: 'us' }),
        N('app', COL[3], y0('us') + 7, { id: 'a_us2', tier: 'M', region: 'us' }),
        N('app', COL[3], y0('eu') + 1, { id: 'a_eu1', tier: 'M', region: 'eu' }),
        N('app', COL[3], y0('eu') + 7, { id: 'a_eu2', tier: 'M', region: 'eu' }),
        N('sql', COL[5], y0('us') + 4, { id: 'db_us', tier: 'L', region: 'us', name: 'Primary (US)', cfg: { replication: mode } }),
        N('sql', COL[5], y0('eu') + 4, { id: 'db_eu', tier: 'L', region: 'eu', name: 'Primary (EU)', cfg: { replication: mode } }),
      ],
      [
        E('users_us', 'dns'),
        E('users_eu', 'dns'),
        E('dns', 'lb_us'),
        E('dns', 'lb_eu'),
        ...fan(['lb_us'], ['a_us1', 'a_us2']),
        ...fan(['lb_eu'], ['a_eu1', 'a_eu2']),
        ...fan(['a_us1', 'a_us2'], ['db_us']),
        ...fan(['a_eu1', 'a_eu2'], ['db_eu']),
        E('db_us', 'db_eu'),
        E('db_eu', 'db_us'),
      ],
    );
  return {
    start: build(startMode),
    solution: build(solMode),
    traps: ap ? [] : [],
  };
}

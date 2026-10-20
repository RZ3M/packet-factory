import type { TierId } from '../../engine/types';
import { COL, D, E, N, ROW, USERS, fan } from '../dsl';
import type { Level } from '../types';

const apps = (n: number, tier: TierId = 'L') => Array.from({ length: n }, (_, i) => N('app', COL[2], ROW(i + (n <= 3 ? 1 : 0)), { id: `a${i + 1}`, tier }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `a${i + 1}`);
const front = (n: number, tier: TierId = 'L') => [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), ...apps(n, tier)];
const frontEdges = (n: number) => [E('users', 'lb1'), ...fan(['lb1'], ids(n))];

export const ch3: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '3-1',
    chapter: 3,
    title: 'Copies for Everyone',
    tagline: 'One database, thousands of readers.',
    brief: `**4,000 req/s, 95% reads** — but this time reads are spread evenly over a huge catalog, so a cache only catches a fraction of them. The database is maxed out.

**Master-slave replication** (primary → read replicas):
- The **primary** handles all writes and ships every change to its replicas.
- **Replicas** are read-only copies. Apps send reads to them and writes to the primary.
- Replicas scale *reads*, not writes — every replica must still apply every write.

Wire **SQL → SQL** (primary → replica) to set up replication, then wire your App Servers to the primary *and* the replicas.

Replicas lag slightly behind. A user who reads right after writing might not see their own change yet.`,
    learn: ['Master-slave (primary-replica) replication', 'Read scaling', 'Replication lag and read-your-writes'],
    concepts: ['replication', 'rdbms', 'consistency'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy', 'replication'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 50000, skew: 0.35 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 4000 }], mix: { read: 95, write: 5 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 1300, star: 2 },
      { kind: 'stale', target: 0.05, star: 3 },
    ],
    start: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'M' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3),
        N('sql', COL[4], ROW(0), { id: 'db1', tier: 'M', name: 'Primary' }),
        N('sql', COL[5], ROW(1), { id: 'r1', tier: 'M', name: 'Replica 1', cfg: { role: 'replica' } }),
        N('sql', COL[5], ROW(2) + 1, { id: 'r2', tier: 'M', name: 'Replica 2', cfg: { role: 'replica' } }),
        N('sql', COL[5], ROW(4), { id: 'r3', tier: 'M', name: 'Replica 3', cfg: { role: 'replica' } }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['db1', 'r1', 'r2', 'r3']), E('db1', 'r1'), E('db1', 'r2'), E('db1', 'r3')],
    ),
    traps: [
      {
        name: 'one giant database',
        maxStars: 1,
        design: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
      },
    ],
    hints: [
      'Add a SQL Database and wire the existing one → the new one. The new one becomes a read replica automatically.',
      'Wire every App Server to each replica too (Shift-drag). Apps send reads to replicas and writes to the primary.',
      'Each replica must also apply all the writes. Size so that reads ÷ replicas fits comfortably.',
    ],
    debrief: `### What just happened
The primary kept doing what only it can do — **accept writes** — while reads fanned out across replicas. Purple dots on the dashed links are the **replication stream**: every write is re-applied on every replica.

### Master-slave replication (primer)
- The master serves reads and writes, replicating writes to one or more slaves, which serve only reads.
- If the master goes offline the system can keep serving **reads** in read-only mode until a slave is promoted.

**Disadvantages:**
- Logic is needed to promote a replica to primary.
- **Replication lag**: data may be lost if the primary fails before replicating, and reads from replicas can be stale.
- More replicas = more replication work; write-heavy workloads can bog replicas down applying writes.
- Read scaling helps reads only — every node still processes every write.

### Read-your-writes
A user who posts a comment and immediately reloads may hit a replica that hasn't caught up. Common fixes: read from the primary for a few seconds after a user writes, or route a user's reads to a replica that is known to be caught up.`,
    quiz: [
      {
        q: 'You add 4 read replicas. What happens to your maximum write throughput?',
        options: ['It increases 5×', 'It stays roughly the same (or drops slightly)', 'It doubles', 'Writes now go to replicas'],
        answer: 1,
        explain: 'All writes still go through the single primary, and every replica must apply them too. Replication scales reads, not writes.',
      },
      {
        q: 'A user updates their profile and the next page shows the old data. Most likely cause?',
        options: ['Cache stampede', 'Replication lag on a read replica', 'DNS TTL', 'TCP retransmission'],
        answer: 1,
        explain: 'The read went to a replica that had not yet applied the write — a read-your-writes violation.',
      },
      {
        q: 'If the primary fails in a master-slave setup with no automation, what still works?',
        options: ['Nothing', 'Reads (read-only mode) until a replica is promoted', 'Writes only', 'Everything'],
        answer: 1,
        explain: 'Replicas keep serving reads; writes fail until someone promotes a replica to primary.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '3-2',
    chapter: 3,
    title: 'Primary Down',
    tagline: 'The database just died. Did you lose anyone\'s data?',
    brief: `Your primary database **will crash mid-run and not come back**.

To survive you need:
- A **standby** copy that receives replication and can be **promoted** to primary.
- **Automatic failover** on the primary (heartbeats stop → promote within ~8 s).
- Apps **wired to the standby** so they can reach it once it's promoted.
- Something to serve **reads** while the failover happens.

And then the hard part: **async replication** ships writes *after* acknowledging them. If the primary dies, the last few writes may never have reached the standby — they're gone. **Synchronous replication** waits for the standby before acknowledging: slower writes, zero loss.

Requirement: **no acknowledged write may be lost.**`,
    learn: ['Fail-over: active-passive databases', 'Synchronous vs asynchronous replication', 'RPO: how much data you can afford to lose'],
    concepts: ['failover', 'replication', 'availability'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy', 'replication', 'failover'],
    duration: 70,
    warmup: 5,
    keyspace: { keys: 20000, skew: 0.9 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2000 }], mix: { read: 80, write: 20 } }],
    chaos: [{ at: 25, type: 'crash', target: 'db1', note: '💥 Disk controller failure on the primary database!' }],
    objectives: [
      { kind: 'success', target: 96, star: 1 },
      { kind: 'dataLoss', target: 0, star: 1 },
      { kind: 'p95', target: 150, star: 1 },
      { kind: 'cost', target: 1450, star: 2 },
      { kind: 'availability', target: 85, star: 3 },
    ],
    start: D([...front(3, 'M'), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L', name: 'Primary' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3, 'M'),
        N('sql', COL[4], ROW(0), { id: 'db1', tier: 'L', name: 'Primary', cfg: { replication: 'sync', autoFailover: true } }),
        N('sql', COL[5], ROW(1), { id: 'sb', tier: 'L', name: 'Standby', cfg: { role: 'standby' } }),
        N('sql', COL[5], ROW(3), { id: 'r1', tier: 'L', name: 'Read Replica', cfg: { role: 'replica' } }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['db1', 'sb', 'r1']), E('db1', 'sb'), E('db1', 'r1')],
    ),
    traps: [
      {
        name: 'async replication',
        design: D(
          [
            ...front(3, 'M'),
            N('sql', COL[4], ROW(0), { id: 'db1', tier: 'L', name: 'Primary', cfg: { replication: 'async', autoFailover: true } }),
            N('sql', COL[5], ROW(1), { id: 'sb', tier: 'L', name: 'Standby', cfg: { role: 'standby' } }),
            N('sql', COL[5], ROW(3), { id: 'r1', tier: 'L', name: 'Read Replica', cfg: { role: 'replica' } }),
          ],
          [...frontEdges(3), ...fan(ids(3), ['db1', 'sb', 'r1']), E('db1', 'sb'), E('db1', 'r1')],
        ),
      },
      {
        name: 'replicas but no automatic failover',
        design: D(
          [
            ...front(3, 'M'),
            N('sql', COL[4], ROW(0), { id: 'db1', tier: 'L', name: 'Primary', cfg: { replication: 'sync' } }),
            N('sql', COL[5], ROW(1), { id: 'sb', tier: 'L', name: 'Standby', cfg: { role: 'standby' } }),
            N('sql', COL[5], ROW(3), { id: 'r1', tier: 'L', name: 'Read Replica', cfg: { role: 'replica' } }),
          ],
          [...frontEdges(3), ...fan(ids(3), ['db1', 'sb', 'r1']), E('db1', 'sb'), E('db1', 'r1')],
        ),
      },
    ],
    hints: [
      'Add a database, wire Primary → it, and set its role to Hot standby. Wire every App Server to it as well.',
      'On the primary: enable Automatic failover. Add a read replica so reads keep flowing while the standby is promoted.',
      'Try async first and read the event log when the primary dies. Then switch the primary to Synchronous replication.',
    ],
    debrief: `### What just happened
- Heartbeats to the primary stopped; after ~8 s the standby was **promoted** and apps reconnected to it. That's **active-passive fail-over** for databases.
- With **async replication**, everything the primary committed after the standby's last applied point vanished: the classic *"potential loss of data if the master fails before newly written data can be replicated"*.
- With **sync replication**, the primary only acknowledged writes the standby already had. Slower writes — and if the standby becomes unreachable, a strictly synchronous primary must *refuse* writes. Durability costs availability.

### Two numbers to name in an interview
- **RPO** (recovery point objective): how much data you can lose. Async ≈ seconds; sync ≈ zero.
- **RTO** (recovery time objective): how long until you're back. Here, the ~8 s failover window.

Real systems often use *semi-synchronous* replication: wait for at least one replica, not all.`,
    quiz: [
      {
        q: 'Which replication mode can lose acknowledged writes when the primary fails?',
        options: ['Synchronous', 'Asynchronous', 'Neither', 'Both equally'],
        answer: 1,
        explain: 'Async acknowledges before the replica has the data; a crash in that window loses it.',
      },
      {
        q: 'What is a cost of synchronous replication?',
        options: ['Possible data loss', 'Higher write latency, and writes block if replicas are unreachable', 'Stale reads on the primary', 'No failover is possible'],
        answer: 1,
        explain: 'Each write waits for a replica round trip, and a strict sync primary cannot accept writes when its replica is gone.',
      },
      {
        q: 'During an 8-second database failover, which requests can still succeed if you planned well?',
        options: ['None', 'Reads served from replicas or caches', 'Only writes', 'Only requests from mobile users'],
        answer: 1,
        explain: 'Writes need a primary, but reads can keep flowing from replicas and caches.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '3-3',
    chapter: 3,
    title: 'Split the Data',
    tagline: 'Too many writes for any single machine.',
    brief: `**5,000 req/s and 60% are writes.** Replicas won't help — every replica applies every write. Even the biggest database is pegged.

**Sharding** splits the data across several databases, each owning a slice of the keys. Each shard handles only its slice of reads *and* writes, so write capacity scales with the number of shards.

Place a **Shard Router**, wire App Servers → Router → several SQL databases. The router decides which shard owns each key:
- **Hash** — even spread.
- **Range** — keys 0…N on shard 1, and so on. Simple, but popular keys tend to cluster…
- **Consistent hashing** — even spread, and adding a shard only moves ~1/N of the keys.`,
    learn: ['Sharding (horizontal partitioning)', 'Hash vs range partitioning, hot spots', 'Consistent hashing'],
    concepts: ['sharding', 'consistent-hashing', 'rdbms'],
    palette: ['app', 'sql', 'lb', 'cache', 'shardrouter'],
    features: ['ha', 'cachePolicy', 'replication'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 40000, skew: 0.7 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 5000 }], mix: { read: 40, write: 60 } }],
    objectives: [
      { kind: 'success', target: 99, star: 1 },
      { kind: 'p95', target: 150, star: 1 },
      { kind: 'cost', target: 1900, star: 2 },
      { kind: 'p99', target: 200, star: 3 },
    ],
    start: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3),
        N('shardrouter', COL[3], ROW(2), { id: 'sr', cfg: { strategy: 'consistent' } }),
        N('sql', COL[4] + 2, ROW(1), { id: 's1', tier: 'L', name: 'Shard 1' }),
        N('sql', COL[4] + 2, ROW(2), { id: 's2', tier: 'L', name: 'Shard 2' }),
        N('sql', COL[4] + 2, ROW(3), { id: 's3', tier: 'L', name: 'Shard 3' }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['sr']), ...fan(['sr'], ['s1', 's2', 's3'])],
    ),
    traps: [
      {
        name: 'range partitioning',
        design: D(
          [
            ...front(3),
            N('shardrouter', COL[3], ROW(2), { id: 'sr', cfg: { strategy: 'range' } }),
            N('sql', COL[4] + 2, ROW(1), { id: 's1', tier: 'L' }),
            N('sql', COL[4] + 2, ROW(2), { id: 's2', tier: 'L' }),
            N('sql', COL[4] + 2, ROW(3), { id: 's3', tier: 'L' }),
          ],
          [...frontEdges(3), ...fan(ids(3), ['sr']), ...fan(['sr'], ['s1', 's2', 's3'])],
        ),
      },
      {
        name: 'read replicas instead of shards',
        design: D(
          [
            ...front(3),
            N('sql', COL[4], ROW(1), { id: 'db1', tier: 'XL' }),
            N('sql', COL[5], ROW(3), { id: 'r1', tier: 'L', cfg: { role: 'replica' } }),
          ],
          [...frontEdges(3), ...fan(ids(3), ['db1', 'r1']), E('db1', 'r1')],
        ),
      },
    ],
    hints: [
      'Writes are the bottleneck. Replicas apply every write too, so they do not help here.',
      'Shard Router between the apps and several SQL databases. Each database is a primary for its slice of keys.',
      'Range partitioning puts the most popular (lowest-numbered) keys on the same shard. Use hash or consistent hashing.',
    ],
    debrief: `### What just happened
Each shard owned ~⅓ of the keys and therefore ~⅓ of the reads **and writes**. Write capacity scaled linearly with shards.

### Sharding (primer)
Distributing data across databases so each manages a subset. Less traffic, fewer writes, smaller indexes and more cache hits per shard. If one shard goes down, the others still work (add replicas per shard for availability).

**Disadvantages:**
- Application/routing logic must know where each key lives; cross-shard queries and **joins are painful**.
- **Hot spots**: uneven data or popularity (a celebrity user) can overload one shard — exactly what range partitioning did with the most popular keys.
- **Rebalancing** when you add shards is complex. With \`hash(key) mod N\`, changing N moves almost every key. **Consistent hashing** moves only ~1/N of them.

### How to pick a shard key
High cardinality, evenly distributed, and aligned with your access pattern (e.g. \`user_id\` if most queries are per-user).`,
    quiz: [
      {
        q: 'Which technique increases WRITE capacity of a relational database?',
        options: ['Adding read replicas', 'Sharding', 'Adding a CDN', 'Increasing cache TTL'],
        answer: 1,
        explain: 'Sharding splits writes across independent primaries. Replicas only add read capacity.',
      },
      {
        q: 'With hash(key) mod N sharding, you go from 4 to 5 shards. Roughly what fraction of keys move?',
        options: ['~1/5', '~1/2', '~4/5', 'None'],
        answer: 2,
        explain: 'A key stays only if key mod 4 == key mod 5, which is true for about 1/5 of keys — ~80% move. Consistent hashing moves ~1/5.',
      },
      {
        q: 'What is a "hot spot" in a sharded system?',
        options: ['A shard that is physically overheating', 'One shard receiving disproportionate traffic due to skewed keys or access', 'A cache with a high hit rate', 'A replica with no lag'],
        answer: 1,
        explain: 'Skewed data or popularity concentrates load on one shard, which becomes the bottleneck.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '3-4',
    chapter: 3,
    title: 'Divide by Function',
    tagline: 'Users, products and orders do not need to share a database.',
    brief: `Your monolithic database holds **users, products and orders** together. It needs the most expensive tier just to keep up.

**Federation** (functional partitioning) splits databases **by function**: a Users DB, a Products DB, an Orders DB. Each is smaller, gets only its own traffic, can be sized independently, and keeps more of its working set in memory.

Each request in this level belongs to one domain. Click a database and set **"Holds data for"** to a domain; wire the App Servers to all of them — apps route each request to the matching database.

Traffic split: **products 50%, users 30%, orders 20%**.`,
    learn: ['Federation (functional partitioning)', 'Sizing each store for its own load', 'Why cross-database joins hurt'],
    concepts: ['federation', 'rdbms'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy', 'replication', 'federation'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 30000, skew: 0.6 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 4000 }], mix: { read: 80, write: 20 }, domains: { products: 50, users: 30, orders: 20 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 120, star: 1 },
      { kind: 'cost', target: 1500, star: 2 },
      { kind: 'p99', target: 150, star: 3 },
    ],
    start: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3),
        N('sql', COL[4], ROW(1), { id: 'dp', tier: 'L', name: 'Products DB', cfg: { domain: 'products' } }),
        N('sql', COL[4], ROW(2) + 1, { id: 'du', tier: 'M', name: 'Users DB', cfg: { domain: 'users' } }),
        N('sql', COL[4], ROW(4), { id: 'do', tier: 'M', name: 'Orders DB', cfg: { domain: 'orders' } }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['dp', 'du', 'do'])],
    ),
    traps: [
      {
        name: 'one huge database',
        maxStars: 1,
        design: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
      },
    ],
    hints: [
      'Add two more databases. In each one\'s inspector, set "Holds data for" to products, users or orders.',
      'Products get half the traffic; size that database bigger than the others.',
      'Wire every App Server to all three databases (Shift-drag three times).',
    ],
    debrief: `### What just happened
Instead of one monolithic database, three smaller ones each handle their own domain. Products got the biggest box; users and orders got cheaper ones. Total cost dropped *and* each database has headroom.

### Federation (primer)
Splits databases by function. Less read and write traffic per database, less replication lag, more data fits in memory → more cache hits, and you can write to several databases in parallel.

**Disadvantages:**
- Not effective if your schema needs huge functions or tables.
- Application logic must know which database to read and write.
- **Joining data across databases** is complex (you join in the app, or use a server link).
- More hardware and more operational complexity.

Federation is often the first step toward **microservices**: each service owning its own data.`,
    quiz: [
      {
        q: 'What distinguishes federation from sharding?',
        options: [
          'Federation splits by function (users vs orders); sharding splits the same data by key',
          'They are the same',
          'Federation only applies to caches',
          'Sharding splits by function; federation by key',
        ],
        answer: 0,
        explain: 'Federation = different tables/functions on different DBs. Sharding = the same table partitioned across DBs by key.',
      },
      {
        q: 'A report needs to join orders with user profiles after federation. What is the main pain?',
        options: ['Joins are faster', 'The join must happen across databases (in the app or via links), which is complex and slow', 'Orders can no longer be written', 'Users DB becomes read-only'],
        answer: 1,
        explain: 'Cross-database joins are a known downside of federation.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '3-5',
    chapter: 3,
    title: 'Query Surgery',
    tagline: 'The database is slow. Maybe it is not the hardware.',
    brief: `Pages are slow and the database is on fire. Before you reach for a credit card, look at how it's being used:
- **Indexes are switched off** — every lookup scans the whole table.
- Half of all reads are **multi-table JOINs** (a post + its author + its counts), each several times more expensive than a simple read.

Your budget does not allow the largest database. Tune the one you have:
- **Indexes**: B-tree lookups instead of scans — reads much faster, writes a bit slower.
- **Denormalization**: store redundant copies (e.g. author name inside the post row) so reads skip the joins — reads get cheaper, writes more expensive.

*Profile before you optimize. The cheapest capacity is the work you stop doing.*`,
    learn: ['SQL tuning: indexes', 'Denormalization trade-offs', 'Read vs write cost'],
    concepts: ['sql-tuning', 'denormalization', 'rdbms'],
    palette: ['app', 'sql', 'lb'],
    features: ['ha', 'tuning'],
    duration: 60,
    warmup: 5,
    joinShare: 0.5,
    keyspace: { keys: 20000, skew: 0.8 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2500 }], mix: { read: 90, write: 10 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 120, star: 1 },
      { kind: 'cost', target: 900, star: 2 },
      { kind: 'p50', target: 47, star: 3 },
    ],
    start: D([...front(2), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L', cfg: { indexes: false } })], [...frontEdges(2), ...fan(ids(2), ['db1'])]),
    solution: D(
      [...front(2), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L', cfg: { indexes: true, denormalized: true } })],
      [...frontEdges(2), ...fan(ids(2), ['db1'])],
    ),
    traps: [
      {
        name: 'indexes only (still joining)',
        design: D([...front(2), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L', cfg: { indexes: true } })], [...frontEdges(2), ...fan(ids(2), ['db1'])]),
      },
      {
        name: 'throw hardware at it',
        maxStars: 1,
        design: D([...front(2), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL', cfg: { indexes: true } })], [...frontEdges(2), ...fan(ids(2), ['db1'])]),
      },
    ],
    hints: [
      'Click the database. Turn Indexes on.',
      'Still too slow? Half the reads are joins. Denormalize the schema.',
      'Watch the write latency rise slightly — every write now updates redundant copies and indexes.',
    ],
    debrief: `### What just happened
Same hardware, a fraction of the work. Indexes turned scans into lookups, and denormalization removed the joins from the hot read path. You paid for it on writes.

### SQL tuning (primer highlights)
- **Benchmark and profile** first (slow query log, \`EXPLAIN\`), then fix what's actually slow.
- **Indexes**: columns you SELECT, GROUP BY, ORDER BY or JOIN on should usually be indexed. B-trees keep lookups/inserts/deletes at O(log n). Indexes cost memory and slow down writes. For bulk loads, disable indexes, load, rebuild.
- **Tighten the schema**: use \`CHAR\` for fixed-length fields, \`TEXT\` for large blobs (or store a path to object storage), \`INT\` for numbers up to 2³², \`DECIMAL\` for money, avoid large BLOBs, \`NOT NULL\` where you can.
- **Avoid expensive joins** — denormalize where performance demands it.
- **Partition tables**: hot data in a separate table that fits in memory.
- **Query cache**: can help, but invalidation can make it slower under writes.

### Denormalization
Improves read performance at the expense of write performance: redundant copies in several tables avoid joins. Useful because reads typically outnumber writes 100:1 or even 1000:1. Downsides: duplicated data, constraints (or materialized views) to keep copies in sync, and a design that performs worse under heavy writes.`,
    quiz: [
      {
        q: 'Adding an index on a column generally…',
        options: ['Speeds up reads that filter on it, slows down writes slightly', 'Speeds up both reads and writes', 'Slows down reads', 'Has no effect on writes'],
        answer: 0,
        explain: 'Every insert/update must also maintain the index, so writes pay a small cost for faster reads.',
      },
      {
        q: 'When is denormalization a good idea?',
        options: ['Write-heavy workloads with rare reads', 'Read-heavy workloads where joins dominate latency', 'When you need strict normal forms', 'Never'],
        answer: 1,
        explain: 'Denormalization trades write cost and duplication for cheaper reads — worth it when reads vastly outnumber writes.',
      },
      {
        q: 'What should you do FIRST when a database is slow?',
        options: ['Buy a bigger instance', 'Shard it', 'Benchmark and profile to find the slow queries', 'Switch to NoSQL'],
        answer: 2,
        explain: 'Measure first (slow query log, EXPLAIN). Many "scaling" problems are missing indexes or bad queries.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '3-6',
    chapter: 3,
    title: 'Polyglot Persistence',
    tagline: 'One database cannot be good at everything.',
    brief: `Your platform has grown four very different workloads (check the Traffic mix panel):
- **Ingest** (teal) — a firehose of append-only events: clicks, logs, telemetry.
- **Graph** (pink) — "friends of friends" traversals.
- **Reads/writes** (blue/orange) — simple lookups of profiles and settings by key.
- **Txn** (lime) — payments that must be **atomic** across several rows.

A relational database *can* do all of it — but graph traversals become chains of self-joins, and the ingest firehose saturates its write path.

Pick the right **NoSQL** store for each job and wire them to your apps. Apps automatically send each request type to the fastest store that supports it. But be careful: key-value, document and wide-column stores **don't give you multi-row ACID transactions**.`,
    learn: ['Key-value, document, wide-column and graph databases', 'SQL vs NoSQL: ACID vs BASE', 'Matching storage to access patterns'],
    concepts: ['nosql-kv', 'nosql-document', 'nosql-widecolumn', 'nosql-graph', 'sql-vs-nosql'],
    palette: ['app', 'sql', 'lb', 'cache', 'kv', 'document', 'widecolumn', 'graphdb'],
    features: ['ha', 'cachePolicy', 'replication', 'consistency'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 30000, skew: 0.8 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 5000 }], mix: { read: 25, write: 10, ingest: 40, graph: 15, txn: 10 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'anomalies', target: 0, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 1350, star: 2 },
      { kind: 'p99', target: 120, star: 3 },
    ],
    start: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3),
        N('sql', COL[4], ROW(0), { id: 'db1', tier: 'M', name: 'Payments (SQL)' }),
        N('widecolumn', COL[4], ROW(1) + 1, { id: 'wc', name: 'Events (wide-column)', cfg: { nodes: 1 } }),
        N('graphdb', COL[4], ROW(3), { id: 'gd', name: 'Social graph' }),
        N('kv', COL[4], ROW(4) + 1, { id: 'kv', name: 'Profiles (KV)', cfg: { nodes: 1 } }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['db1', 'wc', 'gd', 'kv'])],
    ),
    traps: [
      {
        name: 'NoSQL for everything (no SQL)',
        design: D(
          [...front(3), N('widecolumn', COL[4], ROW(1), { id: 'wc', cfg: { nodes: 2 } }), N('graphdb', COL[4], ROW(3), { id: 'gd' })],
          [...frontEdges(3), ...fan(ids(3), ['wc', 'gd'])],
        ),
      },
    ],
    hints: [
      'A graph database makes friends-of-friends cheap. A wide-column store eats append-only ingest for breakfast.',
      'Keep payments (Txn) on SQL — NoSQL stores here do not give multi-row ACID transactions, and anomalies are not allowed.',
      'NoSQL stores scale out by adding nodes; start with 1 node each and watch utilization.',
    ],
    debrief: `### What just happened
You built a **polyglot persistence** layer: each workload lives in the store whose data model fits it.

| Store | Model | Great at | Watch out for |
|---|---|---|---|
| **Key-value** (Redis, DynamoDB) | hash map | O(1) get/put by key, huge scale | no joins, no rich queries |
| **Document** (MongoDB, CouchDB) | JSON documents | flexible schema, queries on fields | limited multi-doc transactions |
| **Wide-column** (Cassandra, Bigtable, HBase) | row key → column families | massive write throughput, time series | queries must match the key design |
| **Graph** (Neo4j) | nodes + edges | relationship traversal | hard to shard |
| **SQL** | tables + joins | ACID transactions, ad-hoc queries | scaling writes |

### ACID vs BASE
Relational databases offer **ACID** (Atomicity, Consistency, Isolation, Durability). Many NoSQL stores favor **BASE**: *Basically Available*, *Soft state*, *Eventual consistency* — choosing availability over strict consistency.

### SQL or NoSQL? (primer)
**SQL:** structured data, strict schema, relational data, complex joins, transactions, clear patterns for scaling, mature tooling, fast index lookups.
**NoSQL:** semi-structured data, dynamic schema, non-relational data, no need for complex joins, store many TB/PB, very data-intensive workloads, very high IOPS throughput.`,
    quiz: [
      {
        q: 'Which store is the best fit for a high-volume stream of append-only events (clickstream)?',
        options: ['Graph database', 'Wide-column store', 'Single relational primary', 'In-memory cache only'],
        answer: 1,
        explain: 'Wide-column stores (Cassandra, Bigtable) use log-structured writes and scale out — built for heavy write throughput and time-series data.',
      },
      {
        q: 'What does the "E" in BASE stand for?',
        options: ['Exclusive', 'Eventual consistency', 'Encryption', 'Elasticity'],
        answer: 1,
        explain: 'BASE = Basically Available, Soft state, Eventual consistency.',
      },
      {
        q: 'Which requirement most strongly suggests keeping data in a relational database?',
        options: ['Multi-row ACID transactions (e.g. moving money between accounts)', 'Storing petabytes of logs', 'A flexible, changing schema', 'Simple key lookups at huge scale'],
        answer: 0,
        explain: 'Transactions that must atomically update several rows are the home turf of relational databases.',
      },
    ],
  },
];

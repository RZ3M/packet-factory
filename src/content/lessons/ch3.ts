import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

const lbApps = () => [node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 2, 'a2', { tier: 'L' })];
const front = [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2'])];
const apps = ['a1', 'a2'];

export const LESSONS_CH3: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '3-1': [
    {
      title: 'Copies that serve reads',
      body: `When reads overwhelm a database — and a cache can't help because reads are spread across too many different records — make **copies**.

**Master-slave replication** (primary → replicas):
- The **primary** accepts all writes and streams every change to its **replicas** (the purple dashed links — watch the replication traffic).
- **Replicas** are read-only copies. Apps send **reads to replicas** and **writes to the primary**.

Both scenes take 3,000 req/s, 95% reads, spread over 50,000 records. One database drowns; a primary with two replicas shares the load.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 3000 }], mix: { read: 95, write: 5 } }], keyspace: { keys: 50000, skew: 0.35 } },
        stats: ['success', 'p95', { node: 'db', metric: 'util', label: 'Primary busy' }, { node: 'r1', metric: 'util', label: 'Replica busy' }],
        scenes: [
          {
            label: 'One database',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database' })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Primary + 2 replicas',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { tier: 'M', name: 'Primary' }), node('sql', 5, 1, 'r1', { tier: 'M', name: 'Replica 1', cfg: { role: 'replica' } }), node('sql', 4, 2, 'r2', { tier: 'M', name: 'Replica 2', cfg: { role: 'replica' } })],
              [...front, ...fan(apps, ['db', 'r1', 'r2']), E('db', 'r1'), E('db', 'r2')],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Replication lag',
      body: `Replication isn't instant. The primary commits a write, then ships it to replicas, which **re-apply** it. The delay is **replication lag** — usually milliseconds, but it grows when replicas are busy or far away.

Consequences:
- **Stale reads** — a read from a replica may miss a write that just happened.
- **Read-your-writes violations** — a user saves their profile, refreshes, and sees the old version.
- Replicas **don't scale writes**: every replica must apply *every* write. Write-heavy workloads bog replicas down.

**Fixes for read-your-writes:** read from the primary for a few seconds after a user writes; or pin a user to a replica known to be caught up; or accept it where it doesn't matter.

**If the primary dies**, replicas keep serving **reads** in read-only mode until someone promotes one — the next level.`,
      tip: `Place a second **SQL Database** and wire **existing DB → new DB**: it becomes a replica automatically (dashed purple link). Then Shift-wire the App Servers to the replica too. Apps route reads to replicas and writes to the primary.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '3-2': [
    {
      title: 'When the primary dies',
      body: `Losing the primary means **no writes**. Replicas keep reads alive, but someone has to **promote** a replica to become the new primary — and every app has to start writing to it.

**Automatic failover**: the replicas exchange heartbeats with the primary. When heartbeats stop for several seconds, a **hot standby** (a replica kept specifically for this) is promoted automatically.

Both scenes lose the primary 5 seconds in. Without automation, writes fail for the rest of the run. With a standby and automatic failover, writes resume after ~8 seconds.`,
      demo: {
        level: { duration: 24, sources: [{ id: 'users', phases: [{ at: 0, rps: 800 }], mix: { read: 80, write: 20 } }], chaos: [{ at: 5, type: 'crash', target: 'db' }] },
        stats: ['success', 'failed', 'p95'],
        scenes: [
          {
            label: 'Replica, no failover',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { name: 'Primary' }), node('sql', 4, 2, 'r1', { name: 'Replica', cfg: { role: 'replica' } })],
              [...front, ...fan(apps, ['db', 'r1']), E('db', 'r1')],
            ),
            note: 'Reads survive on the replica; writes fail forever.',
            expect: [{ stat: 'success', op: '<', value: 88 }],
          },
          {
            label: 'Standby + auto failover',
            design: D(
              [
                users(),
                ...lbApps(),
                node('sql', 4, 0, 'db', { name: 'Primary', cfg: { autoFailover: true, replication: 'sync' } }),
                node('sql', 5, 1, 'sb', { name: 'Standby', cfg: { role: 'standby' } }),
                node('sql', 4, 2, 'r1', { name: 'Replica', cfg: { role: 'replica' } }),
              ],
              [...front, ...fan(apps, ['db', 'sb', 'r1']), E('db', 'sb'), E('db', 'r1')],
            ),
            note: 'Heartbeats fail → the standby is promoted → writes resume.',
            expect: [{ stat: 'success', op: '>', value: 90 }],
          },
        ],
      },
    },
    {
      title: 'Synchronous vs asynchronous replication',
      body: `**When** is a write acknowledged?

- **Asynchronous** — the primary commits locally, answers the user, and ships the change to replicas *afterwards*. Fast. But if the primary dies before shipping, those writes **never reached the standby** and are lost on failover.
- **Synchronous** — the primary waits until a replica has the write before answering. Every write pays an extra round trip, and if no replica is reachable a strict primary must refuse writes. But a promoted standby has **everything**.
- **Semi-synchronous** (what MySQL/Postgres offer) — wait for at least one replica.

Both scenes crash the primary with automatic failover on. Watch **Lost writes**.`,
      demo: {
        level: { duration: 20, sources: [{ id: 'users', phases: [{ at: 0, rps: 900 }], mix: { read: 70, write: 30 } }], chaos: [{ at: 6, type: 'crash', target: 'db' }] },
        stats: ['success', 'dataLoss', 'p95'],
        scenes: [
          {
            label: 'Async replication',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { name: 'Primary', cfg: { autoFailover: true, replication: 'async' } }), node('sql', 4, 2, 'sb', { name: 'Standby', cfg: { role: 'standby' } })],
              [...front, ...fan(apps, ['db', 'sb']), E('db', 'sb')],
            ),
            expect: [{ stat: 'dataLoss', op: '>', value: 0 }],
          },
          {
            label: 'Sync replication',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { name: 'Primary', cfg: { autoFailover: true, replication: 'sync' } }), node('sql', 4, 2, 'sb', { name: 'Standby', cfg: { role: 'standby' } })],
              [...front, ...fan(apps, ['db', 'sb']), E('db', 'sb')],
            ),
            expect: [{ stat: 'dataLoss', op: '<', value: 1 }],
          },
        ],
      },
    },
    {
      title: 'RPO and RTO',
      body: `Two numbers worth naming in every availability discussion:

- **RPO — recovery point objective**: how much data you can afford to lose. Async replication: seconds. Sync: zero.
- **RTO — recovery time objective**: how long until you're serving again. Here, the ~8 s it takes to detect the failure and promote.

Ask the interviewer what the business needs. A bank wants RPO = 0; a social feed can live with a few seconds.`,
      tip: `Add a database, wire **Primary → it**, set its **Role** to **Hot standby**, and wire every App Server to it (so they can reach it after promotion). On the primary, enable **Automatic failover** and choose **Replication: Synchronous**.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '3-3': [
    {
      title: 'Splitting the data',
      body: `Replicas multiply **read** capacity, but every replica still applies **every write**. When writes are the bottleneck, the only way out is to **split the data** so each database handles a slice.

**Sharding** (horizontal partitioning): each shard owns a subset of the keys — say users 0–999,999 on shard 1, the next million on shard 2… A **shard router** looks at each request's key and sends it to the right shard.

Both scenes take 3,600 req/s, **70% writes**. Replicas don't help at all; three shards split the writes three ways.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 3600 }], mix: { read: 30, write: 70 } }], keyspace: { keys: 30000, skew: 0.7 } },
        stats: ['success', 'p95', { node: 'db', metric: 'util', label: 'Primary/Shard 1 busy' }],
        scenes: [
          {
            label: 'Primary + replicas',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { tier: 'L', name: 'Primary' }), node('sql', 4, 2, 'r1', { tier: 'L', name: 'Replica', cfg: { role: 'replica' } })],
              [...front, ...fan(apps, ['db', 'r1']), E('db', 'r1')],
            ),
            note: 'All writes still land on one primary.',
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Shard router + 3 shards',
            design: D(
              [users(), ...lbApps(), node('shardrouter', 3, 1, 'sr', { name: 'Shard router' }), node('sql', 4, 0, 'db', { tier: 'L', name: 'Shard 1' }), node('sql', 5, 1, 's2', { tier: 'L', name: 'Shard 2' }), node('sql', 4, 2, 's3', { tier: 'L', name: 'Shard 3' })],
              [...front, ...fan(apps, ['sr']), ...fan(['sr'], ['db', 's2', 's3'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Choosing a shard key',
      body: `How keys map to shards decides whether the load is even.

- **Range partitioning** — keys 0…N on shard 1, N…2N on shard 2. Simple, and range scans are easy. But if popular keys cluster (new users, recent dates, low IDs), **one shard gets most of the traffic** — a *hot spot*.
- **Hash partitioning** — shard = hash(key) mod N. Spreads keys evenly regardless of popularity.

In the scenes, the most popular keys are the low-numbered ones. Range partitioning piles them onto Shard 1.

**A good shard key** has high cardinality, distributes evenly, and matches your access pattern (e.g. \`user_id\` if most queries are per-user). Watch out for **celebrities** — one very hot key can still overload a shard.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 3600 }], mix: { read: 30, write: 70 } }], keyspace: { keys: 30000, skew: 0.8 } },
        stats: ['success', { node: 'db', metric: 'util', label: 'Shard 1' }, { node: 's2', metric: 'util', label: 'Shard 2' }, { node: 's3', metric: 'util', label: 'Shard 3' }],
        scenes: [
          {
            label: 'Range',
            design: D(
              [users(), ...lbApps(), node('shardrouter', 3, 1, 'sr', { name: 'Router · range', cfg: { strategy: 'range' } }), node('sql', 4, 0, 'db', { tier: 'L', name: 'Shard 1' }), node('sql', 5, 1, 's2', { tier: 'L', name: 'Shard 2' }), node('sql', 4, 2, 's3', { tier: 'L', name: 'Shard 3' })],
              [...front, ...fan(apps, ['sr']), ...fan(['sr'], ['db', 's2', 's3'])],
            ),
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Hash',
            design: D(
              [users(), ...lbApps(), node('shardrouter', 3, 1, 'sr', { name: 'Router · hash', cfg: { strategy: 'hash' } }), node('sql', 4, 0, 'db', { tier: 'L', name: 'Shard 1' }), node('sql', 5, 1, 's2', { tier: 'L', name: 'Shard 2' }), node('sql', 4, 2, 's3', { tier: 'L', name: 'Shard 3' })],
              [...front, ...fan(apps, ['sr']), ...fan(['sr'], ['db', 's2', 's3'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Resharding & consistent hashing',
      body: `Eventually you add a shard. With \`hash(key) mod N\`, changing N changes the answer for **almost every key** — most of your data has to move, and every cache keyed the same way goes cold.

**Consistent hashing** places shards (as many *virtual nodes*) on a ring; each key belongs to the next node clockwise. Adding a node only takes keys from its neighbours — about **1/N** of the data moves.

Try it: add nodes in both modes and compare how many keys (pulsing dots) move.

**Other sharding costs:** cross-shard queries and **joins** become hard, transactions across shards are painful, and rebalancing is operational work.`,
      widget: 'hashring',
      tip: `Place a **Shard Router**, wire **App Servers → Router → several SQL databases**. Each database is a primary for its slice. Pick the partitioning strategy in the router's settings.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '3-4': [
    {
      title: 'Split by function',
      body: `**Federation** (functional partitioning) splits databases by **what the data is**, not by key: a Users DB, a Products DB, an Orders DB.

- Each database gets only its own domain's traffic, so it can be **smaller** and sized for its own load.
- Smaller databases keep more of their working set in memory → more cache hits.
- No single primary serializes all writes, so writes to different domains happen in parallel.

In the scenes, traffic is 50% products, 30% users, 20% orders.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 2400 }], mix: { read: 80, write: 20 }, domains: { products: 50, users: 30, orders: 20 } }], keyspace: { keys: 30000, skew: 0.6 } },
        stats: ['success', 'p95', 'cost'],
        scenes: [
          {
            label: 'One database',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Everything' })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Federated',
            design: D(
              [
                users(),
                ...lbApps(),
                node('sql', 4, 0, 'dp', { tier: 'M', name: 'Products DB', cfg: { domain: 'products' } }),
                node('sql', 4, 1, 'du', { tier: 'M', name: 'Users DB', cfg: { domain: 'users' } }),
                node('sql', 4, 2, 'do', { tier: 'S', name: 'Orders DB', cfg: { domain: 'orders' } }),
              ],
              [...front, ...fan(apps, ['dp', 'du', 'do'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Federation vs sharding',
      body: `| | Federation | Sharding |
|---|---|---|
| Splits by | function / table (users vs orders) | key within the same table |
| Number of DBs | a handful | as many as you need |
| App logic | knows which DB holds which tables | knows which shard holds which key |
| Pain point | **joins across databases** | joins and transactions across shards, hot spots, resharding |

They combine well: federate first (one database per domain), then shard the domains that keep growing.

**Federation downsides (primer):** not effective if the schema needs huge functions or tables; app logic must route to the right DB; joining data from two databases is complex (via a server link or in application code); more hardware and complexity. Federation is also a natural stepping stone to **microservices**, each owning its own data.`,
      tip: `Add databases and set each one's **Holds data for** to products, users or orders. Wire every App Server to all of them — apps route each request to the matching database.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '3-5': [
    {
      title: 'Indexes',
      body: `Without an index, finding a row means **scanning the table** — checking every row. An index is a sorted structure (usually a **B-tree**) that finds rows in **O(log n)** steps, like a book's index instead of reading every page.

\`\`\`sql
-- without an index on email: full table scan
SELECT * FROM users WHERE email = 'ada@example.com';
CREATE INDEX idx_users_email ON users(email);
\`\`\`

The trade-off: every **insert or update must also update each index**, so writes get a bit slower, and indexes use memory.

**Index what you query**: columns used in WHERE, JOIN, ORDER BY and GROUP BY. Bulk load? Drop indexes, load, then rebuild.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 600 }], mix: { read: 90, write: 10 } }] },
        stats: ['success', 'p95', { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'No indexes',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database', cfg: { indexes: false } })], [...front, ...fan(apps, ['db'])]),
            note: 'Every lookup scans. Five times the work per read.',
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Indexed',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database', cfg: { indexes: true } })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Denormalization',
      body: `A normalized schema stores each fact once, so showing a post with its author name and comment count needs a **JOIN** across several tables — expensive on every page view.

**Denormalizing** stores redundant copies — e.g. \`author_name\` and \`comment_count\` directly on the post row — so reads skip the joins. The price: every write must update **all the copies** (or use materialized views), and duplicated data can drift.

It pays off because reads typically outnumber writes **100:1 or more**. In the scenes, half of all reads are joins.`,
      demo: {
        level: { joinShare: 0.5, sources: [{ id: 'users', phases: [{ at: 0, rps: 1200 }], mix: { read: 90, write: 10 } }] },
        stats: ['success', 'p95', { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'Normalized (joins)',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database' })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Denormalized',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database', cfg: { denormalized: true } })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Profile before you buy',
      body: `Before scaling hardware, find out **what** is slow:
1. **Benchmark** (load test) to reproduce the problem.
2. **Profile**: enable the slow query log, run \`EXPLAIN\` on the worst queries.
3. Fix the biggest offender, measure again.

**Schema tips from the primer:** \`CHAR\` for fixed-length fields; \`TEXT\` for large text (or store a path to object storage); \`INT\` for numbers up to ~4 billion; \`DECIMAL\` for money; avoid large BLOBs; \`NOT NULL\` where possible; **partition** hot rows into their own table so they stay in memory.

The cheapest capacity is the work you stop doing.`,
      tip: `Click the database: **Indexes** and **Denormalized schema** are toggles in its settings. Watch read and write latency both change.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '3-6': [
    {
      title: 'Four NoSQL data models',
      body: `"NoSQL" isn't one thing — it's several data models, each built for a different access pattern:

| Model | Think of it as | Great for | Examples |
|---|---|---|---|
| **Key-value** | a giant hash map | get/put by key at huge scale: sessions, carts, profiles | Redis, DynamoDB |
| **Document** | key → JSON document | flexible, nested records you query by field | MongoDB, CouchDB |
| **Wide-column** | row key → columns, sorted | massive write volume, time series, logs | Cassandra, Bigtable, HBase |
| **Graph** | nodes + edges | relationship traversal: friends of friends | Neo4j |

Most NoSQL stores **scale out by adding nodes** and partition data automatically. In exchange, they give up joins and (usually) multi-row transactions.`,
    },
    {
      title: 'Right store, right job',
      body: `A relational database *can* do everything — but some workloads hurt:
- **Graph traversals** become chains of self-joins (~20× the work of a graph database).
- An **append-only firehose** saturates the SQL write path; wide-column stores use log-structured writes that are far cheaper.

The scenes run the same mixed workload (pink graph, teal ingest, blue reads). On the right, each type goes to the store that suits it. Apps pick the fastest store that supports each request type automatically — your job is to provide the right stores.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { graph: 30, ingest: 40, read: 30 } }], keyspace: { keys: 20000, skew: 0.8 } },
        stats: ['success', 'p95', 'cost'],
        scenes: [
          {
            label: 'SQL for everything',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { tier: 'L', name: 'SQL (L)' })], [...front, ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '<', value: 90 }],
          },
          {
            label: 'Polyglot',
            design: D(
              [users(), ...lbApps(), node('graphdb', 4, 0, 'g', { name: 'Graph DB' }), node('widecolumn', 4, 1, 'w', { name: 'Wide-column', cfg: { nodes: 1 } }), node('kv', 4, 2, 'kv', { name: 'Key-value', cfg: { nodes: 1 } })],
              [...front, ...fan(apps, ['g', 'w', 'kv'])],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'ACID vs BASE',
      body: `Relational databases give **ACID** transactions: **A**tomic (all or nothing), **C**onsistent, **I**solated (as if run one at a time), **D**urable.

Many NoSQL stores choose **BASE**: **B**asically **A**vailable, **S**oft state, **E**ventual consistency — availability and scale over strict correctness.

That matters for things like payments: *"take $50 from Alice, give $50 to Bob"* must happen completely or not at all. On a store without multi-row transactions, a crash or concurrent update can leave **half-applied state** (counted as *anomalies*).

**Reasons for SQL:** structured/relational data, strict schema, complex joins, transactions. **Reasons for NoSQL:** semi-structured data, flexible schema, huge data volume, very high throughput, simple access patterns.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 300 }], mix: { txn: 100 } }] },
        stats: ['success', 'p95', 'anomalies'],
        scenes: [
          {
            label: 'Payments on a KV store',
            design: D([users(), node('app', 2, 1, 'a1', { tier: 'M' }), node('kv', 4, 1, 'kv', { name: 'Key-value' })], [E('users', 'a1'), E('a1', 'kv')]),
            expect: [{ stat: 'anomalies', op: '>', value: 0 }],
          },
          {
            label: 'Payments on SQL',
            design: D([users(), node('app', 2, 1, 'a1', { tier: 'M' }), node('sql', 4, 1, 'db', { name: 'SQL' })], [E('users', 'a1'), E('a1', 'db')]),
            expect: [{ stat: 'anomalies', op: '<', value: 1 }],
          },
        ],
      },
      tip: `Place NoSQL stores from the **Data** section and wire App Servers to them. Each store's **Nodes** setting scales it out. Keep a SQL database wired for **Txn** requests.`,
    },
  ],
};

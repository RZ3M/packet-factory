import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH3: Record<string, SolutionExplain> = {
  '3-1': {
    idea: `4,000 req/s, 95% reads, spread almost evenly over 50,000 records (low skew), so a cache would only catch a fraction. The database needs ~38 connections' worth of reads plus ~4 for writes — about 210% of a medium database.

**Read replicas** split the reads: the primary keeps only the writes (~4 busy connections), and each of three medium replicas takes ~12.7 connections of reads + ~2 of replicated writes → **~73%** each.`,
    choices: [
      {
        node: 'db1',
        title: 'Primary (medium) handles writes',
        why: `200 writes/s × 20 ms ≈ 4 busy connections — ~20%. The primary also ships every write to the replicas.`,
      },
      {
        node: 'r1',
        title: 'Three medium read replicas',
        why: `Reads are split three ways. Each replica also has to **re-apply every write** (~2 connections' worth), which is why replicas scale reads but never writes. Two replicas would be ~107% — three is the minimum that fits.`,
      },
      {
        title: 'Apps wired to the primary AND all replicas',
        why: `Apps send reads to replicas and writes to the primary. If a replica isn't wired, it never gets read traffic.`,
      },
      {
        title: 'Why staleness stays near zero',
        why: `Replicas lag by about one log-shipping batch (~100 ms). With writes this rare and spread over 50,000 keys, almost no read asks for a key written in the last 100 ms — which is why stale reads stay under the 0.05% star.`,
      },
    ],
    whyNot: {
      'one giant database': `An XL database (80 connections) runs at ~52% and passes — but it costs $950/mo vs $640 for four medium machines, and it's still a single point of failure. Over the $1,300 budget star.`,
    },
    takeaway: `Replicas scale reads, not writes. Mention replication lag and read-your-writes whenever you add them.`,
  },

  '3-2': {
    idea: `The primary dies at 25 s and never comes back. You need:
1. A **hot standby** receiving replication, promoted automatically after ~8 s of missed heartbeats.
2. **Synchronous replication** so the standby already has every acknowledged write (zero data loss).
3. A **read replica** so reads keep flowing during the 8-second failover.
4. Apps **wired to the standby** so they can write to it once it's promoted.`,
    choices: [
      {
        node: 'db1',
        title: 'Primary: synchronous replication + automatic failover',
        why: `Sync means a write is acknowledged only after a replica has it — that's what makes RPO = 0. Automatic failover turns an outage into an ~8-second write pause (RTO).`,
      },
      {
        node: 'sb',
        title: 'Hot standby (L)',
        why: `It receives every write but serves nothing, so it's always ready. Same size as the primary: after promotion it carries all writes.`,
      },
      {
        node: 'r1',
        title: 'Read replica (L)',
        why: `Reads go to replicas anyway (1,600/s × 10 ms = 16 connections + 4 for applying writes → 50% of an L). During failover it keeps every read working, so only writes pause for ~8 s — success stays ~97%.`,
      },
    ],
    whyNot: {
      'async replication': `Everything else works, but the primary acknowledged writes that were still waiting in its replication buffer when it died. The promoted standby never got them: ~36 acknowledged writes lost.`,
      'replicas but no automatic failover': `Reads survive on the replica, but nobody promotes it, so every write fails from 25 s to the end — about 14% of all requests.`,
    },
    takeaway: `Name RPO (how much data you can lose) and RTO (how long until you recover) in every failover discussion.`,
  },

  '3-3': {
    idea: `5,000 req/s with **60% writes**: 3,000 writes × 20 ms + 2,000 reads × 10 ms ≈ **80 busy connections** — the entire XL database, at 100%. Replicas can't help: each one replays every write.

**Shard** the data: a shard router sends each key to one of three large databases. Each shard owns a third of the keys and therefore ~a third of the reads **and** writes → ~27 connections of 40 → **~67%**.`,
    choices: [
      {
        node: 'sr',
        title: 'Shard router with consistent hashing',
        why: `Hashing spreads keys evenly no matter how popular they are. *Consistent* hashing additionally means that adding a fourth shard later only moves ~¼ of the keys instead of ~¾.`,
      },
      {
        node: 's1',
        title: 'Three large shards',
        why: `Write capacity now scales with the number of shards. Three L shards ($1,140) cost less than one XL plus the replicas that wouldn't have helped, and leave headroom.`,
      },
    ],
    whyNot: {
      'range partitioning': `Keys 0–13,333 go to shard 1 — but the most popular keys are the low-numbered ones. With this skew, ~71% of all traffic lands on shard 1, which overloads while the others idle (a hot spot).`,
      'read replicas instead of shards': `Replicas take some reads off the primary, but all 3,000 writes/s still hit one XL primary (60 connections' worth) and the replica must replay them too. The primary stays saturated.`,
    },
    takeaway: `Sharding is how you scale writes. Choose a shard key with high cardinality and even popularity; plan for hot keys and resharding.`,
  },

  '3-4': {
    idea: `One database holding everything needs ~48 busy connections (4,000 req/s × 12 ms average). That's an XL ($950).

**Federation** splits by function. Each database only gets its own domain's traffic, so each can be sized for its share:
- Products (50%) → ~24 connections → **L** (60%)
- Users (30%) → ~14 → **M** (~75–80%)
- Orders (20%) → ~10 → **M** (48%)

Total **$700** instead of $950, and each database is smaller, faster to back up, and keeps more of its working set in memory.`,
    choices: [
      {
        node: 'dp',
        title: 'Products DB (L)',
        why: `Half the traffic is product browsing, so it gets the biggest box. Federation lets you spend where the load actually is.`,
      },
      {
        node: 'du',
        title: 'Users DB (M)',
        why: `~30% of traffic → ~75–80% of a medium at peak. Its own database also isolates user data (and its failures) from the catalog.`,
      },
      {
        node: 'do',
        title: 'Orders DB (M)',
        why: `~20% of traffic → under half of a medium — room to grow during sales.`,
      },
      {
        title: 'Apps wired to all three',
        why: `The application knows which database owns which data and routes each request accordingly. That routing logic — and cross-database joins — is federation's main cost.`,
      },
    ],
    whyNot: {
      'one huge database': `An XL holds everything at ~60% and passes, but costs $250/mo more than the federated set and keeps one big blast radius. Over the budget star.`,
    },
    takeaway: `Federation splits by function, sharding splits by key. Federation is often the first step toward services owning their own data.`,
  },

  '3-5': {
    idea: `The database was slow because of **how it was used**, not its size:
- With **indexes off**, every lookup is a table scan (~5× the work).
- Half the reads are **joins** (~4× the work of a simple read).

Fix both on the same large database: with indexes and a denormalized schema, a read costs ~10 ms and a write ~32 ms (more indexes and redundant copies to update). 2,250 reads × 10 ms + 250 writes × 32 ms ≈ **30.5 busy connections of 40 → ~76%**.`,
    choices: [
      {
        node: 'db1',
        title: 'Indexes on',
        why: `B-tree lookups instead of scans: reads drop from ~50 ms to ~10 ms. Writes get ~20% slower because every index must be updated — a good trade when reads outnumber writes 9:1.`,
      },
      {
        node: 'db1',
        title: 'Denormalized schema',
        why: `Storing redundant data on the row (e.g. author name on a post) removes the joins from the hot read path. Writes now update every copy (~1.6× the cost) — worthwhile because reads dominate.`,
      },
    ],
    whyNot: {
      'indexes only (still joining)': `Indexes fix the scans, but half the reads still pay ~4× for joins: average read ≈ 25 ms → ~61 busy connections on a 40-connection database. Still overloaded.`,
      'throw hardware at it': `An XL with indexes absorbs the joins at ~76% — but it costs $950 vs $380, and every join still costs latency. Profiling and fixing the queries first is the cheaper move.`,
    },
    takeaway: `Benchmark and profile first (slow query log, EXPLAIN). Missing indexes and expensive joins are the most common "scaling" problems.`,
  },

  '3-6': {
    idea: `Four workloads, four stores — **polyglot persistence**:
- **Graph traversals** (750/s) → graph database: ~6 ms each instead of ~120 ms of self-joins.
- **Ingest firehose** (2,000/s) → wide-column store: log-structured writes at ~1.5 ms.
- **Key lookups** (1,250/s) → key-value store: ~2 ms.
- **Payments** (500/s, must be ACID) → SQL: the only store here that gives multi-row transactions.

On SQL alone, graph queries by themselves would need ~90 busy connections.`,
    choices: [
      {
        node: 'gd',
        title: 'Graph database for friends-of-friends',
        why: `750 traversals × 6 ms ≈ 4.5 busy slots of 20 (~23%). Graph databases store relationships as pointers, so a traversal is pointer-chasing instead of repeated joins.`,
      },
      {
        node: 'wc',
        title: 'Wide-column store (1 node) for ingest and writes',
        why: `2,000 ingests × 1.5 ms + 500 writes × 2 ms ≈ 4 slots of 30. Append-only, high-volume writes are exactly what Cassandra/Bigtable-style stores are built for.`,
      },
      {
        node: 'kv',
        title: 'Key-value store (1 node) for simple reads',
        why: `Profiles and settings looked up by ID: O(1) gets at ~2 ms. Apps route reads here because it's the fastest store that supports them.`,
      },
      {
        node: 'db1',
        title: 'SQL (M) only for transactions',
        why: `500 payments × 25 ms ≈ 12.5 connections → ~63%. Apps keep transactions on SQL, the only store here with multi-row ACID guarantees — zero anomalies.`,
      },
    ],
    whyNot: {
      'NoSQL for everything (no SQL)': `Without SQL, transactions, reads and graph queries all pile onto the graph database (the only remaining store that handles them well), which overloads. The design trades one bottleneck for another.`,
    },
    takeaway: `Choose stores per access pattern. If you pick NoSQL, say how you'll handle the missing joins and transactions.`,
  },
};

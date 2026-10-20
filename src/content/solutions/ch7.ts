import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH7: Record<string, SolutionExplain> = {
  '7-1': {
    idea: `A 10:1 read-heavy system with skewed popularity. The design keeps **small hot metadata** in SQL behind a cache, puts **immutable content** in object storage behind a CDN, and adds a replica for cache misses.

At peak (4,500 req/s): ~3,400 reads mostly hit the cache, ~720 content fetches come from the CDN edge, and only ~400 writes/s reach the primary (~8 busy connections).`,
    choices: [
      {
        node: 'cdn',
        title: 'CDN + object storage for paste content',
        why: `Paste text never changes once written — perfect for an edge cache. Object storage holds ~450 GB over three years cheaply; the CDN keeps popular pastes close to readers.`,
      },
      {
        node: 'api',
        title: 'One API group (M × 4) behind a load balancer',
        why: `Stateless servers. At peak ~3,800 dynamic req/s × ~12 ms ≈ 46 busy threads — three medium instances (48) would sit near 100%, so four (64) keep it around 70%. Instances keep the wiring simple.`,
      },
      {
        node: 'mc',
        title: 'Memory cache (L) for shortlink lookups',
        why: `Traffic is uneven: a few viral pastes get most reads. A 16,000-object cache catches most of the hot set, so the replica only sees the long tail and stays out of saturation.`,
      },
      {
        node: 'rep',
        title: 'Primary + read replica',
        why: `The primary handles ~4 writes/s on average (bursts are higher); the replica takes cache-miss reads. It also gives a failover path if the primary dies.`,
      },
    ],
    takeaway: `Don't over-engineer a 4-writes-per-second system: cache, CDN and one replica carry it. Spend interview time on the ID scheme, collisions, expiry and analytics.`,
  },

  '7-2': {
    idea: `Optimize the hottest path — reading a home timeline — by doing work at write time (**fan-out on write**):
- **Tweets** go to a queue; the user is acknowledged in ~50 ms.
- **Fan-out workers** persist the tweet and push it into ~10 followers' timelines in a memory cache.
- **Timeline reads** become cache hits.
- **Search** gets its own pool and index behind an L7 split, so search load never touches timelines.

The celebrity burst multiplies fan-out work; the queue absorbs it and the fan-out pool autoscales.`,
    choices: [
      {
        node: 'tl',
        title: 'XL timeline cache',
        why: `Timelines are read ~16× more often than tweets are written. Keeping them in memory makes the most common request a ~1 ms lookup. XL so the whole hot set fits.`,
      },
      {
        node: 'q',
        title: 'Fan-out queue',
        why: `Posting must be fast, but delivering to followers can lag a second or two. The queue decouples them, and absorbs the retweet storm instead of failing it.`,
      },
      {
        node: 'fan',
        title: 'Fan-out workers (autoscaling 2 → 6)',
        why: `Each tweet becomes ~10 cache writes plus one database write. Autoscaling covers the celebrity burst; back pressure keeps them from overwhelming the tweet store.`,
      },
      {
        node: 'lb',
        title: 'L7 split: timelines vs search',
        why: `Search is a different workload with its own index and its own scaling. Routing it to a separate pool keeps a search spike from slowing timelines (bulkheads).`,
      },
      {
        node: 'idx',
        title: 'Search cluster',
        why: `Full-text search on an inverted index, never on the tweet store. In production it's sharded with scatter-gather queries.`,
      },
    ],
    takeaway: `Name the trade-off: fan-out on write makes reads cheap and writes expensive. Add the hybrid for celebrities (merge at read time) and keep only recent timelines in RAM.`,
  },

  '7-3': {
    idea: `Two independent pipelines:
- **Crawl (batch)**: a scheduler feeds URLs into \`links_to_crawl\`; crawler workers fetch and process pages. 600 crawls/s × 100 ms = 60 busy slots → 6 large workers (96 slots, ~62%).
- **Search (interactive)**: query API → **query cache** → reverse index. Popular queries repeat a lot, so the cache answers most of them (~80%).

Keeping them separate means a crawl surge can never slow search.`,
    choices: [
      {
        node: 'links',
        title: 'Queue of links to crawl',
        why: `A durable work list. In production it's a priority queue (popular pages are re-crawled more often) with dedup against \`crawled_links\` to avoid loops.`,
      },
      {
        node: 'crawlers',
        title: 'Crawler workers: L × 6',
        why: `Sized for pages per second to meet the freshness target. Mostly waiting on the network, which is why many concurrent slots matter.`,
      },
      {
        node: 'qc',
        title: 'Query cache in front of the index',
        why: `Search is skewed: a small cache of popular queries serves ~80% of searches, so the index only handles the long tail. That's the third star.`,
      },
      {
        node: 'idx',
        title: 'Reverse index (M)',
        why: `Handles cache misses at ~8 ms each. Without the cache it would need a much bigger tier.`,
      },
      {
        node: 'qapi',
        title: 'Query API: L × 4',
        why: `6,000 searches/s × ~14 ms ≈ 84 busy threads → 128 threads keeps it at ~66%.`,
      },
    ],
    takeaway: `Separate batch from interactive work. In the interview, spend time on dedup and cycle detection, politeness, prioritization and freshness.`,
  },

  '7-4': {
    idea: `90% of traffic is transaction ingest that doesn't need to be instant. Accept it in milliseconds, then process it asynchronously:
- **Queue** absorbs the ingest stream (including the evening surge).
- **Extraction workers** process and store transactions in a **wide-column store** built for write volume.
- **Accounts and budgets** — small, relational, read by users — stay in SQL with a cache in front.`,
    choices: [
      {
        node: 'q',
        title: 'Ingest queue',
        why: `Users never wait for categorization or storage; the queue smooths the surge, and failed writes are retried so no transaction is lost.`,
      },
      {
        node: 'tx',
        title: 'Transaction extraction workers (M × 6)',
        why: `Up to ~4,500 ingests/s × a few ms each, plus budget jobs (~400 ms) — 48 threads keeps them comfortably ahead so events land in milliseconds.`,
      },
      {
        node: 'wc',
        title: 'Wide-column store for transactions',
        why: `Append-only, write-heavy data at billions of rows per month: exactly the workload for Cassandra/Bigtable-style stores. A single SQL primary would be the bottleneck.`,
      },
      {
        node: 'db',
        title: 'SQL for accounts and budgets, with a cache',
        why: `Relational, low-volume, read when users visit. A small cache handles dashboard reads.`,
      },
    ],
    takeaway: `Write-heavy and latency-tolerant ⇒ queue + workers + write-optimized storage. Mention idempotency (banks resend transactions) and batch analytics off raw logs.`,
  },

  '7-5': {
    idea: `Friends-of-friends lookups on a graph that doesn't fit on one machine, without a graph database.

Store adjacency lists in a sharded **key-value store** (the "person servers"): each BFS hop is a key lookup (~30 ms for the multi-get). Put a **lookup cache** in front — popular people are looked up constantly — so most hops never reach the store.`,
    choices: [
      {
        node: 'c',
        title: 'Lookup cache (M)',
        why: `Graph traffic is skewed toward well-connected people. Caching them cuts both latency and store load — about half of all lookups never reach the store.`,
      },
      {
        node: 'ps',
        title: 'Key-value store with 4 nodes (person servers)',
        why: `Adjacency lists partition naturally by person ID; nodes add capacity linearly. SQL would need ~120 ms of recursive joins per traversal.`,
      },
      {
        node: 'api',
        title: 'Search API: L × 3',
        why: `~3,500 req/s × ~14 ms ≈ 49 busy threads → 96 threads gives headroom.`,
      },
    ],
    takeaway: `Shard by person; a lookup service maps person → shard; BFS hops across shards. Mention bidirectional BFS and batching lookups per shard.`,
  },

  '7-6': {
    idea: `The hot set of queries is bigger than one cache node. **Shard the cache by query** with consistent hashing: each query lives on exactly one node, so the cluster's memory adds up (two 16k-object nodes ≈ a 32k-object cache). A 10-minute TTL bounds staleness.`,
    choices: [
      {
        node: 'ring',
        title: 'Shard router with consistent hashing',
        why: `Routes each query to the one node that owns it. Consistent hashing means adding a node later only remaps ~1/N of the queries instead of turning the whole cache cold.`,
      },
      {
        node: 'c1',
        title: 'Two large cache shards, TTL 10 min, LRU',
        why: `Together they hold ~32k of the hottest queries → ~80% hit rate. LRU keeps hot queries and evicts cold ones; the TTL forces periodic refresh as the index changes.`,
      },
      {
        node: 'idx',
        title: 'Reverse index (M) for misses',
        why: `Only ~20% of queries reach it — about 1,400/s — well within a medium index.`,
      },
      {
        node: 'api',
        title: 'Query API: L × 4',
        why: `7,000 req/s × ~14 ms ≈ 98 busy threads → 128 threads.`,
      },
    ],
    whyNot: {
      'two caches side by side, no key routing': `Without key routing, every query can land on either node, so both nodes end up caching the same hot queries. You pay for 32k objects but effectively get a 16k cache: hit rate drops to ~68% and misses flood the index.`,
    },
    takeaway: `LRU = hash map + doubly linked list. Shard caches by key (consistent hashing) so memory adds up instead of duplicating.`,
  },

  '7-7': {
    idea: `**Precompute, then serve.** The weekly "best sellers per category" aggregation runs as batch jobs over sales logs; users only ever read its small output.
- **Reads** (99% of traffic) hit a tiny, extremely hot ranking table, so a small cache absorbs nearly all of them.
- **Sales** are appended to a write-friendly log store via a queue.
- **Batch jobs** (MapReduce) run on a worker pool sized to finish within the hour.`,
    choices: [
      {
        node: 'c',
        title: 'Small rank cache',
        why: `There are only ~2,000 ranking rows, and the hottest categories dominate. A 1,000-object cache catches ~95% of reads.`,
      },
      {
        node: 'db',
        title: 'sales_rank table (SQL, M)',
        why: `Holds the batch output; only cache misses reach it.`,
      },
      {
        node: 'mr',
        title: 'MapReduce workers (L × 3)',
        why: `~18 batch jobs/s × 1.5 s ≈ 27 busy slots of 48. Batch work never touches the read path.`,
      },
      {
        node: 'logs',
        title: 'Sales logs in a wide-column store',
        why: `Append-only events, written cheaply and read in bulk by the batch jobs.`,
      },
      {
        node: 'api',
        title: 'Sales API: L × 5',
        why: `~9,000 req/s × 12 ms ≈ 108 busy threads → 160 threads (~67%).`,
      },
    ],
    takeaway: `Never compute heavy aggregates on the request path. Batch layer (MapReduce/Spark over logs) + serving layer (small table + cache).`,
  },

  '7-8': {
    idea: `The primer's growth path, built for the final load (~11,000 req/s) but cheap while traffic is small:
- **CDN + S3** take the 20% static traffic off the servers entirely.
- An **HA load balancer** in front of an **autoscaling** web group (2 → 10 medium instances) follows the traffic ramp.
- A **large cache** absorbs ~90% of reads, so the database mostly sees misses and writes.
- **Primary + standby (sync, auto failover) + read replica** survive the primary crash with zero data loss.`,
    choices: [
      {
        node: 'cdn',
        title: 'CDN (M) + S3 for static content',
        why: `Up to ~2,200 static req/s served from the edge. Without it, every image would load the web tier and cross the network to users.`,
      },
      {
        node: 'web',
        title: 'Autoscaling web group, 2 → 10 instances',
        why: `At 200 req/s two instances are plenty; at 11,000 the group grows to ~7–8 (each ~1,300/s). During the steepest part of the ramp the group runs hot for ~10 s until new instances finish booting — the classic autoscaling lag — but the cache and queues absorb it, and the average cost stays far below provisioning for peak.`,
      },
      {
        node: 'elb',
        title: 'Load balancer with HA',
        why: `Everything flows through it, so it gets an active-passive pair.`,
      },
      {
        node: 'ec',
        title: 'Large cache',
        why: `16k objects of 50k with web-like skew ≈ 90% hits. That's what lets a single large primary + one replica handle 8,000+ reads/s.`,
      },
      {
        node: 'sb',
        title: 'Multi-AZ standby with sync replication',
        why: `When the primary fails at 85 s, the standby is promoted in ~8 s with every acknowledged write. Writes pause briefly; reads continue on the cache and replica.`,
      },
    ],
    takeaway: `Narrate it as iterations: each component exists because of a bottleneck you can name — static traffic, the web tier, read load, then availability.`,
  },
};

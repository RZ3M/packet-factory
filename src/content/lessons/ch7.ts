import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

export const LESSONS_CH7: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '7-1': [
    {
      title: 'Metadata vs content',
      body: `The core trick in Pastebin / Bit.ly: split **small, hot metadata** from **bulky content**.

- **SQL** \`pastes\` table: \`shortlink\` (indexed), \`expiration_length_in_minutes\`, \`created_at\`, \`paste_path\` — tiny rows that fit in memory.
- **Object store**: the paste text itself at \`paste_path\`. Immutable, cheap, durable — perfect behind a CDN.
- **Memory cache** in front of SQL: traffic is skewed, so viral pastes are almost always cache hits.
- **Read replicas** absorb cache misses; the primary handles only ~4 writes/s.

The demo runs the reference architecture at peak: blue reads hit the cache, green content comes from the CDN, orange writes go to the primary.`,
      demo: {
        level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 75, static: 16, write: 9 } }], keyspace: { keys: 20000, skew: 1, staticKeys: 5000, staticSkew: 1 } },
        stats: ['success', 'p95', { node: 'mc', metric: 'hit', label: 'Cache hits' }, { node: 'cdn', metric: 'hit', label: 'CDN hits' }],
        scenes: [
          {
            label: 'Reference design',
            design: D(
              [
                users(),
                node('cdn', 1, 0, 'cdn', { name: 'CDN' }),
                node('objstore', 2, 0, 's3', { name: 'Paste content' }),
                node('lb', 1, 2, 'lb'),
                node('app', 2, 2, 'api', { tier: 'M', name: 'API', cfg: { instances: 2 } }),
                node('cache', 3, 1, 'mc', { name: 'Memory cache' }),
                node('sql', 4, 2, 'db', { name: 'Metadata' }),
                node('sql', 4, 3, 'rep', { name: 'Replica', cfg: { role: 'replica' } }),
              ],
              [E('users', 'cdn'), E('users', 'lb'), E('cdn', 's3'), E('lb', 'api'), ...fan(['api'], ['mc', 'db', 'rep', 's3']), E('db', 'rep')],
            ),
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Generating the short link',
      body: `\`\`\`python
url = base_encode(md5(ip_address + timestamp))[:7]
\`\`\`

- **MD5** gives a uniformly distributed 128-bit hash.
- **Base62** (\`[a-zA-Z0-9]\`) makes it URL-safe and short.
- Take the first **7 characters**: 62⁷ ≈ **3.5 trillion** links.
- **Collisions** are rare but possible: check the table and retry with a different salt.

Alternatives worth mentioning: a counter-based ID service (unique, but sequential and guessable unless encoded), or pre-generated key ranges handed out to servers.

**Analytics** don't need to be real time: run **MapReduce** over web server logs for hit counts instead of writing a counter on every read.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-2': [
    {
      title: 'Fan-out on write',
      body: `How do you build someone's home timeline?

- **Fan-out on read** — when they open the app, query the recent tweets of *everyone they follow* and merge them. Every timeline view is an expensive multi-join query.
- **Fan-out on write** — when someone tweets, push the tweet ID into each follower's **precomputed timeline** in a memory cache (Redis lists). Reading a timeline becomes a single cache lookup.

Twitter chose fan-out on write because reads outnumber tweets ~16:1. Posting goes through a **queue**, so the tweet is acknowledged instantly and fan-out workers catch up behind it.`,
      demo: {
        level: { fanout: 10, joinShare: 1, sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 90, write: 10 } }], keyspace: { keys: 5000, skew: 1.05 } },
        stats: ['success', 'readP95', 'jobP95', { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'Fan-out on read',
            design: D([users(), node('lb', 1, 1, 'lb'), node('app', 2, 1, 'api', { tier: 'L', cfg: { instances: 2 } }), node('sql', 4, 1, 'db', { tier: 'M', name: 'Tweets (joins per read)' })], [E('users', 'lb'), E('lb', 'api'), E('api', 'db')]),
            note: 'Every timeline view runs an expensive merge query against the database.',
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Fan-out on write',
            design: D(
              [
                users(),
                node('lb', 1, 1, 'lb'),
                node('app', 2, 1, 'api', { tier: 'L', cfg: { instances: 2 } }),
                node('cache', 3, 0, 'tl', { tier: 'L', name: 'Timeline cache' }),
                node('queue', 3, 2, 'q', { name: 'Fan-out queue' }),
                node('worker', 4, 2, 'fan', { tier: 'M', name: 'Fan-out workers', cfg: { instances: 2 } }),
                node('sql', 5, 1, 'db', { tier: 'M', name: 'Tweets', cfg: { denormalized: true } }),
              ],
              [E('users', 'lb'), E('lb', 'api'), E('api', 'tl'), E('api', 'q'), E('tl', 'db'), E('q', 'fan'), E('fan', 'tl'), E('fan', 'db')],
            ),
            note: 'Purple fan-out traffic writes each tweet into followers\' cached timelines; reads are cache hits.',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'The celebrity problem & search',
      body: `Fan-out on write has a nasty edge case: an account with **50 million followers** turns one tweet into 50 million timeline inserts — minutes of work.

The **hybrid** fix: fan out on write for normal users; for celebrities, skip fan-out and **merge their recent tweets in at read time**.

Other pieces of the primer's design:
- Keep only **recent** timelines (and active users) in memory; rebuild the rest from storage on demand.
- **Search** runs on a separate **search cluster** (Lucene-style inverted index, sharded, scatter-gather queries).
- **Media** lives in object storage behind a CDN; notifications go through a queue.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-3': [
    {
      title: 'The crawl loop',
      body: `A crawler is a big **job queue** feeding stateless workers:

\`\`\`
loop:
  link = links_to_crawl.pop_highest_priority()
  if crawled_links.has_similar_signature(link): lower its priority, continue
  page = fetch(link)                      # mostly network wait
  enqueue jobs: reverse index, titles & snippets
  crawled_links.add(link, signature(page))
  links_to_crawl.add(extract_links(page)) # with priority
\`\`\`

Things the interviewer will poke at:
- **Cycles and duplicates** — normalize URLs, keep \`crawled_links\`, compare **page signatures** to catch near-duplicates.
- **Freshness** — re-crawl popular pages more often (priority queue).
- **Politeness** — respect \`robots.txt\`, rate-limit per host.
- **DNS** — the crawler's own DNS cache avoids a bottleneck.`,
    },
    {
      title: 'Batch vs interactive',
      body: `This system has two very different workloads:
- **Crawling** is batch: throughput matters, latency doesn't. Size workers for *pages per second* to hit your freshness target.
- **Searching** is interactive: users want results in ~100 ms.

Keep them on **separate paths** (bulkheads) so a crawl surge never slows search. And because search traffic is skewed, a **query cache** in front of the reverse index answers the popular queries from memory.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-4': [
    {
      title: 'An ingestion pipeline',
      body: `Mint is **write-heavy** (about 10 transactions written per page view) and **latency-tolerant** (nobody needs their budget updated within milliseconds). That screams **queue + workers**:

1. Accounts API receives "refresh my accounts" or new transactions → **queue**.
2. **Transaction extraction workers** pull from the queue, fetch from banks, store raw logs in **object storage**, categorize each transaction (seller → category), and write to the transactions store.
3. **Budget service** updates monthly spending incrementally; a **notification service** alerts when you go over.
4. Heavy analytics (monthly reports) run as **MapReduce** over the raw logs, not on the live database.

Also: only refresh accounts of users **active in the last 30 days**, and make ingestion **idempotent** — banks resend transactions.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-5': [
    {
      title: 'BFS across shards',
      body: `Shortest path in an unweighted graph is **breadth-first search** — but this graph has 5 billion edges spread over many **person servers** (shards).

\`\`\`
queue = [source]; visited = {source}
while queue:
  person = queue.pop_front()
  server = lookup_service.server_for(person.id)   # which shard?
  for friend_id in server.friends(person.id):
    if friend_id == target: return path
    if friend_id not in visited: visited.add(friend_id); queue.append(friend_id)
\`\`\`

Optimizations to mention:
- **Bidirectional BFS** — search from both ends and meet in the middle (explores ~2·b^(d/2) instead of b^d nodes).
- **Batch lookups** per person server to cut round trips; co-locate friends on the same shard (e.g. by geography).
- **Cache** hot people and popular paths — some people are looked up constantly.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-6': [
    {
      title: 'An LRU cache',
      body: `The query cache maps *normalized query → results*. Memory is limited, so it evicts the **least recently used** entry.

O(1) get and set needs two structures:
- a **hash map** from key → list node, to find entries instantly;
- a **doubly linked list** ordered by recency: move a node to the front on every hit, evict from the tail when full.

\`\`\`python
def get(self, query):
    node = self.lookup.get(query)
    if not node: return None
    self.linked_list.move_to_front(node)
    return node.results
\`\`\`

**Freshness**: a TTL per entry bounds staleness when the index changes; refresh-ahead keeps the hottest queries warm.`,
    },
    {
      title: 'Sharding the cache',
      body: `The hot set doesn't fit on one machine, so spread it over several. Three options from the primer:

1. **Each machine caches whatever it sees** — simple, but the same hot queries are duplicated on every node and the hit rate is low.
2. **Every machine holds a full copy** — simple, wastes memory.
3. **Shard by key** — each query lives on exactly one node, so memory adds up. ✔

Use **consistent hashing** to pick the node, so adding or removing a cache node only remaps ~1/N of the keys instead of turning the whole cache cold.`,
      widget: 'hashring',
    },
  ],

  // ---------------------------------------------------------------------------
  '7-7': [
    {
      title: 'Precompute, then serve',
      body: `"Best sellers in each category over the past week" is an expensive **aggregation**, but the answer changes slowly (hourly is fine) and is read **100× more** than sales are written.

So split it in two:
- **Batch layer** — append sales to logs in object storage (cheap, sequential). Every hour, **MapReduce**:
  1. *map*: \`(category, product_id) → quantity\` per sale,
  2. *reduce*: sum per key,
  3. a distributed sort by \`(category, quantity)\`.
- **Serving layer** — write the results to a small \`sales_rank\` table and serve it from **cache and read replicas**.

The read path never touches the raw sales data. This batch + serving split underlies countless analytics features.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '7-8': [
    {
      title: 'Growing up, one bottleneck at a time',
      body: `The primer's capstone grows a system from one box to millions of users by repeating one loop: **measure → find the bottleneck → fix it → repeat**. Step through the stages; each runs at a higher load.

1. **Single box** — app and database together. Scale vertically.
2. **Users+** — separate the database; move static files to **object storage + CDN**.
3. **Users++** — **load balancer** + several web servers; a **cache** for hot reads and sessions.
4. **Users+++** — **read replicas**, a **standby** with automatic failover, and an **autoscaling** web tier.

Beyond that: federation, sharding, NoSQL for suitable data, and async queues for heavy work — only when the numbers demand it.`,
      demo: {
        level: { keyspace: { keys: 20000, skew: 1, staticKeys: 2000, staticSkew: 0.9 } },
        stats: ['rps', 'success', 'p95', 'cost'],
        scenes: [
          {
            label: '1 · Single box',
            design: D([users(), node('app', 2, 1, 'app', { name: 'Web + app' }), node('sql', 4, 1, 'db', { name: 'MySQL' })], [E('users', 'app'), E('app', 'db')]),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 200 }], mix: { read: 75, static: 20, write: 5 } }] },
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
          {
            label: '2 · Users+',
            design: D(
              [users(), node('cdn', 1, 0, 'cdn', { name: 'CloudFront' }), node('objstore', 2, 0, 's3', { name: 'S3' }), node('app', 2, 2, 'app', { tier: 'M', name: 'Web + app' }), node('sql', 4, 2, 'db', { tier: 'M', name: 'RDS' })],
              [E('users', 'cdn'), E('users', 'app'), E('cdn', 's3'), E('app', 'db')],
            ),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 1000 }], mix: { read: 75, static: 20, write: 5 } }] },
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
          {
            label: '3 · Users++',
            design: D(
              [
                users(),
                node('cdn', 1, 0, 'cdn', { name: 'CloudFront' }),
                node('objstore', 2, 0, 's3', { name: 'S3' }),
                node('lb', 1, 2, 'lb', { name: 'ELB' }),
                node('app', 2, 2, 'app', { tier: 'M', name: 'Web ×3', cfg: { instances: 3 } }),
                node('cache', 3, 1, 'ec', { tier: 'M', name: 'ElastiCache' }),
                node('sql', 4, 2, 'db', { tier: 'M', name: 'RDS' }),
              ],
              [E('users', 'cdn'), E('users', 'lb'), E('cdn', 's3'), E('lb', 'app'), E('app', 'ec'), E('app', 'db')],
            ),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 4000 }], mix: { read: 75, static: 20, write: 5 } }] },
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
          {
            label: '4 · Users+++',
            design: D(
              [
                users(),
                node('cdn', 1, 0, 'cdn', { tier: 'M', name: 'CloudFront' }),
                node('objstore', 2, 0, 's3', { name: 'S3' }),
                node('lb', 1, 2, 'lb', { name: 'ELB', cfg: { ha: true } }),
                node('app', 2, 2, 'app', { tier: 'M', name: 'Web (autoscaling)', cfg: { instances: 7, autoscale: true, maxInstances: 12 } }),
                node('cache', 3, 1, 'ec', { tier: 'L', name: 'ElastiCache' }),
                node('sql', 4, 2, 'db', { tier: 'L', name: 'RDS primary', cfg: { autoFailover: true, replication: 'sync' } }),
                node('sql', 5, 1, 'sb', { tier: 'L', name: 'Standby', cfg: { role: 'standby' } }),
                node('sql', 5, 3, 'rr', { tier: 'L', name: 'Read replica', cfg: { role: 'replica' } }),
              ],
              [E('users', 'cdn'), E('users', 'lb'), E('cdn', 's3'), E('lb', 'app'), ...fan(['app'], ['ec', 'db', 'sb', 'rr']), E('db', 'sb'), E('db', 'rr')],
            ),
            level: { sources: [{ id: 'users', phases: [{ at: 0, rps: 9000 }], mix: { read: 75, static: 20, write: 5 } }] },
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
  ],
};

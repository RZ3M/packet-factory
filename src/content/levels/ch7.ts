import { CATALOG } from '../../engine/catalog';
import type { NodeKind } from '../../engine/types';
import { COL, D, E, N, ROW, USERS } from '../dsl';
import type { Level } from '../types';

const ALL_FEATURES = ['ha', 'cachePolicy', 'replication', 'failover', 'instances', 'autoscale', 'l7', 'tuning', 'cdnPush', 'consistency', 'sanitize'];
const PAL: NodeKind[] = (Object.keys(CATALOG) as NodeKind[]).filter((k) => CATALOG[k].placeable !== false);
const without = (...k: NodeKind[]) => PAL.filter((p) => !k.includes(p));

export const ch7: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '7-1',
    chapter: 7,
    title: 'Pastebin / Bit.ly',
    tagline: 'The classic warm-up: store text, hand back a short link.',
    brief: `**Build it.** We simulate the **evening peak** — traffic is far from evenly distributed, and a few pastes go viral.

- **Reads** (blue): someone follows a short link → look up paste metadata.
- **Static** (green): the paste *content* itself — immutable once written.
- **Writes** (orange): a new paste.

The primer's design separates **metadata** (small rows in SQL) from **content** (blobs in object storage), puts a **memory cache** in front of the database for popular pastes, and scales reads with **replicas**. A full palette is unlocked — use what you need.`,
    learn: ['Running the 4-step interview framework end to end', 'Separating metadata from blobs', 'Read-heavy scaling'],
    concepts: ['interview-framework', 'object-storage', 'cache', 'replication'],
    palette: without('graphdb'),
    features: ALL_FEATURES,
    duration: 70,
    warmup: 5,
    keyspace: { keys: 50000, skew: 1, staticKeys: 20000, staticSkew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }, { at: 30, rps: 4500 }, { at: 70, rps: 4500 }], mix: { read: 75, static: 16, write: 9 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 1300, star: 2 },
      { kind: 'p99', target: 150, star: 3 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('cdn', COL[1], ROW(0), { id: 'cdn' }),
        N('objstore', COL[2], ROW(0), { id: 's3', name: 'Paste content' }),
        N('lb', COL[1], ROW(2) + 2, { id: 'lb' }),
        N('app', COL[2], ROW(2) + 2, { id: 'api', tier: 'M', name: 'Read/Write API', cfg: { instances: 4 } }),
        N('cache', COL[3] + 2, ROW(1), { id: 'mc', tier: 'L', name: 'Memory cache' }),
        N('sql', COL[4] + 2, ROW(2) + 2, { id: 'db', tier: 'M', name: 'Metadata (primary)' }),
        N('sql', COL[5] + 2, ROW(4), { id: 'rep', tier: 'M', name: 'Read replica', cfg: { role: 'replica' } }),
      ],
      [E('users', 'cdn'), E('users', 'lb'), E('cdn', 's3'), E('lb', 'api'), E('api', 'mc'), E('api', 'db'), E('api', 'rep'), E('api', 's3'), E('db', 'rep')],
    ),
    interview: {
      prompt: `"Design **Pastebin** — or **Bit.ly**. Users paste text and get a short random URL. Anyone with the link can view it."`,
      clarify: [
        {
          q: 'What is a sensible read-to-write ratio assumption for a paste/short-link service?',
          options: ['1:10 (write heavy)', '1:1', '10:1 (read heavy)', '10,000:1'],
          answer: 2,
          explain: 'The primer assumes 10 million writes and 100 million reads per month: a 10:1 read-heavy workload. That steers you toward caching and read replicas.',
        },
        {
          q: 'Do page-view analytics need to be real time?',
          options: ['Yes, sub-second dashboards', 'No — hourly/daily batch (e.g. MapReduce over logs) is fine', 'Analytics are out of scope forever', 'They must block the read path'],
          answer: 1,
          explain: 'The primer states analytics need not be real time, so you can process web server logs offline instead of writing a counter on every read.',
        },
        {
          q: 'Where should the paste contents (up to a few KB of text, immutable) live?',
          options: ['In a TEXT column of the main SQL table only', 'In object storage (S3), with the SQL row storing its path', 'In the cache only', 'In DNS'],
          answer: 1,
          explain: 'Keep the database lean (metadata + path) and put blobs in cheap, durable object storage. The relational table stays small enough to fit in memory.',
        },
        {
          q: 'How do you generate the short link?',
          options: [
            'Sequential IDs exposed directly',
            'Hash (e.g. MD5 of IP + timestamp), Base62-encode, take the first 7 characters; check for collisions',
            'Ask the user for one every time',
            'Use the full URL as the key',
          ],
          answer: 1,
          explain: 'MD5 gives a uniformly distributed hash; Base62 ([a-zA-Z0-9]) keeps it URL-safe. 62^7 ≈ 3.5 trillion possible links. Collisions are rare but must be handled (retry with a different salt).',
        },
      ],
      estimates: [
        { q: '10 million pastes per month. Average writes per second?', answer: 4, unit: 'writes/s', tolerance: 0.5, explain: '10M ÷ 2.5M s/month = 4 writes/s.' },
        { q: '100 million reads per month. Average reads per second?', answer: 40, unit: 'reads/s', tolerance: 0.4, explain: '100M ÷ 2.5M = 40 reads/s. Tiny on average — the peaks and viral pastes are what you design for.' },
        { q: '~1.27 KB per paste, 10M pastes/month. Storage after 3 years?', answer: 450, unit: 'GB', tolerance: 0.4, explain: '1.27 KB × 10M = 12.7 GB/month × 36 ≈ 450 GB — and 360 million short links.' },
      ],
      reference: `### Reference design (from the primer)
**High level:** Client → Web server (reverse proxy) → **Write API** / **Read API** → SQL database (metadata) + Object store (content).

**Core components**
- **Write API**: generate a unique shortlink (MD5 → Base62 → first 7 chars), check for collisions in the \`pastes\` table, store the paste content in the object store and the row \`(shortlink, expiration_length_in_minutes, created_at, paste_path)\` in SQL. Index \`shortlink\` and \`created_at\`.
- **Read API**: look up the shortlink, fetch content from the object store, return it (or an error if expired).
- **Analytics**: no real-time requirement — MapReduce over web server logs (hit counts per shortlink).
- **Expiry**: a periodic job scans and deletes expired pastes (or mark them and clean up lazily).

**Scale the design**
- **DNS → CDN** for static assets; **load balancer** → horizontally scaled web/API servers.
- **Memory cache** (Memcached/Redis) for popular pastes — traffic is uneven, so the cache absorbs the hot set.
- **SQL read replicas** for cache misses; the primary handles the (few) writes.
- If writes grow: **federation** or **sharding**, or a **NoSQL** key-value store keyed by shortlink — it's a natural KV workload.

**Trade-offs to mention:** SQL vs KV store for the shortlink map; how long to keep expired data; custom aliases; rate limiting anonymous writers to prevent abuse.`,
    },
    hints: [
      'Read-heavy: a memory cache in front of SQL plus a replica will carry most reads.',
      'Paste content is immutable static data — object storage behind a CDN.',
      'One App Server node with Instances > 1 behind a load balancer saves a lot of wiring.',
    ],
    debrief: `### Interview recap
You ran the full loop: **clarify → estimate → design → scale**. The numbers were small on average (40 reads/s!) — the design effort went into peaks, viral hot spots and cheap storage, not raw throughput.

**What interviewers listen for here:** the read/write ratio driving a cache-first design; blobs out of the database; a sensible ID scheme with collision handling; and *not* over-engineering a 4-writes-per-second system.`,
    quiz: [
      {
        q: 'How many unique 7-character Base62 codes exist (roughly)?',
        options: ['~62 million', '~3.5 billion', '~3.5 trillion', '~62 trillion'],
        answer: 2,
        explain: '62^7 ≈ 3.52 × 10^12 — plenty for 360 million links in 3 years.',
      },
      {
        q: 'Why store paste content in object storage rather than the SQL table?',
        options: ['SQL cannot store text', 'Keeps the relational table small (fits in memory) and puts large immutable blobs in cheap, durable storage', 'Object storage is faster than SQL for small rows', 'For strong consistency'],
        answer: 1,
        explain: 'Small hot metadata stays in memory; bulky content goes to storage designed for it.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-2',
    chapter: 7,
    title: 'Twitter Timeline & Search',
    tagline: 'Fan-out on write, timelines in memory, search on an index.',
    brief: `**Build it.** Three request types at peak:
- **Home timeline reads** (blue) — by far the most common. Must be fast.
- **Tweets** (orange) — posting must be fast too. Each tweet must be **fanned out** to followers' timelines (~10 deliveries per tweet).
- **Search** (yellow) — full-text, read-heavy.

Primer approach: **fan-out on write** — when a tweet is posted, workers push it into each follower's timeline **in a memory cache** (Redis lists), so reading a timeline is a single cache hit. Use a **queue** so posting returns immediately. Search goes to a dedicated **search index**.

Workers wired to a Cache perform the fan-out automatically (~10 cache writes per tweet). Watch out for **celebrities**: a mid-run burst of tweets will flood the fan-out.`,
    learn: ['Fan-out on write vs on read', 'Timelines in memory', 'Search clusters', 'The celebrity problem'],
    concepts: ['interview-framework', 'message-queues', 'cache', 'search-index'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 80,
    warmup: 5,
    fanout: 10,
    keyspace: { keys: 50000, skew: 1.05 },
    sources: [
      {
        id: 'users',
        phases: [
          { at: 0, rps: 6000 },
          { at: 35, rps: 6000 },
          { at: 36, rps: 7200, mix: { read: 78, write: 16, search: 6 } },
          { at: 50, rps: 7200 },
          { at: 51, rps: 6000, mix: { read: 88, write: 6, search: 6 } },
        ],
        mix: { read: 88, write: 6, search: 6 },
      },
    ],
    chaos: [{ at: 35, type: 'notice', note: '⭐ A celebrity just tweeted — retweet storm incoming!' }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, types: ['read'], star: 1 },
      { kind: 'p95', target: 120, types: ['write'], star: 1 },
      { kind: 'jobP95', target: 10000, star: 1, label: 'Tweets delivered to timelines within 10 s (p95)' },
      { kind: 'cost', target: 3000, star: 2 },
      { kind: 'p95', target: 100, types: ['search'], star: 3 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: twitterSolution(),
    interview: {
      prompt: `"Design the **Twitter timeline and search** (or the Facebook feed and search). Users post tweets, view their home timeline (tweets from people they follow), view a user timeline, and search tweets."`,
      clarify: [
        {
          q: 'Which is heavier for the timeline service: reads or writes?',
          options: ['Writes dominate', 'Reads dominate (viewing timelines), though ingesting tweets is write-heavy too', 'They are equal', 'Neither matters'],
          answer: 1,
          explain: 'The primer assumes 250 billion reads/month vs 15 billion tweets/month. Optimize for fast timeline reads.',
        },
        {
          q: 'Fan-out on write vs fan-out on read: what does fan-out on write mean?',
          options: [
            'When you open your timeline, query everyone you follow',
            'When someone tweets, push the tweet into each follower\'s precomputed timeline',
            'Write tweets to every data center synchronously',
            'Replicate the database on every write',
          ],
          answer: 1,
          explain: 'Pushing at write time makes reads a single lookup. The cost: users with millions of followers make writes enormous (the celebrity problem).',
        },
        {
          q: 'How would you handle users with millions of followers?',
          options: [
            'Fan out to all followers synchronously',
            'Skip fan-out for celebrities; merge their recent tweets into timelines at read time (hybrid)',
            'Ban celebrities',
            'Store their tweets only in search',
          ],
          answer: 1,
          explain: 'A hybrid: fan-out on write for normal users, fan-out on read for the few accounts with huge follower counts.',
        },
      ],
      estimates: [
        { q: '250 billion timeline reads per month. Reads per second?', answer: 100000, unit: 'reads/s', tolerance: 0.4, explain: '250B ÷ 2.5M s = 100,000 reads/s.' },
        { q: '15 billion tweets per month. Tweets per second?', answer: 6000, unit: 'tweets/s', tolerance: 0.4, explain: '15B ÷ 2.5M = 6,000 tweets/s.' },
        { q: 'Average fan-out of 10 deliveries per tweet. Deliveries per second?', answer: 60000, unit: 'deliveries/s', tolerance: 0.4, explain: '6,000 × 10 = 60,000 fan-out writes/s — why timelines live in memory.' },
      ],
      reference: `### Reference design (from the primer)
**Posting a tweet:** Client → Web server → **Write API** → store the tweet in the user's timeline (SQL) → contact the **Fan Out Service**, which:
1. Looks up the user's followers in the **User Graph Service** (followers kept in memory cache),
2. Stores the tweet in each follower's home timeline in a **memory cache** (Redis list: tweet ID + user ID, keep the last ~800 tweets),
3. Stores the tweet in the **Search Index Service**,
4. Stores media in the **Object Store**,
5. Uses the **Notification Service** to push notifications (async via a queue).

**Reading the home timeline:** Read API → **Timeline Service** reads the precomputed list from the memory cache (O(1)) → Tweet Info Service / User Info Service do multi-gets for tweet and user details → done.

**Search:** Search API → **Search Cluster** (e.g. Lucene) parses and normalizes the query, scatter-gathers across index shards, merges, ranks and returns.

**Scale the design**
- The **Fan Out Service** is the bottleneck: celebrities with millions of followers make tweets take minutes to fan out. Avoid fanning out highly-followed users; merge their tweets at read time.
- Keep only recent days of timelines in cache; rebuild inactive users' timelines from SQL when they return.
- **Memory caches** for tweet info, user info and graph; **SQL read replicas**; the volume of writes eventually calls for **sharding or NoSQL**.
- **CDN** for media.`,
    },
    hints: [
      'Route search to its own pool with an L7 load balancer and filters (Bulkheads, 6-3), and give it a Search Index.',
      'App → Queue for tweets (writes); Queue → Worker; Worker → Timeline cache (fan-out) and → database (persistence).',
      'Timeline reads should hit a big memory cache in front of the tweet store. Autoscale the fan-out workers for the celebrity burst.',
    ],
    debrief: `### Interview recap
- **Fan-out on write** turned the hottest operation — reading a timeline — into a cache lookup, at the price of write amplification (×10 here, ×millions for celebrities).
- The **queue** kept tweeting fast during the retweet storm; fan-out caught up later.
- **Search** lived on its own index and its own pool, so a search surge can't slow down timelines.

Mention the **hybrid** approach for celebrities, keeping only recent timelines in RAM, and sharding by user ID as the system grows.`,
    quiz: [
      {
        q: 'Why do timeline reads stay fast with fan-out on write?',
        options: ['Reads go to the search index', 'Each user\'s timeline is precomputed in memory, so a read is one lookup', 'Tweets are cached in the CDN', 'Reads are eventually consistent'],
        answer: 1,
        explain: 'The expensive merge of "everyone you follow" happens once at write time instead of on every read.',
      },
      {
        q: 'What is the main cost of fan-out on write?',
        options: ['Slow reads', 'Write amplification — especially for accounts with huge follower counts', 'No caching possible', 'Search becomes impossible'],
        answer: 1,
        explain: 'One tweet from an account with 50M followers means 50M timeline inserts.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-3',
    chapter: 7,
    title: 'Web Crawler',
    tagline: 'Crawl a billion pages a month and answer 40k searches a second.',
    brief: `**Build it.** Two very different workloads share this system:
- A **Crawl Scheduler** feeds URLs to crawl as **jobs** (purple). Each crawl fetches a page (~100 ms of mostly network wait), extracts links, and updates the index. Pages need re-crawling regularly to stay **fresh**.
- **Users** send **search** queries (yellow) — and popular queries repeat a lot.

Primer approach: a **queue** of links to crawl feeding a fleet of **crawler workers**; a **reverse index** for search; a **memory cache** for popular queries; and the search path kept separate so crawling load never slows down users.`,
    learn: ['Job queues at scale', 'Caching popular queries', 'Separating batch and interactive workloads'],
    concepts: ['interview-framework', 'message-queues', 'search-index', 'cache'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 70,
    warmup: 5,
    jobMs: 100,
    keyspace: { keys: 40000, skew: 1.1 },
    sources: [
      { id: 'users', phases: [{ at: 0, rps: 6000 }], mix: { search: 100 } },
      { id: 'sched', phases: [{ at: 0, rps: 600 }], mix: { job: 100 } },
    ],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 80, types: ['search'], star: 1 },
      { kind: 'jobP95', target: 5000, star: 1, label: 'Pages crawled within 5 s of scheduling (p95)' },
      { kind: 'cost', target: 2400, star: 2 },
      { kind: 'offload', target: 70, types: ['search'], by: ['cache'], star: 3, label: '≥ 70% of searches answered from cache' },
    ],
    start: D([USERS({ y: ROW(1), name: 'Users' }), USERS({ id: 'sched', y: ROW(4), name: 'Crawl Scheduler' })]),
    solution: D(
      [
        USERS({ y: ROW(1), name: 'Users' }),
        USERS({ id: 'sched', y: ROW(4), name: 'Crawl Scheduler' }),
        N('lb', COL[1], ROW(1), { id: 'lb' }),
        N('app', COL[2], ROW(1), { id: 'qapi', tier: 'L', name: 'Query API', cfg: { instances: 4 } }),
        N('cache', COL[3] + 2, ROW(0), { id: 'qc', tier: 'M', name: 'Query cache' }),
        N('search', COL[4] + 4, ROW(1), { id: 'idx', tier: 'M', name: 'Reverse index' }),
        N('app', COL[1], ROW(4), { id: 'capi', tier: 'S', name: 'Crawl intake' }),
        N('queue', COL[2], ROW(4), { id: 'links', name: 'links_to_crawl', cfg: { maxDepth: 200000 } }),
        N('worker', COL[3] + 2, ROW(4), { id: 'crawlers', tier: 'L', name: 'Crawler service', cfg: { instances: 6 } }),
      ],
      [E('users', 'lb'), E('lb', 'qapi'), E('qapi', 'qc'), E('qc', 'idx'), E('sched', 'capi'), E('capi', 'links'), E('links', 'crawlers')],
    ),
    interview: {
      prompt: `"Design a **web crawler** for a search engine: crawl a list of URLs, generate a reverse index of words → pages, generate titles and snippets, and serve user searches."`,
      clarify: [
        {
          q: 'How does the crawler avoid getting stuck in an infinite loop?',
          options: ['It cannot', 'Detect duplicate URLs and near-duplicate pages (e.g. page signatures), and track crawled links', 'Only crawl one domain', 'Use UDP'],
          answer: 1,
          explain: 'The link graph has cycles. Keep a crawled_links store and compare page signatures to skip duplicates; normalize URLs.',
        },
        {
          q: 'How often must pages be re-crawled?',
          options: ['Never', 'Regularly to stay fresh — on average weekly, more often for popular sites', 'Once per second', 'Only when users complain'],
          answer: 1,
          explain: 'The primer assumes an average refresh of about once per week, prioritizing popular pages.',
        },
        {
          q: 'Search traffic is skewed — some queries are extremely popular. Implication?',
          options: ['Nothing', 'Cache popular query results in memory', 'Shard by query length', 'Disable search during crawls'],
          answer: 1,
          explain: 'A memory cache for popular queries absorbs most search load (the primer even has a separate "query cache" design question).',
        },
      ],
      estimates: [
        { q: '4 billion links crawled per month. Crawls per second?', answer: 1600, unit: 'crawls/s', tolerance: 0.4, explain: '4B ÷ 2.5M s ≈ 1,600 writes/s.' },
        { q: '100 billion searches per month. Searches per second?', answer: 40000, unit: 'searches/s', tolerance: 0.4, explain: '100B ÷ 2.5M = 40,000 searches/s.' },
        { q: '500 KB per page, 4 billion pages crawled per month. Storage per month?', answer: 2, unit: 'PB', tolerance: 0.4, explain: '500 KB × 4B = 2 PB per month (72 PB in 3 years).' },
      ],
      reference: `### Reference design (from the primer)
**Crawling**
- \`links_to_crawl\`: a priority-ordered store of links (NoSQL / Redis sorted set) ranked by popularity.
- \`crawled_links\`: processed links plus page signatures.
- **Crawler Service** loop: take the top link → check \`crawled_links\` for a similar page signature (skip + lower priority if found) → otherwise crawl, add jobs for the **Reverse Index Service** and **Document Service** (titles & snippets), compute the page signature, move the link to \`crawled_links\`.
- **Deduplication**: MapReduce to find exact duplicate URLs; Jaccard index / cosine similarity for near-duplicate pages.
- **Freshness**: re-crawl based on a page's change history; respect \`robots.txt\`.

**Search**
- Client → Web server → **Query API** → parse (remove markup, fix typos, normalize case, convert to boolean ops) → **Reverse Index Service** finds matching documents, ranks and returns top results → **Document Service** returns titles and snippets.

**Scale the design**
- Popular queries are served from a **memory cache** (Redis/Memcached) — also reduces load on the index.
- The reverse index and document services make heavy use of **sharding and federation**.
- Crawler DNS lookups are a bottleneck — the crawler service keeps its own DNS cache; keep many connections open (connection pooling); consider UDP for some lookups.
- Crawling is **batch**, searching is **interactive**: isolate them so a crawl surge never slows search.`,
    },
    hints: [
      'Two separate paths: Scheduler → intake → queue → crawler workers; Users → LB → query API → search.',
      'Crawl jobs: 600/s × 0.1 s = 60 busy slots. A large worker has 16.',
      'Put a Query cache between the query API and the Reverse index (App → Cache → Search Index).',
    ],
    debrief: `### Interview recap
- The crawl pipeline is a **job queue** feeding stateless workers — scale workers to hit your freshness target.
- Search is a separate, latency-sensitive path, with a **query cache** soaking up the long tail's popular head.
- In the interview, spend time on **dedup and cycle detection**, **politeness** (robots.txt, per-host rate limits), and **prioritization** (crawl popular pages more often).`,
    quiz: [
      {
        q: 'What prevents a crawler from looping forever on a site with cyclic links?',
        options: ['TCP timeouts', 'Tracking crawled URLs and page signatures to skip duplicates', 'A CDN', 'Sharding by domain'],
        answer: 1,
        explain: 'Normalize URLs and store what you have crawled (plus content signatures to catch near-duplicates).',
      },
      {
        q: 'Why keep crawling and search on separate infrastructure paths?',
        options: ['They use different programming languages', 'Batch crawl load should never degrade interactive search latency', 'Search needs UDP', 'Crawling is read-only'],
        answer: 1,
        explain: 'Isolate batch from interactive workloads (bulkheads).',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-4',
    chapter: 7,
    title: 'Mint.com',
    tagline: 'Pull in billions of bank transactions; budgets can wait a little.',
    brief: `**Build it.** A personal-finance app that connects to users' bank accounts.
- **Ingest** (teal): transactions pulled from banks — the vast majority of traffic. Users don't need them to appear within milliseconds.
- **Reads** (blue): users viewing spending and budgets.
- **Jobs** (purple): budget analysis & notifications ("you're over your food budget").

It's **write-heavy**: about **10 writes per read**. The primer design routes ingestion through a **queue** to transaction-extraction workers that categorize and store transactions, keeps reads on replicas/caches, and runs budget analysis asynchronously. Losing a transaction is not acceptable.`,
    learn: ['Write-heavy design', 'Async ingestion pipelines', 'Batch analytics vs online reads'],
    concepts: ['interview-framework', 'message-queues', 'asynchronism', 'sql-vs-nosql'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 70,
    warmup: 5,
    jobMs: 400,
    keyspace: { keys: 40000, skew: 0.7 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 3000 }, { at: 30, rps: 5000 }, { at: 45, rps: 5000 }, { at: 55, rps: 3000 }], mix: { ingest: 90, read: 9, job: 1 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'dataLoss', target: 0, star: 1 },
      { kind: 'jobP95', target: 20000, star: 1, label: 'Transactions & budget jobs processed within 20 s (p95)' },
      { kind: 'p95', target: 100, types: ['read'], star: 1 },
      { kind: 'cost', target: 1900, star: 2 },
      { kind: 'jobP95', target: 5000, star: 3, label: 'Processed within 5 s (p95)' },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb' }),
        N('app', COL[2], ROW(2), { id: 'api', tier: 'M', name: 'Accounts API', cfg: { instances: 4 } }),
        N('queue', COL[3] + 2, ROW(3) + 2, { id: 'q', name: 'Ingest queue', cfg: { maxDepth: 200000 } }),
        N('worker', COL[4] + 4, ROW(3) + 2, { id: 'tx', tier: 'M', name: 'Transaction extraction', cfg: { instances: 6 } }),
        N('widecolumn', COL[5] + 6, ROW(4), { id: 'wc', name: 'Transactions', cfg: { nodes: 2 } }),
        N('cache', COL[3] + 2, ROW(0), { id: 'c', tier: 'S', name: 'Budget cache' }),
        N('sql', COL[4] + 4, ROW(0), { id: 'db', tier: 'M', name: 'Accounts & budgets' }),
      ],
      [E('users', 'lb'), E('lb', 'api'), E('api', 'q'), E('api', 'c'), E('api', 'db'), E('q', 'tx'), E('tx', 'wc')],
    ),
    interview: {
      prompt: `"Design **Mint.com**: users connect financial accounts, transactions are pulled daily and categorized automatically, users see spending by category, set budgets, and get notified when they approach or exceed them."`,
      clarify: [
        {
          q: 'Do budget notifications need to be instant?',
          options: ['Yes, within 10 ms', 'No — budget notifications don\'t need to be instant, so they can be computed asynchronously', 'Notifications are not needed', 'Only via SMS'],
          answer: 1,
          explain: 'The primer states notifications don\'t need to be instant — a queue + workers fits.',
        },
        {
          q: 'Should the system update every account daily?',
          options: ['Yes, all 30 million accounts', 'Only accounts of users active in the past 30 days', 'Only on login', 'Never'],
          answer: 1,
          explain: 'Restricting daily updates to recently active users cuts the work dramatically.',
        },
        {
          q: 'How do you categorize a transaction?',
          options: ['Ask the user every time', 'Map the seller to a category (e.g. a seller → category table), with user overrides', 'Random', 'By amount'],
          answer: 1,
          explain: 'A seller-based lookup (the primer assumes ~50,000 sellers) handles most transactions; users can recategorize.',
        },
      ],
      estimates: [
        { q: '5 billion transactions per month. Transaction writes per second?', answer: 2000, unit: 'writes/s', tolerance: 0.4, explain: '5B ÷ 2.5M s = 2,000 transactions/s.' },
        { q: '500 million read requests per month. Reads per second?', answer: 200, unit: 'reads/s', tolerance: 0.4, explain: '500M ÷ 2.5M = 200 reads/s — a 10:1 write-to-read workload.' },
        { q: '~50 bytes per transaction × 5B per month. New data per month?', answer: 250, unit: 'GB', tolerance: 0.4, explain: '50 B × 5B = 250 GB/month → 9 TB in 3 years.' },
      ],
      reference: `### Reference design (from the primer)
**Adding an account:** Client → Web server → Accounts API → store in SQL \`accounts\` table.

**Extracting transactions** (async): Accounts API → **Queue** (e.g. SQS/RabbitMQ) → **Transaction Extraction Service** pulls from the queue → fetches transactions from the bank → stores raw logs in the **Object Store** → uses the **Category Service** (seller → category) → uses the **Budget Service** to compute aggregate spending → **Notification Service** if over budget → updates SQL \`transactions\` and \`monthly_spending\` tables → notifies the client.

**Budgets:** a default budget per category based on income; users can override. Monthly spending is updated incrementally, or computed by **MapReduce** over the raw transaction logs in the object store.

**Scale the design**
- Write-heavy: **asynchronous** ingestion through queues; **SQL write scaling** via federation/sharding — or move transactions to a **NoSQL** store built for write throughput.
- Reads are rare: a **memory cache** for popular data (dashboards), **SQL read replicas** for misses.
- Run analytics in **batch** off the object store logs, not on the OLTP database.`,
    },
    hints: [
      'Apps → Queue → Worker pool → a store built for heavy writes (or a big SQL primary).',
      'Reads and budgets can live in a normal SQL database with a cache in front.',
      'Workers must keep up with the burst average: 4,300 ingest/s in the peak. Size the pool.',
    ],
    debrief: `### Interview recap
- The defining property was **write-heavy, latency-tolerant ingestion**: perfect for a queue and a worker pool.
- Transactions went to a store optimized for writes; account and budget data (small, relational, read by users) stayed in SQL.
- Budget analysis ran **asynchronously**; notifications didn't need to be instant.

Mention: idempotent ingestion (banks resend transactions), batch reprocessing from raw logs, and restricting daily refresh to active users.`,
    quiz: [
      {
        q: 'Mint is 10:1 write-to-read. Which technique matters most?',
        options: ['Read replicas', 'Asynchronous ingestion with queues and write-scalable storage', 'A CDN', 'Push CDNs'],
        answer: 1,
        explain: 'Writes dominate and users tolerate delay, so queue ingestion and store transactions where writes scale.',
      },
      {
        q: 'Banks may send the same transaction twice. What property must ingestion have?',
        options: ['Low latency', 'Idempotency (dedupe by transaction ID)', 'Strong consistency across regions', 'TLS termination'],
        answer: 1,
        explain: 'At-least-once delivery plus retries means duplicates — dedupe on a stable transaction ID.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-5',
    chapter: 7,
    title: 'Social Graph',
    tagline: 'Find the shortest path between two people — at 100 million users.',
    brief: `**Build it.** Users search for people and see how they're connected ("friend of a friend"). That's a **graph traversal** (pink).

The interviewer adds a constraint: **exercise traditional systems — no graph database.** 100 million users × 50 friends doesn't fit on one machine anyway.

Primer approach: a **Lookup Service** that knows which **Person Server** (shard) holds each user; person servers keep adjacency lists; a BFS hops between shards. Popular lookups are cached. Here, traversals can run on a key-value store (each hop is a key lookup) or on SQL (each hop is a self-join).`,
    learn: ['Sharding a graph by user', 'BFS across shards', 'Caching hot lookups'],
    concepts: ['interview-framework', 'sharding', 'nosql-graph', 'cache'],
    palette: without('graphdb'),
    features: ALL_FEATURES,
    duration: 60,
    warmup: 5,
    keyspace: { keys: 50000, skew: 0.9 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 3500 }], mix: { graph: 80, read: 15, write: 5 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 120, types: ['graph'], star: 1 },
      { kind: 'cost', target: 1500, star: 2 },
      { kind: 'p50', target: 48, types: ['graph'], star: 3 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb' }),
        N('app', COL[2], ROW(2), { id: 'api', tier: 'L', name: 'Search API', cfg: { instances: 3 } }),
        N('cache', COL[3] + 2, ROW(1), { id: 'c', tier: 'M', name: 'Lookup cache' }),
        N('kv', COL[4] + 4, ROW(2), { id: 'ps', name: 'Person servers', cfg: { nodes: 4 } }),
      ],
      [E('users', 'lb'), E('lb', 'api'), E('api', 'c'), E('c', 'ps')],
    ),
    interview: {
      prompt: `"Design the **data structures for a social network**: users can search for someone and see the **shortest path** to that person. 100 million users, ~50 friends each."`,
      clarify: [
        {
          q: 'The graph has 5 billion edges. Can it live on one machine?',
          options: ['Yes, easily', 'No — it must be partitioned (sharded) across many "person servers"', 'Only on SSDs', 'Only in a CDN'],
          answer: 1,
          explain: 'The primer assumes the graph does not fit on a single machine, so you shard users across person servers and add a lookup service.',
        },
        {
          q: 'Which algorithm finds the shortest path in an unweighted graph?',
          options: ['Depth-first search', 'Breadth-first search', 'Dijkstra with negative weights', 'Binary search'],
          answer: 1,
          explain: 'BFS explores level by level, so the first time it reaches the target is via a shortest path. (Bidirectional BFS from both ends is even better.)',
        },
      ],
      estimates: [
        { q: '100 million users × 50 friends. How many friend relationships?', answer: 5000000000, unit: 'edges', tolerance: 0.3, explain: '100M × 50 = 5 billion relationships.' },
        { q: '1 billion friend searches per month. Searches per second?', answer: 400, unit: 'searches/s', tolerance: 0.4, explain: '1B ÷ 2.5M = 400 searches/s.' },
      ],
      reference: `### Reference design (from the primer)
**Use case: search for a user and see the shortest path.**
- Client → Web server → **Search API** → **User Graph Service**.
- The User Graph Service uses a **Lookup Service** to find which **Person Server** stores the current user's info and friend list.
- It runs **BFS**: for each frontier person, ask the Lookup Service which Person Server holds them, fetch their friend IDs from that server, enqueue unvisited friends, until the target is found.
- Person Servers are **sharded** by person ID.

**Scale the design**
- **Memory cache** for person and friend lookups (popular users are looked up constantly).
- Batch friend lookups per Person Server to reduce round trips; colocate friends on the same shard when possible (e.g. by location).
- **Bidirectional BFS** from source and target; limit search depth; precompute/cache popular paths.
- Store results of popular searches.
- Alternatives (if allowed): a **graph database** such as Neo4j, or a graph query layer.`,
    },
    hints: [
      'No graph database allowed. A key-value store does a traversal hop with a few key lookups; SQL needs expensive self-joins.',
      'Put a lookup cache in front of the store — popular people are looked up over and over.',
      'NoSQL stores scale out: add nodes until utilization is comfortable.',
    ],
    debrief: `### Interview recap
- Partition users across **person servers**; a **lookup service** maps person → server; BFS hops between servers.
- A **cache** in front absorbed the hot lookups (popular people), cutting both latency and store load.
- Key-value stores turned each hop into a cheap get; a relational design pays for self-joins — which is why the primer calls this out as an exercise in traditional systems.`,
    quiz: [
      {
        q: 'In a sharded social graph, what does the Lookup Service do?',
        options: ['Ranks search results', 'Maps a person ID to the person server (shard) that stores them', 'Caches images', 'Issues TLS certificates'],
        answer: 1,
        explain: 'Every hop of the BFS needs to know where that person\'s adjacency list lives.',
      },
      {
        q: 'Why use bidirectional BFS for shortest paths?',
        options: ['It uses more memory', 'Searching from both ends meets in the middle, exploring far fewer nodes', 'It works on weighted graphs only', 'It avoids sharding'],
        answer: 1,
        explain: 'With branching factor b and distance d, two searches of depth d/2 explore ~2·b^(d/2) nodes instead of b^d.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-6',
    chapter: 7,
    title: 'Search Query Cache',
    tagline: 'A key-value cache in front of a very expensive search engine.',
    brief: `**Build it.** Your search engine's **reverse index service** is expensive and slow to scale. Most queries repeat — some are wildly popular.

Design the **query cache**: a key-value store mapping *query → results*.
- Memory is limited: you can't cache everything. **LRU eviction** keeps the hottest queries.
- One cache node is not enough memory for the working set: **shard the cache** across nodes. Route each query to the node that owns it (**consistent hashing**) so each query is cached exactly once.
- Results go stale; a **TTL** refreshes them.

Hint: a Shard Router can route to cache nodes, building a cache cluster.`,
    learn: ['LRU caches', 'Sharding a cache with consistent hashing', 'Hit rate vs memory'],
    concepts: ['interview-framework', 'cache', 'consistent-hashing'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 70,
    warmup: 12,
    keyspace: { keys: 60000, skew: 0.85 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 7000 }], mix: { search: 100 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 80, star: 1 },
      { kind: 'offload', target: 70, types: ['search'], by: ['cache'], star: 1, label: '≥ 70% of queries answered from cache' },
      { kind: 'cost', target: 1900, star: 2 },
      { kind: 'offload', target: 80, types: ['search'], by: ['cache'], star: 3, label: '≥ 80% of queries answered from cache' },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb' }),
        N('app', COL[2], ROW(2), { id: 'api', tier: 'L', name: 'Query API', cfg: { instances: 4 } }),
        N('shardrouter', COL[3], ROW(2), { id: 'ring', name: 'Hash ring', cfg: { strategy: 'consistent' } }),
        N('cache', COL[4], ROW(1), { id: 'c1', tier: 'L', name: 'Cache shard 1', cfg: { ttl: 600 } }),
        N('cache', COL[4], ROW(3), { id: 'c2', tier: 'L', name: 'Cache shard 2', cfg: { ttl: 600 } }),
        N('search', COL[5] + 2, ROW(2), { id: 'idx', tier: 'M', name: 'Reverse index' }),
      ],
      [E('users', 'lb'), E('lb', 'api'), E('api', 'ring'), E('ring', 'c1'), E('ring', 'c2'), E('c1', 'idx'), E('c2', 'idx')],
    ),
    traps: [
      {
        name: 'two caches side by side, no key routing',
        maxStars: 2,
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb' }),
            N('app', COL[2], ROW(2), { id: 'api', tier: 'L', cfg: { instances: 4 } }),
            N('cache', COL[4], ROW(1), { id: 'c1', tier: 'L', cfg: { ttl: 600 } }),
            N('cache', COL[4], ROW(3), { id: 'c2', tier: 'L', cfg: { ttl: 600 } }),
            N('search', COL[5] + 2, ROW(2), { id: 'idx', tier: 'M' }),
          ],
          [E('users', 'lb'), E('lb', 'api'), E('api', 'c1'), E('api', 'c2'), E('c1', 'idx'), E('c2', 'idx')],
        ),
      },
    ],
    interview: {
      prompt: `"Design a **key-value cache** to save the results of the most recent web server queries. The search engine is expensive; popular queries should almost always be served from cache."`,
      clarify: [
        {
          q: 'Which data structure gives O(1) LRU get and put?',
          options: ['A sorted array', 'A hash map + doubly linked list', 'A binary search tree', 'A bloom filter'],
          answer: 1,
          explain: 'The hash map finds the node in O(1); the doubly linked list moves it to the front or evicts the tail in O(1).',
        },
        {
          q: 'The cache does not fit on one machine. How do you split it?',
          options: [
            'Every machine caches everything (replication only)',
            'Shard by query key with consistent hashing so each query lives on one node',
            'Random placement',
            'By result size',
          ],
          answer: 1,
          explain: 'Sharding by key means each query is cached once and total memory adds up. Consistent hashing limits reshuffling when nodes change.',
        },
        {
          q: 'How do cached results get refreshed when the index changes?',
          options: ['They never change', 'A TTL expires entries; popular entries can be refreshed ahead of expiry', 'Clear the whole cache every second', 'Write-behind'],
          answer: 1,
          explain: 'TTLs bound staleness; refresh-ahead keeps the hottest keys warm.',
        },
      ],
      estimates: [
        { q: '10 billion queries per month. Requests per second?', answer: 4000, unit: 'req/s', tolerance: 0.4, explain: '10B ÷ 2.5M = 4,000 req/s.' },
        { q: '270 bytes per cached query. If all 10 billion monthly queries were unique and stored, how much data?', answer: 2.7, unit: 'TB', tolerance: 0.4, explain: '270 B × 10B = 2.7 TB/month — far too much for RAM, hence LRU eviction.' },
      ],
      reference: `### Reference design (from the primer)
- Client → Web server (reverse proxy) → **Query API** → parse query (remove markup, normalize, correct spelling, boolean ops) → **Memory Cache** lookup.
  - **Hit**: move the entry to the front of the LRU list; return results.
  - **Miss**: call the **Reverse Index Service** to find matching documents, the **Document Service** for titles and snippets; store in the cache (evict the LRU tail if full).

**Cache implementation:** a hash map (query → node) plus a doubly linked list ordered by recency. Get and set are O(1).

**When to update the cache:** when page content changes, when a page is removed or added, or when rank changes. A **TTL** is the simplest handle on staleness; refresh popular entries ahead of time.

**Scale the design**
- One machine's memory isn't enough → **shard the cache** across machines.
  - Each machine has its own cache? Simple but low hit rate (a query may be cached on one machine and missed on another).
  - Each machine has a copy of the cache? Simple, but inefficient use of memory.
  - **Shard the cache across all machines** with consistent hashing: each query lives on exactly one node. ✔
- Analytics and the reverse index sit behind it and scale with sharding/federation.`,
    },
    hints: [
      'Total cache memory is what matters: the hot set is larger than one node.',
      'App → Shard Router (consistent hashing) → several Cache nodes → each cache → the Reverse index.',
      'Wiring several caches directly to the app splits traffic randomly — every node caches a copy of the same hot queries and memory is wasted.',
    ],
    debrief: `### Interview recap
- **LRU** kept the hottest queries; **TTL** bounded staleness.
- **Sharding by key** made the cluster's memory add up — each query cached exactly once. Wiring caches side-by-side without key routing would have duplicated the hot set on every node.
- **Consistent hashing** means adding a node only remaps ~1/N of the keys: a small cold-miss blip instead of a cache-wide stampede.`,
    quiz: [
      {
        q: 'Three cache nodes each independently cache whatever they see (random routing). Compared to key-sharded routing, the hit rate is…',
        options: ['Higher', 'Lower — the same hot keys are duplicated on every node, wasting memory', 'Identical', 'Undefined'],
        answer: 1,
        explain: 'Random routing means each node must hold the hot set by itself; sharding pools the memory.',
      },
      {
        q: 'You add a 4th node to a 3-node cache using hash(key) mod N. What happens?',
        options: ['Nothing', 'Most keys map to a different node → a burst of misses (stampede) on the backend', 'Only new keys go to the new node', 'Hit rate doubles immediately'],
        answer: 1,
        explain: 'Mod-N remaps ~75% of keys. Consistent hashing remaps ~25%.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-7',
    chapter: 7,
    title: 'Amazon Sales Rank',
    tagline: 'Best sellers by category: 100 reads for every sale.',
    brief: `**Build it.** Show the **best-selling products in each category**, updated hourly.
- **Reads** (blue): category pages showing the ranking — 100× more common than sales.
- **Ingest** (teal): sales events streaming in.
- **Jobs** (purple): the hourly **MapReduce-style** rank computation, chunked into batch jobs.

Primer approach: log sales cheaply (append to an object store / log), crunch them in **batch** with MapReduce, write the results into a small **sales_rank** table — then serve those few, extremely hot rows from **cache and read replicas**.`,
    learn: ['Batch processing (MapReduce) vs online serving', 'Precomputing results for read-heavy access', 'Caching hot aggregates'],
    concepts: ['interview-framework', 'asynchronism', 'cache', 'replication'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 60,
    warmup: 5,
    jobMs: 1500,
    keyspace: { keys: 2000, skew: 1.2 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 9000 }], mix: { read: 98.8, ingest: 1, job: 0.2 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 80, types: ['read'], star: 1 },
      { kind: 'jobP95', target: 15000, star: 1, label: 'Sales & rank jobs processed within 15 s (p95)' },
      { kind: 'cost', target: 2000, star: 2 },
      { kind: 'p99', target: 100, types: ['read'], star: 3 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb' }),
        N('app', COL[2], ROW(2), { id: 'api', tier: 'L', name: 'Sales API', cfg: { instances: 5 } }),
        N('cache', COL[3] + 2, ROW(0), { id: 'c', tier: 'S', name: 'Rank cache' }),
        N('sql', COL[4] + 4, ROW(1), { id: 'db', tier: 'M', name: 'sales_rank' }),
        N('queue', COL[3] + 2, ROW(3) + 2, { id: 'q', name: 'Sales log', cfg: { maxDepth: 200000 } }),
        N('worker', COL[4] + 4, ROW(3) + 2, { id: 'mr', tier: 'L', name: 'MapReduce', cfg: { instances: 3 } }),
        N('widecolumn', COL[5] + 6, ROW(4), { id: 'logs', name: 'Sales logs', cfg: { nodes: 1 } }),
      ],
      [E('users', 'lb'), E('lb', 'api'), E('api', 'c'), E('api', 'db'), E('api', 'q'), E('q', 'mr'), E('mr', 'logs')],
    ),
    interview: {
      prompt: `"Design **Amazon's sales rank by category**: compute the past week's most popular products in each category and show them to users browsing a category."`,
      clarify: [
        {
          q: 'How fresh must the rankings be?',
          options: ['Real time', 'Updated hourly (popular products maybe more often)', 'Monthly', 'Only on deploy'],
          answer: 1,
          explain: 'The primer assumes hourly updates — which permits batch computation instead of online aggregation.',
        },
        {
          q: 'Where should the heavy aggregation over a week of sales run?',
          options: ['On every page view against the OLTP database', 'In a batch job (MapReduce) over sales logs, writing results to a small table', 'In the browser', 'In the CDN'],
          answer: 1,
          explain: 'Aggregate offline, store the result, serve the result. Never compute a weekly aggregate on the read path.',
        },
      ],
      estimates: [
        { q: '1 billion transactions per month. Transactions per second?', answer: 400, unit: 'tx/s', tolerance: 0.4, explain: '1B ÷ 2.5M = 400 transactions/s.' },
        { q: '100 billion read requests per month. Reads per second?', answer: 40000, unit: 'reads/s', tolerance: 0.4, explain: '100B ÷ 2.5M = 40,000 reads/s — a 100:1 read-to-write ratio.' },
      ],
      reference: `### Reference design (from the primer)
- Sales logs are appended to an **object store** (S3) instead of the database — cheap, sequential writes.
- **Sales Rank Service** runs **MapReduce** over the raw logs:
  1. Map: \`(category, product_id) → quantity\` for each sale in the window.
  2. Reduce: sum quantities per \`(category, product_id)\`.
  3. A second pass sorts by \`(category, quantity)\` (distributed sort).
- Results go into a SQL **sales_rank** table indexed on \`id\`, \`category_id\`, \`product_id\`.
- Client → Web server → **Read API** → \`sales_rank\` table.

**Scale the design**
- The read path is extremely hot and small: **memory cache** for popular categories, **SQL read replicas** for misses.
- **CDN** for static content; analytics on a **data warehouse** (Redshift/BigQuery) rather than the OLTP database.
- Sales logs and MapReduce scale horizontally; if writes to the rank table grow, use **federation/sharding** or NoSQL.`,
    },
    hints: [
      'The ranking is a tiny set of very hot rows: a small cache in front of the rank table absorbs nearly all reads.',
      'Sales and batch jobs go through a queue to workers; workers write sales logs to a write-friendly store.',
      'Batch jobs take ~1.5 s each — size the worker pool so the hourly crunch keeps up.',
    ],
    debrief: `### Interview recap
- **Precompute, then serve**: the expensive weekly aggregation ran in batch, and users only ever read its small output.
- The output is tiny and extremely hot → a cache made reads nearly free.
- Writes (sales) were logged cheaply and processed asynchronously.

This "batch layer + serving layer" split is the backbone of countless analytics features.`,
    quiz: [
      {
        q: 'Why not compute "top products this week" on each page view?',
        options: ['SQL cannot sort', 'Aggregating a week of sales per request is far too expensive; precompute in batch and serve the result', 'It would be too fresh', 'Caches cannot store lists'],
        answer: 1,
        explain: 'Move heavy computation off the request path; serve precomputed results.',
      },
      {
        q: 'What does the "map" step do in a MapReduce word-count style job?',
        options: ['Sorts the final output', 'Emits key/value pairs from each input record (e.g. (category, product) → quantity)', 'Deletes old data', 'Assigns IP addresses'],
        answer: 1,
        explain: 'Map emits intermediate key/value pairs; reduce aggregates all values per key.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '7-8',
    chapter: 7,
    title: 'Scaling to Millions',
    tagline: 'The final exam: grow from a handful of users to millions.',
    brief: `**Build it.** The primer's capstone: **design a system that scales from one user to tens of millions** on the cloud. Traffic grows over the run from a trickle to **~11,000 req/s**:

- **Reads** dominate (100:1 vs writes) — **relational data** is required.
- **Static** assets (images, JS, CSS).
- Traffic is uneven, and **something will break** along the way.

Everything is unlocked. Build for the final load, keep costs sane while traffic is small (autoscaling!), and survive the failures. This is the whole primer in one level.`,
    learn: ['Iterative scaling: benchmark, find the bottleneck, fix it, repeat', 'Putting it all together'],
    concepts: ['interview-framework', 'scaling-aws', 'scaling', 'cache', 'replication', 'cdn', 'autoscaling'],
    palette: PAL,
    features: ALL_FEATURES,
    duration: 120,
    warmup: 5,
    keyspace: { keys: 50000, skew: 1, staticKeys: 5000, staticSkew: 0.9 },
    sources: [
      {
        id: 'users',
        phases: [
          { at: 0, rps: 200, label: 'Users+' },
          { at: 30, rps: 2000, label: 'Users++' },
          { at: 70, rps: 7000, label: 'Users+++' },
          { at: 100, rps: 11000, label: 'Users++++' },
          { at: 120, rps: 11000 },
        ],
        mix: { read: 75, static: 20, write: 5 },
      },
    ],
    chaos: [
      { at: 55, type: 'crash', target: 'random:app', recoverAfter: 20, note: '💥 An app server instance died!' },
      { at: 85, type: 'crash', target: 'kind:sql:primary', note: '💥 The primary database failed!' },
    ],
    objectives: [
      { kind: 'success', target: 98.5, star: 1 },
      { kind: 'p95', target: 150, star: 1 },
      { kind: 'dataLoss', target: 0, star: 1 },
      { kind: 'cost', target: 2600, star: 2 },
      { kind: 'success', target: 99.3, star: 3 },
    ],
    start: D([USERS({ y: ROW(2) })]),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('dns', COL[1], ROW(2), { id: 'dns' }),
        N('cdn', COL[2], ROW(0), { id: 'cdn', tier: 'M' }),
        N('objstore', COL[3], ROW(0), { id: 's3', name: 'S3 (static)' }),
        N('lb', COL[2], ROW(2) + 2, { id: 'elb', name: 'ELB', cfg: { ha: true } }),
        N('app', COL[3], ROW(2) + 2, { id: 'web', tier: 'M', name: 'Web/app (ASG)', cfg: { instances: 2, autoscale: true, maxInstances: 10 } }),
        N('cache', COL[4], ROW(1), { id: 'ec', tier: 'L', name: 'ElastiCache' }),
        N('sql', COL[5], ROW(2) + 2, { id: 'db', tier: 'L', name: 'RDS primary', cfg: { replication: 'sync', autoFailover: true } }),
        N('sql', COL[6], ROW(1), { id: 'sb', tier: 'L', name: 'Multi-AZ standby', cfg: { role: 'standby' } }),
        N('sql', COL[6], ROW(4), { id: 'rr', tier: 'L', name: 'Read replica', cfg: { role: 'replica' } }),
      ],
      [
        E('users', 'dns'),
        E('dns', 'cdn'),
        E('dns', 'elb'),
        E('cdn', 's3'),
        E('elb', 'web'),
        E('web', 'ec'),
        E('web', 'db'),
        E('web', 'sb'),
        E('web', 'rr'),
        E('db', 'sb'),
        E('db', 'rr'),
      ],
    ),
    interview: {
      prompt: `"Design a system that scales to **millions of users** on AWS. Start with a single box and evolve the design as users grow: Users+, Users++, Users+++…"`,
      clarify: [
        {
          q: 'What is the right first move when going from a single box to more users?',
          options: ['Shard the database immediately', 'Measure: benchmark/profile to find the actual bottleneck, then address it', 'Rewrite in a faster language', 'Add a CDN to everything'],
          answer: 1,
          explain: 'The primer\'s iterative approach: benchmark/load test → profile for bottlenecks → address them while evaluating alternatives and trade-offs → repeat.',
        },
        {
          q: 'The web tier must scale horizontally. What has to move out of the web servers first?',
          options: ['The load balancer', 'Session/state data — into a cache or database', 'The CDN', 'DNS'],
          answer: 1,
          explain: 'Stateless web servers can be added and removed freely (autoscaling). Sessions go to ElastiCache/DynamoDB.',
        },
        {
          q: 'Which is the usual order of database scaling moves for a read-heavy relational app?',
          options: [
            'Shard first, then cache',
            'Vertical scale → cache → read replicas → (federation / sharding / NoSQL only when needed)',
            'NoSQL first',
            'Multi-region master-master first',
          ],
          answer: 1,
          explain: 'Cheap and simple first; distribution complexity only when the numbers demand it.',
        },
      ],
      estimates: [
        { q: '100 billion reads per month. Reads per second?', answer: 40000, unit: 'reads/s', tolerance: 0.4, explain: '100B ÷ 2.5M = 40,000 reads/s.' },
        { q: '1 billion writes per month. Writes per second?', answer: 400, unit: 'writes/s', tolerance: 0.4, explain: '1B ÷ 2.5M = 400 writes/s.' },
        { q: '1 KB per write × 1 billion writes per month. New content in 3 years?', answer: 36, unit: 'TB', tolerance: 0.4, explain: '1 TB/month × 36 months = 36 TB.' },
      ],
      reference: `### Reference design: the primer's growth path
1. **Single box** — web server + MySQL on one EC2 instance. Vertical scaling; monitor CPU/memory/IO.
2. **Users+** — move MySQL to **RDS**; static content to **S3**; use an **Elastic IP** and **Route 53** DNS. Separate concerns so each can scale.
3. **Users++** — add a **load balancer** (ELB) with web servers in **multiple availability zones**; **Multi-AZ RDS** (master + standby); serve static content from **CloudFront** (CDN). Split web servers and application servers (APIs) if useful.
4. **Users+++** — read-heavy: add **ElastiCache** (Memcached/Redis) for frequently read data and **session state**; add **RDS read replicas**.
5. **Users++++** — **autoscaling groups** for web and app servers (scale on CPU / latency / traffic); automate provisioning (Chef/Ansible/Terraform) and monitoring (CloudWatch, host & app metrics, alerts).
6. **Users+++++** — keep iterating: **federation**, **sharding**, **denormalization**, **SQL tuning**; move suitable data to **NoSQL** (DynamoDB); move expensive work to **async** queues and workers (SQS + Lambda/EC2) — e.g. thumbnail generation.

**Process, not just components:** benchmark → profile → fix the bottleneck → evaluate trade-offs → repeat.`,
    },
    hints: [
      'Static traffic → CDN backed by object storage. Dynamic → a load balancer (HA) → an autoscaling app group.',
      'Reads: a cache plus a read replica. Durability and the primary failure: standby + automatic failover + synchronous replication.',
      'Autoscaling keeps costs low while traffic is small; set a sensible max so the final surge is covered.',
    ],
    debrief: `### You did it
This level is the primer's "scaling AWS to millions" walkthrough compressed into two minutes: CDN + object storage for static content, a load-balanced stateless web tier that autoscales, a cache in front of a replicated relational database with automatic failover — and failures handled along the way.

**For the interview:** narrate the *iterations*. Start simple, name the bottleneck at each stage, propose the fix and its trade-off, and only add complexity the numbers justify.`,
    quiz: [
      {
        q: 'What should drive each step of scaling a system?',
        options: ['Whatever the newest technology is', 'Measured bottlenecks (benchmarks, profiling, monitoring)', 'Gut feeling', 'The number of microservices'],
        answer: 1,
        explain: 'The primer stresses an iterative loop: benchmark/load test, profile for bottlenecks, address them, repeat.',
      },
      {
        q: 'Why does autoscaling require stateless web servers?',
        options: ['It does not', 'Instances are added and removed at any time; any state on them would be lost or stranded', 'Because of DNS', 'Because of CDNs'],
        answer: 1,
        explain: 'Autoscaling treats instances as cattle, not pets — state must live in shared stores.',
      },
    ],
  },
];

function twitterSolution() {
  return D(
    [
      USERS({ y: ROW(2) }),
      N('lb', COL[1], ROW(2), { id: 'lb', cfg: { layer: 'L7' } }),
      N('app', COL[2], ROW(1), { id: 'api', tier: 'L', name: 'Timeline/Tweet API', cfg: { instances: 3 } }),
      N('app', COL[2], ROW(4), { id: 'sapi', tier: 'M', name: 'Search API', cfg: { instances: 1 } }),
      N('cache', COL[4], ROW(0), { id: 'tl', tier: 'XL', name: 'Timeline cache' }),
      N('queue', COL[3] + 2, ROW(2), { id: 'q', name: 'Fan-out queue', cfg: { maxDepth: 200000 } }),
      N('worker', COL[4] + 4, ROW(2), { id: 'fan', tier: 'M', name: 'Fan-out service', cfg: { instances: 2, autoscale: true, maxInstances: 6 } }),
      N('sql', COL[5] + 6, ROW(1), { id: 'db', tier: 'L', name: 'Tweet store' }),
      N('search', COL[4], ROW(4), { id: 'idx', tier: 'S', name: 'Search cluster' }),
    ],
    [
      E('users', 'lb'),
      E('lb', 'api', ['read', 'write']),
      E('lb', 'sapi', ['search']),
      E('api', 'tl'),
      E('api', 'q'),
      E('tl', 'db'),
      E('q', 'fan'),
      E('fan', 'tl'),
      E('fan', 'db'),
      E('sapi', 'idx'),
    ],
  );
}

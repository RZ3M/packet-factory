import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

const twoApps = () => [node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })];
const front = [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2'])];

export const LESSONS_CH2: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '2-1': [
    {
      title: 'Memory is fast, disk is slow',
      body: `Every layer of storage is roughly **10–100× slower** than the one above it. A database usually has to touch an index and maybe the disk; an in-memory key-value store just looks up a hash table in RAM.

That gap is the whole reason caches exist: if you can answer a request **from memory** instead of from the database, it's faster *and* the database never sees it.

These are the primer's *"latency numbers every programmer should know"* — worth memorizing roughly for interviews. (The Labs have a game for them.)`,
      widget: 'latency',
    },
    {
      title: 'Why a small cache catches most reads',
      body: `You can't fit everything in memory. Luckily you don't need to.

Real traffic is **skewed**: a few items (the front page, a viral post, a celebrity's profile) get a huge share of requests, while most items are rarely touched. This is a *power law* (Zipf distribution).

So caching only the **hottest** items covers a disproportionate share of requests. Drag the slider: with typical web skew, caching 10% of items serves roughly **three quarters** of reads.

The flatter the distribution ("flat"), the less a cache helps — you'd need far more memory for the same hit rate.`,
      widget: 'zipf',
    },
    {
      title: 'Cache-aside in action',
      body: `The most common pattern is **cache-aside** (lazy loading). The application does the work:

1. Look in the **cache**. Hit? Return it — under a millisecond.
2. Miss? Read from the **database**…
3. …then **store the result in the cache** for next time.

Compare the scenes (1,500 req/s, 95% reads). Without a cache the database is pegged. With one, watch the **hit rate climb** as it warms up, and the database relax as the cache absorbs reads.

**Cold start:** a fresh cache is empty, so the first requests all miss. That matters after deploys or restarts.`,
      demo: {
        level: { duration: 18, sources: [{ id: 'users', phases: [{ at: 0, rps: 1500 }], mix: { read: 95, write: 5 } }], keyspace: { keys: 10000, skew: 1 } },
        stats: ['success', 'p95', { node: 'db', metric: 'util', label: 'DB busy' }, { node: 'c1', metric: 'hit', label: 'Hit rate' }],
        scenes: [
          {
            label: 'Database only',
            design: D([users(), ...twoApps(), node('sql', 4, 1, 'db', { name: 'Database (S)' })], [...front, ...fan(['a1', 'a2'], ['db'])]),
            note: 'Every read hits the database. It saturates and requests start failing.',
            expect: [{ stat: 'success', op: '<', value: 95 }],
          },
          {
            label: 'Cache + database',
            design: D([users(), ...twoApps(), node('cache', 4, 0, 'c1', { name: 'Cache' }), node('sql', 4, 2, 'db', { name: 'Database (S)' })], [...front, ...fan(['a1', 'a2'], ['c1', 'db'])]),
            note: 'Apps check the cache first; only misses reach the database.',
            expect: [{ stat: 'success', op: '>', value: 99 }],
          },
        ],
      },
    },
    {
      title: 'Where caches live',
      body: `The primer lists caching at every layer:

- **Client** — the browser or OS caches responses.
- **CDN** — edge servers cache static files (next level).
- **Web server** — reverse proxies (nginx, Varnish) cache whole responses.
- **Database** — its own buffer cache; tune it for your workload.
- **Application** — Redis/Memcached between your app and the database. That's what you just built.

**What to cache:** *query results* (key = hash of the query — hard to invalidate) or *objects* (a user, a rendered page, a timeline — easier to invalidate when the underlying data changes). Good candidates: sessions, rendered pages, activity streams, user graph data.

**Eviction:** memory is limited, so caches drop entries. **LRU** (least recently used) keeps hot data and evicts cold data.`,
      tip: `Place a **Cache**. Hold **Shift** and drag a wire from any App Server onto it to connect them all. Keep the App → Database wires: misses go there. Bigger cache tiers hold more items → higher hit rate.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '2-2': [
    {
      title: 'Distance is latency',
      body: `Light in fibre covers ~200 km per millisecond. A round trip from Asia to a US data center is ~**190 ms** before your server does anything. No code optimization fixes physics. The only fix is to **move content closer**.

A **CDN** (content delivery network) is a fleet of edge servers in hundreds of cities. Users fetch files from the nearest edge (~10 ms away). The edge keeps copies, and only goes back to your **origin** when it doesn't have a file yet.

Both scenes serve images to **users in Asia** from a US origin.`,
      demo: {
        level: { sources: [{ id: 'users', region: 'ap', phases: [{ at: 0, rps: 400 }], mix: { static: 100 } }], keyspace: { keys: 1000, skew: 1, staticKeys: 500, staticSkew: 1 } },
        stats: ['rps', 'p95', 'p50'],
        scenes: [
          {
            label: 'Straight to the US origin',
            design: D([users(undefined, { name: 'Users · Asia' }), node('app', 2, 1, 'app', { name: 'Origin (US)' })], [E('users', 'app')]),
            note: 'Every image crosses the Pacific and back.',
            expect: [{ stat: 'p95', op: '>', value: 200 }],
          },
          {
            label: 'Through a CDN',
            design: D([users(undefined, { name: 'Users · Asia' }), node('cdn', 2, 1, 'cdn', { name: 'CDN edge', cfg: { mode: 'push' } }), node('objstore', 4, 1, 's3', { name: 'Object storage (US)' })], [E('users', 'cdn'), E('cdn', 's3')]),
            note: 'Images come from an edge server in the same city.',
            expect: [{ stat: 'p95', op: '<', value: 60 }],
          },
        ],
      },
    },
    {
      title: 'Object storage',
      body: `Static files (images, video, CSS/JS, uploads) don't belong on app servers or in the database. Put them in **object storage** — Amazon S3, Google Cloud Storage, Azure Blob:

- Practically **unlimited** and very **durable** (copies across devices and zones).
- **Cheap** per GB, no capacity planning.
- Tens of milliseconds per request, so it sits **behind a CDN**.

The common pattern: the database stores *metadata and a path* (\`photo_id, owner, s3_key\`); the bytes live in object storage; users fetch them through the CDN.`,
    },
    {
      title: 'Push vs pull CDNs',
      body: `**Pull CDN** — the edge fetches a file from your origin the **first time** someone asks, then caches it until its TTL expires. Nothing to manage; the first request for each file is slow. Good for **heavy traffic and huge catalogs**.

**Push CDN** — **you upload** content to the CDN ahead of time. No misses at all, but you pay to store **everything**, and you must re-push when files change. Good for **small catalogs that rarely change**.

In the scenes, watch the **edge hit rate**: pull starts at zero and climbs as files are requested; push is at 100% from the first second.

**CDN downsides:** cost grows with traffic, content can be **stale** until the TTL expires, and URLs must point at the CDN.`,
      demo: {
        level: { sources: [{ id: 'users', region: 'eu', phases: [{ at: 0, rps: 600 }], mix: { static: 100 } }], keyspace: { keys: 1000, skew: 1, staticKeys: 1500, staticSkew: 0.9 } },
        stats: ['rps', 'p95', { node: 'cdn', metric: 'hit', label: 'Edge hit rate' }],
        scenes: [
          { label: 'Pull CDN', design: D([users(), node('cdn', 2, 1, 'cdn', { name: 'Pull CDN' }), node('objstore', 4, 1, 's3', { name: 'Origin (S3)' })], [E('users', 'cdn'), E('cdn', 's3')]) },
          {
            label: 'Push CDN',
            design: D([users(), node('cdn', 2, 1, 'cdn', { name: 'Push CDN', cfg: { mode: 'push' } }), node('objstore', 4, 1, 's3', { name: 'Origin (S3)' })], [E('users', 'cdn'), E('cdn', 's3')]),
            expect: [{ stat: 'cdn.hit', op: '>', value: 95 }],
          },
        ],
      },
      tip: `Wire each **Users** group to the **CDN** *and* keep its wire to the load balancer: static files go to the CDN, everything else to your servers. Wire **CDN → Object Storage** as the origin. Push/pull is in the CDN's settings.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '2-3': [
    {
      title: 'Stale reads',
      body: `A cache is a **copy**. When the real data changes, the copy is wrong until something fixes it. A read that returns data older than a write the user was already told succeeded is a **stale read** (orange ≈ marks on the board).

Three common ways to keep a cache fresh, all in the demo:

- **TTL only** — every entry expires after a fixed time. Simple, but data can be stale for the whole TTL.
- **Cache-aside invalidation** — when the app writes to the database, it **deletes** that key from the cache; the next read reloads it.
- **Write-through** — writes go *through* the cache, which updates its copy and synchronously writes the database.`,
      demo: {
        level: { duration: 16, sources: [{ id: 'users', phases: [{ at: 0, rps: 1200 }], mix: { read: 85, write: 15 } }], keyspace: { keys: 2000, skew: 1.1 } },
        stats: ['success', 'stale', { node: 'c1', metric: 'hit', label: 'Hit rate' }, { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'TTL only (10 min)',
            design: D([users(), ...twoApps(), node('cache', 4, 0, 'c1', { tier: 'M', cfg: { policy: 'ttl-only', ttl: 600 } }), node('sql', 4, 2, 'db', { tier: 'M' })], [...front, ...fan(['a1', 'a2'], ['c1', 'db'])]),
            note: 'Great hit rate, but popular records keep changing and the cache keeps serving old versions.',
            expect: [{ stat: 'stale', op: '>', value: 10 }],
          },
          {
            label: 'Invalidate on write',
            design: D([users(), ...twoApps(), node('cache', 4, 0, 'c1', { tier: 'M', cfg: { policy: 'cache-aside', ttl: 600 } }), node('sql', 4, 2, 'db', { tier: 'M' })], [...front, ...fan(['a1', 'a2'], ['c1', 'db'])]),
            note: 'Writes delete the cached key. Almost every read is fresh; a small race remains.',
            expect: [{ stat: 'stale', op: '<', value: 1 }],
          },
          {
            label: 'Write-through',
            design: D(
              [users(), ...twoApps(), node('cache', 4, 0, 'c1', { tier: 'M', cfg: { policy: 'write-through', ttl: 600 } }), node('sql', 4, 2, 'db', { tier: 'M' })],
              [...front, ...fan(['a1', 'a2'], ['c1', 'db']), E('c1', 'db')],
            ),
            note: 'Writes update the cache with the new value as they pass through to the database.',
            expect: [{ stat: 'stale', op: '<', value: 0.5 }],
          },
        ],
      },
    },
    {
      title: 'Choosing an update strategy',
      body: `| Strategy | Reads | Writes | Staleness | Watch out for |
|---|---|---|---|---|
| TTL only | fastest | untouched | up to the TTL | showing old prices, balances |
| Cache-aside | miss = 3 trips | DB + delete key | tiny race window | cold cache after restarts |
| Write-through | always warm for written data | slower (cache + DB) | none | caching data nobody reads |

**The cache-aside race:** a read misses and fetches the *old* row; a write commits and deletes the key; then the slow read puts the old value back. Short TTLs bound how long such mistakes live.

**Rule of thumb:** use TTLs everywhere as a safety net, invalidate on write for data users edit, and write-through for data that is read right after it's written.`,
      tip: `Click the cache and change **Update strategy** and **TTL**. For write-through, also wire **Cache → Database** so writes can flow through it.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '2-4': [
    {
      title: 'Write-through vs write-behind',
      body: `Two ways to send writes through a cache:

**Write-through** — app → cache → database, **synchronously**. The user waits for both. Durable: if the cache dies, the database already has everything.

**Write-behind** (write-back) — app → cache → **acknowledge immediately**; the cache flushes to the database **later, in batches**. Very fast, and batching collapses many updates to a hot key into one database write. But until the flush, the data lives **only in cache memory**.

In both scenes the cache **crashes 8 seconds in**. Watch **Lost writes**: with write-behind, every write the cache acknowledged but hadn't flushed is gone — the user was told "saved".`,
      demo: {
        level: { duration: 16, sources: [{ id: 'users', phases: [{ at: 0, rps: 1600 }], mix: { read: 55, write: 45 } }], keyspace: { keys: 2000, skew: 1.15 }, chaos: [{ at: 8, type: 'crash', target: 'c1', recoverAfter: 3 }] },
        stats: ['success', 'p95', 'dataLoss', { node: 'db', metric: 'util', label: 'DB busy' }],
        scenes: [
          {
            label: 'Write-through',
            design: D(
              [users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 2, 'a2', { tier: 'L' }), node('cache', 4, 0, 'c1', { cfg: { policy: 'write-through' } }), node('sql', 4, 2, 'db', { tier: 'L' })],
              [...front, ...fan(['a1', 'a2'], ['c1', 'db']), E('c1', 'db')],
            ),
            expect: [{ stat: 'dataLoss', op: '<', value: 1 }],
          },
          {
            label: 'Write-behind',
            design: D(
              [users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 2, 'a2', { tier: 'L' }), node('cache', 4, 0, 'c1', { cfg: { policy: 'write-behind' } }), node('sql', 4, 2, 'db', { tier: 'L' })],
              [...front, ...fan(['a1', 'a2'], ['c1', 'db']), E('c1', 'db')],
            ),
            note: 'Notice how relaxed the database is before the crash — batching is powerful. Then the crash wipes out the unflushed writes.',
            expect: [{ stat: 'dataLoss', op: '>', value: 0 }],
          },
        ],
      },
    },
    {
      title: 'Cold caches & thundering herds',
      body: `When a cache restarts it comes back **empty**. Suddenly every request misses and goes to the database at once — a **thundering herd** (or cache stampede). If the database was relying on the cache to survive, it falls over too.

Defences:
- Keep **headroom** in the database for a cold-cache period.
- Spread the cache over **several nodes**, so one failure only drops part of the hot set.
- **Request coalescing**: when 100 requests miss the same key, let one fetch it and the rest wait.
- **Refresh-ahead**: reload popular entries *before* they expire, so hot keys never miss. It wastes work on entries that aren't read again.

**When is write-behind acceptable?** When losing a few seconds of updates doesn't matter (view counters, "last seen", analytics) — never for money or anything a user explicitly saved.`,
      tip: `Write-behind and refresh-ahead are in the cache's **Update strategy** settings. Size the database so it survives the moment the cache is cold.`,
    },
  ],
};

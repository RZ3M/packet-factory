import { COL, D, E, N, ROW, USERS, fan } from '../dsl';
import type { Level } from '../types';

const apps3 = (tier: 'M' | 'L' = 'M', cfg: Record<string, any> = {}) => [
  N('app', COL[2], ROW(1), { id: 'a1', tier, cfg }),
  N('app', COL[2], ROW(2), { id: 'a2', tier, cfg }),
  N('app', COL[2], ROW(3), { id: 'a3', tier, cfg }),
];
const APPS = ['a1', 'a2', 'a3'];

export const ch2: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '2-1',
    chapter: 2,
    title: 'Memory Is Fast',
    tagline: 'Your database is drowning in the same reads over and over.',
    brief: `Traffic is **95% reads**, and most of them ask for the *same popular records* — the front page, trending posts. Every single one goes to the database, which is now **overloaded**.

You could buy a much bigger database… or notice that **memory is ~100× faster than disk** and keep the hot data in a **Cache**.

**Cache-aside** (lazy loading):
1. App checks the cache. **Hit** → done in under a millisecond.
2. **Miss** → read from the database, then put the result in the cache for next time.

Wire every App Server to a Cache *and* to the database. Hold **Shift** while dragging a wire to connect all app servers at once.`,
    learn: ['Caching and cache-aside', 'Hit rate, and why popularity skew makes caches work', 'Cache sizing (memory vs hit rate)'],
    concepts: ['cache', 'latency-throughput', 'cache-update'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha'],
    duration: 60,
    warmup: 5,
    keyspace: { keys: 10000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2500 }], mix: { read: 95, write: 5 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 520, star: 2 },
      { kind: 'p50', target: 40, star: 3 },
    ],
    start: D(
      [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), ...apps3(), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'M' })],
      [E('users', 'lb1'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1'])],
    ),
    solution: D(
      [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), ...apps3(), N('cache', COL[4], ROW(0), { id: 'c1' }), N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' })],
      [E('users', 'lb1'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1', 'c1'])],
    ),
    traps: [
      {
        name: 'bigger database instead of a cache',
        maxStars: 1,
        design: D(
          [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), ...apps3(), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })],
          [E('users', 'lb1'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1'])],
        ),
      },
    ],
    hints: [
      'Run it once. Click the database — utilization is pinned at 100% and a queue is piling up in front of it.',
      'Place a Cache. Shift-drag a wire from any App Server onto it to connect all three.',
      'Watch the cache\'s hit rate climb as it warms up. Even a small cache catches most reads because popularity is skewed.',
    ],
    debrief: `### What just happened
A small cache holding ~10% of your keys absorbed roughly **three quarters of all reads**. That's not magic — it's **skew**. Real traffic follows a power law (Zipf): a few items are wildly popular, most are rarely touched. Cache the head of the distribution and you cover most requests.

- **Cache hit**: ~0.5 ms from RAM instead of ~10 ms from the database.
- **Database load** dropped by the hit rate, freeing it for writes and misses.
- **Cold start**: hit rate starts at 0% and climbs as the cache fills — watch out after restarts.

### Cache-aside (lazy loading)
The application owns the logic: look in the cache, fall back to the database, then populate the cache. Only requested data is cached, so it's memory-efficient. Downsides: every miss costs **three trips** (cache, DB, cache write), and data can go stale if the DB changes underneath (next level!).

### Where caches live
The primer lists many layers — **client** (browser), **CDN**, **web server** (reverse proxy), **database** (its own buffer cache), and **application** caches like Memcached and Redis. You just built the last one.`,
    quiz: [
      {
        q: 'Why does a cache that holds only 10% of keys often serve 70%+ of reads?',
        options: ['Caches compress data 7×', 'Access patterns are skewed — a few keys are very popular', 'Databases are slower at night', 'Cache hits are counted twice'],
        answer: 1,
        explain: 'Popularity follows a power law. The hottest few percent of items receive most of the requests, so caching them covers most reads.',
      },
      {
        q: 'In cache-aside, what happens on a cache miss?',
        options: [
          'The request fails and the client retries',
          'The cache fetches from the DB by itself',
          'The app reads from the DB, then writes the result into the cache',
          'The DB pushes the value into the cache',
        ],
        answer: 2,
        explain: 'Cache-aside = the application is responsible for reading from storage on a miss and populating the cache (lazy loading).',
      },
      {
        q: 'Roughly how much faster is reading from main memory than an SSD random read?',
        options: ['About the same', '~10×', '~1,000×', '~1,000,000×'],
        answer: 2,
        explain: 'Main memory reference ≈ 100 ns; 4 KB random SSD read ≈ 150 µs — about 1,500× slower.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '2-2',
    chapter: 2,
    title: 'Around the World',
    tagline: 'Images are crushing your servers — and Tokyo is very far away.',
    brief: `Your app went international. Users in **the US, Europe and Asia** load pages full of **images, CSS and JS** (green dots) — 60% of all requests. Your servers live only in the US.

Two problems:
- App servers waste CPU serving files that **never change**.
- Physics: a round trip from Asia to the US takes ~**190 ms** before your server even starts working.

A **CDN** (content delivery network) keeps copies of static files on edge servers *near every user*. Store the originals in cheap **Object Storage** (S3) and put the CDN in front of it.

- Wire each Users group to the **CDN** as well as the load balancer. Static requests go to the CDN; everything else still goes to your servers.
- Wire **CDN → Object Storage** as the origin.

**Pull vs push:** a *pull* CDN fetches a file from origin the first time someone asks for it. A *push* CDN is pre-loaded with everything — no misses, but you pay to store the whole catalog.`,
    learn: ['Content delivery networks', 'Pull vs push CDNs', 'Object storage for static assets', 'Network latency is physics'],
    concepts: ['cdn', 'object-storage', 'latency-throughput'],
    palette: ['app', 'sql', 'lb', 'cache', 'cdn', 'objstore'],
    features: ['ha', 'cdnPush'],
    duration: 60,
    warmup: 4,
    keyspace: { keys: 10000, skew: 1, staticKeys: 2000, staticSkew: 0.9 },
    sources: [
      { id: 'users', region: 'us', phases: [{ at: 0, rps: 1500 }], mix: { static: 60, read: 35, write: 5 } },
      { id: 'users_eu', region: 'eu', phases: [{ at: 0, rps: 900 }], mix: { static: 60, read: 35, write: 5 } },
      { id: 'users_ap', region: 'ap', phases: [{ at: 0, rps: 600 }], mix: { static: 60, read: 35, write: 5 } },
    ],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 60, types: ['static'], star: 1 },
      { kind: 'offload', target: 90, types: ['static'], by: ['cdn'], star: 1 },
      { kind: 'cost', target: 760, star: 2 },
      { kind: 'offload', target: 99.5, types: ['static'], by: ['cdn'], star: 3, label: '≥ 99.5% of static files served from the edge' },
    ],
    start: D(
      [
        USERS({ y: ROW(1), name: 'Users · US' }),
        USERS({ id: 'users_eu', y: ROW(2) + 2, name: 'Users · EU', region: 'eu' }),
        USERS({ id: 'users_ap', y: ROW(4), name: 'Users · Asia', region: 'ap' }),
        N('lb', COL[1], ROW(2) + 2, { id: 'lb1' }),
        ...apps3(),
        N('cache', COL[4], ROW(1), { id: 'c1' }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
      ],
      [E('users', 'lb1'), E('users_eu', 'lb1'), E('users_ap', 'lb1'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1', 'c1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(1), name: 'Users · US' }),
        USERS({ id: 'users_eu', y: ROW(2) + 2, name: 'Users · EU', region: 'eu' }),
        USERS({ id: 'users_ap', y: ROW(4), name: 'Users · Asia', region: 'ap' }),
        N('cdn', COL[1], ROW(0) - 1, { id: 'cdn1', cfg: { mode: 'push' } }),
        N('objstore', COL[2], ROW(0) - 1, { id: 's3' }),
        N('lb', COL[1], ROW(2) + 2, { id: 'lb1' }),
        ...apps3(),
        N('cache', COL[4], ROW(1), { id: 'c1' }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
      ],
      [
        E('users', 'lb1'),
        E('users_eu', 'lb1'),
        E('users_ap', 'lb1'),
        E('users', 'cdn1'),
        E('users_eu', 'cdn1'),
        E('users_ap', 'cdn1'),
        E('cdn1', 's3'),
        ...fan(['lb1'], APPS),
        ...fan(APPS, ['db1', 'c1']),
      ],
    ),
    traps: [
      {
        name: 'pull CDN (misses each file once)',
        maxStars: 2,
        design: D(
          [
            USERS({ y: ROW(1), name: 'Users · US' }),
            USERS({ id: 'users_eu', y: ROW(2) + 2, name: 'Users · EU', region: 'eu' }),
            USERS({ id: 'users_ap', y: ROW(4), name: 'Users · Asia', region: 'ap' }),
            N('cdn', COL[1], ROW(0) - 1, { id: 'cdn1' }),
            N('objstore', COL[2], ROW(0) - 1, { id: 's3' }),
            N('lb', COL[1], ROW(2) + 2, { id: 'lb1' }),
            ...apps3(),
            N('cache', COL[4], ROW(1), { id: 'c1' }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
          ],
          [E('users', 'lb1'), E('users_eu', 'lb1'), E('users_ap', 'lb1'), E('users', 'cdn1'), E('users_eu', 'cdn1'), E('users_ap', 'cdn1'), E('cdn1', 's3'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1', 'c1'])],
        ),
      },
      {
        name: 'object storage behind the apps, no CDN',
        design: D(
          [
            USERS({ y: ROW(1), name: 'Users · US' }),
            USERS({ id: 'users_eu', y: ROW(2) + 2, name: 'Users · EU', region: 'eu' }),
            USERS({ id: 'users_ap', y: ROW(4), name: 'Users · Asia', region: 'ap' }),
            N('lb', COL[1], ROW(2) + 2, { id: 'lb1' }),
            ...apps3(),
            N('objstore', COL[4], ROW(0), { id: 's3' }),
            N('cache', COL[4], ROW(1) + 2, { id: 'c1' }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
          ],
          [E('users', 'lb1'), E('users_eu', 'lb1'), E('users_ap', 'lb1'), ...fan(['lb1'], APPS), ...fan(APPS, ['db1', 'c1', 's3'])],
        ),
      },
    ],
    hints: [
      'Place a CDN and an Object Storage. Wire CDN → Object Storage.',
      'Wire each of the three Users groups to the CDN. Keep their wires to the load balancer for dynamic requests.',
      'For the third star, a pull CDN still misses the first time it sees each file. Try push mode.',
    ],
    debrief: `### What just happened
- **Static offload**: 60% of requests never touched your servers. App CPU dropped, so you need fewer of them.
- **Latency**: an Asian user now fetches images from a nearby edge (~12 ms) instead of crossing the Pacific (~210 ms).
- **Object storage** is the natural home for files: practically unlimited, durable, cheap — but ~25 ms per request, so it belongs *behind* a CDN.

### Push vs pull CDNs
| | Pull | Push |
|---|---|---|
| How content gets there | Fetched from origin on first request, kept until TTL | You upload it ahead of time |
| First request | Slow (miss) | Fast |
| Storage cost | Only what is requested | Everything, always |
| Good for | Heavy traffic, long-tail catalogs | Small catalogs, rarely changing content |

### Disadvantages of CDNs
Cost (depends on traffic), staleness if content changes before the TTL expires, and URLs that must point at the CDN.

**Notice** that your *dynamic* requests from Asia are still slow — the CDN only fixed static files. Fixing that needs servers in more regions (Chapter 5).`,
    quiz: [
      {
        q: 'Which CDN type is best for a huge catalog where most files are rarely requested?',
        options: ['Push CDN', 'Pull CDN', 'No CDN', 'A CDN in only one region'],
        answer: 1,
        explain: 'A pull CDN only stores what is actually requested; pushing a huge long-tail catalog means paying to store files nobody downloads.',
      },
      {
        q: 'Why is object storage usually placed behind a CDN rather than served directly?',
        options: ['Object storage cannot serve HTTP', 'It is far from users and relatively slow per request; the CDN caches it at the edge', 'It is more expensive than the CDN', 'It only stores databases'],
        answer: 1,
        explain: 'Object stores are durable and cheap but have tens of milliseconds of latency and live in one region. A CDN serves cached copies near users.',
      },
      {
        q: 'Roughly how long does a packet take to go California → Netherlands → California?',
        options: ['1.5 ms', '15 ms', '150 ms', '1.5 s'],
        answer: 2,
        explain: 'About 150 ms — the speed of light in fibre plus routing. No amount of server tuning removes it; only moving data closer does.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '2-3',
    chapter: 2,
    title: 'Yesterday\'s News',
    tagline: 'Users edit their posts… and keep seeing the old version.',
    brief: `Someone set the cache to **"TTL only"** with a **10-minute TTL**: entries are never invalidated, they just expire. Hit rate is fantastic. Users are furious — they edit something and the site keeps showing the old version.

That's a **stale read**: a read that returns data older than a write the user was already told succeeded. Orange **≈** marks pop up wherever one happens.

Your options (click the cache):
- **Shorter TTL** — less staleness, but more misses hit the database.
- **Cache-aside invalidation** — on every write, delete the key from the cache so the next read reloads it.
- **Write-through** — writes go *through* the cache to the database, so the cache always holds the latest value.

Keep stale reads under **0.5%** without melting the database.`,
    learn: ['Cache invalidation', 'TTL trade-offs', 'Freshness vs hit rate'],
    concepts: ['cache-update', 'consistency', 'cache'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy'],
    duration: 60,
    warmup: 6,
    keyspace: { keys: 5000, skew: 1.1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2000 }], mix: { read: 85, write: 15 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'stale', target: 0.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'cost', target: 600, star: 2 },
      { kind: 'stale', target: 0.1, star: 3 },
    ],
    start: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
        N('cache', COL[4], ROW(1), { id: 'c1', tier: 'M', cfg: { policy: 'ttl-only', ttl: 600 } }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
        N('cache', COL[4], ROW(1), { id: 'c1', tier: 'M', cfg: { policy: 'write-through', ttl: 600 } }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1']), E('c1', 'db1')],
    ),
    traps: [
      {
        name: 'just a 5 second TTL',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1' }),
            N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
            N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
            N('cache', COL[4], ROW(1), { id: 'c1', tier: 'M', cfg: { policy: 'ttl-only', ttl: 5 } }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1'])],
        ),
      },
    ],
    hints: [
      'Run it and watch the Stale KPI in the top bar.',
      'Click the cache and switch the update strategy to Cache-aside: writes now delete the cached key.',
      'For the third star: cache-aside has a small race (a read can refill the cache with old data just before a write lands). Write-through updates the cache with the new value itself — wire Cache → Database so writes can flow through it.',
    ],
    debrief: `### What just happened
There are only two hard things in computer science: cache invalidation and naming things. You just met the first.

- **TTL only**: simplest, but anything cached keeps its old value until the TTL expires. Short TTLs trade staleness for database load.
- **Cache-aside + invalidation**: on write, update the DB and **delete** the cache entry. Mostly fresh — but there's a race: a concurrent read can re-populate the cache with the old value just before the write commits.
- **Write-through**: the app writes to the cache, and the cache synchronously writes to the database. The cache always holds the latest data. Writes get slower (two hops), and you cache data that may never be read (mitigate with TTLs).

### Consistency, again
A cache is a *replica* of your data, and every replica raises the consistency question. Caches usually give you **eventual consistency** unless you deliberately update them on every write.`,
    quiz: [
      {
        q: 'A product page cache has a 1-hour TTL and no invalidation. A price changes. What happens?',
        options: ['Users see the new price immediately', 'Users may see the old price for up to an hour', 'The cache crashes', 'The database rejects the write'],
        answer: 1,
        explain: 'TTL-only caching serves the cached value until it expires. That\'s acceptable for some data (avatars) and dangerous for others (prices, inventory).',
      },
      {
        q: 'What is a downside of write-through caching?',
        options: ['Reads are always stale', 'Writes are slower and you may cache data that is never read', 'It cannot be combined with TTLs', 'It loses data if the cache crashes'],
        answer: 1,
        explain: 'Every write touches both cache and DB synchronously, and freshly written data that nobody reads still occupies cache memory.',
      },
      {
        q: 'In cache-aside, what should a write do to the cache?',
        options: ['Nothing', 'Delete (invalidate) the key', 'Increment its TTL', 'Flush the whole cache'],
        answer: 1,
        explain: 'Invalidate the key so the next read loads the fresh value from the database.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '2-4',
    chapter: 2,
    title: 'Hot Writes',
    tagline: 'A like counter that everyone hammers at once.',
    brief: `You launched **likes and view counters**. Now **half your traffic is writes**, and they pile onto a small set of popular records. The database can't keep up.

Your cache now offers a tempting option: **write-behind** (write-back). Writes are acknowledged as soon as they hit the cache and flushed to the database later **in batches**. Many updates to the same hot key collapse into one database write. Blazing fast, very cheap.

But there's a catch the brochure doesn't mention… **a cache node will crash during this run.**

Requirement from the business: *a like the user saw counted must never disappear.*`,
    learn: ['Write-through vs write-behind', 'Durability and data loss', 'Thundering herd after a cache restart'],
    concepts: ['cache-update', 'cache'],
    palette: ['app', 'sql', 'lb', 'cache'],
    features: ['ha', 'cachePolicy'],
    duration: 70,
    warmup: 5,
    keyspace: { keys: 2000, skew: 1.15 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 2400 }], mix: { read: 55, write: 45 } }],
    chaos: [{ at: 40, type: 'crash', target: 'kind:cache', recoverAfter: 4, note: '💥 The cache node ran out of memory and restarted!' }],
    objectives: [
      { kind: 'success', target: 98, star: 1 },
      { kind: 'dataLoss', target: 0, star: 1 },
      { kind: 'p95', target: 120, types: ['write'], star: 1 },
      { kind: 'cost', target: 900, star: 2 },
      { kind: 'p95', target: 85, star: 3 },
    ],
    start: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'M' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'M' }),
        N('cache', COL[4], ROW(1), { id: 'c1', tier: 'S' }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1'])],
    ),
    solution: D(
      [
        USERS({ y: ROW(2) }),
        N('lb', COL[1], ROW(2), { id: 'lb1' }),
        N('app', COL[2], ROW(1), { id: 'a1', tier: 'L' }),
        N('app', COL[2], ROW(3), { id: 'a2', tier: 'L' }),
        N('cache', COL[4], ROW(1), { id: 'c1', tier: 'S', cfg: { policy: 'write-through' } }),
        N('sql', COL[4], ROW(3), { id: 'db1', tier: 'L' }),
      ],
      [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1']), E('c1', 'db1')],
    ),
    traps: [
      {
        name: 'write-behind',
        design: D(
          [
            USERS({ y: ROW(2) }),
            N('lb', COL[1], ROW(2), { id: 'lb1' }),
            N('app', COL[2], ROW(1), { id: 'a1', tier: 'L' }),
            N('app', COL[2], ROW(3), { id: 'a2', tier: 'L' }),
            N('cache', COL[4], ROW(1), { id: 'c1', tier: 'S', cfg: { policy: 'write-behind' } }),
            N('sql', COL[4], ROW(3), { id: 'db1', tier: 'M' }),
          ],
          [E('users', 'lb1'), ...fan(['lb1'], ['a1', 'a2']), ...fan(['a1', 'a2'], ['db1', 'c1']), E('c1', 'db1')],
        ),
      },
    ],
    hints: [
      'Try write-behind first (wire Cache → Database so it can flush). Watch what happens at 40 s.',
      'Durability rules out write-behind. Something has to absorb ~1,100 writes/s synchronously — check the database\'s capacity for writes.',
      'Write-through (or cache-aside) plus a bigger database survives the crash without losing anything.',
    ],
    debrief: `### What just happened
- **Write-behind** acknowledged writes from memory and flushed them later. Fast and cheap — batching collapses many writes to a hot key into one — but the moment the cache died, every unflushed write was **gone**. The user was told "saved"; it wasn't.
- **Write-through** keeps the database as the source of truth on every write. Slower writes, bigger database, zero loss.
- After the crash the cache came back **empty** (cold). Every read missed at once and hit the database — a mini **thundering herd**. Headroom in the database is what kept you up.

### When is write-behind OK?
When losing a few seconds of updates is acceptable (view counters, analytics, "last seen" timestamps) — or when the cache itself is replicated and persistent. Never for money or anything a user explicitly saved.

### Refresh-ahead
The fourth strategy: proactively reload popular entries shortly before they expire, so hot keys never miss. Great when you can predict which keys will be needed; wasted work when you can't.`,
    quiz: [
      {
        q: 'What is the main risk of write-behind (write-back) caching?',
        options: ['Reads become slower', 'Acknowledged writes can be lost if the cache fails before flushing', 'It needs more database capacity', 'It cannot batch writes'],
        answer: 1,
        explain: 'Writes live only in cache memory until the asynchronous flush. A crash in between loses them even though the client saw success.',
      },
      {
        q: 'Which workload is a reasonable fit for write-behind?',
        options: ['Bank transfers', 'Order checkout', 'Video view counters', 'Password changes'],
        answer: 2,
        explain: 'View counts tolerate losing a few seconds of increments; money, orders and credentials do not.',
      },
      {
        q: 'A cache restarts empty and every request misses at once, overloading the database. This is called…',
        options: ['Split brain', 'Thundering herd / cache stampede', 'Back pressure', 'Head-of-line blocking'],
        answer: 1,
        explain: 'A cold or flushed cache sends a burst of misses to the backing store. Mitigations: DB headroom, warm-up, request coalescing, multiple cache nodes, refresh-ahead.',
      },
    ],
  },
];

import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH2: Record<string, SolutionExplain> = {
  '2-1': {
    idea: `The medium database can do ~20 concurrent operations. 2,375 reads × 10 ms + 125 writes × 20 ms ≈ **26 busy connections** — 130% of capacity.

Instead of a bigger database, put a cache in front. With 10,000 keys and typical (Zipf) skew, a cache holding the hottest **1,000 keys (10%)** settles at roughly **two thirds of reads** once warm (writes invalidate keys and entries expire, so it never reaches the theoretical ~75%). The database then sees ~800 reads/s + the writes ≈ 10–12 busy connections → **~55–60%**.`,
    choices: [
      {
        node: 'c1',
        title: 'A small (1 GB) cache, cache-aside',
        why: `Skew does the work: the hottest 10% of items get roughly two thirds to three quarters of the requests. A cache hit costs ~0.6 ms instead of ~10 ms, so median latency drops too — which is what earns the third star. $45/mo beats the $220/mo jump to a large database.`,
      },
      {
        node: 'a1',
        title: 'Every App Server wired to the cache AND the database',
        why: `In cache-aside the application owns the logic: check the cache, on a miss read the database and fill the cache. That's why each app needs both wires.`,
      },
      {
        node: 'db1',
        title: 'Database stays medium',
        why: `With two thirds of reads absorbed, it runs around 60% — headroom for writes, cache misses, and the cold-start period while the cache warms up.`,
      },
    ],
    whyNot: {
      'bigger database instead of a cache': `A large database (40 connections) runs at ~65% and passes — but it costs $660/mo (over the $520 star) and every read still pays ~10 ms of database time, so median latency is worse than with a cache.`,
    },
    takeaway: `Caches work because traffic is skewed. Size them with the 80/20 rule and say how they're invalidated.`,
  },

  '2-2': {
    idea: `60% of requests are static files, and 40% of users are an ocean away. Two problems, one fix: a **CDN** in front of **object storage**.

- Static files are served from an edge near each user (~12 ms instead of ~105–210 ms across the ocean).
- The app servers stop serving files, so they only handle dynamic traffic.
- With **push** mode the edge already holds all 2,000 files — 100% edge hits from the first second, for ~$24/mo of storage.`,
    choices: [
      {
        node: 'cdn1',
        title: 'CDN in push mode',
        why: `Push pre-loads every file, so there are no first-request misses — that's what reaches ≥99.5% edge offload for the third star. With a small catalog (2,000 files) the extra storage cost is modest; for a huge long-tail catalog, pull would be cheaper.`,
      },
      {
        node: 's3',
        title: 'Object storage as the origin',
        why: `Cheap, durable, effectively unlimited storage for blobs. It's slow per request (~25 ms) and in one region, which is exactly why it sits behind the CDN.`,
      },
      {
        title: 'Users wired to both the CDN and the load balancer',
        why: `Static requests go to the CDN; dynamic reads and writes still go to your servers. Only content that can be cached at the edge belongs on the CDN.`,
      },
      {
        node: 'a1',
        title: 'The app tier stays the same',
        why: `Dynamic traffic is 40% of 3,000 = 1,200 req/s → ~15 busy threads across 48. Offloading static files is why no extra servers were needed.`,
      },
    ],
    whyNot: {
      'pull CDN (misses each file once)': `Works well and is cheaper on storage, but every file misses once on its first request, so edge offload lands just under 99.5% — two stars instead of three.`,
      'object storage behind the apps, no CDN': `The apps stop serving files themselves, but every image still travels from the US to Europe and Asia and back. Static p95 stays around 250 ms — physics wins.`,
    },
    takeaway: `CDNs fix distance and offload origin servers. Push for small, stable catalogs; pull for large or fast-changing ones.`,
  },

  '2-3': {
    idea: `The cache had a 10-minute TTL and **no invalidation**, so popular records — which are written constantly — were served stale for minutes.

Switch to **write-through**: writes go through the cache, which stores the new value and synchronously writes the database. The cache always holds the latest version of anything written, so the long TTL is now safe — and the hit rate stays high.`,
    choices: [
      {
        node: 'c1',
        title: 'Write-through update strategy',
        why: `Cache-aside (delete-on-write) also gets under 0.5% stale, but it has a race: a slow read can put an old value back right after the write deleted it. Write-through writes the new value itself, closing that gap — that's the third star (≤ 0.1% stale).`,
      },
      {
        title: 'Cache → Database wire',
        why: `Write-through needs a path from the cache to the database so writes can flow *through* it. Without that wire the cache can't forward writes.`,
      },
      {
        title: 'Keeping the 10-minute TTL',
        why: `Once every write updates the cache, a long TTL doesn't cause staleness — it just keeps hot entries warm. TTL becomes a safety net, not the freshness mechanism.`,
      },
    ],
    whyNot: {
      'just a 5 second TTL': `Hot records are written many times a second, so even 5 seconds is an eternity — about 64% of reads are still stale, and the database takes far more misses. Short TTLs bound staleness; they don't remove it.`,
    },
    takeaway: `For data users edit, update or invalidate the cache **on write**. Use TTLs as a safety net on top.`,
  },

  '2-4': {
    idea: `Half the traffic is writes to a few hot records, and the cache **will crash**. The business rule is absolute: a like the user saw counted must never disappear.

That rules out write-behind (acknowledged writes would sit only in cache memory). Use **write-through** and give the database enough capacity for the writes plus the reads that miss after the crash:
- 1,080 writes/s × 20 ms ≈ 22 busy connections — too much for a medium database (20). **Large (40)** handles it with room for the cold-cache read burst.`,
    choices: [
      {
        node: 'c1',
        title: 'Write-through cache',
        why: `Every write lands in the database before the user is told "saved", so the crash loses nothing. Reads of freshly written values stay fast because the cache holds the new value.`,
      },
      {
        node: 'db1',
        title: 'Database → L',
        why: `It must absorb all writes synchronously, plus a thundering herd of reads when the cache restarts empty. It averages ~60% and briefly touches ~90% during the cold-cache burst — a medium database would have fallen over right there.`,
      },
      {
        node: 'a1',
        title: 'Two large App Servers',
        why: `2,400 req/s × ~13 ms ≈ 31 busy threads. Two medium servers (32) would be at 100%; two large (64) sit near 50% and keep latency low.`,
      },
    ],
    whyNot: {
      'write-behind': `Before the crash it's fast and cheap — batching collapses many updates to hot keys. When the cache dies, ~500 writes that users were told succeeded are gone. Afterwards writes fall back onto an undersized database and latency explodes.`,
    },
    takeaway: `Write-behind trades durability for speed. It's fine for view counters; never for money or anything a user explicitly saved.`,
  },
};

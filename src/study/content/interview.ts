// Interview section: solved questions (from the game's capstone levels) and the
// primer's list of additional questions with short approach sketches.

import { LEVELS } from '../../content/levels';
import type { Level } from '../../content/types';
import { CATALOG } from '../../engine/catalog';
import type { Design, NodeKind } from '../../engine/types';
import type { DFrame, DNode, NodeKey } from '../types';
import type { Link } from './library';

export const SOLVED: Level[] = LEVELS.filter((l) => l.chapter === 7 && l.interview);

const KIND_MAP: Partial<Record<NodeKind, NodeKey>> = {
  users: 'user',
  dns: 'dns',
  cdn: 'cdn',
  lb: 'lb',
  proxy: 'proxy',
  gateway: 'gateway',
  app: 'app',
  worker: 'worker',
  queue: 'queue',
  pubsub: 'queue',
  cache: 'cache',
  sql: 'db',
  kv: 'kv',
  document: 'doc',
  widecolumn: 'wide',
  graphdb: 'graph',
  search: 'search',
  objstore: 's3',
  shardrouter: 'router',
};

/**
 * Lay a game design out as a compact, animated mobile diagram: a top-to-bottom
 * layered graph (depth from the users), at most four nodes per row.
 */
export function designToFrames(design: Design, caption: string): DFrame[] {
  const incoming = new Set(design.edges.map((e) => e.to));
  const depth = new Map<string, number>();
  const queue = design.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of design.edges) {
      if (e.from === id && !depth.has(e.to)) {
        depth.set(e.to, depth.get(id)! + 1);
        queue.push(e.to);
      }
    }
  }
  for (const n of design.nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

  const layers = new Map<number, typeof design.nodes>();
  for (const n of design.nodes) {
    const d = depth.get(n.id)!;
    layers.set(d, [...(layers.get(d) ?? []), n]);
  }
  const nodes: DNode[] = [];
  let row = 0;
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    const layer = layers.get(d)!.sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < layer.length; i += 4) {
      const chunk = layer.slice(i, i + 4);
      const k = chunk.length;
      const step = k > 1 ? Math.min(1.25, 3.2 / (k - 1)) : 0;
      chunk.forEach((dn, j) => {
        const inst = dn.config?.instances > 1 ? `×${dn.config.instances}` : undefined;
        nodes.push({ id: dn.id, label: dn.name ?? CATALOG[dn.kind]?.name ?? dn.kind, k: KIND_MAP[dn.kind] ?? 'service', x: 1.6 + (j - (k - 1) / 2) * step, y: row * 1.5, badge: inst });
      });
      row++;
    }
  }
  const links = design.edges.map((e) => ({ from: e.from, to: e.to, rate: 1 }));
  return [{ caption, nodes, links }];
}

export interface ExtraQuestion {
  id: string;
  title: string;
  core: string;
  steps: [string, string][];
  links: Link[];
}

const L = (label: string, url: string): Link => ({ label, url });

export const EXTRA_QUESTIONS: ExtraQuestion[] = [
  {
    id: 'dropbox',
    title: 'File sync like Dropbox',
    core: 'Split files into content-hashed blocks; sync only changed blocks; notify clients of changes.',
    steps: [
      ['Chunk + hash', 'Clients split files into ~4 MB blocks and hash each one. Identical blocks are stored once (dedupe).'],
      ['Metadata service', 'File → list of block hashes, versions and owners in a sharded SQL database.'],
      ['Block store', 'Blocks in object storage; uploads go directly with pre-signed URLs.'],
      ['Notifications', 'Long-poll / WebSocket servers tell other devices "file X changed" so they pull new blocks.'],
      ['Conflicts', 'Two offline edits → keep both as "conflicted copy" rather than lose data.'],
    ],
    links: [L('How we\'ve scaled Dropbox', 'https://www.youtube.com/watch?v=PE4gwstWhmc')],
  },
  {
    id: 'search-engine',
    title: 'Search engine like Google',
    core: 'Crawl → build an inverted index sharded by document → scatter queries, gather and rank top results.',
    steps: [
      ['Crawl', 'A distributed crawler fetches pages into storage (see Web Crawler).'],
      ['Index', 'MapReduce builds an inverted index: term → posting list of (doc, positions).'],
      ['Shard', 'Shard the index by document; each shard answers for its slice.'],
      ['Query', 'Scatter the query to all shards, each returns its top-k, merge and rank (PageRank + relevance).'],
      ['Cache', 'Popular queries are cached; results are heavily skewed.'],
    ],
    links: [L('Anatomy of a search engine', 'http://infolab.stanford.edu/~backrub/google.html'), L('Implementing search engines', 'http://www.ardendertat.com/2012/01/11/implementing-search-engines/')],
  },
  {
    id: 'crawler',
    title: 'Scalable web crawler',
    core: 'A prioritized URL frontier, politeness per host, and dedupe of URLs and page content.',
    steps: [
      ['Frontier', 'Queue of URLs to crawl, prioritized by page rank / freshness, partitioned by host.'],
      ['Politeness', 'One queue per host with rate limits and robots.txt respect.'],
      ['Fetch + parse', 'Workers fetch, extract links, push new URLs back to the frontier.'],
      ['Dedupe', 'Seen-URL set (Bloom filter) and content signatures (simhash) to skip duplicates.'],
    ],
    links: [L('Building a web crawler', 'https://www.quora.com/How-can-I-build-a-web-crawler-from-scratch')],
  },
  {
    id: 'google-docs',
    title: 'Google Docs',
    core: 'Real-time collaborative editing via operational transforms (or CRDTs) with a server ordering edits.',
    steps: [
      ['Sessions', 'Clients hold a WebSocket to the server that owns the document.'],
      ['Operations', 'Edits are small ops (insert "a" at 12). The server orders them and broadcasts.'],
      ['Transform', 'Concurrent ops are transformed against each other (OT) so everyone converges.'],
      ['Persist', 'Append ops to a log; snapshot the doc periodically.'],
    ],
    links: [L('Differential synchronization', 'https://neil.fraser.name/writing/sync/')],
  },
  {
    id: 'kv-store',
    title: 'Key-value store like Redis',
    core: 'Consistent hashing for partitions, N-way replication, quorum reads/writes, LSM storage.',
    steps: [
      ['Partition', 'Consistent hashing with virtual nodes spreads keys and eases rebalancing.'],
      ['Replicate', 'Write to N replicas; choose R and W (R + W > N for strong reads).'],
      ['Storage', 'In-memory with an append-only log, or LSM tree on disk.'],
      ['Failure', 'Gossip for membership, hinted handoff, Merkle-tree repair.'],
    ],
    links: [L('Dynamo paper', 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf'), L('Implementing a KV store', 'http://codecapsule.com/2012/11/07/ikvs-implementing-a-key-value-store-table-of-contents/')],
  },
  {
    id: 'memcached',
    title: 'Cache system like Memcached',
    core: 'Client-side consistent hashing over independent in-memory servers with LRU eviction.',
    steps: [
      ['API', 'get / set / delete with TTL.'],
      ['Distribution', 'Client hashes the key to a server; servers are independent.'],
      ['Memory', 'Slab allocator + per-slab LRU.'],
      ['Thundering herd', 'Leases or request coalescing so one miss doesn\'t hit the DB 1,000 times.'],
    ],
    links: [L('Intro to Memcached', 'http://www.slideshare.net/oemebamo/introduction-to-memcached')],
  },
  {
    id: 'recommendations',
    title: 'Recommendations like Amazon',
    core: 'Offline batch jobs compute item-to-item similarity; online service mixes in recent activity.',
    steps: [
      ['Collect', 'Clickstream and purchases flow through Kafka into a data lake.'],
      ['Offline', 'Spark computes "people who bought X also bought Y" (item-item collaborative filtering).'],
      ['Serve', 'Precomputed lists in a KV store, keyed by item or user.'],
      ['Online', 'Re-rank with recent session activity; A/B test changes.'],
    ],
    links: [L('Hulu recommendation system', 'https://web.archive.org/web/20170406065247/http://tech.hulu.com/blog/2011/09/19/recommendation-system.html')],
  },
  {
    id: 'tinyurl',
    title: 'URL shortener like Bitly',
    core: 'Generate a unique short key (base62), store key → URL, serve redirects from cache.',
    steps: [
      ['Key', 'Base62 of a counter / Snowflake id, or hash + collision check. 7 chars ≈ 3.5 trillion keys.'],
      ['Store', 'KV or SQL: key → long URL, owner, expiry.'],
      ['Redirect', '301/302 from a cache; reads outnumber writes ~100:1.'],
      ['Analytics', 'Log clicks to a queue; aggregate asynchronously.'],
    ],
    links: [L('Shortener design notes', 'http://n00tc0d3r.blogspot.com/')],
  },
  {
    id: 'whatsapp',
    title: 'Chat app like WhatsApp',
    core: 'Persistent connections to chat servers, a presence service, and store-and-forward for offline users.',
    steps: [
      ['Connect', 'Each client holds a WebSocket/TCP connection to a chat server; a registry maps user → server.'],
      ['Send', 'Server routes the message to the recipient\'s server, or stores it if they\'re offline.'],
      ['Deliver', 'Acks drive sent ✓, delivered ✓✓, read states; push notification when offline.'],
      ['Groups', 'Fan out to each member; large groups via a queue.'],
    ],
    links: [L('The WhatsApp architecture', 'http://highscalability.com/blog/2014/2/26/the-whatsapp-architecture-facebook-bought-for-19-billion.html')],
  },
  {
    id: 'instagram',
    title: 'Photo sharing like Instagram',
    core: 'Upload to object storage + CDN, metadata in sharded SQL, feed via fan-out.',
    steps: [
      ['Upload', 'Pre-signed upload to object storage; workers make thumbnails.'],
      ['Serve', 'Images served from a CDN.'],
      ['Metadata', 'Users, photos, follows in Postgres sharded by user id.'],
      ['Feed', 'Fan-out on write into per-user feed lists in Redis (fan-out on read for celebrities).'],
    ],
    links: [L('Instagram architecture', 'http://highscalability.com/blog/2011/12/6/instagram-architecture-14-million-users-terabytes-of-photos.html'), L('Flickr architecture', 'http://highscalability.com/flickr-architecture')],
  },
  {
    id: 'news-feed',
    title: 'Facebook news feed',
    core: 'Aggregate posts from friends, rank them, and cache per-user feeds — push vs pull trade-off.',
    steps: [
      ['Write path', 'New post → fan-out service pushes post ids into followers\' feed caches.'],
      ['Read path', 'Fetch cached ids, hydrate posts from cache, rank.'],
      ['Hybrid', 'Pull for high-follower accounts to avoid huge fan-outs.'],
      ['Ranking', 'Score by affinity, recency, engagement.'],
    ],
    links: [L('Building a news feed', 'http://www.quora.com/What-are-best-practices-for-building-something-like-a-News-Feed'), L('Etsy activity feeds', 'http://www.slideshare.net/danmckinley/etsy-activity-feeds-architecture')],
  },
  {
    id: 'timeline',
    title: 'Facebook timeline',
    core: 'Denormalize a user\'s history into a time-ordered, per-user store for fast scrolling.',
    steps: [
      ['Denormalize', 'Copy activity into per-user rows ordered by time.'],
      ['Summaries', 'Precompute yearly / monthly highlights in batch jobs.'],
      ['Cache', 'Recent sections cached; old sections loaded on demand.'],
    ],
    links: [L('Timeline: the power of denormalization', 'http://highscalability.com/blog/2012/1/23/facebook-timeline-brought-to-you-by-the-power-of-denormaliza.html')],
  },
  {
    id: 'fb-chat',
    title: 'Facebook chat',
    core: 'Long-lived connections, a presence system, and channel servers that buffer messages.',
    steps: [
      ['Channel servers', 'Each user\'s messages queue on a channel server (Erlang).'],
      ['Presence', 'A separate service aggregates who is online.'],
      ['Delivery', 'Long-polling / persistent connections push messages.'],
    ],
    links: [L('Erlang at Facebook', 'http://www.erlang-factory.com/upload/presentations/31/EugeneLetuchy-ErlangatFacebook.pdf')],
  },
  {
    id: 'graph-search',
    title: 'Graph search like Facebook',
    core: 'Index the social graph (entities + edges) and answer structured queries with ranked retrieval.',
    steps: [
      ['Index', 'Inverted indexes over edges: "likes:Pizza", "lives_in:Paris".'],
      ['Query', 'Parse natural language into a structured query, intersect posting lists.'],
      ['Rank', 'Score by social proximity and relevance.'],
    ],
    links: [L('Under the hood: graph search', 'https://www.facebook.com/notes/facebook-engineering/under-the-hood-building-out-the-infrastructure-for-graph-search/10151347573598920')],
  },
  {
    id: 'cdn',
    title: 'CDN like Cloudflare',
    core: 'Anycast routes users to the nearest POP; POPs cache content in tiers and pull misses from origin.',
    steps: [
      ['Routing', 'Anycast IP or GeoDNS sends users to the closest edge.'],
      ['Caching', 'Edge → regional tier → origin to cut origin load.'],
      ['Invalidation', 'Purge by URL or tag across all POPs.'],
      ['Security', 'Absorb DDoS and terminate TLS at the edge.'],
    ],
    links: [L('Globally distributed content delivery', 'https://figshare.com/articles/Globally_distributed_content_delivery/6605972')],
  },
  {
    id: 'trending',
    title: 'Trending topics like Twitter',
    core: 'Stream processing with sliding-window counts, compared against a baseline to find spikes.',
    steps: [
      ['Ingest', 'Tweets flow into Kafka.'],
      ['Count', 'Storm/Flink counts hashtags in sliding windows, partitioned by tag.'],
      ['Rank', 'Rolling top-k with a heap; score by velocity vs normal volume.'],
      ['Serve', 'Results in a cache per region, refreshed every few seconds.'],
    ],
    links: [L('Real-time trending topics in Storm', 'http://www.michael-noll.com/blog/2013/01/18/implementing-real-time-trending-topics-in-storm/')],
  },
  {
    id: 'id-gen',
    title: 'Random ID generation',
    core: 'Snowflake: 64-bit IDs = timestamp + machine id + sequence. Unique, roughly time-ordered, no coordination.',
    steps: [
      ['Layout', '41 bits ms timestamp · 10 bits machine · 12 bits sequence → 4,096 ids/ms/machine.'],
      ['Machine id', 'Assigned via ZooKeeper or config.'],
      ['Clock', 'Refuse to issue ids if the clock moves backwards.'],
    ],
    links: [L('Announcing Snowflake', 'https://blog.twitter.com/2010/announcing-snowflake')],
  },
  {
    id: 'top-k',
    title: 'Top-k requests in a time window',
    core: 'Approximate counting with a Count-Min Sketch + heap per window; merge partial results.',
    steps: [
      ['Partition', 'Hash keys to aggregator nodes.'],
      ['Count', 'Count-Min Sketch for memory-bounded approximate counts.'],
      ['Top-k', 'Min-heap of size k per node; merge heaps for the global answer.'],
      ['Windows', 'Tumbling buckets per minute, summed for the requested interval.'],
    ],
    links: [L('Efficient top-k computation', 'https://www.cs.ucsb.edu/sites/default/files/documents/2005-23.pdf')],
  },
  {
    id: 'multi-dc',
    title: 'Serving from multiple data centers',
    core: 'Route users to the nearest region; choose per-data-type replication: sync for money, async for the rest.',
    steps: [
      ['Routing', 'GeoDNS / anycast to the closest healthy region.'],
      ['Data', 'Async replication (eventual) or consensus (Spanner-style) per dataset.'],
      ['Writes', 'Home region per user, or multi-master with conflict resolution.'],
      ['Failover', 'Health checks drain traffic from a failed region.'],
    ],
    links: [L('How Google serves data from multiple datacenters', 'http://highscalability.com/blog/2009/8/24/how-google-serves-data-from-multiple-datacenters.html')],
  },
  {
    id: 'card-game',
    title: 'Online multiplayer card game',
    core: 'An authoritative game server per table; clients send intents, the server validates and broadcasts state.',
    steps: [
      ['Matchmaking', 'Queue players, assign a table to a game server.'],
      ['Authority', 'Server holds the deck and validates every move (no cheating).'],
      ['Sync', 'WebSockets push state diffs; turn-based games can be async.'],
      ['Persist', 'Snapshot game state so a crash or reconnect can resume.'],
    ],
    links: [L('Real-time multiplayer', 'http://buildnewgames.com/real-time-multiplayer/')],
  },
  {
    id: 'gc',
    title: 'Garbage collection system',
    core: 'Find unreachable objects from roots and reclaim them: mark-and-sweep, generational, concurrent.',
    steps: [
      ['Mark', 'Traverse from roots (stack, globals), mark reachable objects.'],
      ['Sweep', 'Free everything unmarked.'],
      ['Generations', 'Most objects die young: collect the young heap often, the old heap rarely.'],
      ['Pauses', 'Concurrent/incremental marking keeps pauses short.'],
    ],
    links: [L('Baby\'s first garbage collector', 'http://journal.stuffwithstuff.com/2013/12/08/babys-first-garbage-collector/')],
  },
  {
    id: 'rate-limiter',
    title: 'API rate limiter',
    core: 'Token bucket per key stored in Redis, checked at the gateway; reply 429 when empty.',
    steps: [
      ['Algorithm', 'Token bucket (bursty) or sliding-window log/counter (smooth).'],
      ['State', 'Counters in Redis with atomic Lua scripts / INCR + TTL.'],
      ['Placement', 'At the API gateway, before expensive work.'],
      ['Layers', 'Per user, per IP, plus a global load shedder for emergencies.'],
    ],
    links: [L('Stripe: scaling with rate limiters', 'https://stripe.com/blog/rate-limiters')],
  },
  {
    id: 'stock-exchange',
    title: 'Stock exchange',
    core: 'A single-threaded, in-memory matching engine per symbol, fed by a sequenced, replicated log.',
    steps: [
      ['Sequencer', 'Every order gets a sequence number; the log is the source of truth.'],
      ['Matching', 'Order book per symbol: price-time priority, bids vs asks in sorted structures.'],
      ['Determinism', 'Replicas replay the same log to get identical state (hot standby).'],
      ['Market data', 'Publish trades and book updates via multicast.'],
    ],
    links: [L('Jane Street: building an exchange', 'https://youtu.be/b1e4t2k2KJY')],
  },
];

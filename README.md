# Packet Factory

A system design game. Build architectures out of load balancers, caches, databases, queues and CDNs, then watch simulated traffic ride the belts through them — and see exactly where (and why) your design breaks.

The curriculum follows [The System Design Primer](https://github.com/donnemartin/system-design-primer) end to end, from a single server to the primer's interview questions.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` produces a static site in `dist/`.

## What's in the game

- **Campaign — 34 levels in 7 chapters**
  1. *Hello, Production* — requests, latency/throughput, vertical vs horizontal scaling, load balancers, health checks & N+1, stateless servers
  2. *Need for Speed* — caching (cache-aside), CDNs & object storage, cache invalidation/TTLs, write-through vs write-behind
  3. *Data Gravity* — read replicas, failover with sync vs async replication, sharding (and hot spots), federation, SQL tuning & denormalization, SQL vs NoSQL (KV, document, wide-column, graph)
  4. *Later, Please* — message/task queues, back pressure & autoscaling, queue-based load leveling
  5. *Five Nines* — availability math under a chaos monkey, multi-region with GeoDNS, CAP theorem as two levels (CP bank vs AP like button)
  6. *The Edge* — reverse proxies & TLS termination, security (WAF, rate limiting, parameterized queries), microservices & L7 bulkheads
  7. *The Interview Gauntlet* — the primer's solved questions as full interviews: Pastebin, Twitter, web crawler, Mint, social graph, query cache, sales rank, scaling to millions
- **Sandbox** — everything unlocked; dial traffic and inject chaos live.
- **Codex** — notes on every primer topic with trade-offs and interview angles.
- **Labs** — napkin math, the latency ladder, availability ("nines") calculator, TCP vs UDP, consistency & CAP, HTTP/REST/RPC.
- **Interview drill** — rapid-fire questions across all topics.

## Study mode (phone-friendly)

Open the site on a phone (or add `#study` to the URL, or pick **Study mode** on the home screen) for a mobile-first study app:

- **Learn** — 36 short, swipeable lectures across 10 tracks covering the whole primer, with animated architecture diagrams and interactive widgets.
- **Interview** — how to approach a question, the 8 solved questions (clarify, estimate, reference design, why each choice works), 6 object-oriented design questions with Python solutions, and approach sketches for the primer's 22 additional questions.
- **Library** — real-world systems (MapReduce, Bigtable, Dynamo, Kafka, Spanner…), company architectures and engineering blogs, each summarized with the lesson to take away.
- **Practice** — 160+ flashcards with spaced repetition (Leitner boxes), deck progress, streaks, and a quick multiple-choice quiz.

Study progress is stored in your browser under its own key, separately from game progress.

## How the simulation works

`src/engine/sim.ts` is a discrete-event simulation. Every packet is a real request (or a sample of a few requests at high load) with a type, a key drawn from a Zipf popularity distribution, and a user. Components have concurrency slots, service times and bounded queues, so queueing delay, saturation, cache hit rates (real LRU caches), replication lag and stale reads, hot shards, failovers, data loss on async replication or write-behind, CAP behaviour during partitions, and back pressure all *emerge* from your design rather than being scripted.

Each level ships with a reference solution and "trap" designs; `npm test` runs every level headlessly to check that the reference earns 3 stars, the starting layout fails, and each trap fails for the reason the level teaches.

## Credits

Curriculum and Codex content are adapted from [The System Design Primer](https://github.com/donnemartin/system-design-primer) by Donne Martin, licensed [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) (condensed, reorganized and extended). Icons by [Lucide](https://lucide.dev).

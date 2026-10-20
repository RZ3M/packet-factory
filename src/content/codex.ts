// The Codex: concise notes on every topic in the System Design Primer.
// Written in our own words; each entry links back to the matching primer section.

export interface CodexEntry {
  id: string;
  title: string;
  section: string;
  tldr: string;
  body: string; // markdown
  pros?: string[];
  cons?: string[];
  interview?: string[];
  related?: string[];
  primer: string;
}

export const CODEX_SECTIONS = [
  'Interview Toolkit',
  'Foundations',
  'Availability & Consistency',
  'Traffic & Edge',
  'Application Layer',
  'Databases',
  'Caching',
  'Asynchronism',
  'Communication',
  'Security',
];

const PRIMER = 'https://github.com/donnemartin/system-design-primer#';
export const primerUrl = (anchor: string) => `${PRIMER}${anchor}`;

export const CODEX: CodexEntry[] = [
  // ======================================================================= Interview Toolkit
  {
    id: 'interview-framework',
    title: 'The 4-step interview',
    section: 'Interview Toolkit',
    tldr: 'A system design interview is an open-ended conversation you lead: clarify, sketch, deep-dive, scale.',
    body: `### Step 1 — Use cases, constraints, assumptions
Gather requirements and scope the problem. Ask:
- **Who** uses it and **how**? How many users?
- What does the system **do**? What are the inputs and outputs?
- How much **data**? How many **requests per second**?
- What is the **read-to-write ratio**?

Write the assumptions down. They drive every later decision.

### Step 2 — High-level design
Sketch the main components and connections (clients, web servers, app servers, databases, caches, queues). Justify each one.

### Step 3 — Core components
Go deep on the interesting parts: the data model and schema, the API, key algorithms (e.g. how a short URL is generated, how a feed is built), and trade-offs like SQL vs NoSQL.

### Step 4 — Scale the design
Identify **bottlenecks** given the constraints and address them: load balancers, horizontal scaling, caching, database replication and sharding, async processing. Discuss alternatives and trade-offs — *everything is a trade-off*.

### Back-of-the-envelope
You may need quick estimates (QPS, storage, bandwidth). Know the **powers of two** and **latency numbers**, and practice in the *Napkin Math* lab.`,
    interview: [
      'Drive the conversation; check in with the interviewer at each step.',
      'State assumptions explicitly and compute rough numbers before designing.',
      'Start simple, then scale the specific bottlenecks you can name.',
      'Always discuss trade-offs and alternatives — there is no single right answer.',
    ],
    related: ['back-of-envelope', 'latency-numbers', 'powers-of-two', 'scaling-aws'],
    primer: `${PRIMER}how-to-approach-a-system-design-interview-question`,
  },
  {
    id: 'back-of-envelope',
    title: 'Back-of-the-envelope estimation',
    section: 'Interview Toolkit',
    tldr: 'Rough math (QPS, storage, bandwidth, memory) to size a system before designing it.',
    body: `### Handy conversions
- **~2.5 million seconds per month**, 86,400 per day (≈ 10⁵)
- 1 request/s ≈ 2.5 million requests/month
- 40 requests/s ≈ 100 million/month · 400 requests/s ≈ 1 billion/month
- 1 million requests/day ≈ 12 requests/s

### The usual chain
1. **Traffic**: daily active users × actions per user ÷ 86,400 = average QPS. Peak is often 2–3× average (more for spiky consumer traffic).
2. **Storage**: items per day × size × retention (× replication factor).
3. **Bandwidth**: QPS × average response size.
4. **Memory for caching**: hot fraction (80/20 rule → ~20%) × item size × item count.
5. **Servers**: peak QPS ÷ (per-server throughput × target utilization ~0.7).

### Worked example (Twitter, from the primer)
250 billion reads/month ÷ 2.5M s ≈ **100,000 reads/s**; 15 billion tweets/month → **6,000 tweets/s**; ×10 fan-out → **60,000 deliveries/s**; 10 KB per tweet → **150 TB/month**.`,
    interview: ['Round aggressively; the order of magnitude is what matters.', 'Say the units out loud and sanity-check results ("40,000 reads/s — that\'s a cache problem, not a single database").'],
    related: ['powers-of-two', 'latency-numbers', 'interview-framework'],
    primer: `${PRIMER}back-of-the-envelope-calculations`,
  },
  {
    id: 'powers-of-two',
    title: 'Powers of two',
    section: 'Interview Toolkit',
    tldr: '2¹⁰ ≈ thousand (KB), 2²⁰ ≈ million (MB), 2³⁰ ≈ billion (GB), 2⁴⁰ ≈ trillion (TB).',
    body: `| Power | Exact value | Approx. | Bytes |
|---|---|---|---|
| 7 | 128 | | |
| 8 | 256 | | |
| 10 | 1,024 | 1 thousand | 1 KB |
| 16 | 65,536 | | 64 KB |
| 20 | 1,048,576 | 1 million | 1 MB |
| 30 | 1,073,741,824 | 1 billion | 1 GB |
| 32 | 4,294,967,296 | | 4 GB |
| 40 | 1,099,511,627,776 | 1 trillion | 1 TB |

Useful facts: a 32-bit unsigned integer tops out around **4.3 billion** (why IPv4 ran out, and why 32-bit IDs overflow at scale). 64-bit IDs are effectively unlimited.`,
    related: ['back-of-envelope', 'latency-numbers'],
    primer: `${PRIMER}powers-of-two-table`,
  },
  {
    id: 'latency-numbers',
    title: 'Latency numbers to know',
    section: 'Interview Toolkit',
    tldr: 'Memory ≈ 100 ns, SSD random read ≈ 150 µs, datacenter round trip ≈ 0.5 ms, disk seek ≈ 10 ms, cross-ocean ≈ 150 ms.',
    body: `| Operation | Time |
|---|---|
| L1 cache reference | 0.5 ns |
| Branch mispredict | 5 ns |
| L2 cache reference | 7 ns |
| Mutex lock/unlock | 25 ns |
| Main memory reference | 100 ns |
| Compress 1 KB (Zippy) | 10 µs |
| Send 1 KB over 1 Gbps | 10 µs |
| Read 4 KB randomly from SSD | 150 µs |
| Read 1 MB sequentially from memory | 250 µs |
| Round trip within a datacenter | 500 µs |
| Read 1 MB sequentially from SSD | 1 ms |
| HDD seek | 10 ms |
| Read 1 MB sequentially from 1 Gbps | 10 ms |
| Read 1 MB sequentially from HDD | 30 ms |
| Packet CA → Netherlands → CA | 150 ms |

### Rules of thumb
- Sequential read throughput: HDD ~30 MB/s, 1 Gbps network ~100 MB/s, SSD ~1 GB/s, RAM ~4 GB/s.
- ~2,000 round trips per second inside a datacenter; only 6–7 per second around the world.
- Memory is ~1,000× faster than SSD random reads → **caching**. Distance is physics → **CDNs and multi-region**.`,
    related: ['cache', 'cdn', 'back-of-envelope'],
    primer: `${PRIMER}latency-numbers-every-programmer-should-know`,
  },
  {
    id: 'scaling-aws',
    title: 'Scaling to millions of users',
    section: 'Interview Toolkit',
    tldr: 'Iterate: single box → separate DB → static to object storage + CDN → load balancer + many web servers → cache + replicas → autoscaling → sharding/NoSQL/async.',
    body: `The primer's capstone walks a system from one user to tens of millions. The pattern matters more than the AWS names:

1. **Single box** — web app + database together. Scale vertically; add monitoring.
2. **Separate the database** (managed RDS) so web and data tiers scale independently. Move **static content to object storage** (S3). Use DNS (Route 53) and a stable IP.
3. **Load balancer + multiple web servers** across availability zones. **Multi-AZ** database (master + standby). **CDN** for static assets. Optionally split web servers from application (API) servers.
4. **Read-heavy?** Add a **memory cache** (ElastiCache) for hot reads and **session state**; add **read replicas**.
5. **Autoscaling** groups for web/app servers; automate configuration (Chef/Puppet/Ansible/Terraform) and monitoring/alerting (CloudWatch, metrics, logs).
6. Keep going as needed: **federation, sharding, denormalization, SQL tuning**, move some data to **NoSQL** (DynamoDB), and move expensive work to **async** queues and workers.

**The method:** benchmark/load test → profile for bottlenecks → address them while evaluating trade-offs → repeat.`,
    interview: ['Narrate the evolution; justify each step by the bottleneck it removes.', 'Don\'t start with sharding — complexity must be earned.'],
    related: ['scaling', 'cache', 'replication', 'autoscaling', 'cdn'],
    primer: `${PRIMER}design-a-system-that-scales-to-millions-of-users-on-aws`,
  },
  {
    id: 'further-study',
    title: 'Real-world architectures',
    section: 'Interview Toolkit',
    tldr: 'Read how real companies built their systems — the primer links dozens of architecture write-ups and engineering blogs.',
    body: `The primer lists papers and posts on real systems — worth skimming before interviews:

- **Data processing**: MapReduce (Google), Spark (Databricks), Storm (Twitter).
- **Data stores**: Bigtable, HBase, Cassandra, DynamoDB, MongoDB, Spanner, Memcached, Redis.
- **File systems**: Google File System (GFS), HDFS.
- **Coordination**: Chubby, ZooKeeper.
- **Company architectures**: Amazon, Facebook, Netflix, Pinterest, Twitter, Uber, WhatsApp, YouTube, Instagram, Stack Overflow, and many more.
- **Company engineering blogs**: a long list of team blogs — a great way to see trade-offs discussed by the people who made them.

The primer also has **object-oriented design** interview questions (hash map, LRU cache, call center, deck of cards, parking lot, chat server) — the LRU cache shows up in the *Search Query Cache* capstone here.`,
    related: ['interview-framework'],
    primer: `${PRIMER}real-world-architectures`,
  },

  // ======================================================================= Foundations
  {
    id: 'performance-scalability',
    title: 'Performance vs scalability',
    section: 'Foundations',
    tldr: 'A system is scalable if adding resources increases performance proportionally. Slow for one user = performance problem; fast for one but slow under load = scalability problem.',
    body: `Increasing performance usually means serving **more units of work**, but it can also mean handling **larger units of work** (e.g. growing datasets).

- **Performance problem**: the system is slow even for a single user — fix the code, the queries, the algorithm.
- **Scalability problem**: the system is fast for one user but slow under heavy load — add capacity in a way that actually helps (horizontal scaling, caching, partitioning).

Scalability is not free: distributing work adds coordination, consistency and failure-handling costs.`,
    related: ['latency-throughput', 'scaling'],
    primer: `${PRIMER}performance-vs-scalability`,
  },
  {
    id: 'latency-throughput',
    title: 'Latency vs throughput',
    section: 'Foundations',
    tldr: 'Latency is the time to do one thing; throughput is how many things you do per unit time. Aim for maximal throughput with acceptable latency.',
    body: `- **Latency**: time for one request — network round trip + waiting in queues + doing the work.
- **Throughput**: requests completed per second. A server with *N* worker threads and service time *S* tops out near **N / S**.

### Utilization and queueing
As utilization **ρ** approaches 100%, waiting time grows roughly like **ρ / (1 − ρ)**: at 50% you wait about one service time, at 90% about nine, at 99% about ninety-nine. That's why latency looks fine until it suddenly explodes — and why you provision for **peak** with headroom (~60–70% utilization).

### Tail latency
Averages hide pain. Track **p95/p99**: if a page fans out to 100 backends, even a rare slow backend makes most page loads slow.

### Little's law
Concurrency = throughput × latency. If you serve 1,000 req/s at 200 ms, ~200 requests are in flight.`,
    interview: ['Ask for latency targets (p95/p99) as well as QPS.', 'Explain why you keep utilization below ~70% at peak.'],
    related: ['performance-scalability', 'latency-numbers', 'scaling'],
    primer: `${PRIMER}latency-vs-throughput`,
  },
  {
    id: 'scaling',
    title: 'Vertical vs horizontal scaling',
    section: 'Foundations',
    tldr: 'Scale up (bigger box: simple, capped, SPOF) or scale out (more boxes behind a load balancer: cheaper at scale, needs statelessness).',
    body: `### Vertical scaling (scale up)
Replace the machine with a bigger one. No code changes, but **cost grows faster than capacity**, there's a **hard ceiling**, resizing usually means **downtime**, and it's still a single point of failure.

### Horizontal scaling (scale out)
Add more machines behind a **load balancer**. Uses cheap **commodity** hardware, scales further, and tolerates failures.

**Disadvantages of horizontal scaling** (primer):
- Adds complexity and requires **cloning** servers.
- Servers must be **stateless**: no user data such as sessions or profile pictures stored locally.
- Sessions go to a centralized store (database, Redis, Memcached).
- Downstream servers (caches, databases) must handle more simultaneous connections as upstream servers scale out.`,
    pros: ['Vertical: simplest possible change', 'Horizontal: near-linear capacity, cheaper per unit, fault tolerant'],
    cons: ['Vertical: ceiling, superlinear cost, downtime to resize, SPOF', 'Horizontal: statelessness required, more moving parts'],
    related: ['load-balancer', 'stateless', 'autoscaling'],
    primer: `${PRIMER}horizontal-scaling`,
  },
  {
    id: 'stateless',
    title: 'Stateless services & sessions',
    section: 'Foundations',
    tldr: 'Keep user state out of web/app servers so any server can handle any request.',
    body: `A **stateful** server holds data only it knows — sessions, uploads, in-memory carts. That ties each user to one machine:
- Load balancers need **sticky sessions** (IP hash / cookies), which unbalance load.
- When the server dies, its users lose their state.
- With \`hash(user) mod N\` stickiness, changing N remaps most users.

A **stateless** tier stores sessions in a shared store (Redis, Memcached, a database) or in signed client tokens (e.g. JWTs). Then servers are interchangeable: autoscaling, rolling deploys and failures become non-events.`,
    related: ['scaling', 'load-balancer', 'cache'],
    primer: `${PRIMER}horizontal-scaling`,
  },
  {
    id: 'autoscaling',
    title: 'Autoscaling',
    section: 'Foundations',
    tldr: 'Add or remove instances automatically from a signal (CPU, latency, queue depth). It reacts after the fact — boot time is the gap you must cover.',
    body: `Autoscaling groups grow and shrink a pool of identical, **stateless** instances based on metrics:
- **CPU / utilization** — simple, common.
- **Latency or request rate** — closer to what users feel.
- **Queue depth / age** — ideal for workers.

### Things to remember
- **Reaction lag**: detection + instance boot time (tens of seconds to minutes). Cover it with headroom, a queue, or **scheduled/predictive** scaling for known peaks.
- **Bounds**: a max protects your budget from runaway scaling; a min keeps redundancy.
- **Cooldowns** prevent flapping.
- Requires automation: images or config management, health checks, centralized logs/metrics.`,
    related: ['scaling', 'back-pressure', 'scaling-aws'],
    primer: `${PRIMER}design-a-system-that-scales-to-millions-of-users-on-aws`,
  },

  // ======================================================================= Availability & Consistency
  {
    id: 'cap',
    title: 'CAP theorem',
    section: 'Availability & Consistency',
    tldr: 'In a distributed system you can only guarantee two of Consistency, Availability and Partition tolerance — and partitions happen, so the real choice is C or A during one.',
    body: `- **Consistency** — every read receives the most recent write or an error.
- **Availability** — every request receives a response, without a guarantee it contains the most recent information.
- **Partition tolerance** — the system continues to operate despite arbitrary partitioning due to network failures.

*Networks aren't reliable, so you'll need to support partition tolerance.* The trade-off is between consistency and availability **while a partition is happening**.

### CP — consistency + partition tolerance
Waiting for a response from the partitioned node might result in a timeout error. A good choice if the business needs **atomic reads and writes** (banking, inventory, leader election).

### AP — availability + partition tolerance
Responses return the most readily available version of the data on any node, which might not be the latest. Writes may take time to propagate when the partition is resolved. A good choice if the business allows **eventual consistency** or must keep working despite external errors (social feeds, likes, shopping carts).

**Beyond CAP:** PACELC adds that *else* (no partition) you still trade **latency vs consistency** — synchronous replication costs round trips every day, not just during partitions.`,
    interview: ['Name which side you choose and why, per feature (payments CP, feed AP).', 'Mention the latency cost of consistency even without partitions.'],
    related: ['consistency', 'replication', 'availability'],
    primer: `${PRIMER}cap-theorem`,
  },
  {
    id: 'consistency',
    title: 'Consistency patterns',
    section: 'Availability & Consistency',
    tldr: 'Weak (may never see a write), eventual (will see it, soon), strong (sees it immediately).',
    body: `With multiple copies of the same data, you must decide how to keep them in sync so clients have a consistent view.

### Weak consistency
After a write, reads may or may not see it. Best-effort. Seen in **memcached** and realtime systems like **VoIP, video chat and multiplayer games** — if you lose reception for a few seconds, you don't hear what was said.

### Eventual consistency
After a write, reads will **eventually** see it (typically within milliseconds). Data is replicated **asynchronously**. Seen in **DNS and email**. Works well in highly available systems.

### Strong consistency
After a write, reads **will** see it. Data is replicated **synchronously**. Seen in **file systems and RDBMSes**. Works well in systems that need transactions.

### Useful in-between guarantees
**Read-your-writes** (a user always sees their own updates), **monotonic reads** (never go back in time), **causal consistency**. Often enough for user-facing features without paying for global strong consistency.`,
    related: ['cap', 'replication', 'cache-update'],
    primer: `${PRIMER}consistency-patterns`,
  },
  {
    id: 'availability',
    title: 'Availability in numbers',
    section: 'Availability & Consistency',
    tldr: 'Measured in nines. Components in sequence multiply (worse); components in parallel protect each other (better).',
    body: `| Availability | Downtime / year | / month | / week | / day |
|---|---|---|---|---|
| 99.9% (three 9s) | 8h 45m 57s | 43m 49.7s | 10m 4.8s | 1m 26.4s |
| 99.99% (four 9s) | 52m 35.7s | 4m 23s | 1m 5s | 8.6s |

### In sequence
\`Availability(Total) = Availability(Foo) × Availability(Bar)\` — two 99.9% components in sequence give 99.8%.

### In parallel
\`Availability(Total) = 1 − (1 − Availability(Foo)) × (1 − Availability(Bar))\` — two 99.9% components in parallel give 99.9999%.

### Levers
- Remove **single points of failure** (load balancers, databases, DNS, regions).
- Shorten **MTTR**: health checks, automatic failover, fast restarts.
- Independence matters: copies sharing a rack, region or bad deploy fail together.`,
    related: ['failover', 'replication', 'load-balancer'],
    primer: `${PRIMER}availability-in-numbers`,
  },
  {
    id: 'failover',
    title: 'Fail-over: active-passive & active-active',
    section: 'Availability & Consistency',
    tldr: 'Keep a spare that takes over (active-passive) or run all copies live and share load (active-active).',
    body: `### Active-passive
Heartbeats are sent between the active and the passive server on standby. If the heartbeat is interrupted, the passive server takes over the active's IP address and resumes service. Downtime depends on whether the passive is **hot** (already running) or must start from **cold**. Only the active server handles traffic. Also called *master-slave* failover.

### Active-active
Both servers manage traffic, spreading the load between them. If public-facing, DNS needs to know both IPs; if internal, application logic must know both. Also called *master-master* failover. Each node needs spare capacity for when its partner dies.

### Disadvantages of fail-over
- Adds more hardware and complexity.
- Potential **data loss** if the active system fails before newly written data is replicated to the passive.`,
    related: ['availability', 'replication', 'load-balancer'],
    primer: `${PRIMER}fail-over`,
  },
  {
    id: 'replication',
    title: 'Replication (master-slave, master-master)',
    section: 'Availability & Consistency',
    tldr: 'Copy data to other nodes. Master-slave scales reads; master-master spreads writes but invites conflicts.',
    body: `### Master-slave (primary-replica)
The master serves reads and writes, replicating writes to one or more slaves, which serve **only reads**. Slaves can also replicate to further slaves in a tree. If the master goes offline, the system can operate in **read-only mode** until a slave is promoted or a new master is provisioned.

**Disadvantages:** additional logic is needed to promote a slave; replication lag; see general disadvantages below.

### Master-master
Both masters serve reads and writes and coordinate with each other on writes. If either master goes down, the system continues with both reads and writes.

**Disadvantages:** you need a load balancer or app logic to determine where to write; most master-master systems are either **loosely consistent** (violating ACID) or have **increased write latency** due to synchronization; **conflict resolution** comes more into play as write nodes are added.

### General disadvantages of replication
- **Data loss** if the master fails before newly written data is replicated.
- Writes are replayed to read replicas — with lots of writes, replicas can bog down replaying writes and serve fewer reads.
- More read slaves = more replication = more lag.
- On some systems, writing to the master can spawn multiple threads to write in parallel, while replicas only support writing sequentially with a single thread.
- More hardware and complexity.

### Sync vs async
**Synchronous**: acknowledge after replicas have the write — no loss, higher latency, writes block if replicas are unreachable. **Asynchronous**: acknowledge immediately — fast, but recent writes can be lost on failover. **Semi-synchronous**: wait for at least one replica.`,
    interview: ['Replicas scale reads, not writes.', 'Name RPO (data you can lose) and RTO (time to recover) when discussing failover.'],
    related: ['failover', 'consistency', 'sharding', 'cap'],
    primer: `${PRIMER}replication`,
  },

  // ======================================================================= Traffic & Edge
  {
    id: 'dns',
    title: 'Domain Name System',
    section: 'Traffic & Edge',
    tldr: 'Translates names into IPs, hierarchically and with caching (TTL). Managed DNS can route by weight, latency or geography.',
    body: `DNS is hierarchical, with a few authoritative servers at the top level. Your router or ISP provides information about which DNS server(s) to contact for a lookup. Lower-level DNS servers **cache** mappings, which can become stale due to propagation delays. Results can also be cached by your browser or OS for a period determined by the **time to live (TTL)**.

### Record types
- **NS** — specifies the DNS servers for your domain/subdomain.
- **MX** — specifies the mail servers for accepting messages.
- **A** — points a name to an IP address.
- **CNAME** — points a name to another name (example.com → www.example.com).

### Traffic routing (managed DNS like Route 53, Cloudflare)
- **Weighted round robin** — prevent traffic from going to servers under maintenance, balance between cluster sizes, A/B testing.
- **Latency-based** routing.
- **Geolocation-based** routing.
- **Health-checked failover**.

### Disadvantages
- Accessing a DNS server introduces a slight delay (mitigated by caching).
- DNS server management can be complex (usually handled by governments, ISPs, large companies).
- DNS services have been the target of DDoS attacks.
- **TTL trade-off**: low TTL = faster failover and changes, more lookups; high TTL = fewer lookups, slow to react.`,
    related: ['cdn', 'load-balancer', 'availability'],
    primer: `${PRIMER}domain-name-system`,
  },
  {
    id: 'cdn',
    title: 'Content delivery networks',
    section: 'Traffic & Edge',
    tldr: 'A globally distributed network of proxy servers that serve content from locations close to the user.',
    body: `Generally static files (HTML/CSS/JS, photos, videos) are served from a CDN, although some CDNs (e.g. CloudFront) support dynamic content. The site's DNS resolution tells clients which server to contact.

Serving content from CDNs improves performance in two ways:
- Users receive content from data centers **close to them**.
- Your servers do not have to serve requests that the CDN fulfills.

### Push CDNs
Receive new content whenever changes occur on your server. You take full responsibility for providing content, uploading directly to the CDN and rewriting URLs to point to it. You configure when content expires and is updated. Content is uploaded only when new or changed, **minimizing traffic but maximizing storage**. Sites with little traffic or content that isn't often updated work well with push CDNs.

### Pull CDNs
Grab new content from your server when the **first user requests** it. You leave content on your server and rewrite URLs to point to the CDN. The first request is slower until the content is cached. A TTL determines how long content is cached. Pull CDNs **minimize storage** on the CDN but can create redundant traffic if files expire and are pulled before they've actually changed. Sites with **heavy traffic** work well with pull CDNs.

### Disadvantages
- CDN costs can be significant depending on traffic (weigh against what you'd pay otherwise).
- Content might be **stale** if updated before the TTL expires.
- CDNs require changing URLs for static content to point to the CDN.`,
    related: ['object-storage', 'cache', 'latency-numbers'],
    primer: `${PRIMER}content-delivery-network`,
  },
  {
    id: 'load-balancer',
    title: 'Load balancers',
    section: 'Traffic & Edge',
    tldr: 'Distribute incoming requests across servers, route around unhealthy ones, and remove the web tier as a single point of failure.',
    body: `Load balancers distribute incoming client requests to computing resources such as application servers and databases, returning the response to the appropriate client. They are effective at:
- Preventing requests from going to **unhealthy servers**
- Preventing **overloading** resources
- Helping to eliminate a **single point of failure**

They can be hardware (expensive) or software (e.g. HAProxy). Additional benefits: **SSL termination** (decrypt incoming requests and encrypt responses so backends don't have to; no X.509 certs on each server) and **session persistence** (cookies / routing a client to the same instance when apps don't track sessions).

To protect against failures, it's common to run multiple load balancers in **active-passive** or **active-active** mode.

### Routing methods
Random · Least loaded · Session/cookies · **Round robin** or weighted round robin · **Layer 4** · **Layer 7**.

### Layer 4 vs layer 7
- **Layer 4** looks at the transport layer: source/destination IPs and ports, not the contents of the packet. Forwards packets with NAT.
- **Layer 7** looks at the application layer: headers, message, cookies. It terminates traffic, reads the message, makes a balancing decision (e.g. video traffic to video servers, billing traffic to security-hardened billing servers), then opens a connection to the selected server. More flexible, more expensive per request.

### Disadvantages
- Can become a **performance bottleneck** if under-resourced or misconfigured.
- Adds complexity.
- A single load balancer is a single point of failure; multiple load balancers add complexity.`,
    related: ['scaling', 'reverse-proxy', 'stateless', 'availability'],
    primer: `${PRIMER}load-balancer`,
  },
  {
    id: 'reverse-proxy',
    title: 'Reverse proxy (web server)',
    section: 'Traffic & Edge',
    tldr: 'A web server in front of your apps: one public face, TLS termination, caching, compression, static files, security.',
    body: `A reverse proxy centralizes internal services and provides unified interfaces to the public. Requests from clients are forwarded to a server that can fulfil them before the proxy returns the server's response.

### Benefits
- **Increased security** — hide information about backend servers, blacklist IPs, limit connections per client.
- **Increased scalability and flexibility** — clients only see the proxy's IP, so you can scale servers or change their configuration.
- **SSL termination** — decrypt incoming requests and encrypt server responses so backends don't have to.
- **Compression** — compress server responses.
- **Caching** — return the response for cached requests.
- **Static content** — serve HTML/CSS/JS, photos, videos directly.

### Load balancer vs reverse proxy
- A load balancer is useful when you have **multiple** servers serving the same function.
- A reverse proxy can be useful even with **just one** web or application server.
- NGINX and HAProxy support both layer 7 reverse proxying and load balancing.

### Disadvantages
Increased complexity; a single reverse proxy is a single point of failure, and configuring multiple proxies (failover) further increases complexity.`,
    related: ['load-balancer', 'cache', 'security'],
    primer: `${PRIMER}reverse-proxy-web-server`,
  },
  {
    id: 'object-storage',
    title: 'Object storage',
    section: 'Traffic & Edge',
    tldr: 'S3-style blob storage: practically unlimited, durable, cheap — tens of ms per request. Keep blobs here, metadata in your database.',
    body: `Object stores (Amazon S3, Google Cloud Storage, Azure Blob) store immutable blobs addressed by key: images, videos, paste contents, logs, backups, ML datasets.

- **Durable** (data replicated across devices/zones) and **cheap** per GB.
- **Scales without effort** — no capacity planning.
- **Higher per-request latency** than local disk or memory; best behind a CDN for hot content.
- Common pattern: store the blob in the object store, store its **path/URL and metadata** in SQL/NoSQL.
- Great as a data lake for **batch processing** (MapReduce/Spark over logs).`,
    related: ['cdn', 'rdbms'],
    primer: `${PRIMER}design-a-system-that-scales-to-millions-of-users-on-aws`,
  },

  // ======================================================================= Application Layer
  {
    id: 'microservices',
    title: 'Application layer & microservices',
    section: 'Application Layer',
    tldr: 'Separate the web layer from an application (platform) layer, and split the platform into small, independently deployable services.',
    body: `Separating the web layer from the application layer (also known as the platform layer) lets you **scale and configure both independently**. Adding a new API results in adding application servers without necessarily adding web servers. The **single responsibility principle** advocates small, autonomous services that work together. Small teams with small services can plan more aggressively for rapid growth.

Workers in the application layer also help enable **asynchronism**.

### Microservices
A suite of independently deployable, small, modular services. Each runs a unique process and communicates through a well-defined, lightweight mechanism to serve a business goal. Pinterest, for example, could have: user profile, follower, feed, search, photo upload…

**Benefits:** independent scaling, failure isolation (bulkheads), independent deploys, team autonomy, tech choice per service.

### Service discovery
Systems such as **Consul**, **etcd** and **ZooKeeper** help services find each other by keeping track of registered names, addresses and ports. **Health checks** verify service integrity (often via an HTTP endpoint). Consul and etcd both have a built-in key-value store useful for config values and shared data.

### Disadvantages
- Adding an application layer with loosely coupled services requires a different approach from an architectural, operations and process viewpoint (vs a monolith).
- Microservices add complexity in deployments and operations.`,
    related: ['load-balancer', 'asynchronism', 'rpc-rest'],
    primer: `${PRIMER}application-layer`,
  },
  {
    id: 'search-index',
    title: 'Search indexes',
    section: 'Application Layer',
    tldr: 'An inverted index (word → documents) turns full-text search from a table scan into a lookup. Elasticsearch, Solr, Lucene.',
    body: `Relational databases can do \`LIKE '%term%'\`, but that scans every row. A **search index** keeps an **inverted index**: for each term, the list of documents containing it, plus statistics for ranking.

- **Indexing**: tokenize, normalize (lowercase, stemming), drop stop words, update postings lists. Usually asynchronous — documents become searchable a moment after they're written.
- **Querying**: parse the query, look up postings, intersect/union, rank (TF-IDF/BM25 + business signals).
- **Scaling**: shard the index across nodes (scatter-gather queries) and replicate shards for read throughput and availability.
- **Caching** popular queries is extremely effective (see the *Search Query Cache* capstone).`,
    related: ['microservices', 'cache', 'sharding'],
    primer: `${PRIMER}design-the-twitter-timeline-and-search`,
  },

  // ======================================================================= Databases
  {
    id: 'rdbms',
    title: 'Relational databases (RDBMS)',
    section: 'Databases',
    tldr: 'Tables of rows with SQL and ACID transactions. The default choice — until writes or data size outgrow one machine.',
    body: `A relational database like SQL is a collection of data items organized in tables. **ACID** is a set of properties of relational database transactions:
- **Atomicity** — each transaction is all or nothing.
- **Consistency** — any transaction brings the database from one valid state to another.
- **Isolation** — executing transactions concurrently has the same results as if they were executed serially.
- **Durability** — once a transaction has been committed, it will remain so.

### Techniques to scale a relational database
**Master-slave replication**, **master-master replication**, **federation**, **sharding**, **denormalization**, and **SQL tuning** — each has its own Codex entry.`,
    related: ['replication', 'federation', 'sharding', 'denormalization', 'sql-tuning', 'sql-vs-nosql'],
    primer: `${PRIMER}relational-database-management-system-rdbms`,
  },
  {
    id: 'federation',
    title: 'Federation',
    section: 'Databases',
    tldr: 'Split databases by function — users, products, forums — so each is smaller and gets only its own traffic.',
    body: `Federation (or functional partitioning) splits up databases by function. Instead of a single, monolithic database, you could have three: **forums**, **users** and **products**, resulting in less read and write traffic to each database and therefore less replication lag. Smaller databases result in more data that can fit in memory, which in turn results in more cache hits due to improved cache locality. With no single central master serializing writes, you can **write in parallel**, increasing throughput.

### Disadvantages
- Not effective if your schema requires huge functions or tables.
- You'll need to update your application logic to determine which database to read and write.
- **Joining data from two databases** is more complex with a server link.
- Adds more hardware and additional complexity.`,
    related: ['sharding', 'rdbms', 'microservices'],
    primer: `${PRIMER}federation`,
  },
  {
    id: 'sharding',
    title: 'Sharding',
    section: 'Databases',
    tldr: 'Partition the same data across databases by key so each shard handles a slice of reads and writes.',
    body: `Sharding distributes data across different databases such that each database can only manage a subset of the data. Taking a users database as an example, as the number of users increases, more shards are added.

Similar to federation, sharding results in less read and write traffic, less replication, and more cache hits. Index size is also reduced, which generally improves performance with faster queries. If one shard goes down, the other shards are still operational, although you'll want some form of replication to avoid data loss. Like federation, there is no single central master serializing writes, allowing you to write in parallel with increased throughput.

Common ways to shard a table of users: by the user's last name initial, by geographic location, or — most evenly — by a **hash** of the user id.

### Disadvantages
- You'll need to update your application logic to work with shards, which could result in complex SQL queries.
- **Data distribution can become lopsided** — a set of power users on one shard could result in increased load to that shard compared to others. Rebalancing adds complexity; a sharding function based on **consistent hashing** reduces the amount of transferred data.
- **Joining data from multiple shards** is more complex.
- Adds more hardware and additional complexity.`,
    interview: ['Pick a shard key with high cardinality that matches the dominant access pattern.', 'Call out hot keys (celebrities) and resharding cost.'],
    related: ['consistent-hashing', 'federation', 'replication'],
    primer: `${PRIMER}sharding`,
  },
  {
    id: 'consistent-hashing',
    title: 'Consistent hashing',
    section: 'Databases',
    tldr: 'Map keys and nodes onto a ring so adding or removing a node only moves ~1/N of the keys.',
    body: `With naive \`hash(key) mod N\`, changing N remaps almost every key: going from 4 to 5 shards moves ~80% of the data and turns every cache into a cold cache.

**Consistent hashing** places nodes (usually many **virtual nodes** each) on a hash ring; a key belongs to the next node clockwise. Adding a node only steals keys from its neighbours (~1/N of all keys); removing one hands its keys to the next node.

Used in Dynamo-style stores (Cassandra, DynamoDB), distributed caches (Memcached clients), CDNs and load balancers. Variants include rendezvous (highest random weight) hashing and **jump consistent hashing**.`,
    related: ['sharding', 'cache', 'stateless'],
    primer: `${PRIMER}sharding`,
  },
  {
    id: 'denormalization',
    title: 'Denormalization',
    section: 'Databases',
    tldr: 'Store redundant copies of data to avoid expensive joins: faster reads, slower and more complex writes.',
    body: `Denormalization attempts to improve read performance at the expense of some write performance. Redundant copies of the data are written in multiple tables to avoid expensive joins. Some RDBMSs such as PostgreSQL and Oracle support **materialized views**, which handle the work of storing redundant information and keeping redundant copies consistent.

Once data becomes distributed with techniques such as federation and sharding, managing joins across data centers further increases complexity. Denormalization might circumvent the need for such complex joins.

In most systems, reads can heavily outnumber writes **100:1 or even 1000:1**. A read resulting in a complex database join can be very expensive, spending a significant amount of time on disk operations.

### Disadvantages
- Data is duplicated.
- Constraints can help redundant copies of information stay in sync, which increases complexity of the database design.
- A denormalized database under heavy write load might perform worse than its normalized counterpart.`,
    related: ['sql-tuning', 'rdbms'],
    primer: `${PRIMER}denormalization`,
  },
  {
    id: 'sql-tuning',
    title: 'SQL tuning',
    section: 'Databases',
    tldr: 'Benchmark and profile first; then index, tighten the schema, avoid expensive joins, partition hot tables.',
    body: `It's important to **benchmark and profile** to simulate and uncover bottlenecks: benchmark with tools like *ab*; profile with the **slow query log**.

### Tighten up the schema
- MySQL dumps to disk in contiguous blocks for fast access.
- Use **CHAR** instead of VARCHAR for fixed-length fields (fast random access).
- Use **TEXT** for large blocks of text; it allows boolean searches. TEXT fields store a pointer on disk used to locate the text block.
- Use **INT** for larger numbers up to 2³² (4 billion).
- Use **DECIMAL** for currency to avoid floating point errors.
- Avoid storing large **BLOBs**; store the location of where to get the object instead.
- VARCHAR(255) is the largest number of characters countable in an 8-bit number, often maximizing use of a byte in some RDBMSs.
- Set **NOT NULL** where applicable to improve search performance.

### Use good indices
- Columns you query (SELECT, GROUP BY, ORDER BY, JOIN) could be faster with indices.
- Indices are usually a self-balancing **B-tree**: data stays sorted, searches/insertions/deletions are logarithmic.
- Placing an index can keep data in memory, requiring more space.
- **Writes can be slower** since the index also needs to be updated.
- When loading large amounts of data, it might be faster to disable indices, load the data, then rebuild the indices.

### Avoid expensive joins
Denormalize where performance demands it.

### Partition tables
Break up a table by putting hot spots in a separate table to help keep it in memory.

### Tune the query cache
In some cases the query cache could lead to performance issues.`,
    related: ['denormalization', 'rdbms', 'performance-scalability'],
    primer: `${PRIMER}sql-tuning`,
  },
  {
    id: 'nosql-kv',
    title: 'Key-value stores',
    section: 'Databases',
    tldr: 'A hash map at scale: O(1) reads and writes by key. Redis, Memcached, DynamoDB, Voldemort.',
    body: `Abstraction: **hash table**. A key-value store generally allows O(1) reads and writes and is often backed by memory or SSD. Data stores can maintain keys in **lexicographic order**, allowing efficient retrieval of key ranges. Key-value stores can allow storing metadata with a value.

Key-value stores provide high performance and are often used for **simple data models** or for rapidly changing data, such as an in-memory cache layer. Since they offer only a limited set of operations, complexity is shifted to the application layer if additional operations are needed.

A key-value store is the basis for more complex systems such as a document store, and in some cases, a graph database.`,
    related: ['sql-vs-nosql', 'cache', 'nosql-document'],
    primer: `${PRIMER}key-value-store`,
  },
  {
    id: 'nosql-document',
    title: 'Document stores',
    section: 'Databases',
    tldr: 'Key-value with JSON/XML documents as values, queryable by their contents. MongoDB, CouchDB, Firestore.',
    body: `Abstraction: **key-value store with documents stored as values**. A document store is centered around documents (XML, JSON, binary, etc.), where a document stores all information for a given object. Document stores provide APIs or a query language to query based on the internal structure of the document itself. *Note: many key-value stores include features for working with a value's metadata, blurring the lines between these two storage types.*

Based on the underlying implementation, documents are organized by collections, tags, metadata or directories. Although documents can be organized or grouped together, documents may have fields that are completely different from each other.

Some document stores like **MongoDB** and **CouchDB** also provide a SQL-like language to perform complex queries. **DynamoDB** supports both key-values and documents.

Document stores provide **high flexibility** and are often used for working with occasionally changing data.`,
    related: ['sql-vs-nosql', 'nosql-kv'],
    primer: `${PRIMER}document-store`,
  },
  {
    id: 'nosql-widecolumn',
    title: 'Wide column stores',
    section: 'Databases',
    tldr: 'Nested map: row key → column families → columns, versioned by timestamp. Built for huge, write-heavy datasets. Bigtable, HBase, Cassandra.',
    body: `Abstraction: **nested map** \`ColumnFamily<RowKey, Columns<ColKey, Value, Timestamp>>\`.

A wide column store's basic unit of data is a column (name/value pair). A column can be grouped in column families (analogous to a SQL table). Super column families further group column families. You can access each column independently with a row key, and columns with the same row key form a row. Each value contains a **timestamp** for versioning and for conflict resolution.

Google introduced **Bigtable** as the first wide column store, which influenced the open-source **HBase** (often used in the Hadoop ecosystem) and **Cassandra** from Facebook. Stores such as Bigtable, HBase and Cassandra maintain keys in lexicographic order, allowing efficient retrieval of selective key ranges.

Wide column stores offer **high availability and high scalability**. They are often used for **very large data sets** — time series, event logs, messaging. Log-structured storage makes writes very cheap.`,
    related: ['sql-vs-nosql', 'nosql-kv', 'consistent-hashing'],
    primer: `${PRIMER}wide-column-store`,
  },
  {
    id: 'nosql-graph',
    title: 'Graph databases',
    section: 'Databases',
    tldr: 'Nodes and edges stored as first-class records, so relationship traversals are pointer chasing instead of joins. Neo4j, FlockDB.',
    body: `Abstraction: **graph**. In a graph database, each node is a record and each arc is a relationship between two nodes. Graph databases are optimized to represent complex relationships with many foreign keys or many-to-many relationships.

Graph databases offer **high performance for data models with complex relationships**, such as a social network. They are relatively new and not yet widely used; it might be more difficult to find development tools and resources. Many graphs can only be accessed with REST APIs.

Graphs are hard to **partition** — a traversal crosses shards constantly — which is why many graph databases scale up rather than out, and why large social networks often build graph services on sharded key-value stores instead (see the *Social Graph* capstone).`,
    related: ['sql-vs-nosql', 'sharding'],
    primer: `${PRIMER}graph-database`,
  },
  {
    id: 'sql-vs-nosql',
    title: 'SQL or NoSQL',
    section: 'Databases',
    tldr: 'SQL for relational data, transactions and flexible queries; NoSQL for scale, flexible schemas and simple access patterns. ACID vs BASE.',
    body: `NoSQL is a collection of data items represented in a key-value store, document store, wide column store or graph database. Data is denormalized, and joins are generally done in the application code. Most NoSQL stores lack true ACID transactions and favor **eventual consistency**.

**BASE** is often used to describe the properties of NoSQL databases. In comparison with the CAP theorem, BASE chooses availability over consistency:
- **Basically available** — the system guarantees availability.
- **Soft state** — the state of the system may change over time, even without input.
- **Eventual consistency** — the system will become consistent over a period of time, given that it doesn't receive input during that period.

### Reasons for SQL
Structured data · strict schema · relational data · need for complex joins · transactions · clear patterns for scaling · more established: developers, community, code, tools · lookups by index are very fast.

### Reasons for NoSQL
Semi-structured data · dynamic or flexible schema · non-relational data · no need for complex joins · store many TB (or PB) of data · very data-intensive workload · very high throughput for IOPS.

### Sample data well-suited for NoSQL
Rapid ingest of clickstream and log data · leaderboard or scoring data · temporary data such as a shopping cart · frequently accessed ('hot') tables · metadata/lookup tables.`,
    interview: ['Choose per workload, not per company — polyglot persistence is normal.', 'If you pick NoSQL, explain how you handle the lack of joins and multi-row transactions.'],
    related: ['rdbms', 'nosql-kv', 'nosql-document', 'nosql-widecolumn', 'nosql-graph', 'cap'],
    primer: `${PRIMER}sql-or-nosql`,
  },

  // ======================================================================= Caching
  {
    id: 'cache',
    title: 'Caching',
    section: 'Caching',
    tldr: 'Keep frequently used data in fast storage (memory) close to where it is needed. Improves load times and reduces load on servers and databases.',
    body: `Caching improves page load times and can reduce the load on your servers and databases. In this model, the dispatcher first looks up whether the request has been made before and tries to find the previous result to return, in order to save the actual execution.

Databases often benefit from a uniform distribution of reads and writes across partitions. **Popular items can skew the distribution**, causing bottlenecks. Putting a cache in front of a database can help absorb uneven loads and spikes in traffic.

### Where to cache
- **Client caching** — client side (OS or browser), server side, or in a distinct cache layer.
- **CDN caching** — CDNs are considered a type of cache.
- **Web server caching** — reverse proxies and caches such as Varnish can serve static and dynamic content directly. Web servers can also cache requests, returning responses without contacting application servers.
- **Database caching** — your database usually includes some level of caching in a default configuration, optimized for a generic use case. Tweaking these settings for specific usage patterns can further boost performance.
- **Application caching** — in-memory caches such as Memcached and Redis are key-value stores between your application and your data storage. Since the data is held in RAM, it is much faster than typical databases where data is stored on disk. RAM is more limited than disk, so **cache invalidation algorithms** such as least recently used (**LRU**) can help invalidate 'cold' entries and keep 'hot' data in RAM.

Redis has additional features: persistence options, and built-in data structures such as sorted sets and lists.

### What to cache
- **Database query level**: hash the query as the key, store the result. Hard to delete a cached result with complex queries; if one piece of data changes (e.g. a table cell), you need to delete all cached queries that might include it.
- **Object level**: see your data as an object, similar to your application code. Have your application assemble the dataset from the database into a class instance or data structure. Remove the object from cache if its underlying data has changed. Allows for asynchronous processing: workers assemble objects by consuming the latest cached object.
  Suggestions of what to cache: user sessions, fully rendered web pages, activity streams, user graph data.

### Disadvantages
- Need to maintain **consistency** between caches and the source of truth (cache invalidation).
- Cache invalidation is a difficult problem — there is additional complexity associated with *when* to update the cache.
- Need to make application changes such as adding Redis or Memcached.`,
    interview: ['Say what you cache, where, the eviction policy, and how it is invalidated.', 'Size the cache with the 80/20 rule and expected hit rate.'],
    related: ['cache-update', 'cdn', 'consistency', 'latency-numbers'],
    primer: `${PRIMER}cache`,
  },
  {
    id: 'cache-update',
    title: 'When to update the cache',
    section: 'Caching',
    tldr: 'Cache-aside (lazy), write-through (sync), write-behind (async, risky), refresh-ahead (predictive).',
    body: `Since you can only store a limited amount of data in cache, you'll need to determine which cache update strategy works best for your use case.

### Cache-aside (lazy loading)
The application is responsible for reading and writing from storage; the cache does not interact with storage directly.
1. Look for the entry in the cache, resulting in a cache **miss**.
2. Load the entry from the database.
3. Add the entry to the cache.
4. Return the entry.

Memcached is generally used this way. Subsequent reads of data added to the cache are fast. Only requested data is cached, which avoids filling up the cache with data that isn't requested.

**Disadvantages:** each cache miss results in **three trips**, which can cause a noticeable delay. Data can become **stale** if it is updated in the database — mitigated by setting a TTL that forces an update, or by using write-through. When a node fails, it is replaced by a new, empty node, increasing latency.

### Write-through
The application uses the cache as the main data store, reading and writing data to it, while the cache is responsible for reading and writing to the database: the app adds/updates the entry in the cache; the cache **synchronously** writes the entry to the data store; return.

Write-through is a slow overall operation due to the write, but subsequent reads of just-written data are fast. Users are generally more tolerant of latency when updating data than reading it. Data in the cache is not stale.

**Disadvantages:** when a new node is created due to failure or scaling, it will not cache entries until the entry is updated in the database (cache-aside together with write-through can mitigate this). Most data written might never be read, which can be minimized with a TTL.

### Write-behind (write-back)
The application adds/updates the entry in the cache and the cache **asynchronously** writes the entry to the data store, improving write performance.

**Disadvantages:** there could be **data loss** if the cache goes down before its contents hit the data store. It is more complex to implement than cache-aside or write-through.

### Refresh-ahead
You can configure the cache to automatically refresh any recently accessed cache entry prior to its expiration. Refresh-ahead can result in reduced latency vs read-through if the cache can accurately predict which items are likely to be needed in the future.

**Disadvantage:** not accurately predicting which items are likely to be needed can result in reduced performance than without refresh-ahead.`,
    related: ['cache', 'consistency'],
    primer: `${PRIMER}when-to-update-the-cache`,
  },

  // ======================================================================= Asynchronism
  {
    id: 'asynchronism',
    title: 'Asynchronism',
    section: 'Asynchronism',
    tldr: 'Do expensive work outside the request: respond fast, let workers finish in the background.',
    body: `Asynchronous workflows help reduce request times for expensive operations that would otherwise be performed in-line. They can also help by doing time-consuming work in advance, such as periodic aggregation of data.

Typical candidates: sending emails, generating thumbnails, transcoding video, fan-out of social posts, report generation, importing data from third parties, search indexing.

### Disadvantages
Use cases such as **inexpensive calculations and realtime workflows** might be better suited for synchronous operations, as introducing queues can add delays and complexity. The client also needs a way to learn the result: polling, websockets, push notifications, or simply eventual visibility.`,
    related: ['message-queues', 'back-pressure', 'microservices'],
    primer: `${PRIMER}asynchronism`,
  },
  {
    id: 'message-queues',
    title: 'Message & task queues',
    section: 'Asynchronism',
    tldr: 'Queues receive, hold and deliver messages so producers and consumers are decoupled in time and rate.',
    body: `### Message queues
Message queues receive, hold, and deliver messages. If an operation is too slow to perform inline, you can use a message queue with the following workflow:
1. An application publishes a job to the queue, then notifies the user of the job status.
2. A worker picks up the job from the queue, processes it, then signals the job is complete.

The user is not blocked and the job is processed in the background. During this time, the client might optionally do a small amount of processing to make it seem like the task has completed — for example, a posted tweet could be instantly shown on your timeline but could take some time before it is actually delivered to all of your followers.

- **Redis** — useful as a simple message broker, but messages can be lost.
- **RabbitMQ** — popular but requires you to adapt to the AMQP protocol and manage your own nodes.
- **Amazon SQS** — hosted but can have high latency and the possibility of messages being delivered twice.
- **Kafka / Kinesis** — durable, partitioned logs; consumers track offsets and can replay.

### Task queues
Tasks queues receive tasks and their related data, run them, then deliver their results. They can support scheduling and can be used to run computationally-intensive jobs in the background. **Celery** has support for scheduling and primarily has Python support.

### Patterns
- **Point-to-point** (one consumer per message) vs **publish/subscribe** (every subscriber gets a copy — fan-out to email, search indexing, analytics…).
- **At-least-once** delivery → make consumers **idempotent**; use a **dead-letter queue** for poison messages.
- **Queue-based load leveling**: size consumers for the average rate, let the queue absorb bursts.`,
    related: ['asynchronism', 'back-pressure', 'autoscaling'],
    primer: `${PRIMER}message-queues`,
  },
  {
    id: 'back-pressure',
    title: 'Back pressure',
    section: 'Asynchronism',
    tldr: 'When a queue is full, push back (reject/503) instead of growing without bound; clients retry with exponential backoff.',
    body: `If queues start to grow significantly, the queue size can become larger than memory, resulting in cache misses, disk reads, and even slower performance. **Back pressure** can help by limiting the queue size, thereby maintaining a high throughput rate and good response times for jobs already in the queue. Once the queue fills up, clients get a **server busy or HTTP 503** status code to try again later. Clients can retry the request at a later time, perhaps with **exponential backoff**.

### Related ideas
- **Exponential backoff with jitter** — spread retries out so clients that failed together don't retry together (retry storms).
- **Load shedding** — drop low-priority work first.
- **Rate limiting** — cap each client's share up front.
- **Circuit breakers** — stop calling a failing dependency for a while and fail fast.`,
    related: ['message-queues', 'security', 'autoscaling'],
    primer: `${PRIMER}back-pressure`,
  },

  // ======================================================================= Communication
  {
    id: 'http',
    title: 'HTTP',
    section: 'Communication',
    tldr: 'A request/response protocol between clients and servers: a verb, a resource, headers and a body. Built on TCP (HTTP/3: QUIC over UDP).',
    body: `HTTP is a method for encoding and transporting data between a client and a server. It is a request/response protocol: clients issue requests and servers issue responses with relevant content and completion status info about the request. HTTP is self-contained, allowing requests and responses to flow through many intermediate routers and servers that perform load balancing, caching, encryption, and compression.

A basic HTTP request consists of a **verb** (method) and a **resource** (endpoint).

| Verb | Description | Idempotent* | Safe | Cacheable |
|---|---|---|---|---|
| GET | Reads a resource | Yes | Yes | Yes |
| POST | Creates a resource or triggers a process that handles data | No | No | Yes if response contains freshness info |
| PUT | Creates or replaces a resource | Yes | No | No |
| PATCH | Partially updates a resource | No | No | Yes if response contains freshness info |
| DELETE | Deletes a resource | Yes | No | No |

*Can be called many times without different outcomes.

HTTP is an application layer protocol relying on lower-level protocols such as **TCP** and **UDP**.`,
    related: ['tcp-udp', 'rpc-rest'],
    primer: `${PRIMER}hypertext-transfer-protocol-http`,
  },
  {
    id: 'tcp-udp',
    title: 'TCP vs UDP',
    section: 'Communication',
    tldr: 'TCP: connection-oriented, reliable, ordered, congestion-controlled. UDP: connectionless datagrams, lower latency, no guarantees.',
    body: `### TCP
TCP is a connection-oriented protocol over an IP network. Connection is established and terminated using a **handshake**. All packets sent are guaranteed to reach the destination in the original order and without corruption through:
- Sequence numbers and checksum fields for each packet
- Acknowledgement packets and automatic retransmission

If the sender does not receive a correct response, it will resend the packets. If there are multiple timeouts, the connection is dropped. TCP also implements **flow control** and **congestion control**. These guarantees cause delays and generally result in less efficient transmission than UDP.

To ensure high throughput, web servers can keep a large number of TCP connections open, resulting in high memory usage. It can be expensive to have a large number of open connections between web server threads and, say, a memcached server. **Connection pooling** can help, in addition to switching to UDP where applicable.

**Use TCP** when you need all of the data to arrive intact, and want to automatically make a best estimate use of network throughput: web servers, database info, SMTP, FTP, SSH.

### UDP
UDP is connectionless. Datagrams (analogous to packets) are guaranteed only at the datagram level. Datagrams might reach their destination out of order or not at all. UDP does not support congestion control. Without the guarantees that TCP supports, UDP is generally more efficient.

UDP can **broadcast**, sending datagrams to all devices on the subnet. This is useful with **DHCP** because the client has not yet received an IP address, thus preventing a way for TCP to stream without the IP address.

UDP is less reliable but works well in real time use cases such as **VoIP, video chat, streaming, and realtime multiplayer games**.

**Use UDP** when you need the lowest latency, late data is worse than loss of data, or you want to implement your own error correction.`,
    related: ['http', 'latency-numbers'],
    primer: `${PRIMER}transmission-control-protocol-tcp`,
  },
  {
    id: 'rpc-rest',
    title: 'RPC vs REST',
    section: 'Communication',
    tldr: 'RPC exposes behaviours (call a remote procedure); REST exposes resources (uniform verbs on URIs). RPC for internal performance; REST for public APIs.',
    body: `### Remote procedure call (RPC)
In an RPC, a client causes a procedure to execute on a different address space, usually a remote server. The procedure is coded as if it were a local procedure call, abstracting away the details of how to communicate with the server from the client program. Remote calls are usually slower and less reliable than local calls, so it is helpful to distinguish RPC calls from local calls. Popular frameworks: **Protobuf, Thrift, Avro** (gRPC).

Flow: client program → client stub (marshals procedure id + args) → client communication module → server communication module → server stub (unmarshals) → server procedure; the response repeats the steps in reverse.

RPC is focused on **exposing behaviors**. RPCs are often used for performance reasons with internal communications, as you can hand-craft native calls to better fit your use cases. Choose a native library (SDK) when you know your target platform, want to control how your "logic" is accessed, want to control how error control happens off your library, or when performance and end user experience is your primary concern.

**RPC disadvantages:** clients become tightly coupled to the service implementation; a new API must be defined for every new operation or use case; it can be difficult to debug; you might not be able to leverage existing technologies out of the box (e.g. extra effort to make RPC calls properly cached on caching servers such as Squid).

### Representational state transfer (REST)
REST is an architectural style enforcing a client/server model where the client acts on a set of resources managed by the server. The server provides a representation of resources and actions that can either manipulate or get a new representation of resources. All communication must be **stateless and cacheable**.

Four qualities of a RESTful interface: identify resources (URI) · change with representations (verbs) · self-descriptive error message (status response) · HATEOAS (HTML interface for HTTP).

REST is focused on **exposing data**. It minimizes the coupling between client/server and is often used for public HTTP APIs. REST uses a more generic and uniform method of exposing resources through URIs, representation through headers, and actions through verbs such as GET, POST, PUT, DELETE, and PATCH. Being stateless, REST is great for horizontal scaling and partitioning.

**REST disadvantages:** with REST being focused on exposing data, it might not be a good fit if resources are not naturally organized or accessed in a simple hierarchy (e.g. returning all updated records from the past hour matching a set of events is not easily expressed as a path); REST typically relies on a few verbs which sometimes doesn't fit your use case; fetching complicated resources with nested hierarchies requires **multiple round trips** (e.g. a blog entry and its comments); over time, more fields might be added to an API response and older clients will receive all new data fields, even those they don't need — bloating payloads and increasing latency.

| Operation | RPC | REST |
|---|---|---|
| Signup | POST /signup | POST /persons |
| Resign | POST /resign | DELETE /persons/1234 |
| Read a person | GET /readPerson?personid=1234 | GET /persons/1234 |
| Read a person's items | GET /readUsersItemsList?personid=1234 | GET /persons/1234/items |
| Add an item | POST /addItemToUsersItemsList | POST /persons/1234/items |
| Update an item | POST /modifyItem | PUT /items/456 |
| Delete an item | POST /removeItem | DELETE /items/456 |`,
    related: ['http', 'microservices'],
    primer: `${PRIMER}remote-procedure-call-rpc`,
  },

  // ======================================================================= Security
  {
    id: 'security',
    title: 'Security',
    section: 'Security',
    tldr: 'Encrypt in transit and at rest, sanitize all inputs, use parameterized queries, apply least privilege — and defend in depth.',
    body: `Security is a broad topic. Unless you have considerable experience, a security background, or are applying for a position that requires knowledge of security, you probably won't need to know more than the basics:
- **Encrypt** in transit and at rest.
- **Sanitize all user inputs** or any input parameters exposed to user to prevent **XSS** and **SQL injection**.
- Use **parameterized queries** to prevent SQL injection.
- Use the principle of **least privilege**.

### Also good to know for system design
- **TLS** everywhere on the public internet; terminate at a load balancer/reverse proxy if backends are on a trusted network (or re-encrypt for zero-trust).
- **Authentication & authorization**: sessions or tokens (OAuth2 / JWT); check authorization on every request, server side.
- **Rate limiting** per client (token bucket, sliding window) and **WAFs** at the edge; return 429 with Retry-After.
- **DDoS**: absorb at the edge (CDN/anycast scrubbing), cache aggressively, protect expensive endpoints.
- **Secrets** in a secret manager, not in code; rotate keys.
- **Audit logs** and monitoring for anomalies.`,
    related: ['reverse-proxy', 'load-balancer', 'back-pressure'],
    primer: `${PRIMER}security`,
  },
];

export const CODEX_BY_ID = new Map(CODEX.map((c) => [c.id, c]));

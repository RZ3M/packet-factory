import type { Track } from '../types';
import { C, big, compare, diagram, fr, l, n, steps } from './dsl';

const U = (y = 1, extra = {}) => n('u', 'Users', 'user', 0, y, extra);

export const TRACKS_1: Track[] = [
  // =========================================================================
  {
    id: 'playbook',
    title: 'Interview Playbook',
    icon: 'GraduationCap',
    color: '#f5a524',
    blurb: 'How to run a system design interview from the first question to the last bottleneck.',
    lectures: [
      {
        id: 'approach',
        title: 'The 4-step approach',
        blurb: 'Clarify, sketch, deep-dive, scale.',
        minutes: 4,
        codex: 'interview-framework',
        slides: [
          {
            t: 'An open-ended conversation you lead',
            b: 'There is no single right answer. Interviewers watch **how you reason**: how you scope, which trade-offs you see, and how you react to new constraints.',
            v: steps(
              ['Clarify', 'Use cases, constraints and assumptions. Who uses it? How much traffic? Read/write ratio?'],
              ['High-level design', 'Sketch the main components and how they connect. Justify each one.'],
              ['Core components', 'Go deep on the interesting parts: data model, API, key algorithms.'],
              ['Scale', 'Find the bottlenecks and fix them: load balancers, caching, replication, sharding, async.'],
            ),
          },
          {
            t: 'Step 1 — Ask before you draw',
            b: 'Scope the problem in the first 5 minutes.',
            pts: [
              'Who is going to use it, and how?',
              'How many users? Requests per second?',
              'What are the inputs and outputs?',
              'How much data, and for how long?',
              'What is the read-to-write ratio?',
            ],
          },
          {
            t: 'Step 2 — High-level design',
            b: 'Start simple and correct. Users → web/app servers → database is fine as a first sketch.',
            v: diagram(
              fr('Start with the simplest thing that works.', [U(), n('a', 'App', 'app', 1.4, 1), n('d', 'Database', 'db', 2.8, 1)], [l('u', 'a', { back: true }), l('a', 'd', { color: C.read })]),
              fr('Then add components only to solve a named problem.', [U(), n('lb', 'LB', 'lb', 1, 1), n('a', 'App', 'app', 2, 0.4), n('a2', 'App', 'app', 2, 1.6), n('c', 'Cache', 'cache', 3, 0.4, { state: 'new' }), n('d', 'Database', 'db', 3, 1.6)], [l('u', 'lb'), l('lb', 'a'), l('lb', 'a2'), l('a', 'c', { color: C.read }), l('a2', 'd', { color: C.read })]),
            ),
          },
          {
            t: 'Step 3 — Core components',
            b: 'Pick one or two interesting pieces and go deep. For a URL shortener: how to generate IDs (hash + Base62), collisions, the schema, SQL vs NoSQL, the API.',
          },
          {
            t: 'Step 4 — Scale the design',
            b: 'Walk the request path and ask *"what breaks first at 10× load?"* Then fix that bottleneck and say what it costs.',
            pts: ['Load balancer + horizontal scaling', 'Caching', 'Database replication / sharding', 'Async queues', '…and always name the trade-off'],
          },
        ],
      },
      {
        id: 'envelope',
        title: 'Back-of-the-envelope math',
        blurb: 'Turn monthly numbers into QPS, storage and servers.',
        minutes: 4,
        codex: 'back-of-envelope',
        slides: [
          { t: 'The magic number', v: big('2.5M', 'seconds in a month (≈ 30 × 86,400)'), b: 'Divide anything "per month" by 2.5 million to get "per second".' },
          {
            t: 'Handy conversions',
            pts: ['1 req/s ≈ 2.5 million req/month', '40 req/s ≈ 100 million req/month', '400 req/s ≈ 1 billion req/month', '1 million req/day ≈ 12 req/s'],
          },
          {
            t: 'Worked example: Twitter',
            b: '250 billion reads/month ÷ 2.5M ≈ **100,000 reads/s**. 15 billion tweets/month → **6,000 tweets/s**. ×10 fan-out → **60,000 deliveries/s**. That last number tells you timelines must live in memory.',
            v: big('100k/s', 'timeline reads', '#38bdf8'),
          },
          {
            t: 'The usual chain',
            v: steps(
              ['Traffic', 'Daily users × actions ÷ 86,400 = average QPS. Peak ≈ 2–3× average.'],
              ['Storage', 'Items/day × size × retention (× replication).'],
              ['Bandwidth', 'QPS × average response size.'],
              ['Cache memory', 'Hot 20% × item size × count.'],
              ['Servers', 'Peak QPS ÷ (per-server QPS × 0.7).'],
            ),
          },
          { t: 'Round aggressively', b: 'Interviewers want the right **order of magnitude** and clear reasoning, not decimals. Say units out loud and sanity-check: "40k reads/s — that is a caching problem, not a single database."' },
        ],
      },
      {
        id: 'numbers',
        title: 'Numbers every engineer knows',
        blurb: 'Latency ladder and powers of two.',
        minutes: 3,
        codex: 'latency-numbers',
        slides: [
          { t: 'The latency ladder', v: { kind: 'widget', id: 'latency' }, b: 'Each step is roughly 10× slower. RAM → network → disk → oceans.' },
          { t: 'Memory vs SSD', v: big('~1,000×', 'memory is faster than an SSD random read'), b: 'That gap is why caches exist.' },
          { t: 'Distance is physics', v: big('150 ms', 'California → Netherlands → California'), b: 'No code fixes the speed of light. Only moving data closer does (CDNs, regions).' },
          {
            t: 'Powers of two',
            pts: ['2¹⁰ ≈ 1 thousand → KB', '2²⁰ ≈ 1 million → MB', '2³⁰ ≈ 1 billion → GB', '2⁴⁰ ≈ 1 trillion → TB', '2³² ≈ 4.3 billion: the 32-bit limit'],
          },
          { t: 'Throughput rules of thumb', pts: ['HDD ~30 MB/s sequential', '1 Gbps network ~100 MB/s', 'SSD ~1 GB/s', 'RAM ~4 GB/s', '~2,000 round trips/s inside a datacenter'] },
        ],
      },
      {
        id: 'scaling-millions',
        title: 'From 1 user to 10 million',
        blurb: "The primer's step-by-step growth path.",
        minutes: 4,
        codex: 'scaling-aws',
        slides: [
          {
            t: 'Grow one bottleneck at a time',
            v: diagram(
              fr('1 · One box runs web app and MySQL. Scale up while you can.', [U(), n('a', 'Web + DB', 'app', 1.8, 1)], [l('u', 'a', { back: true })]),
              fr('2 · Split the database out; move static files to object storage + CDN.', [U(), n('cdn', 'CDN', 'cdn', 1.3, 0), n('s3', 'Object store', 's3', 2.8, 0), n('a', 'Web', 'app', 1.3, 1.6), n('d', 'MySQL', 'db', 2.8, 1.6, { state: 'new' })], [l('u', 'cdn', { color: C.static }), l('cdn', 's3', { color: C.static, rate: 1 }), l('u', 'a'), l('a', 'd')]),
              fr('3 · Load balancer + many stateless web servers; replicas for reads.', [U(), n('lb', 'LB', 'lb', 1, 1), n('a1', 'Web', 'app', 2, 0.4), n('a2', 'Web', 'app', 2, 1.6), n('d', 'Primary', 'db', 3.1, 0.4), n('r', 'Replica', 'db', 3.1, 1.6, { state: 'new' })], [l('u', 'lb'), l('lb', 'a1'), l('lb', 'a2'), l('a1', 'd', { color: C.write }), l('a2', 'r'), l('d', 'r', { dashed: true })]),
              fr('4 · Cache hot reads; queue slow work; autoscale the web tier.', [U(), n('lb', 'LB', 'lb', 1, 1), n('a', 'Web ×N', 'app', 2, 1, { badge: 'auto' }), n('c', 'Cache', 'cache', 3, 0, { state: 'new' }), n('d', 'MySQL', 'db', 3, 1), n('q', 'Queue', 'queue', 3, 2, { state: 'new' })], [l('u', 'lb'), l('lb', 'a', { rate: 3 }), l('a', 'c', { back: true }), l('a', 'd', { rate: 1 }), l('a', 'q', { color: C.job, rate: 1 })]),
              fr('5 · Finally: shard / federate the data and split into services.', [U(), n('lb', 'LB', 'lb', 1, 1), n('s1', 'Users svc', 'service', 2, 0.3), n('s2', 'Posts svc', 'service', 2, 1.7), n('d1', 'Shard A', 'db', 3.1, 0.3), n('d2', 'Shard B', 'db', 3.1, 1.7)], [l('u', 'lb'), l('lb', 's1'), l('lb', 's2'), l('s1', 'd1'), l('s2', 'd2')]),
            ),
          },
          { t: 'The loop', v: steps(['Benchmark', 'Load test to find the next limit.'], ['Profile', 'Which component saturates first?'], ['Fix', 'Apply the cheapest pattern that removes it.'], ['Repeat', 'A new bottleneck appears somewhere else.']) },
          { t: 'Don’t skip ahead', b: 'Sharding and microservices on day one add cost and complexity you don’t need yet. In interviews, show **when** each step becomes necessary, using your estimates.' },
          { t: 'Ops grows too', pts: ['Metrics, logging and alerting from day one', 'Automate deploys (CI/CD)', 'Multiple availability zones for redundancy', 'Autoscaling driven by those metrics'] },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'foundations',
    title: 'Foundations',
    icon: 'Layers',
    color: '#34d399',
    blurb: 'Latency, throughput, scaling up and out, stateless services.',
    lectures: [
      {
        id: 'perf',
        title: 'Performance vs scalability',
        blurb: 'Two different problems with two different fixes.',
        minutes: 2,
        codex: 'performance-scalability',
        slides: [
          {
            t: 'Two kinds of slow',
            v: compare('Performance problem', ['Slow even for one user', 'Fix the code, queries, algorithm'], 'Scalability problem', ['Fast for one, slow under load', 'Add or rearrange capacity']),
          },
          { t: 'What "scalable" means', b: 'A system is scalable if adding resources increases performance **proportionally**. If doubling servers doesn\'t double throughput, something shared is the bottleneck.' },
        ],
      },
      {
        id: 'latency',
        title: 'Latency vs throughput',
        blurb: 'Why latency explodes near 100% utilization.',
        minutes: 3,
        codex: 'latency-throughput',
        slides: [
          {
            t: 'Definitions',
            v: compare('Latency', ['Time for one request', 'Network + waiting + work', 'Measure p95 / p99'], 'Throughput', ['Requests per second', '≈ threads ÷ time per request']),
          },
          {
            t: 'A request\'s journey',
            v: diagram(fr('Each dot is a request; green dots are responses.', [U(), n('a', 'App Server', 'app', 1.6, 1), n('d', 'Database', 'db', 3.2, 1)], [l('u', 'a', { back: true }), l('a', 'd', { back: true, color: C.read })])),
          },
          { t: 'Queueing: why 90% busy hurts', v: { kind: 'widget', id: 'queueing' }, b: 'Response time ≈ work ÷ (1 − utilization). Plan for ~60–70% at peak.' },
          { t: 'Tail latency', b: 'A page that calls 100 backends is slow if **any** of them is slow. That\'s why you track p95/p99, not averages.' },
        ],
      },
      {
        id: 'scaling',
        title: 'Scaling up vs scaling out',
        blurb: 'Bigger boxes or more boxes.',
        minutes: 3,
        codex: 'scaling',
        slides: [
          {
            t: 'Vertical scaling',
            v: diagram(
              fr('One small server is overloaded…', [U(), n('a', 'App (S)', 'app', 2, 1, { state: 'hot' })], [l('u', 'a', { rate: 4, color: C.read })]),
              fr('…so buy a bigger one.', [U(), n('a', 'App (XL)', 'app', 2, 1, { state: 'new' })], [l('u', 'a', { rate: 4, color: C.read })]),
            ),
            b: 'Simple, no code changes. But cost grows faster than capacity, there\'s a ceiling, resizing means downtime, and it\'s still one machine.',
          },
          {
            t: 'Horizontal scaling',
            v: diagram(fr('A load balancer spreads requests over identical servers.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App', 'app', 2.6, 0), n('a2', 'App', 'app', 2.6, 1), n('a3', 'App', 'app', 2.6, 2)], [l('u', 'lb', { rate: 4 }), l('lb', 'a1'), l('lb', 'a2'), l('lb', 'a3')])),
            b: 'Cheap commodity machines, near-linear capacity, survives failures. Requires **stateless** servers.',
          },
          { t: 'Costs of scaling out', pts: ['Servers must be clones — no local state', 'Sessions move to a shared store', 'Databases see many more connections', 'More moving parts to operate'] },
        ],
      },
      {
        id: 'stateless',
        title: 'Stateless services',
        blurb: 'Why sessions don\'t belong on app servers.',
        minutes: 3,
        codex: 'stateless',
        slides: [
          {
            t: 'The sticky problem',
            v: diagram(
              fr('Alice logs in on App 1 — her session lives there.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App 1', 'app', 2.6, 0.4, { badge: 'Alice' }), n('a2', 'App 2', 'app', 2.6, 1.6)], [l('u', 'lb'), l('lb', 'a1')]),
              fr('Her next request lands on App 2, which has never heard of her. Logged out!', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App 1', 'app', 2.6, 0.4, { badge: 'Alice' }), n('a2', 'App 2', 'app', 2.6, 1.6, { state: 'hot' })], [l('u', 'lb'), l('lb', 'a2', { color: C.err })]),
              fr('Fix: every server reads sessions from a shared cache.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App 1', 'app', 2.4, 0.4), n('a2', 'App 2', 'app', 2.4, 1.6), n('s', 'Sessions', 'cache', 3.6, 1, { state: 'new' })], [l('u', 'lb'), l('lb', 'a1'), l('lb', 'a2'), l('a1', 's', { color: C.read, rate: 1 }), l('a2', 's', { color: C.read, rate: 1 })]),
            ),
          },
          { t: 'Sticky sessions?', b: 'IP-hash stickiness works until a server dies. With `hash mod N`, changing N re-maps about two thirds of users — mass logouts.' },
          { t: 'Cattle, not pets', b: 'With no state on servers you can add, remove, autoscale and redeploy freely. Sessions → Redis or signed tokens; uploads → object storage.' },
        ],
      },
      {
        id: 'autoscaling',
        title: 'Autoscaling',
        blurb: 'Capacity that follows traffic — with a delay.',
        minutes: 2,
        codex: 'autoscaling',
        slides: [
          {
            t: 'How it works',
            v: diagram(
              fr('Traffic rises; utilization crosses the threshold.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App', 'app', 2.6, 0.4, { state: 'hot' }), n('a2', 'App', 'app', 2.6, 1.6, { state: 'hot' })], [l('u', 'lb', { rate: 4 }), l('lb', 'a1', { rate: 3 }), l('lb', 'a2', { rate: 3 })]),
              fr('A new instance boots (~minutes in real clouds).', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App', 'app', 2.6, 0, { state: 'hot' }), n('a2', 'App', 'app', 2.6, 1, { state: 'hot' }), n('a3', 'Booting…', 'app', 2.6, 2, { state: 'dim' })], [l('u', 'lb', { rate: 4 }), l('lb', 'a1', { rate: 3 }), l('lb', 'a2', { rate: 3 })]),
              fr('Load spreads out.', [U(), n('lb', 'LB', 'lb', 1.2, 1), n('a1', 'App', 'app', 2.6, 0), n('a2', 'App', 'app', 2.6, 1), n('a3', 'App', 'app', 2.6, 2, { state: 'new' })], [l('u', 'lb', { rate: 4 }), l('lb', 'a1'), l('lb', 'a2'), l('lb', 'a3')]),
            ),
          },
          { t: 'It reacts after the fact', pts: ['Cover boot time with headroom or a queue', 'Pre-scale for known events', 'Always set a max (budget + runaway protection)', 'Signals: CPU, latency, queue depth'] },
        ],
      },
    ],
  },

  // =========================================================================
  {
    id: 'availability',
    title: 'Availability & Consistency',
    icon: 'Scale',
    color: '#38bdf8',
    blurb: 'CAP, consistency patterns, fail-over, replication and the nines.',
    lectures: [
      {
        id: 'cap',
        title: 'The CAP theorem',
        blurb: 'Partitions happen. Choose C or A.',
        minutes: 4,
        codex: 'cap',
        slides: [
          { t: 'Pick two', v: steps(['Consistency', 'Every read gets the latest write — or an error.'], ['Availability', 'Every request gets a non-error response (maybe stale).'], ['Partition tolerance', 'Keeps working when the network between nodes fails.']) },
          { t: 'P is not optional', b: 'Networks fail. So the real choice is what to do **during a partition**: refuse (CP) or answer with possibly stale data (AP).' },
          {
            t: 'A partition, live',
            v: diagram(
              fr('Two regions replicate to each other.', [n('us', 'DB · US', 'db', 0.4, 1), n('eu', 'DB · EU', 'db', 2.8, 1)], [l('us', 'eu', { color: C.repl, dashed: true }), l('eu', 'us', { color: C.repl, dashed: true })]),
              fr('The link fails.', [n('us', 'DB · US', 'db', 0.4, 1), n('eu', 'DB · EU', 'db', 2.8, 1), n('x', 'partition', 'note', 1.6, 0, { state: 'down' })], []),
              fr('CP: refuse writes that can\'t be replicated (errors, no conflicts).', [n('us', 'DB · US', 'db', 0.4, 1, { state: 'down' }), n('eu', 'DB · EU', 'db', 2.8, 1, { state: 'down' })], []),
              fr('AP: keep accepting writes on both sides; reconcile later (conflicts).', [n('us', 'DB · US', 'db', 0.4, 1, { badge: 'v7' }), n('eu', 'DB · EU', 'db', 2.8, 1, { badge: 'v9' })], []),
            ),
          },
          { t: 'Which one?', v: compare('CP', ['Banking, inventory', 'Leader election, locks', 'Needs atomic reads/writes'], 'AP', ['Feeds, likes, carts', 'Presence, DNS', 'Eventual consistency is fine']) },
        ],
      },
      {
        id: 'consistency',
        title: 'Consistency patterns',
        blurb: 'Weak, eventual, strong.',
        minutes: 3,
        codex: 'consistency',
        slides: [
          {
            t: 'Weak consistency',
            b: 'After a write, reads **may or may not** see it. Best effort.',
            pts: ['Memcached', 'VoIP, video chat', 'Realtime multiplayer games'],
          },
          {
            t: 'Eventual consistency',
            b: 'After a write, reads **will eventually** see it (usually milliseconds). Async replication.',
            v: diagram(
              fr('Write lands on A…', [n('a', 'Replica A', 'db', 0.3, 1, { badge: 'v2' }), n('b', 'Replica B', 'db', 2.7, 1, { badge: 'v1' })], [l('a', 'b', { color: C.repl, dashed: true, rate: 1 })]),
              fr('…and reaches B shortly after.', [n('a', 'Replica A', 'db', 0.3, 1, { badge: 'v2' }), n('b', 'Replica B', 'db', 2.7, 1, { badge: 'v2' })], []),
            ),
            pts: ['DNS', 'Email', 'Most NoSQL defaults'],
          },
          { t: 'Strong consistency', b: 'After a write, every read sees it. Sync replication. Needed for transactions.', pts: ['RDBMS', 'File systems'] },
          { t: 'Useful in-betweens', pts: ['Read-your-writes: you always see your own changes', 'Monotonic reads: you never go back in time'] },
        ],
      },
      {
        id: 'failover',
        title: 'Fail-over',
        blurb: 'Active-passive and active-active.',
        minutes: 3,
        codex: 'failover',
        slides: [
          {
            t: 'Active-passive',
            v: diagram(
              fr('Active serves; passive watches heartbeats.', [U(), n('a', 'Active', 'lb', 1.8, 0), n('p', 'Passive', 'lb', 1.8, 2, { state: 'dim' })], [l('u', 'a'), l('a', 'p', { dashed: true, rate: 1, color: C.repl, label: 'heartbeat' })]),
              fr('Active dies — heartbeats stop.', [U(), n('a', 'Active', 'lb', 1.8, 0, { state: 'down' }), n('p', 'Passive', 'lb', 1.8, 2)], [l('u', 'a', { color: C.err })]),
              fr('Passive takes over the IP.', [U(), n('a', 'Active', 'lb', 1.8, 0, { state: 'down' }), n('p', 'Now active', 'lb', 1.8, 2, { state: 'new' })], [l('u', 'p')]),
            ),
            b: 'Downtime depends on whether the standby is hot or cold.',
          },
          {
            t: 'Active-active',
            v: diagram(fr('Both serve traffic. If one dies, the other takes it all — so each needs spare capacity.', [U(), n('a', 'Server A', 'app', 2, 0.4), n('b', 'Server B', 'app', 2, 1.6)], [l('u', 'a'), l('u', 'b')])),
          },
          { t: 'Costs', pts: ['More hardware and complexity', 'Data loss if the active fails before replicating new writes'] },
        ],
      },
      {
        id: 'replication',
        title: 'Replication',
        blurb: 'Master-slave and master-master.',
        minutes: 4,
        codex: 'replication',
        slides: [
          {
            t: 'Master-slave (primary-replica)',
            v: diagram(fr('Writes go to the primary; reads spread over replicas.', [n('a', 'App', 'app', 0, 1), n('p', 'Primary', 'db', 1.6, 0.2), n('r1', 'Replica', 'db', 3, 0.9), n('r2', 'Replica', 'db', 1.6, 1.8)], [l('a', 'p', { color: C.write, rate: 1 }), l('a', 'r2', { color: C.read }), l('p', 'r1', { dashed: true, color: C.repl, rate: 1 }), l('p', 'r2', { dashed: true, color: C.repl, rate: 1 })])),
            b: 'Scales **reads**, not writes — every replica re-applies every write.',
          },
          { t: 'Replication lag', b: 'Replicas trail the primary. A user who just saved may read an old value from a replica (read-your-writes violation).' },
          {
            t: 'Master-master',
            v: diagram(fr('Both accept writes and sync with each other.', [n('a', 'App', 'app', 0, 1), n('m1', 'Master 1', 'db', 1.8, 0.4), n('m2', 'Master 2', 'db', 1.8, 1.6)], [l('a', 'm1', { color: C.write, rate: 1 }), l('a', 'm2', { color: C.write, rate: 1 }), l('m1', 'm2', { dashed: true, color: C.repl, rate: 1 })])),
            b: 'Either can fail. But either loosely consistent or slower writes, plus conflict resolution.',
          },
          { t: 'Sync vs async', v: compare('Async', ['Fast writes', 'Can lose recent writes on failover'], 'Sync', ['Writes wait for a replica', 'Zero loss (RPO = 0)']) },
        ],
      },
      {
        id: 'nines',
        title: 'Availability in numbers',
        blurb: 'Sequence vs parallel.',
        minutes: 3,
        codex: 'availability',
        slides: [
          { t: 'Three nines', v: big('8h 46m', 'downtime per year at 99.9%') },
          { t: 'Four nines', v: big('52m 36s', 'downtime per year at 99.99%', '#34d399') },
          {
            t: 'In sequence: multiply',
            v: diagram(fr('Every hop must work: 0.999 × 0.999 × 0.999 ≈ 99.7%', [n('lb', 'LB 99.9%', 'lb', 0, 1), n('a', 'App 99.9%', 'app', 1.4, 1), n('d', 'DB 99.9%', 'db', 2.8, 1)], [l('lb', 'a'), l('a', 'd')])),
          },
          {
            t: 'In parallel: protect',
            v: diagram(fr('Down only if both are down: 1 − 0.001² = 99.9999%', [n('lb', 'LB', 'lb', 0, 1), n('a', 'App 99.9%', 'app', 2, 0.4), n('b', 'App 99.9%', 'app', 2, 1.6)], [l('lb', 'a'), l('lb', 'b')])),
          },
          { t: 'MTBF & MTTR', b: 'Availability ≈ MTBF ÷ (MTBF + MTTR). You can\'t stop failures, so automate recovery: health checks, failover, fast restarts.' },
        ],
      },
    ],
  },
];

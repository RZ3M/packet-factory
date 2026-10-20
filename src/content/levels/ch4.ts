import type { TierId } from '../../engine/types';
import { COL, D, E, N, ROW, USERS, fan } from '../dsl';
import type { Level } from '../types';

const apps = (n: number, tier: TierId = 'M') => Array.from({ length: n }, (_, i) => N('app', COL[2], ROW(i + 1), { id: `a${i + 1}`, tier }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `a${i + 1}`);
const front = (n: number, tier: TierId = 'M') => [USERS({ y: ROW(2) }), N('lb', COL[1], ROW(2), { id: 'lb1' }), ...apps(n, tier)];
const frontEdges = (n: number) => [E('users', 'lb1'), ...fan(['lb1'], ids(n))];

export const ch4: Level[] = [
  // -------------------------------------------------------------------------
  {
    id: '4-1',
    chapter: 4,
    title: 'Heavy Lifting',
    tagline: 'Users upload photos. Thumbnails take forever.',
    brief: `Users now upload photos, and each upload needs **thumbnails generated** — a **Job** (purple) that takes ~250 ms of CPU.

Your app servers currently do this work **inside the web request**: the user waits, and worse, every web thread busy resizing images is a thread that can't serve page views. Watch read latency collapse.

Do the work **asynchronously**:
1. The app drops the job onto a **Message Queue** and immediately answers "upload received" (milliseconds).
2. A pool of **Workers** pulls jobs off the queue and grinds through them in the background.

Use the **Instances** setting on a Worker to run a whole pool from one box. Queues automatically spread work across instances.`,
    learn: ['Message and task queues', 'Moving slow work off the request path', 'Worker pools'],
    concepts: ['asynchronism', 'message-queues', 'latency-throughput'],
    palette: ['app', 'sql', 'lb', 'cache', 'queue', 'worker'],
    features: ['ha', 'cachePolicy', 'replication', 'instances'],
    duration: 60,
    warmup: 5,
    jobMs: 250,
    keyspace: { keys: 20000, skew: 1 },
    sources: [{ id: 'users', phases: [{ at: 0, rps: 600 }], mix: { read: 70, write: 10, job: 20 } }],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'p95', target: 100, star: 1 },
      { kind: 'jobP95', target: 5000, star: 1 },
      { kind: 'cost', target: 800, star: 2 },
      { kind: 'jobP95', target: 1000, star: 3 },
    ],
    start: D([...front(2), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'M' })], [...frontEdges(2), ...fan(ids(2), ['db1'])]),
    solution: D(
      [
        ...front(2),
        N('sql', COL[4], ROW(1), { id: 'db1', tier: 'M' }),
        N('queue', COL[3] + 2, ROW(3) + 1, { id: 'q1', name: 'Thumbnail Queue' }),
        N('worker', COL[4] + 4, ROW(3) + 1, { id: 'w1', tier: 'M', name: 'Thumbnailers', cfg: { instances: 5 } }),
      ],
      [...frontEdges(2), ...fan(ids(2), ['db1', 'q1']), E('q1', 'w1')],
    ),
    traps: [
      {
        name: 'just more app servers',
        design: D([...front(2, 'L'), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'M' })], [...frontEdges(2), ...fan(ids(2), ['db1'])]),
      },
    ],
    hints: [
      'Place a Message Queue and wire every App Server to it. Apps will hand jobs to the queue instead of doing them.',
      'Place a Worker and wire Queue → Worker. One worker instance won\'t keep up — raise Instances.',
      '120 jobs/s × 0.25 s each = 30 busy worker slots. A medium worker has 8.',
    ],
    debrief: `### What just happened
- The user's request now ends at the queue: **"accepted"** in a couple of milliseconds. The thumbnail shows up a moment later.
- Web threads are free to serve page views, so **read latency recovered**.
- Workers scale independently from the web tier — you size them for *job throughput*, not for page views.

### Asynchronism (primer)
Asynchronous workflows reduce request times for expensive operations that would otherwise be done in-line, and let you do time-consuming work in advance (pre-computing, batch jobs).

- **Message queues** receive, hold and deliver messages. The app publishes a job and tells the user it's in progress; a worker picks it up and signals completion. (Redis — simple but can lose messages; RabbitMQ — popular, AMQP; Amazon SQS — hosted, may deliver out of order, adds latency.)
- **Task queues** receive tasks plus their data, run them, and deliver results; they can schedule work and run computationally intensive jobs in the background (e.g. Celery).

**Disadvantage:** for cheap operations or real-time needs, queues add delay and complexity. The user also needs a way to learn the job finished (polling, websockets, notifications).

**Delivery guarantees:** most queues are *at-least-once* — a worker may crash after doing the work but before acknowledging, and the job runs again. Make jobs **idempotent**.`,
    quiz: [
      {
        q: 'Why did read latency improve after adding a queue, even though reads never touch it?',
        options: ['The queue caches reads', 'Web threads stopped being tied up by slow jobs', 'The database got faster', 'Reads were routed to workers'],
        answer: 1,
        explain: 'Inline jobs held web threads for hundreds of milliseconds. Offloading them freed capacity for everything else.',
      },
      {
        q: 'Most message queues guarantee at-least-once delivery. What should job handlers be?',
        options: ['Fast', 'Idempotent', 'Synchronous', 'Stateless'],
        answer: 1,
        explain: 'A job may run twice (e.g. a worker dies before acking). Idempotent handlers make retries safe.',
      },
      {
        q: 'When is a queue a poor fit?',
        options: ['Sending emails', 'Video encoding', 'A cheap operation the user needs the answer to right now', 'Generating reports'],
        answer: 2,
        explain: 'Queues add latency and complexity; for inexpensive or real-time operations, doing the work synchronously is simpler and faster.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '4-2',
    chapter: 4,
    title: 'The Flood',
    tagline: 'A marketing email goes out. Uploads 6× in seconds.',
    brief: `Steady traffic is easy. Then marketing emails a million people and **job submissions spike 6×** for about 20 seconds.

What happens to the jobs that can't be processed right away?
- An **unbounded queue** never says no. It grows and grows, and jobs wait minutes. Memory isn't infinite.
- A **bounded queue** applies **back pressure**: when full, new work is *rejected* so clients can back off and retry. Predictable — but rejections are failures.
- **Autoscaling** adds workers when the backlog grows — after they boot.

Find a combination that keeps job latency sane **and** rejects almost nothing, without paying for peak capacity all day.`,
    learn: ['Back pressure', 'Bounded vs unbounded queues', 'Autoscaling and its reaction time'],
    concepts: ['back-pressure', 'message-queues', 'autoscaling'],
    palette: ['app', 'sql', 'lb', 'cache', 'queue', 'worker'],
    features: ['ha', 'cachePolicy', 'replication', 'instances', 'autoscale'],
    duration: 90,
    warmup: 5,
    jobMs: 250,
    keyspace: { keys: 20000, skew: 1 },
    sources: [
      {
        id: 'users',
        phases: [
          { at: 0, rps: 500 },
          { at: 25, rps: 500 },
          { at: 30, rps: 1200, mix: { read: 70, write: 5, job: 25 } },
          { at: 50, rps: 1200 },
          { at: 55, rps: 500, mix: { read: 80, write: 10, job: 10 } },
        ],
        mix: { read: 80, write: 10, job: 10 },
      },
    ],
    chaos: [{ at: 28, type: 'notice', note: '📧 The marketing email just went out…' }],
    objectives: [
      { kind: 'success', target: 99, star: 1 },
      { kind: 'jobP95', target: 30000, star: 1 },
      { kind: 'p95', target: 100, types: ['read'], star: 1 },
      { kind: 'cost', target: 1000, star: 2 },
      { kind: 'jobP95', target: 12000, star: 3 },
    ],
    start: D(
      [
        ...front(2),
        N('sql', COL[4], ROW(1), { id: 'db1', tier: 'M' }),
        N('queue', COL[3] + 2, ROW(3) + 1, { id: 'q1', cfg: { maxDepth: 500 } }),
        N('worker', COL[4] + 4, ROW(3) + 1, { id: 'w1', tier: 'M', cfg: { instances: 2 } }),
      ],
      [...frontEdges(2), ...fan(ids(2), ['db1', 'q1']), E('q1', 'w1')],
    ),
    solution: D(
      [
        ...front(2),
        N('sql', COL[4], ROW(1), { id: 'db1', tier: 'M' }),
        N('queue', COL[3] + 2, ROW(3) + 1, { id: 'q1', cfg: { maxDepth: 10000 } }),
        N('worker', COL[4] + 4, ROW(3) + 1, { id: 'w1', tier: 'M', cfg: { instances: 2, autoscale: true, maxInstances: 10 } }),
      ],
      [...frontEdges(2), ...fan(ids(2), ['db1', 'q1']), E('q1', 'w1')],
    ),
    traps: [
      {
        name: 'unbounded queue, fixed workers',
        design: D(
          [
            ...front(2),
            N('sql', COL[4], ROW(1), { id: 'db1', tier: 'M' }),
            N('queue', COL[3] + 2, ROW(3) + 1, { id: 'q1', cfg: { maxDepth: 0 } }),
            N('worker', COL[4] + 4, ROW(3) + 1, { id: 'w1', tier: 'M', cfg: { instances: 2 } }),
          ],
          [...frontEdges(2), ...fan(ids(2), ['db1', 'q1']), E('q1', 'w1')],
        ),
      },
      {
        name: 'provision for peak all day',
        maxStars: 1,
        design: D(
          [
            ...front(2),
            N('sql', COL[4], ROW(1), { id: 'db1', tier: 'M' }),
            N('queue', COL[3] + 2, ROW(3) + 1, { id: 'q1', cfg: { maxDepth: 10000 } }),
            N('worker', COL[4] + 4, ROW(3) + 1, { id: 'w1', tier: 'M', cfg: { instances: 14 } }),
          ],
          [...frontEdges(2), ...fan(ids(2), ['db1', 'q1']), E('q1', 'w1')],
        ),
      },
    ],
    hints: [
      'Run it as-is. The tiny queue (max 500) starts rejecting the moment the spike hits.',
      'A deeper queue absorbs the burst — but then two workers take minutes to drain it.',
      'Turn on Autoscaling for the workers and give them a sensible max. New instances need ~10 s to boot.',
    ],
    debrief: `### What just happened
The queue **absorbed the burst** while the autoscaler added workers. Once the spike passed, the backlog drained and the extra workers were released — you paid for peak capacity only while you needed it.

### Back pressure (primer)
If queues grow significantly, the queue size can become larger than memory — cache misses, disk reads, slower everything. **Back pressure** limits the queue size, keeping throughput high and response times good for jobs already in the queue. When full, clients get **busy / HTTP 503** and retry later, ideally with **exponential backoff** (and jitter, so retries don't arrive in synchronized waves).

### Autoscaling
Autoscaling reacts to a signal (CPU, queue depth) after the fact. Boot time is the gap you must cover — with a queue buffer, headroom, or pre-scaling before known events (that marketing email was not a surprise to marketing!).`,
    quiz: [
      {
        q: 'What does back pressure do when a queue is full?',
        options: ['Drops the oldest messages silently', 'Rejects new work so clients retry later', 'Adds more memory', 'Processes messages twice as fast'],
        answer: 1,
        explain: 'Bounded queues push back (e.g. 503 Busy) instead of growing without limit; clients retry with exponential backoff.',
      },
      {
        q: 'Why add jitter to exponential backoff?',
        options: ['To make retries faster', 'To avoid many clients retrying at exactly the same moments', 'To encrypt traffic', 'It is required by HTTP'],
        answer: 1,
        explain: 'Without jitter, clients that failed together retry together, creating synchronized load spikes.',
      },
      {
        q: 'A known 10× traffic spike happens every Monday at 9:00. Best approach?',
        options: ['Rely purely on reactive autoscaling', 'Scale out ahead of time (scheduled / predictive scaling)', 'Shrink the queue', 'Disable health checks'],
        answer: 1,
        explain: 'Reactive autoscaling lags by boot time. Predictable spikes should be pre-provisioned.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: '4-3',
    chapter: 4,
    title: 'Drinking from the Firehose',
    tagline: 'Bursty event ingestion. Provision for average, not peak.',
    brief: `You're ingesting **events** (teal) — clicks, transactions, telemetry. They arrive in **bursts**: quiet, then a wall of traffic, then quiet again.

Writing every event synchronously means sizing the database for the biggest burst — expensive, and still fragile.

Put a **queue between the app and the database**: apps accept events instantly, workers drain them into the database at a steady pace. The database only needs to keep up with the **average** rate.

Two catches:
- Events land in the database a little later → dashboards lag a few seconds behind (eventual consistency).
- The user was told "accepted". If a write is dropped later, that's **data loss**. Failed persists are retried — make sure they eventually succeed.`,
    learn: ['Queue-based load leveling', 'Async writes and eventual consistency', 'Provisioning for average vs peak'],
    concepts: ['asynchronism', 'message-queues', 'consistency'],
    palette: ['app', 'sql', 'lb', 'cache', 'queue', 'worker', 'widecolumn'],
    features: ['ha', 'cachePolicy', 'replication', 'instances', 'autoscale'],
    duration: 80,
    warmup: 5,
    keyspace: { keys: 30000, skew: 0.8 },
    sources: [
      {
        id: 'users',
        phases: [
          { at: 0, rps: 1200 },
          { at: 15, rps: 1200 },
          { at: 16, rps: 4200 },
          { at: 26, rps: 4200 },
          { at: 27, rps: 1200 },
          { at: 45, rps: 1200 },
          { at: 46, rps: 4200 },
          { at: 56, rps: 4200 },
          { at: 57, rps: 1200 },
        ],
        mix: { ingest: 85, read: 15 },
      },
    ],
    objectives: [
      { kind: 'success', target: 99.5, star: 1 },
      { kind: 'dataLoss', target: 0, star: 1 },
      { kind: 'jobP95', target: 15000, star: 1, label: 'Events persisted within 15 s (p95)' },
      { kind: 'cost', target: 900, star: 2 },
      { kind: 'p95', target: 70, star: 3 },
    ],
    start: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'L' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
    solution: D(
      [
        ...front(3),
        N('queue', COL[3] + 2, ROW(4), { id: 'q1', name: 'Event Queue', cfg: { maxDepth: 200000 } }),
        N('worker', COL[4] + 4, ROW(4), { id: 'w1', tier: 'S', name: 'Writers', cfg: { instances: 2 } }),
        N('sql', COL[5] + 4, ROW(1), { id: 'db1', tier: 'L' }),
      ],
      [...frontEdges(3), ...fan(ids(3), ['db1', 'q1']), E('q1', 'w1'), E('w1', 'db1')],
    ),
    traps: [
      {
        name: 'synchronous writes to a bigger database',
        maxStars: 1,
        design: D([...front(3), N('sql', COL[4], ROW(2), { id: 'db1', tier: 'XL' })], [...frontEdges(3), ...fan(ids(3), ['db1'])]),
      },
    ],
    hints: [
      'Wire App Servers → Queue → Worker → Database. Apps hand Ingest events to the queue automatically.',
      'Check the average ingest rate vs the database\'s ingest capacity. The queue covers the bursts; the database only needs the average.',
      'A deep queue (200k) gives room for bursts. Keep App Servers wired to the database for reads.',
    ],
    debrief: `### What just happened
This is **queue-based load leveling**: the queue soaks up bursts, workers drain at the rate the database can sustain. You sized the database for the **average** load instead of the **peak** — a big saving.

The price: events become visible a few seconds later (**eventual consistency**), and you must handle failures carefully — an acknowledged event that later fails to persist must be **retried** (here, failed writes go back on the queue). Real systems add a **dead-letter queue** for messages that keep failing.

This pattern shows up in the primer's **Mint.com** solution: transaction imports go through a queue to extraction workers, because users don't need their budget updated within milliseconds.

**A wide-column store** (Cassandra, Bigtable) would also eat this write load directly — a different trade-off: no queue delay, but you give up relational queries.`,
    quiz: [
      {
        q: 'Queue-based load leveling lets you size the database for…',
        options: ['Peak load', 'Average load (if consumers can tolerate delay)', 'Zero load', 'Read load only'],
        answer: 1,
        explain: 'The queue buffers bursts; workers drain at a sustainable rate, so the store needs average capacity plus a margin.',
      },
      {
        q: 'An event was acknowledged to the client, but persisting it failed. What prevents data loss?',
        options: ['A longer TTL', 'Retrying from a durable queue (with a dead-letter queue for poison messages)', 'Returning 200 OK again', 'Sharding'],
        answer: 1,
        explain: 'Durable queues keep the message until a consumer acknowledges success; failures are retried and eventually parked in a DLQ for inspection.',
      },
    ],
  },
];

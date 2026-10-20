import type { LessonStep } from '../types';
import { D, E, fan, node, users } from './kit';

const lbApps = () => [node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'M' }), node('app', 2, 2, 'a2', { tier: 'M' })];
const front = [E('users', 'lb'), ...fan(['lb'], ['a1', 'a2'])];
const apps = ['a1', 'a2'];

export const LESSONS_CH4: Record<string, LessonStep[]> = {
  // ---------------------------------------------------------------------------
  '4-1': [
    {
      title: 'Doing slow work inline',
      body: `Some work is slow: resizing images, encoding video, sending email, generating a report. If an App Server does it **inside the web request**:
- the user stares at a spinner for hundreds of milliseconds or more, and
- that web thread can't serve anyone else meanwhile, so **everything** slows down.

**Asynchronous** processing splits the work:
1. The app drops a **job** (purple) onto a **message queue** and immediately answers *"got it"*.
2. **Workers** pull jobs off the queue and do the heavy lifting in the background.

Both scenes: 400 req/s, 20% of them uploads that need ~250 ms of processing.`,
      demo: {
        level: { jobMs: 250, sources: [{ id: 'users', phases: [{ at: 0, rps: 400 }], mix: { read: 80, job: 20 } }] },
        stats: ['success', 'p95', 'jobP95', { node: 'a1', metric: 'util', label: 'App busy' }],
        scenes: [
          {
            label: 'Jobs done inline',
            design: D([users(), ...lbApps(), node('sql', 4, 1, 'db', { name: 'Database' })], [...front, ...fan(apps, ['db'])]),
            note: 'Web threads are tied up resizing images; page views wait behind them.',
            expect: [{ stat: 'p95', op: '>', value: 300 }],
          },
          {
            label: 'Queue + workers',
            design: D(
              [users(), ...lbApps(), node('sql', 4, 0, 'db', { name: 'Database' }), node('queue', 3, 2, 'q', { name: 'Job queue' }), node('worker', 4, 2, 'w', { tier: 'M', name: 'Workers ×4', cfg: { instances: 4 } })],
              [...front, ...fan(apps, ['db', 'q']), E('q', 'w')],
            ),
            note: 'Uploads are acknowledged in milliseconds; workers finish them a moment later.',
            expect: [{ stat: 'p95', op: '<', value: 100 }],
          },
        ],
      },
    },
    {
      title: 'How message queues behave',
      body: `A **message queue** receives, holds and delivers messages. Producers and consumers no longer need to be up, fast, or scaled at the same time.

Things to know for interviews:
- **Acknowledgements** — a worker acks a message only after finishing it. If it dies first, the message is redelivered.
- **At-least-once delivery** — so a job can run **twice**. Make handlers **idempotent** (running twice = running once), e.g. dedupe on a job ID.
- **Ordering** — many queues (e.g. SQS standard) don't guarantee order; partitioned logs (Kafka) order within a partition.
- **Dead-letter queue** — messages that keep failing go somewhere to be inspected instead of retrying forever.

**Popular options:** Redis (simple, can lose messages), RabbitMQ (AMQP, you run it), Amazon SQS (hosted, may deliver twice), Kafka (durable, replayable log).`,
    },
    {
      title: 'Task queues & the catch',
      body: `A **task queue** (e.g. Celery) adds scheduling and result tracking on top: "run this function with these arguments, maybe at 3 am, tell me the result".

Workers scale **independently** of the web tier: size them for *job throughput* (jobs/s × seconds per job = busy workers needed), not for page views.

**The catch:** asynchrony adds delay and complexity. For cheap operations, or anything the user needs the answer to *right now*, just do it synchronously. And the user needs some way to learn the job finished: polling, websockets, or a notification.`,
      tip: `Place a **Message Queue** and Shift-wire the App Servers to it: apps hand jobs to the queue automatically. Wire **Queue → Worker**. Use a worker's **Instances** setting to run a whole pool from one box.`,
    },
  ],

  // ---------------------------------------------------------------------------
  '4-2': [
    {
      title: 'When work arrives faster than you can do it',
      body: `Queues absorb **bursts**, but if work keeps arriving faster than workers finish it, the queue grows without limit. Jobs wait minutes; eventually memory runs out.

**Back pressure** bounds the queue: when it's full, new work is **rejected** (HTTP 503 *"busy, try later"*) instead of piling up. Jobs already queued stay fast; the overflow becomes errors that clients can retry.

**Autoscaling** adds workers when the backlog grows — but only after they boot.

All three scenes get the same 6-second burst of uploads:`,
      demo: {
        level: {
          duration: 20,
          jobMs: 250,
          sources: [{ id: 'users', phases: [{ at: 0, rps: 60 }, { at: 3, rps: 60 }, { at: 3.1, rps: 260 }, { at: 9, rps: 260 }, { at: 9.1, rps: 60 }], mix: { job: 100 } }],
        },
        stats: ['success', 'jobP95', { node: 'q', metric: 'queue', label: 'Queued' }, { node: 'w', metric: 'util', label: 'Workers busy' }],
        scenes: [
          {
            label: 'Unbounded queue',
            design: D([users(), node('app', 1, 1, 'a1', { tier: 'M' }), node('queue', 2, 1, 'q', { name: 'Queue (∞)', cfg: { maxDepth: 0 } }), node('worker', 3, 1, 'w', { tier: 'M', name: 'Workers ×2', cfg: { instances: 2 } })], [E('users', 'a1'), E('a1', 'q'), E('q', 'w')]),
            note: 'Nothing is rejected, but the backlog takes ages to drain — jobs wait many seconds.',
            expect: [{ stat: 'jobP95', op: '>', value: 3000 }],
          },
          {
            label: 'Bounded (back pressure)',
            design: D([users(), node('app', 1, 1, 'a1', { tier: 'M' }), node('queue', 2, 1, 'q', { name: 'Queue (max 500)', cfg: { maxDepth: 500 } }), node('worker', 3, 1, 'w', { tier: 'M', name: 'Workers ×2', cfg: { instances: 2 } })], [E('users', 'a1'), E('a1', 'q'), E('q', 'w')]),
            note: 'The queue stays short and fast; the overflow is rejected for clients to retry.',
            expect: [{ stat: 'success', op: '<', value: 99 }],
          },
          {
            label: 'Autoscaling workers',
            design: D(
              [users(), node('app', 1, 1, 'a1', { tier: 'M' }), node('queue', 2, 1, 'q', { name: 'Queue' }), node('worker', 3, 1, 'w', { tier: 'M', name: 'Workers (auto)', cfg: { instances: 2, autoscale: true, maxInstances: 8 } })],
              [E('users', 'a1'), E('a1', 'q'), E('q', 'w')],
            ),
            note: 'Watch the ×N badge: new workers boot ~10 s after the backlog appears.',
          },
        ],
      },
    },
    {
      title: 'Retries, backoff and jitter',
      body: `A rejected client should **retry** — carefully:

- **Exponential backoff**: wait 1 s, then 2 s, 4 s, 8 s… so a struggling system gets breathing room.
- **Jitter**: add randomness to each wait. Otherwise thousands of clients that failed together retry *together*, hitting you in synchronized waves (a **retry storm**).
- **Retry budgets**: cap how many retries are in flight.

Related tools: **rate limiting** (cap each client up front), **load shedding** (drop low-priority work first), **circuit breakers** (stop calling a failing dependency for a while and fail fast).`,
    },
    {
      title: 'Autoscaling has a reaction time',
      body: `Autoscaling watches a signal (CPU, queue depth) and adds instances when it's high, removes them when it's low. It is **reactive**: by the time it notices and a new instance boots, the spike has already hit.

Cover the gap with:
- **headroom** (don't run at 95% normally),
- a **queue buffer** for latency-tolerant work,
- **scheduled or predictive scaling** for known peaks (a marketing email is not a surprise to marketing).

Always set a **maximum** so a bug or attack can't scale your bill to infinity.`,
      tip: `On a Worker, turn on **Autoscaling** and set **Max instances**. On the Message Queue, **Max depth** controls back pressure (Unbounded never rejects).`,
    },
  ],

  // ---------------------------------------------------------------------------
  '4-3': [
    {
      title: 'Queue-based load leveling',
      body: `Event ingestion (clicks, transactions, telemetry — teal dots) tends to arrive in **bursts**. Writing every event synchronously means sizing the database for the **biggest** burst.

Put a **queue** between the app and the database: the app acknowledges each event instantly; **workers drain** the queue at a pace the database can sustain. Now the database only needs to handle the **average** rate.

Both scenes get the same bursty stream. Writing directly, the database chokes during each burst. Through a queue, the backlog grows during bursts and drains in the quiet periods.`,
      demo: {
        level: {
          duration: 20,
          sources: [{ id: 'users', phases: [{ at: 0, rps: 1000 }, { at: 4, rps: 1000 }, { at: 4.1, rps: 4000 }, { at: 9, rps: 4000 }, { at: 9.1, rps: 1000 }], mix: { ingest: 100 } }],
        },
        stats: ['success', 'jobP95', { node: 'db', metric: 'util', label: 'DB busy' }, { node: 'q', metric: 'queue', label: 'Backlog' }],
        scenes: [
          {
            label: 'Direct writes',
            design: D([users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 2, 'a2', { tier: 'L' }), node('sql', 4, 1, 'db', { tier: 'M', name: 'Database (M)' })], [E('users', 'lb'), ...fan(['lb'], apps), ...fan(apps, ['db'])]),
            expect: [{ stat: 'success', op: '<', value: 98 }],
          },
          {
            label: 'Through a queue',
            design: D(
              [users(), node('lb', 1, 1, 'lb'), node('app', 2, 0, 'a1', { tier: 'L' }), node('app', 2, 2, 'a2', { tier: 'L' }), node('queue', 3, 1, 'q', { name: 'Event queue', cfg: { maxDepth: 200000 } }), node('worker', 4, 1, 'w', { tier: 'S', name: 'Writers ×2', cfg: { instances: 2 } }), node('sql', 5, 1, 'db', { tier: 'M', name: 'Database (M)' })],
              [E('users', 'lb'), ...fan(['lb'], apps), ...fan(apps, ['q']), E('q', 'w'), E('w', 'db')],
            ),
            expect: [{ stat: 'success', op: '>', value: 99.5 }],
          },
        ],
      },
    },
    {
      title: 'The price: eventual consistency',
      body: `Queued writes land in the database **a little later**. Dashboards and reports lag by however deep the backlog is — that's **eventual consistency**. For analytics, budgets and feeds that's usually fine; for "did my payment go through?" it isn't.

Two more things to get right:
- **Don't lose acknowledged events.** The user was told "received". Use a durable queue, retry failed writes, and send poison messages to a **dead-letter queue**.
- **Make writes idempotent.** Retries and at-least-once delivery mean duplicates; dedupe on an event ID.

This exact pattern is in the primer's **Mint.com** solution: bank transactions are pulled into a queue and processed by workers, because nobody needs their budget updated within milliseconds.`,
      tip: `Wire **App Servers → Queue → Worker → Database**. Ingest events go to the queue automatically; keep App → Database wires for reads. A deep queue gives bursts room to land.`,
    },
  ],
};

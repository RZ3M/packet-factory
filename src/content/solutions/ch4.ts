import type { SolutionExplain } from '../types';

export const SOLUTIONS_CH4: Record<string, SolutionExplain> = {
  '4-1': {
    idea: `120 thumbnail jobs per second at ~250 ms each is **30 busy threads** of pure batch work. Done inline, that work blocks web threads and every page view waits behind it.

Move it **off the request path**: apps hand jobs to a queue in ~5 ms and answer "upload received". A worker pool processes them in the background. Worker capacity: 5 medium instances × 8 threads = 40 → **~75%**.`,
    choices: [
      {
        node: 'q1',
        title: 'Message queue between apps and workers',
        why: `It decouples the two tiers in time: the user's request ends at the queue, and workers can run at their own pace. The upload request now costs the app ~9 ms instead of ~375 ms.`,
      },
      {
        node: 'w1',
        title: 'Worker pool: medium × 5 instances',
        why: `Sized for job throughput, not page views: 120 jobs/s × 0.25 s = 30 busy threads → 40 threads gives ~75% and keeps job latency well under a second. Instances let one box represent a whole pool behind the queue.`,
      },
      {
        node: 'a1',
        title: 'App servers stay medium',
        why: `With jobs gone, they only serve reads and writes: ~600 × 12 ms ≈ 7 busy threads across 32. Page-view latency recovers immediately.`,
      },
    ],
    whyNot: {
      'just more app servers': `Larger app servers have enough threads to do the jobs inline — but every upload still takes ~375 ms+ in the user's request. With 20% of requests that slow, overall p95 is ~530 ms. Capacity was never the only problem; *where* the work happens was.`,
    },
    takeaway: `Anything slow that the user doesn't need to wait for belongs on a queue. Mention at-least-once delivery and idempotent jobs.`,
  },

  '4-2': {
    idea: `Normal load: ~50 jobs/s → 2 medium workers (64 jobs/s capacity, ~78%). The spike: ~300 jobs/s for ~20 s.

Three things work together:
- A **deep queue (10k)** absorbs the spike instead of rejecting it.
- **Autoscaling** adds workers as the backlog grows (each needs ~10 s to boot), up to a max of 10.
- After the spike, the backlog drains and instances are released — you pay for peak capacity only for a minute.`,
    choices: [
      {
        node: 'q1',
        title: 'Queue max depth 10k',
        why: `Big enough to hold the burst while the autoscaler catches up (the backlog peaks at a few thousand), small enough that work never waits more than seconds. 500 rejects immediately; unbounded hides a growing backlog.`,
      },
      {
        node: 'w1',
        title: 'Workers: 2 instances, autoscaling to max 10',
        why: `Two cover the steady state. When the backlog grows, new instances boot; ~10 × 32 jobs/s covers the spike. Average cost stays near $900 instead of paying for 14 workers all day.`,
      },
    ],
    whyNot: {
      'unbounded queue, fixed workers': `Nothing is rejected, but two workers drain only ~64 jobs/s. The spike's backlog takes over a minute to clear, so job p95 hits ~45 s.`,
      'provision for peak all day': `Fourteen workers handle everything instantly, but you pay for peak capacity 100% of the time: ~$1,435/mo for a spike that lasts 20 seconds.`,
    },
    takeaway: `Bound your queues (back pressure), retry with exponential backoff and jitter, and remember autoscaling reacts after the fact — cover the boot gap.`,
  },

  '4-3': {
    idea: `Ingest arrives in bursts: ~1,000 events/s normally, ~3,600/s during bursts. A large SQL database ingests ~40 ÷ 15 ms ≈ **2,700 events/s** — less than the burst peak, but more than the **average** (~1,700/s).

Put a deep queue between the apps and the database: apps acknowledge events instantly, and workers write them at a pace the database can sustain. During bursts the backlog grows; in the quiet periods it drains.`,
    choices: [
      {
        node: 'q1',
        title: 'Event queue (200k)',
        why: `It holds a burst's worth of events so nothing is rejected. The backlog drains between bursts, so events land within a few seconds (persisted p95 ~6 s).`,
      },
      {
        node: 'w1',
        title: 'Two small writer workers',
        why: `Workers wait on the database: when it's saturated they leave work on the queue instead of piling more onto it (back pressure). That keeps the database at a sustainable pace and makes every write eventually succeed — zero lost events.`,
      },
      {
        node: 'db1',
        title: 'Database stays large',
        why: `Sized for the average plus headroom, not the peak. That's the whole point of load leveling: an XL would cost ~$570 more per month.`,
      },
    ],
    whyNot: {
      'synchronous writes to a bigger database': `An XL absorbs the bursts directly and passes, but you pay for peak capacity all the time (~$1,230/mo vs ~$760).`,
    },
    takeaway: `Queues let you provision for the average when consumers can tolerate delay. The cost is eventual consistency and the need to never drop an acknowledged message.`,
  },
};

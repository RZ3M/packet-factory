import type { SolutionExplain } from '../types';

const capCommon = {
  dns: `Geo routing sends each region's users to their local stack, so normal reads and writes stay in-region.`,
};

export const SOLUTIONS_CH5: Record<string, SolutionExplain> = {
  '5-1': {
    idea: `Any app server, load balancer, cache or database can die at random. Availability multiplies along the request path (LB × app × DB), so **every tier** needs a parallel copy:

| Tier | Redundancy | What a failure costs |
|---|---|---|
| Load balancer | HA pair | ~1 s takeover |
| App servers | 3 behind health checks (N+1) | ~2 s detection for ⅓ of traffic |
| Database | sync standby + auto failover + 2 replicas | writes pause ~8 s, reads never stop |`,
    choices: [
      {
        node: 'lb1',
        title: 'Load balancer HA pair',
        why: `The LB sits in front of everything — a single LB failure is a total outage until it reboots. The standby turns that into a one-second blip.`,
      },
      {
        node: 'a3',
        title: 'Three medium app servers',
        why: `1,500 req/s ≈ 18 busy threads. With one of three dead, two still give 32 threads (~57%). Health checks route around the dead one in ~2 s.`,
      },
      {
        node: 'db1',
        title: 'Primary with sync replication + automatic failover',
        why: `When the primary dies, the standby is promoted after ~8 s with every acknowledged write (sync). When the old primary reboots, it rejoins as a replica.`,
      },
      {
        node: 'r1',
        title: 'Two read replicas',
        why: `Reads keep flowing during a primary failover and survive a replica failing too. Two replicas, because the chaos monkey can hit one of them at any time.`,
      },
    ],
    whyNot: {
      'redundant apps, single database': `The web tier survives everything, but the database is still a single point of failure: each time it dies, every request that touches data fails until it reboots. Availability is limited by the weakest tier.`,
    },
    takeaway: `Availability ≈ MTBF ÷ (MTBF + MTTR). You can't stop failures, so remove single points of failure and shrink recovery time with automation.`,
  },

  '5-2': {
    idea: `Two goals: **fast reads everywhere** and **surviving a region outage**.
- **Geo-DNS** sends each user to the nearest healthy region.
- Each region gets a load balancer, app servers and a **local read replica**, so reads never cross an ocean (~50 ms instead of ~200 ms from Asia).
- Writes still go to the single US primary — simple and consistent, at the cost of cross-ocean latency for writes (10% of traffic).
- **TTL 10 s** means when Europe goes dark, European users are steered to the US within ~10 s instead of minutes.`,
    choices: [
      {
        node: 'dns',
        title: 'Geo-DNS with a 10-second TTL',
        why: `Geo routing picks the closest region; health checks remove a dead one. Resolvers cache answers for the TTL, so the TTL *is* your failover delay. 10 s costs more DNS lookups but keeps the outage to ~10 s for EU users.`,
      },
      {
        node: 'r_eu',
        title: 'Read replica in each region',
        why: `Reads are 90% of traffic; serving them from a local replica is what brings p95 for reads under the target. EU and US replicas are large because each must absorb the other region's users during an outage.`,
      },
      {
        node: 'db',
        title: 'One write primary in the US',
        why: `Multi-primary across regions would mean conflict resolution (the next two levels). A single primary keeps writes consistent; replicas lag by an ocean round trip, so some reads are slightly stale.`,
      },
      {
        node: 'a_eu1',
        title: 'Regional apps wired to their local replica and the US primary',
        why: `Apps send reads to the nearby replica and writes across to the primary. Wiring a regional app only to its replica would make writes fail.`,
      },
    ],
    whyNot: {
      'multi-region, but DNS TTL of 5 minutes': `Everything is in place, but resolvers keep handing European users the dead EU address for minutes — longer than the whole outage. About 13% of requests fail.`,
    },
    takeaway: `Multi-region = geo-routing + regional capacity + a data strategy. The simplest data strategy is one write primary with regional read replicas.`,
  },

  '5-3': {
    idea: `During the partition, the two primaries can't talk. With **synchronous** master-master replication, a write is only accepted once the other side confirms it. While the link is down, writes are **refused** — customers see errors for 20 seconds, but no account can ever be changed on both sides at once.

That's **CP**: consistent and partition-tolerant, giving up availability during the partition. Reads keep working the whole time.`,
    choices: [
      {
        node: 'db_us',
        title: 'Synchronous replication on both primaries',
        why: `Every write waits for the other region's acknowledgment (~85 ms extra). In exchange: zero conflicts and zero stale reads. During the partition the acknowledgment can't arrive, so writes fail instead of diverging.`,
      },
      {
        node: 'dns',
        title: 'Geo-DNS to each region',
        why: capCommon.dns,
      },
    ],
    takeaway: `CP for money, inventory and anything that needs atomic reads and writes. Say out loud what users experience during a partition: errors, not wrong balances.`,
  },

  '5-4': {
    idea: `Same topology, opposite business. A refused like is worse than a briefly wrong count, so choose **AP**: **asynchronous** replication. Each region commits locally and ships changes later. During the partition both sides keep accepting writes; when the link heals, the backlog replays and concurrent updates are resolved by last-write-wins.

Writes also get faster: no cross-ocean round trip per write.`,
    choices: [
      {
        node: 'db_us',
        title: 'Asynchronous replication on both primaries',
        why: `Writes are acknowledged after the local commit (~20 ms) instead of waiting ~85 ms for the other region. Availability stays at 100% through the partition. Conflicts happen — and for like counters, merging them is fine.`,
      },
      {
        node: 'dns',
        title: 'Geo-DNS to each region',
        why: capCommon.dns,
      },
    ],
    takeaway: `AP for feeds, likes, carts and presence. Mention how conflicts are resolved: last-write-wins, version vectors, or CRDTs (a like counter is a natural CRDT).`,
  },
};

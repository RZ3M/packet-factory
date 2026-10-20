// Objective scoring and the "advisor" that explains what went wrong.

import { CATALOG } from './catalog';
import { Hist } from './metrics';
import type { Simulation } from './sim';
import type { FailReason, Objective, ReqType } from './types';
import { FAIL_LABEL, REQ_META } from './types';

const HIGHER_IS_BETTER = new Set(['success', 'availability', 'offload']);

export function objectiveValue(sim: Simulation, o: Objective): number {
  const s = sim.stats;
  switch (o.kind) {
    case 'success': {
      if (o.types) {
        let off = 0,
          fail = 0;
        for (const t of o.types) {
          off += s.offeredByType[t] ?? 0;
          fail += s.failByType[t] ?? 0;
        }
        return off ? ((off - fail) / off) * 100 : 100;
      }
      return s.offered ? (s.ok / s.offered) * 100 : 100;
    }
    case 'p50':
    case 'p95':
    case 'p99': {
      const p = o.kind === 'p50' ? 0.5 : o.kind === 'p95' ? 0.95 : 0.99;
      if (o.types) {
        const h = new Hist();
        for (const t of o.types) h.merge(s.latByType[t]);
        return h.pct(p);
      }
      return s.lat.pct(p);
    }
    case 'cost':
      return s.costT ? s.costInt / s.costT : sim.costRate();
    case 'stale':
      return s.reads ? (s.stale / s.reads) * 100 : 0;
    case 'dataLoss':
      return s.dataLoss;
    case 'breaches':
      return s.breaches;
    case 'conflicts':
      return s.conflicts;
    case 'anomalies':
      return s.anomalies;
    case 'jobP95':
      return s.jobs.pct(0.95);
    case 'availability':
      return s.scoredSeconds ? (s.availSeconds / s.scoredSeconds) * 100 : 100;
    case 'offload': {
      const types = o.types ?? ['static'];
      let ok = 0,
        by = 0;
      for (const t of types) {
        const sb = s.servedBy[t] ?? {};
        for (const k in sb) {
          const v = sb[k as keyof typeof sb] ?? 0;
          ok += v;
          if (o.by?.includes(k as any)) by += v;
        }
      }
      return ok ? (by / ok) * 100 : 0;
    }
  }
}

export function objectiveMet(o: Objective, v: number): boolean {
  return HIGHER_IS_BETTER.has(o.kind) ? v >= o.target - 1e-9 : v <= o.target + 1e-9;
}

export function objectiveLabel(o: Objective): string {
  if (o.label) return o.label;
  const types = o.types ? ` (${o.types.map((t) => REQ_META[t].label).join(', ')})` : '';
  switch (o.kind) {
    case 'success':
      return `Success rate ≥ ${o.target}%${types}`;
    case 'p50':
      return `Median latency ≤ ${o.target} ms${types}`;
    case 'p95':
      return `p95 latency ≤ ${o.target} ms${types}`;
    case 'p99':
      return `p99 latency ≤ ${o.target} ms${types}`;
    case 'cost':
      return `Average cost ≤ $${o.target.toLocaleString()}/mo`;
    case 'stale':
      return `Stale reads ≤ ${o.target}%`;
    case 'dataLoss':
      return o.target === 0 ? 'Zero acknowledged writes lost' : `Lost writes ≤ ${o.target}`;
    case 'breaches':
      return o.target === 0 ? 'Zero security breaches' : `Breaches ≤ ${o.target}`;
    case 'conflicts':
      return o.target === 0 ? 'Zero write conflicts' : `Write conflicts ≤ ${o.target}`;
    case 'anomalies':
      return o.target === 0 ? 'Zero transaction anomalies' : `Anomalies ≤ ${o.target}`;
    case 'jobP95':
      return `Background jobs finish within ${fmtMs(o.target)} (p95)`;
    case 'availability':
      return `Availability ≥ ${o.target}% of seconds`;
    case 'offload':
      return `≥ ${o.target}% of ${(o.types ?? ['static']).map((t) => REQ_META[t].label).join('/')} served by ${(o.by ?? []).map((k) => CATALOG[k].name).join('/')}`;
  }
}

export function formatObjectiveValue(o: Objective, v: number): string {
  switch (o.kind) {
    case 'success':
    case 'availability':
    case 'offload':
      return `${v >= 99.95 && v < 100 ? v.toFixed(2) : v.toFixed(1)}%`;
    case 'stale':
      return `${v.toFixed(2)}%`;
    case 'p50':
    case 'p95':
    case 'p99':
    case 'jobP95':
      return fmtMs(v);
    case 'cost':
      return `$${Math.round(v).toLocaleString()}`;
    default:
      return Math.round(v).toLocaleString();
  }
}

export function fmtMs(ms: number): string {
  if (ms >= 10000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 10) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(1)} ms`;
}

export interface ObjectiveResult {
  obj: Objective;
  value: number;
  met: boolean;
}

export interface Evaluation {
  results: ObjectiveResult[];
  passed: boolean;
  stars: number;
}

export function evaluate(sim: Simulation, objectives: Objective[]): Evaluation {
  const results = objectives.map((obj) => {
    const value = objectiveValue(sim, obj);
    return { obj, value, met: objectiveMet(obj, value) };
  });
  const req = results.filter((r) => (r.obj.star ?? 1) === 1);
  const s2 = results.filter((r) => r.obj.star === 2);
  const s3 = results.filter((r) => r.obj.star === 3);
  const passed = req.every((r) => r.met);
  let stars = 0;
  if (passed) {
    stars = 1;
    if (s2.length === 0 || s2.every((r) => r.met)) stars = 2;
    if (stars === 2 && (s3.length === 0 || s3.every((r) => r.met))) stars = 3;
  }
  return { results, passed, stars };
}

// ---------------------------------------------------------------------------
// Advisor

export interface Issue {
  severity: 'bad' | 'warn' | 'info';
  title: string;
  detail: string;
  node?: string;
  codex?: string;
}

const REASON_ADVICE: Record<FailReason, { detail: string; codex?: string }> = {
  overload: {
    detail: 'Its queue filled up, so new requests were rejected with 503s. Add capacity: a bigger tier (vertical) or more instances behind a load balancer (horizontal), or take load off it with a cache.',
    codex: 'scaling',
  },
  timeout: {
    detail: 'Requests waited so long in its queue that clients gave up. Latency explodes as utilization approaches 100% — keep headroom.',
    codex: 'latency-throughput',
  },
  down: {
    detail: 'Requests were sent to a dead or still-booting server. Use health checks and redundancy so traffic routes around failures.',
    codex: 'availability',
  },
  noroute: {
    detail: 'It had nowhere to send some request types. Check that something downstream can handle them (e.g. a database for reads, object storage for static files).',
  },
  session: {
    detail: 'Users were logged out because their session lived on a different server. Make the web tier stateless: store sessions in a shared cache.',
    codex: 'stateless',
  },
  rejected: {
    detail: 'The queue was full and pushed back. That is back pressure working — but you need more workers to drain it, or a deeper queue for bursts.',
    codex: 'back-pressure',
  },
  readonly: {
    detail: 'Writes were sent to a read replica. Only the primary accepts writes.',
    codex: 'replication',
  },
  unavailable: {
    detail: 'Synchronous replication could not reach its peers, so writes were refused to stay consistent. That is CP behaviour: consistency over availability.',
    codex: 'cap',
  },
  notpersisted: {
    detail: 'Writes reached a server with no durable storage behind it. Connect a database.',
    codex: 'rdbms',
  },
  ratelimited: {
    detail: 'Legitimate users were throttled. Your rate limit may be too strict for real traffic.',
    codex: 'security',
  },
};

export function diagnose(sim: Simulation): Issue[] {
  const issues: Issue[] = [];
  const s = sim.stats;
  const total = Math.max(1, s.offered);

  // failures by node
  const rows: { node: string; reason: FailReason; n: number }[] = [];
  for (const id in s.failNodes) {
    const by = s.failNodes[id];
    for (const r in by) rows.push({ node: id, reason: r as FailReason, n: by[r as FailReason] ?? 0 });
  }
  rows.sort((a, b) => b.n - a.n);
  for (const r of rows.slice(0, 4)) {
    if (r.n / total < 0.002) continue;
    const n = sim.nodes.get(r.node);
    const name = n?.name ?? r.node;
    const adv = REASON_ADVICE[r.reason];
    issues.push({
      severity: r.n / total > 0.02 ? 'bad' : 'warn',
      title: `${name}: ${Math.round(r.n).toLocaleString()} requests failed — ${FAIL_LABEL[r.reason]}`,
      detail: adv.detail,
      node: r.node,
      codex: adv.codex,
    });
  }

  // saturated / idle nodes
  for (const n of sim.nodes.values()) {
    if (n.kind === 'users') continue;
    const h = n.view.utilHist;
    if (!h.length) continue;
    const avg = h.reduce((a, b) => a + b, 0) / h.length;
    const peak = Math.max(...h);
    if (peak > 0.95 && !issues.some((i) => i.node === n.id)) {
      issues.push({
        severity: 'warn',
        title: `${n.name} ran at ${Math.round(peak * 100)}% utilization at peak`,
        detail: 'Near 100% busy, queues form and latency climbs steeply (queueing theory). Aim for ~60–70% at peak.',
        node: n.id,
        codex: 'latency-throughput',
      });
    } else if (avg < 0.08 && n.view.cost >= 80 && sim.now > 20) {
      issues.push({
        severity: 'info',
        title: `${n.name} was mostly idle (${Math.round(avg * 100)}% avg)`,
        detail: 'Over-provisioned capacity costs money. Right-size it if you are chasing the budget star.',
        node: n.id,
      });
    }
  }

  if (s.reads > 0 && s.stale / s.reads > 0.005) {
    issues.push({
      severity: 'warn',
      title: `${((s.stale / s.reads) * 100).toFixed(1)}% of reads returned stale data`,
      detail: 'Caches without invalidation, long TTLs, lagging replicas, and eventually-consistent stores all serve old values for a while after a write.',
      codex: 'consistency',
    });
  }
  if (s.dataLoss > 0) {
    issues.push({
      severity: 'bad',
      title: `${Math.round(s.dataLoss).toLocaleString()} acknowledged writes were lost`,
      detail: 'Write-behind caches, async replication and dropped async jobs can all lose writes the user was told succeeded. Use synchronous paths where durability matters.',
      codex: 'cache-update',
    });
  }
  if (s.breaches > 0) {
    issues.push({
      severity: 'bad',
      title: `${Math.round(s.breaches).toLocaleString()} malicious payloads executed`,
      detail: 'Filter attacks at the edge (WAF) and defend in depth with parameterized queries in the app.',
      codex: 'security',
    });
  }
  if (s.conflicts > 0) {
    issues.push({
      severity: 'warn',
      title: `${Math.round(s.conflicts).toLocaleString()} write conflicts between primaries`,
      detail: 'Master-master replication lets two sides change the same record concurrently. Something must resolve conflicts (last-write-wins, CRDTs, or app logic).',
      codex: 'replication',
    });
  }
  if (s.anomalies > 0) {
    issues.push({
      severity: 'warn',
      title: `${Math.round(s.anomalies).toLocaleString()} transactions ran without ACID guarantees`,
      detail: 'Multi-row transactions on a store without transactions can leave half-applied state (double spends, oversold stock). Keep them on a relational database.',
      codex: 'sql-vs-nosql',
    });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return issues.slice(0, 7);
}

export function topTypeFailures(sim: Simulation): { type: ReqType; rate: number }[] {
  const s = sim.stats;
  const out: { type: ReqType; rate: number }[] = [];
  for (const t in s.offeredByType) {
    const ty = t as ReqType;
    const off = s.offeredByType[ty] ?? 0;
    if (!off) continue;
    out.push({ type: ty, rate: (s.failByType[ty] ?? 0) / off });
  }
  return out.sort((a, b) => b.rate - a.rate);
}

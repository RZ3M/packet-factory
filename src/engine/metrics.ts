// Latency histograms and per-run statistics.

import type { FailReason, NodeKind, ReqType } from './types';
import { REQ_TYPES } from './types';

const NB = 110;
const BASE = 0.1; // ms
const LOG_GROW = Math.log(1.15);

export function bucketOf(ms: number): number {
  if (ms <= BASE) return 0;
  return Math.min(NB - 1, Math.floor(Math.log(ms / BASE) / LOG_GROW) + 1);
}

export function bucketMs(i: number): number {
  return i === 0 ? BASE : BASE * Math.exp(i * LOG_GROW);
}

export class Hist {
  c = new Float64Array(NB);
  n = 0;
  add(ms: number, w = 1) {
    this.c[bucketOf(ms)] += w;
    this.n += w;
  }
  merge(h: Hist) {
    for (let i = 0; i < NB; i++) this.c[i] += h.c[i];
    this.n += h.n;
  }
  pct(p: number): number {
    if (this.n <= 0) return 0;
    const target = this.n * p;
    let acc = 0;
    for (let i = 0; i < NB; i++) {
      const c = this.c[i];
      if (acc + c >= target) {
        // interpolate inside the bucket (log-uniform)
        const lo = i === 0 ? 0 : bucketMs(i - 1);
        const hi = bucketMs(i);
        const f = c > 0 ? (target - acc) / c : 1;
        return i === 0 ? hi * f : lo * Math.pow(hi / lo, f);
      }
      acc += c;
    }
    return bucketMs(NB - 1);
  }
}

export interface SecondStats {
  t: number;
  offered: number; // legit requests that finished (ok + fail) this second
  ok: number;
  fail: number;
  failBy: Partial<Record<FailReason, number>>;
  okByType: Partial<Record<ReqType, number>>;
  lat: Hist;
  reads: number;
  stale: number;
  cost: number; // $/mo rate at this second
  jobsDone: number;
  bot: number;
  blocked: number;
}

export function newSecond(t: number): SecondStats {
  return { t, offered: 0, ok: 0, fail: 0, failBy: {}, okByType: {}, lat: new Hist(), reads: 0, stale: 0, cost: 0, jobsDone: 0, bot: 0, blocked: 0 };
}

export class RunStats {
  seconds: SecondStats[] = [];
  cur: SecondStats = newSecond(0);

  // scored totals (after warmup)
  offered = 0;
  ok = 0;
  fail = 0;
  failBy: Partial<Record<FailReason, number>> = {};
  failByType: Partial<Record<ReqType, number>> = {};
  offeredByType: Partial<Record<ReqType, number>> = {};
  lat = new Hist();
  latByType: Record<ReqType, Hist> = Object.fromEntries(REQ_TYPES.map((t) => [t, new Hist()])) as any;
  reads = 0;
  stale = 0;
  dataLoss = 0;
  breaches = 0;
  blocked = 0;
  conflicts = 0;
  anomalies = 0;
  dupes = 0;
  jobs = new Hist();
  jobsDone = 0;
  jobsFailed = 0;
  botServed = 0;
  costInt = 0;
  costT = 0;
  scoredSeconds = 0;
  availSeconds = 0;
  servedBy: Partial<Record<ReqType, Partial<Record<NodeKind, number>>>> = {};
  failNodes: Record<string, Partial<Record<FailReason, number>>> = {};

  scoring = false;

  recordOk(type: ReqType, ms: number, w: number, kind: NodeKind) {
    const c = this.cur;
    c.offered += w;
    c.ok += w;
    c.okByType[type] = (c.okByType[type] ?? 0) + w;
    c.lat.add(ms, w);
    if (!this.scoring) return;
    this.offered += w;
    this.ok += w;
    this.offeredByType[type] = (this.offeredByType[type] ?? 0) + w;
    this.lat.add(ms, w);
    this.latByType[type].add(ms, w);
    const sb = (this.servedBy[type] ??= {});
    sb[kind] = (sb[kind] ?? 0) + w;
  }

  recordFail(type: ReqType, reason: FailReason, w: number, nodeId: string) {
    const c = this.cur;
    c.offered += w;
    c.fail += w;
    c.failBy[reason] = (c.failBy[reason] ?? 0) + w;
    if (!this.scoring) return;
    this.offered += w;
    this.fail += w;
    this.failBy[reason] = (this.failBy[reason] ?? 0) + w;
    this.failByType[type] = (this.failByType[type] ?? 0) + w;
    this.offeredByType[type] = (this.offeredByType[type] ?? 0) + w;
    const fn = (this.failNodes[nodeId] ??= {});
    fn[reason] = (fn[reason] ?? 0) + w;
  }

  recordRead(stale: boolean, w: number) {
    this.cur.reads += w;
    if (stale) this.cur.stale += w;
    if (!this.scoring) return;
    this.reads += w;
    if (stale) this.stale += w;
  }

  recordJob(ms: number, w: number) {
    this.cur.jobsDone += w;
    if (!this.scoring) return;
    this.jobs.add(ms, w);
    this.jobsDone += w;
  }

  add(field: 'dataLoss' | 'breaches' | 'blocked' | 'conflicts' | 'anomalies' | 'dupes' | 'jobsFailed' | 'botServed', w: number) {
    if (field === 'blocked') this.cur.blocked += w;
    if (field === 'botServed') this.cur.bot += w;
    if (!this.scoring && field !== 'dataLoss') return;
    this[field] += w;
  }

  /** Close the current one-second bucket. */
  roll(t: number, cost: number) {
    this.cur.cost = cost;
    this.seconds.push(this.cur);
    if (this.scoring) {
      this.scoredSeconds++;
      if (this.cur.offered === 0 || this.cur.ok / this.cur.offered >= 0.99) this.availSeconds++;
    }
    if (this.seconds.length > 1200) this.seconds.shift();
    this.cur = newSecond(t);
  }

  /** Merge the last n seconds for a live view. */
  recent(n: number) {
    const h = new Hist();
    let ok = 0,
      offered = 0,
      reads = 0,
      stale = 0,
      jobs = 0;
    const failBy: Partial<Record<FailReason, number>> = {};
    const okByType: Partial<Record<ReqType, number>> = {};
    const list = this.seconds.slice(-n);
    for (const s of list) {
      h.merge(s.lat);
      ok += s.ok;
      offered += s.offered;
      reads += s.reads;
      stale += s.stale;
      jobs += s.jobsDone;
      for (const k in s.failBy) failBy[k as FailReason] = (failBy[k as FailReason] ?? 0) + (s.failBy[k as FailReason] ?? 0);
      for (const k in s.okByType) okByType[k as ReqType] = (okByType[k as ReqType] ?? 0) + (s.okByType[k as ReqType] ?? 0);
    }
    const secs = Math.max(1, list.length);
    return {
      rps: offered / secs,
      okRps: ok / secs,
      success: offered ? ok / offered : 1,
      p50: h.pct(0.5),
      p95: h.pct(0.95),
      p99: h.pct(0.99),
      staleRate: reads ? stale / reads : 0,
      failBy,
      okByType,
      jobsPerSec: jobs / secs,
    };
  }
}

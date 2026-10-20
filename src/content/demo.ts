// Shared helpers for lesson demos: build a tiny SimLevel for a scene and read stats from it.

import { objectiveValue } from '../engine/evaluate';
import type { Simulation } from '../engine/sim';
import type { SimLevel } from '../engine/types';
import type { DemoExpect, DemoScene, DemoSpec, DemoStat, DemoStatKey } from './types';

export const DEMO_DEFAULTS: SimLevel = {
  duration: 16,
  warmup: 1,
  keyspace: { keys: 5000, skew: 1, staticKeys: 1500, staticSkew: 0.9 },
  sources: [{ id: 'users', phases: [{ at: 0, rps: 300 }], mix: { read: 100 } }],
  timeout: 3,
  seed: 4242,
};

export function demoLevel(spec: DemoSpec, scene: DemoScene): SimLevel & { objectives: [] } {
  return { ...DEMO_DEFAULTS, ...(spec.level ?? {}), ...(scene.level ?? {}), objectives: [] };
}

export function statValue(sim: Simulation, key: DemoStatKey | string): number {
  if (key.includes('.')) {
    const [id, metric] = key.split('.');
    const v = sim.nodes.get(id)?.view;
    if (!v) return 0;
    switch (metric) {
      case 'util':
        return v.util * 100;
      case 'hit':
        return v.hitRate * 100;
      case 'queue':
        return v.queue;
      case 'lag':
        return v.lag * 1000;
      case 'rps':
        return v.rps;
    }
    return 0;
  }
  const s = sim.stats;
  const r = s.recent(3);
  switch (key as DemoStatKey) {
    case 'rps':
      return r.rps;
    case 'success':
      return r.success * 100;
    case 'p95':
      return r.p95;
    case 'p50':
      return r.p50;
    case 'cost':
      return sim.costRate();
    case 'stale':
      return objectiveValue(sim, { kind: 'stale', target: 0 });
    case 'dataLoss':
      return s.dataLoss;
    case 'conflicts':
      return s.conflicts;
    case 'breaches':
      return s.breaches;
    case 'jobP95':
      return s.jobs.pct(0.95);
    case 'failed':
      return s.fail;
    case 'anomalies':
      return s.anomalies;
    case 'readP95':
      return s.latByType.read.pct(0.95);
  }
  return 0;
}

/** Whole-run versions of the rate stats, used by tests (more stable than a 3 s window). */
export function runStatValue(sim: Simulation, key: DemoExpect['stat']): number {
  switch (key) {
    case 'success':
      return objectiveValue(sim, { kind: 'success', target: 0 });
    case 'p95':
      return objectiveValue(sim, { kind: 'p95', target: 0 });
    case 'p50':
      return objectiveValue(sim, { kind: 'p50', target: 0 });
    default:
      return statValue(sim, key);
  }
}

export function statLabel(s: DemoStat): string {
  if (typeof s !== 'string') return s.label;
  return {
    rps: 'Traffic',
    success: 'Success',
    p95: 'p95',
    p50: 'p50',
    cost: '$/mo',
    stale: 'Stale',
    dataLoss: 'Lost writes',
    conflicts: 'Conflicts',
    breaches: 'Breaches',
    jobP95: 'Job p95',
    failed: 'Failed',
    anomalies: 'Anomalies',
    readP95: 'Read p95',
  }[s];
}

export function statKey(s: DemoStat): string {
  return typeof s === 'string' ? s : `${s.node}.${s.metric}`;
}

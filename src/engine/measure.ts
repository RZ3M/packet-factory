// Run a level in the background (in small chunks, so the UI stays responsive) and
// record how hard every component worked. Used by the "Why it works" breakdown.

import { CATALOG } from './catalog';
import { evaluate, type Evaluation } from './evaluate';
import { Simulation } from './sim';
import type { Design, NodeKind, Objective, SimLevel } from './types';

export interface NodeMeasure {
  id: string;
  name: string;
  kind: NodeKind;
  peakUtil: number; // 0..1+
  avgUtil: number;
  avgRps: number;
  failed: number;
}

export interface Measurement {
  ev: Evaluation;
  nodes: NodeMeasure[];
  cost: number;
  offered: number;
}

const cache = new Map<string, Promise<Measurement>>();

export function measureCached(key: string, level: SimLevel & { objectives: Objective[] }, design: Design): Promise<Measurement> {
  let p = cache.get(key);
  if (!p) {
    p = measure(level, design);
    cache.set(key, p);
  }
  return p;
}

export async function measure(level: SimLevel & { objectives: Objective[] }, design: Design): Promise<Measurement> {
  const sim = new Simulation(level, structuredClone(design));
  sim.visSample = 0;
  sim.fxSample = 0;
  sim.start();
  const acc = new Map<string, { peak: number; sum: number; rps: number; n: number }>();
  const warm = level.warmup ?? 5;
  let i = 0;
  while (!sim.finished) {
    sim.advance(1);
    sim.vis.length = 0;
    sim.fx.length = 0;
    if (sim.now > warm) {
      for (const [id, n] of sim.nodes) {
        if (n.kind === 'users') continue;
        const a = acc.get(id) ?? { peak: 0, sum: 0, rps: 0, n: 0 };
        a.peak = Math.max(a.peak, n.view.util);
        a.sum += n.view.util;
        a.rps += n.view.rps;
        a.n++;
        acc.set(id, a);
      }
    }
    if (++i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const nodes: NodeMeasure[] = [];
  for (const d of design.nodes) {
    if (d.kind === 'users') continue;
    const a = acc.get(d.id);
    nodes.push({
      id: d.id,
      name: d.name ?? CATALOG[d.kind].name,
      kind: d.kind,
      peakUtil: a ? a.peak : 0,
      avgUtil: a && a.n ? a.sum / a.n : 0,
      avgRps: a && a.n ? a.rps / a.n : 0,
      failed: Object.values(sim.stats.failNodes[d.id] ?? {}).reduce((s, v) => s + (v ?? 0), 0),
    });
  }
  return {
    ev: evaluate(sim, level.objectives),
    nodes,
    cost: sim.stats.costT ? sim.stats.costInt / sim.stats.costT : sim.costRate(),
    offered: sim.stats.offered,
  };
}

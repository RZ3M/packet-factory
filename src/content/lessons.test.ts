// Every lesson demo must run, and must show what its lesson text claims.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../engine/sim';
import { demoLevel, runStatValue } from './demo';
import { LEVELS } from './levels';

describe('lesson demos', () => {
  for (const level of LEVELS) {
    const steps = level.lesson ?? [];
    it(`${level.id} has a lesson`, () => {
      expect(steps.length).toBeGreaterThan(0);
    });
    steps.forEach((step, si) => {
      if (!step.demo) return;
      step.demo.scenes.forEach((scene) => {
        it(`${level.id} · ${step.title} · ${scene.label}`, () => {
          const lvl = demoLevel(step.demo!, scene);
          for (const src of lvl.sources) expect(scene.design.nodes.some((n) => n.id === src.id), `source ${src.id} needs a node`).toBe(true);
          const sim = new Simulation(lvl, structuredClone(scene.design));
          sim.start();
          while (!sim.finished) sim.advance(1);
          const got = (scene.expect ?? []).map((x) => ({ ...x, actual: runStatValue(sim, x.stat) }));
          const summary = got.map((g) => `${g.stat}=${g.actual.toFixed(1)} (want ${g.op} ${g.value})`).join(', ');
          if (summary) console.log(`[${level.id}#${si + 1}] ${scene.label}: ${summary}`);
          for (const g of got) {
            if (g.op === '<') expect(g.actual, `${scene.label}: ${g.stat}`).toBeLessThan(g.value);
            else expect(g.actual, `${scene.label}: ${g.stat}`).toBeGreaterThan(g.value);
          }
        });
      });
    });
  }
});

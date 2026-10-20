import { describe, expect, it } from 'vitest';
import { formatObjectiveValue, objectiveLabel, diagnose } from '../engine/evaluate';
import { runHeadless } from '../engine/headless';
import { LEVELS } from './levels';

const only = (globalThis as any).process?.env?.LEVEL as string | undefined;

describe('level balance', () => {
  for (const level of LEVELS) {
    if (only && !only.split(',').includes(level.id)) continue;
    it(`${level.id} ${level.title}: solution earns 3 stars, start design fails`, () => {
      const t0 = Date.now();
      const sol = runHeadless(level, level.solution);
      const start = runHeadless(level, level.start);
      const ms = Date.now() - t0;
      const lines = sol.ev.results.map((r, i) => {
        const s = start.ev.results[i];
        return `   ${r.met ? '✓' : '✗'} ${objectiveLabel(r.obj).padEnd(46)} sol=${formatObjectiveValue(r.obj, r.value).padEnd(9)} start=${formatObjectiveValue(s.obj, s.value)}`;
      });
      console.log(
        `\n[${level.id}] ${level.title}  stars=${sol.ev.stars} startPassed=${start.ev.passed} scale=${sol.sim.scale} (${ms}ms)\n${lines.join('\n')}` +
          (sol.ev.stars < 3 ? `\n   solution issues: ${diagnose(sol.sim).map((i) => i.title).join(' | ')}` : '') +
          `\n   start issues: ${diagnose(start.sim).slice(0, 2).map((i) => i.title).join(' | ')}`,
      );
      for (const trap of level.traps ?? []) {
        const r = runHeadless(level, trap.design);
        const bad = r.ev.results.filter((x) => !x.met).map((x) => `${objectiveLabel(x.obj)}=${formatObjectiveValue(x.obj, x.value)}`);
        console.log(`   trap "${trap.name}": passed=${r.ev.passed} stars=${r.ev.stars} misses: ${bad.join('; ')}`);
        if (trap.maxStars) expect(r.ev.stars, `trap "${trap.name}" should get at most ${trap.maxStars} stars`).toBeLessThanOrEqual(trap.maxStars);
        else expect(r.ev.passed, `trap "${trap.name}" should fail`).toBe(false);
      }
      expect(sol.ev.stars).toBe(3);
      if (level.id !== 'sandbox') expect(start.ev.passed).toBe(false);
    });
  }
});

// Debug helper: DEBUG=<levelId> prints the event log and per-second outcomes of the level's solution.
import { it } from 'vitest';
import { runHeadless } from './engine/headless';
import { LEVEL_BY_ID } from './content/levels';

const id = (globalThis as any).process?.env?.DEBUG as string | undefined;

it.runIf(!!id)('debug run', () => {
  const lvl = LEVEL_BY_ID.get(id!)!;
  const which = (globalThis as any).process?.env?.DESIGN ?? 'solution';
  const { sim } = runHeadless(lvl, which === 'start' ? lvl.start : lvl.solution);
  for (const l of sim.log) console.log(`${l.t.toFixed(1).padStart(6)}s [${l.level}] ${l.msg}`);
  const rows = sim.stats.seconds.map((s, i) => `${String(i).padStart(3)} ok=${Math.round(s.ok)} fail=${Math.round(s.fail)} ${JSON.stringify(s.failBy)}`);
  console.log(rows.filter((r) => !r.includes('fail=0 ')).join('\n'));
  console.log('failNodes', JSON.stringify(sim.stats.failNodes));
});

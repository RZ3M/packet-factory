// MEASURE=1 prints peak/avg utilization of every reference-design component (used to fact-check explanations).
import { it } from 'vitest';
import { measure } from './engine/measure';
import { LEVELS } from './content/levels';

const on = !!(globalThis as any).process?.env?.MEASURE;

it.runIf(on)('measure reference designs', async () => {
  for (const l of LEVELS) {
    const m = await measure(l, l.solution);
    const rows = m.nodes.map((n) => `${n.id}:${Math.round(n.peakUtil * 100)}/${Math.round(n.avgUtil * 100)}%@${Math.round(n.avgRps)}`).join('  ');
    console.log(`[${l.id}] stars=${m.ev.stars} cost=$${Math.round(m.cost)}  ${rows}`);
  }
}, 600000);

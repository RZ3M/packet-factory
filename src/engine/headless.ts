import { evaluate, type Evaluation } from './evaluate';
import { Simulation } from './sim';
import type { Design, Objective, SimLevel } from './types';

/** Run a level to completion without rendering. */
export function runHeadless(level: SimLevel & { objectives: Objective[] }, design: Design): { sim: Simulation; ev: Evaluation } {
  const sim = new Simulation(level, design);
  sim.visSample = 0;
  sim.fxSample = 0;
  sim.start();
  while (!sim.finished) {
    sim.advance(1);
    sim.vis.length = 0;
    sim.fx.length = 0;
  }
  return { sim, ev: evaluate(sim, level.objectives) };
}

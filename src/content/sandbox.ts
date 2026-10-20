import { PLACEABLE } from '../engine/catalog';
import { D, USERS } from './dsl';
import type { Level } from './types';

export const ALL_FEATURES = [
  'sessions',
  'sanitize',
  'instances',
  'autoscale',
  'l7',
  'ha',
  'cdnPush',
  'cachePolicy',
  'replication',
  'failover',
  'tuning',
  'federation',
  'consistency',
];

/** Free-build mode: everything unlocked, traffic controlled live from the UI. */
export const SANDBOX: Level = {
  id: 'sandbox',
  chapter: 0,
  title: 'Sandbox',
  tagline: 'Everything unlocked. Break things on purpose.',
  brief: `Build anything. Every component and setting is unlocked.

Use the **Traffic** panel to dial load and the request mix up or down while it runs, and the **Chaos** buttons to crash components or partition the network. There are no objectives — just you, your design, and the consequences.`,
  learn: [],
  concepts: [],
  palette: PLACEABLE,
  features: ALL_FEATURES,
  duration: 3600,
  warmup: 2,
  keyspace: { keys: 20000, skew: 1, staticKeys: 3000, staticSkew: 0.9 },
  sources: [{ id: 'users', phases: [{ at: 0, rps: 500 }], mix: { read: 80, write: 15, static: 5 }, users: 20000 }],
  scale: 2,
  sessions: false,
  objectives: [],
  start: D([USERS({ y: 14 })]),
  solution: D([USERS({ y: 14 })]),
  hints: [],
  debrief: '',
  quiz: [],
};

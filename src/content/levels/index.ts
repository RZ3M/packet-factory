import type { Chapter, Level } from '../types';
import { ch1 } from './ch1';
import { ch2 } from './ch2';
import { ch3 } from './ch3';
import { ch4 } from './ch4';
import { ch5 } from './ch5';
import { ch6 } from './ch6';
import { ch7 } from './ch7';
import { LESSONS } from '../lessons';
import { SOLUTIONS } from '../solutions';

export const CHAPTERS: Chapter[] = [
  { id: 1, title: 'Hello, Production', subtitle: 'Scaling basics', color: '#34d399', blurb: 'From one server to a fault-tolerant, horizontally scaled web tier.' },
  { id: 2, title: 'Need for Speed', subtitle: 'Caching & CDNs', color: '#fbbf24', blurb: 'Memory beats disk, edges beat oceans — and every cache is a consistency problem.' },
  { id: 3, title: 'Data Gravity', subtitle: 'Databases', color: '#818cf8', blurb: 'Replication, failover, sharding, federation, tuning — and when to leave SQL behind.' },
  { id: 4, title: 'Later, Please', subtitle: 'Asynchronism', color: '#c084fc', blurb: 'Queues, workers, back pressure and autoscaling: do the slow stuff somewhere else.' },
  { id: 5, title: 'Five Nines', subtitle: 'Availability & consistency', color: '#38bdf8', blurb: 'Redundancy math, global deployments, DNS failover — and the CAP theorem in practice.' },
  { id: 6, title: 'The Edge', subtitle: 'Proxies, security & services', color: '#f87171', blurb: 'Reverse proxies, attackers, and splitting the monolith into services that fail independently.' },
  { id: 7, title: 'The Interview Gauntlet', subtitle: 'Primer capstones', color: '#f5a524', blurb: 'The System Design Primer’s interview questions, run as full interviews: clarify, estimate, build, scale.' },
];

export const LEVELS: Level[] = [...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6, ...ch7];
for (const l of LEVELS) {
  l.lesson = LESSONS[l.id];
  l.explain = SOLUTIONS[l.id];
}

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

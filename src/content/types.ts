import type { Design, NodeKind, Objective, Region, SimLevel } from '../engine/types';

// ---------------------------------------------------------------------------
// Lessons

export type DemoStatKey = 'rps' | 'success' | 'p95' | 'p50' | 'cost' | 'stale' | 'dataLoss' | 'conflicts' | 'breaches' | 'jobP95' | 'failed' | 'anomalies' | 'readP95';
export type DemoStat = DemoStatKey | { node: string; metric: 'util' | 'hit' | 'queue' | 'lag' | 'rps'; label: string };

export interface DemoExpect {
  stat: DemoStatKey | `${string}.${'util' | 'hit' | 'queue' | 'lag' | 'rps'}`;
  op: '<' | '>';
  value: number;
}

export interface DemoScene {
  label: string;
  design: Design;
  note?: string;
  level?: Partial<SimLevel>;
  /** checked by the test suite so lesson text never lies */
  expect?: DemoExpect[];
}

export interface DemoSpec {
  scenes: DemoScene[];
  level?: Partial<SimLevel>;
  stats?: DemoStat[];
  regions?: BoardRegion[];
  speed?: number;
}

export type WidgetId = 'queueing' | 'zipf' | 'hashring' | 'latency';

export interface LessonStep {
  title: string;
  body: string; // markdown
  demo?: DemoSpec;
  widget?: WidgetId;
  tip?: string; // "how to use it in the game" callout
}

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export type TutorialCheck =
  | { type: 'node'; kind: NodeKind; count?: number }
  | { type: 'edge'; from: NodeKind; to: NodeKind }
  | { type: 'select'; kind: NodeKind }
  | { type: 'running' }
  | { type: 'tier'; kind: NodeKind; tier: string }
  | { type: 'config'; kind: NodeKind; key: string; value: any }
  | { type: 'manual' };

export interface TutorialStep {
  text: string;
  check: TutorialCheck;
}

export interface Estimate {
  q: string;
  answer: number;
  unit: string;
  tolerance: number; // relative, e.g. 0.3 = ±30%
  explain: string;
}

export interface Interview {
  prompt: string; // the interviewer's opening question
  clarify: QuizQ[]; // step 1: use cases, constraints, assumptions
  estimates: Estimate[]; // back-of-the-envelope
  reference: string; // markdown walkthrough of the reference design
}

export interface BoardRegion {
  region: Region;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Level extends SimLevel {
  id: string;
  chapter: number;
  title: string;
  tagline: string;
  brief: string; // markdown
  learn: string[];
  concepts: string[]; // codex ids
  palette: NodeKind[];
  features: string[];
  objectives: Objective[];
  start: Design;
  solution: Design;
  hints: string[];
  debrief: string; // markdown
  quiz: QuizQ[];
  tutorial?: TutorialStep[];
  board?: { regions?: BoardRegion[] };
  interview?: Interview;
  /** Why the reference solution works, choice by choice. */
  explain?: SolutionExplain;
  /** Multi-step lesson shown before the mission brief. */
  lesson?: LessonStep[];
  /** Tempting-but-wrong designs; the balance test asserts they fail. */
  traps?: { name: string; design: Design; maxStars?: number }[];
}

/** "Why it works": the reasoning behind a level's reference design. */
export interface SolutionChoice {
  node?: string; // id of the solution node this choice is about
  title: string;
  why: string; // markdown
}

export interface SolutionExplain {
  idea: string; // markdown: the core idea and the capacity math
  choices: SolutionChoice[];
  whyNot?: Record<string, string>; // keyed by trap name
  takeaway?: string;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
  color: string;
  blurb: string;
}

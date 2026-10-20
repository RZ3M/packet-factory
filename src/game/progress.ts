// Player progress, persisted in localStorage (best-effort: the game works without it).

import type { Design } from '../engine/types';

export interface LevelProgress {
  stars: number;
  completed: boolean;
  bestCost?: number;
  usedSolution?: boolean;
  quizCorrect?: number;
  quizTotal?: number;
}

export interface Progress {
  levels: Record<string, LevelProgress>;
  designs: Record<string, Design>;
  codexSeen: string[];
  lessonsSeen: string[];
  drillBest: number;
  napkinBest: number;
  settings: { unlockAll: boolean; speed: number; showTutorial: boolean };
}

const KEY = 'packet-factory-progress-v1';

const empty = (): Progress => ({
  levels: {},
  designs: {},
  codexSeen: [],
  lessonsSeen: [],
  drillBest: 0,
  napkinBest: 0,
  settings: { unlockAll: false, speed: 2, showTutorial: true },
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    const e = empty();
    return { ...e, ...p, settings: { ...e.settings, ...(p.settings ?? {}) } };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function resetProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

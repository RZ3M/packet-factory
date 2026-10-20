// Study-mode progress: finished lectures and a Leitner spaced-repetition box per card.
// Stored separately from the game's progress so neither can clobber the other.

import { create } from 'zustand';

const KEY = 'pf-study-v1';
const DAY = 86_400_000;
/** Days until a card in box n is due again. Box 0 = new / forgotten. */
export const BOX_DAYS = [0, 1, 3, 7, 16, 35];

export interface CardState {
  box: number;
  due: number; // epoch ms
  seen: number;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

interface StudyData {
  lectures: Record<string, number>; // lecture id -> completed at
  slide: Record<string, number>; // lecture id -> last slide index
  cards: Record<string, CardState>;
  last?: string; // last opened lecture id
  reviewDays: string[]; // yyyy-mm-dd days with at least one review
}

interface StudyState extends StudyData {
  completeLecture: (id: string) => void;
  setSlide: (id: string, i: number) => void;
  grade: (cardId: string, g: Grade) => void;
  resetCards: () => void;
}

function load(): StudyData {
  const empty: StudyData = { lectures: {}, slide: {}, cards: {}, reviewDays: [] };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function save(s: StudyData) {
  try {
    const { lectures, slide, cards, last, reviewDays } = s;
    localStorage.setItem(KEY, JSON.stringify({ lectures, slide, cards, last, reviewDays }));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function nextState(prev: CardState | undefined, g: Grade, now = Date.now()): CardState {
  const box = prev?.box ?? 0;
  const nb = g === 'again' ? 0 : g === 'hard' ? Math.max(1, box) : g === 'good' ? Math.min(box + 1, BOX_DAYS.length - 1) : Math.min(box + 2, BOX_DAYS.length - 1);
  const days = g === 'again' ? 0 : g === 'hard' ? Math.max(1, BOX_DAYS[nb] / 2) : BOX_DAYS[nb];
  return { box: nb, due: now + days * DAY, seen: (prev?.seen ?? 0) + 1 };
}

export const useStudy = create<StudyState>((set, get) => {
  const commit = (patch: Partial<StudyData>) => {
    set(patch);
    save(get());
  };
  return {
    ...load(),
    completeLecture: (id) => commit({ lectures: { ...get().lectures, [id]: Date.now() } }),
    setSlide: (id, i) => commit({ slide: { ...get().slide, [id]: i }, last: id }),
    grade: (cardId, g) => {
      const days = get().reviewDays;
      commit({
        cards: { ...get().cards, [cardId]: nextState(get().cards[cardId], g) },
        reviewDays: days.includes(today()) ? days : [...days, today()].slice(-60),
      });
    },
    resetCards: () => commit({ cards: {}, reviewDays: [] }),
  };
});

export const isDue = (s: CardState | undefined, now = Date.now()) => !s || s.due <= now;

/** Consecutive days (ending today or yesterday) with at least one review. */
export function streak(days: string[]): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date();
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

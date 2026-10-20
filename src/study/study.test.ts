import { describe, expect, it } from 'vitest';
import { CODEX } from '../content/codex';
import { CARDS, DECKS } from './content/cards';
import { LECTURES, TRACKS } from './content/index';
import { designToFrames, EXTRA_QUESTIONS, SOLVED } from './content/interview';
import { ARCHITECTURES, COMPANIES } from './content/library';
import { OOD } from './content/ood';
import { BOX_DAYS, nextState, streak } from './progress';
import type { DFrame } from './types';

const codexIds = new Set(CODEX.map((c) => c.id));

function checkFrames(frames: DFrame[], where: string) {
  expect(frames.length, where).toBeGreaterThan(0);
  for (const f of frames) {
    const ids = new Set(f.nodes.map((n) => n.id));
    expect(ids.size, `${where}: duplicate node ids`).toBe(f.nodes.length);
    for (const l of f.links) {
      expect(ids.has(l.from) && ids.has(l.to), `${where}: link ${l.from}->${l.to}`).toBe(true);
    }
    // node boxes are 70x46 on an 82x54 grid (see Visuals.tsx): boxes must not touch
    const clashes: string[] = [];
    f.nodes.forEach((a, i) =>
      f.nodes.slice(i + 1).forEach((b) => {
        const apart = Math.abs(a.x - b.x) * 82 >= 70 + 4 || Math.abs(a.y - b.y) * 54 >= 46 + 4;
        if (!apart) clashes.push(`${a.id}/${b.id}`);
      }),
    );
    expect(clashes, `${where} [${f.caption}]: overlapping nodes`).toEqual([]);
  }
}

describe('study content', () => {
  it('has unique lecture ids and valid codex links', () => {
    const ids = LECTURES.map((e) => e.lecture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { lecture } of LECTURES) {
      expect(lecture.slides.length, lecture.id).toBeGreaterThan(0);
      if (lecture.codex) expect(codexIds.has(lecture.codex), `${lecture.id} → ${lecture.codex}`).toBe(true);
    }
  });

  it('covers every codex topic in some lecture', () => {
    const covered = new Set(LECTURES.map((e) => e.lecture.codex).filter(Boolean));
    const missing = CODEX.filter((c) => !covered.has(c.id)).map((c) => c.id);
    // a few codex pages are folded into neighbouring lectures
    expect(missing.length, missing.join(', ')).toBeLessThanOrEqual(12);
  });

  it('has well-formed slides and diagrams', () => {
    for (const { lecture } of LECTURES) {
      for (const s of lecture.slides) {
        expect(s.t, lecture.id).toBeTruthy();
        expect(s.v || s.b || s.pts, `${lecture.id}/${s.t} is empty`).toBeTruthy();
        if (s.v?.kind === 'diagram') checkFrames(s.v.frames, `${lecture.id}/${s.t}`);
      }
    }
    expect(TRACKS.length).toBeGreaterThanOrEqual(10);
  });

  it('lays out every solved interview design', () => {
    expect(SOLVED.length).toBe(8);
    for (const l of SOLVED) checkFrames(designToFrames(l.solution, ''), l.id);
  });

  it('has OOD, library and extra-question content', () => {
    expect(OOD.map((o) => o.id)).toEqual(['hash-map', 'lru-cache', 'call-center', 'deck-of-cards', 'parking-lot', 'chat-server']);
    expect(EXTRA_QUESTIONS.length).toBeGreaterThanOrEqual(22);
    expect(ARCHITECTURES.length).toBe(17);
    expect(COMPANIES.length).toBeGreaterThanOrEqual(20);
  });

  it('has 150+ flashcards with unique ids in known decks', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    const decks = new Set(DECKS.map((d) => d.id));
    for (const c of CARDS) expect(decks.has(c.deck), c.id).toBe(true);
    for (const d of DECKS) expect(CARDS.some((c) => c.deck === d.id), d.id).toBe(true);
  });
});

describe('spaced repetition', () => {
  const DAY = 86_400_000;
  it('moves cards between boxes', () => {
    const a = nextState(undefined, 'good', 0);
    expect(a.box).toBe(1);
    expect(a.due).toBe(BOX_DAYS[1] * DAY);
    const b = nextState(a, 'easy', 0);
    expect(b.box).toBe(3);
    const c = nextState(b, 'again', 0);
    expect(c.box).toBe(0);
    expect(c.due).toBe(0);
    expect(nextState({ box: 5, due: 0, seen: 9 }, 'easy', 0).box).toBe(5);
  });
  it('counts streaks', () => {
    const d = (n: number) => {
      const x = new Date();
      x.setDate(x.getDate() - n);
      return x.toISOString().slice(0, 10);
    };
    expect(streak([d(0), d(1), d(2)])).toBe(3);
    expect(streak([d(1), d(2)])).toBe(2);
    expect(streak([d(3)])).toBe(0);
  });
});

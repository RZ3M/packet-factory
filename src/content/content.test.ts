import { describe, expect, it } from 'vitest';
import { CATALOG } from '../engine/catalog';
import { CODEX, CODEX_BY_ID, CODEX_SECTIONS } from './codex';
import { DRILL } from './drill';
import { LEVELS } from './levels';

describe('content integrity', () => {
  it('every codex reference resolves', () => {
    const missing: string[] = [];
    for (const l of LEVELS) for (const c of l.concepts) if (!CODEX_BY_ID.has(c)) missing.push(`level ${l.id} → ${c}`);
    for (const k in CATALOG) {
      const c = CATALOG[k as keyof typeof CATALOG].codex;
      if (!CODEX_BY_ID.has(c)) missing.push(`component ${k} → ${c}`);
    }
    for (const e of CODEX) for (const r of e.related ?? []) if (!CODEX_BY_ID.has(r)) missing.push(`codex ${e.id} → ${r}`);
    expect(missing).toEqual([]);
  });

  it('codex entries are well formed', () => {
    const ids = new Set<string>();
    for (const e of CODEX) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(CODEX_SECTIONS).toContain(e.section);
      expect(e.body.length).toBeGreaterThan(200);
    }
  });

  it('quiz answers are valid and levels are unique', () => {
    const ids = new Set<string>();
    for (const l of LEVELS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.quiz.length).toBeGreaterThan(0);
      for (const q of [...l.quiz, ...(l.interview?.clarify ?? [])]) expect(q.answer).toBeLessThan(q.options.length);
      for (const n of l.solution.nodes) expect(n.kind === 'users' || l.palette.includes(n.kind), `${l.id} solution uses ${n.kind} not in palette`).toBe(true);
    }
    for (const q of DRILL) expect(q.answer).toBeLessThan(q.options.length);
  });

  it('covers the primer topic list', () => {
    const topics = [
      'performance-scalability',
      'latency-throughput',
      'cap',
      'consistency',
      'availability',
      'failover',
      'replication',
      'dns',
      'cdn',
      'load-balancer',
      'reverse-proxy',
      'microservices',
      'rdbms',
      'federation',
      'sharding',
      'denormalization',
      'sql-tuning',
      'nosql-kv',
      'nosql-document',
      'nosql-widecolumn',
      'nosql-graph',
      'sql-vs-nosql',
      'cache',
      'cache-update',
      'asynchronism',
      'message-queues',
      'back-pressure',
      'http',
      'tcp-udp',
      'rpc-rest',
      'security',
      'powers-of-two',
      'latency-numbers',
      'interview-framework',
      'back-of-envelope',
    ];
    for (const t of topics) expect(CODEX_BY_ID.has(t), t).toBe(true);
  });
});

describe('solution explanations', () => {
  for (const l of LEVELS) {
    it(`${l.id} explains its reference design`, () => {
      expect(l.explain, 'missing explanation').toBeTruthy();
      const ids = new Set(l.solution.nodes.map((n) => n.id));
      for (const c of l.explain!.choices) if (c.node) expect(ids.has(c.node), `${l.id}: choice "${c.title}" points at unknown node ${c.node}`).toBe(true);
      for (const t of l.traps ?? []) expect(l.explain!.whyNot?.[t.name], `${l.id}: no explanation for trap "${t.name}"`).toBeTruthy();
    });
  }
});

import type { DFrame, DLink, DNode, NodeKey, Visual } from '../types';

export const C = {
  read: '#38bdf8',
  write: '#fb923c',
  static: '#4ade80',
  job: '#c084fc',
  err: '#f43f5e',
  repl: '#c4b5fd',
  ok: '#34d399',
  search: '#facc15',
  graph: '#f472b6',
  ingest: '#2dd4bf',
};

export const n = (id: string, label: string, k: NodeKey, x: number, y: number, extra: Partial<DNode> = {}): DNode => ({ id, label, k, x, y, ...extra });
export const l = (from: string, to: string, extra: Partial<DLink> = {}): DLink => ({ from, to, ...extra });
export const fr = (caption: string, nodes: DNode[], links: DLink[], ms?: number): DFrame => ({ caption, nodes, links, ms });
export const diagram = (...frames: DFrame[]): Visual => ({ kind: 'diagram', frames });
export const code = (lang: string, src: string): Visual => ({ kind: 'code', lang, code: src });
export const big = (value: string, label: string, color?: string): Visual => ({ kind: 'big', value, label, color });
export const compare = (lt: string, lp: string[], rt: string, rp: string[]): Visual => ({ kind: 'compare', left: { title: lt, points: lp }, right: { title: rt, points: rp } });
export const steps = (...items: [string, string][]): Visual => ({ kind: 'steps', items: items.map(([title, text]) => ({ title, text })) });

import { CATALOG } from '../engine/catalog';
import type { Design, DesignNode, NodeKind } from '../engine/types';

export const TILE = 16;
export const NODE_W = 8; // tiles
export const NODE_H = 4;

const DATA: NodeKind[] = ['sql', 'kv', 'document', 'widecolumn', 'graphdb', 'search', 'objstore'];
const EDGE_IN: NodeKind[] = ['dns', 'cdn', 'lb', 'proxy', 'gateway', 'app'];

/** Can a wire go from `a` to `b`? Returns an error message, or null when allowed. */
export function connectError(design: Design, a: DesignNode, b: DesignNode): string | null {
  if (a.id === b.id) return 'A component cannot connect to itself.';
  if (b.kind === 'users') return 'Users only send traffic; nothing flows into them.';
  if (design.edges.some((e) => e.from === a.id && e.to === b.id)) return 'Already connected.';
  if (a.kind === 'users' && !EDGE_IN.includes(b.kind)) return `Users can't talk to a ${CATALOG[b.kind].name} directly — put an app or edge component in front.`;
  if (a.kind === 'sql') {
    if (b.kind !== 'sql') return 'Databases do not call other services. (Wire SQL → SQL to set up replication.)';
    return null;
  }
  if (DATA.includes(a.kind)) return `A ${CATALOG[a.kind].name} only answers requests; it does not send them anywhere.`;
  if (a.kind === 'cache' && !(['sql', 'kv', 'document', 'widecolumn', 'graphdb', 'search'] as NodeKind[]).includes(b.kind))
    return 'A cache can only sit in front of a data store.';
  if (b.kind === 'dns') return 'DNS is the first hop — only Users connect to it.';
  if (a.kind === 'shardrouter' && !(['sql', 'kv', 'document', 'widecolumn', 'cache'] as NodeKind[]).includes(b.kind)) return 'A shard router sends to database or cache shards.';
  return null;
}

export function nextName(design: Design, kind: NodeKind): string {
  const base = CATALOG[kind].name;
  const used = new Set(design.nodes.map((n) => n.name ?? CATALOG[n.kind].name));
  if (!used.has(base) && !design.nodes.some((n) => n.kind === kind)) return base;
  for (let i = 2; i < 200; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
  return base;
}

export function nextId(design: Design, kind: NodeKind): string {
  const ids = new Set(design.nodes.map((n) => n.id));
  for (let i = 1; i < 10000; i++) if (!ids.has(`${kind}${i}`)) return `${kind}${i}`;
  return `${kind}${Date.now()}`;
}

/** Find a free spot near (x, y) in tile coordinates. */
export function freeSpot(design: Design, x: number, y: number): { x: number; y: number } {
  const occupied = (px: number, py: number) =>
    design.nodes.some((n) => px < n.x + NODE_W + 1 && px + NODE_W + 1 > n.x && py < n.y + NODE_H + 1 && py + NODE_H + 1 > n.y);
  if (!occupied(x, y)) return { x, y };
  for (let r = 1; r < 30; r++) {
    for (const [dx, dy] of [
      [0, r],
      [0, -r],
      [r, 0],
      [-r, 0],
      [r, r],
      [-r, r],
      [r, -r],
      [-r, -r],
    ]) {
      const px = x + dx * 2;
      const py = y + dy * 2;
      if (px >= 0 && py >= 0 && !occupied(px, py)) return { x: px, y: py };
    }
  }
  return { x, y: y + 6 };
}

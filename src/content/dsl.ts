// Tiny helpers for writing level layouts compactly.

import { defaultConfig } from '../engine/catalog';
import type { Design, DesignEdge, DesignNode, NodeKind, Region, ReqType, TierId } from '../engine/types';

interface NOpts {
  id?: string;
  name?: string;
  tier?: TierId;
  region?: Region;
  cfg?: Record<string, any>;
  locked?: boolean;
}

export function N(kind: NodeKind, x: number, y: number, o: NOpts = {}): DesignNode {
  const spec = defaultConfig(kind);
  const id = o.id ?? `${kind}-${x}-${y}`;
  return {
    id,
    kind,
    x,
    y,
    name: o.name,
    tier: o.tier ?? (['app', 'worker', 'sql', 'cache', 'cdn', 'search'].includes(kind) ? 'S' : undefined),
    region: o.region,
    config: { ...spec, ...(o.cfg ?? {}) },
    locked: o.locked,
  };
}

export function E(from: string, to: string, filter?: ReqType[]): DesignEdge {
  return { id: `${from}>${to}`, from, to, filter };
}

/** Fully connect every `from` to every `to`. */
export function fan(from: string[], to: string[]): DesignEdge[] {
  const out: DesignEdge[] = [];
  for (const f of from) for (const t of to) out.push(E(f, t));
  return out;
}

export function D(nodes: DesignNode[], edges: DesignEdge[] = []): Design {
  return { nodes, edges };
}

export const USERS = (o: NOpts & { x?: number; y?: number } = {}) =>
  N('users', o.x ?? 2, o.y ?? 12, { id: o.id ?? 'users', name: o.name ?? 'Users', locked: true, region: o.region });

/** Columns and rows used by layouts (tile units). */
export const COL = [2, 14, 26, 38, 50, 62, 74];
export const ROW = (i: number) => 2 + i * 6;

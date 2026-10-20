// Small layout helpers for lesson demo boards.
import { D, E, N, fan } from '../dsl';
import type { DesignNode, NodeKind, Region, TierId } from '../../engine/types';

export { D, E, N, fan };

/** Column x positions (tiles) and row y positions for compact demo layouts. */
export const X = [2, 13, 24, 35, 46, 57];
export const Y = (r: number) => 1 + r * 6;

export const users = (y = Y(1), opts: { id?: string; name?: string; region?: Region; x?: number } = {}): DesignNode =>
  N('users', opts.x ?? X[0], y, { id: opts.id ?? 'users', name: opts.name ?? 'Users', region: opts.region, locked: true });

export const node = (kind: NodeKind, col: number, row: number, id: string, o: { tier?: TierId; name?: string; cfg?: Record<string, any>; region?: Region; dy?: number } = {}) =>
  N(kind, X[col], Y(row) + (o.dy ?? 0), { id, tier: o.tier, name: o.name, cfg: o.cfg, region: o.region });

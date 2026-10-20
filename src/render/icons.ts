// Rasterize lucide icons for drawing on the canvas.

import {
  Archive,
  Cog,
  Columns3,
  Database,
  FileBraces,
  Globe,
  KeyRound,
  ListOrdered,
  Network,
  RadioTower,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Signpost,
  Split,
  Users,
  Zap,
} from 'lucide';

type IconNode = [string, Record<string, string | number>][];

const NODES: Record<string, IconNode> = {
  Archive,
  Cog,
  Columns3,
  Database,
  FileBraces,
  Globe,
  KeyRound,
  ListOrdered,
  Network,
  RadioTower,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Signpost,
  Split,
  Users,
  Zap,
} as any;

const cache = new Map<string, HTMLImageElement>();

export function iconImage(name: string, color: string): HTMLImageElement | null {
  const key = `${name}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit.complete ? hit : null;
  const node = NODES[name];
  if (!node) return null;
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, img);
  return null;
}

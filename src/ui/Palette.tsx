import { useMemo } from 'react';
import { CATALOG, nominalCapacity, tierOf, type Category } from '../engine/catalog';
import type { NodeKind } from '../engine/types';
import { LEVELS } from '../content/levels';
import { useGame } from '../game/store';
import { viewCenterTiles } from './Board';
import { Icon, fmtNum } from './common';

const CATS: { id: Category; label: string }[] = [
  { id: 'edge', label: 'Edge & routing' },
  { id: 'compute', label: 'Compute' },
  { id: 'async', label: 'Async' },
  { id: 'data', label: 'Data' },
  { id: 'storage', label: 'Storage' },
];

export function Palette() {
  const level = useGame((s) => s.level);
  const addNode = useGame((s) => s.addNode);
  const fresh = useMemo(() => {
    if (!level || level.id === 'sandbox') return new Set<NodeKind>();
    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const seen = new Set<NodeKind>();
    for (let i = 0; i < idx; i++) for (const k of LEVELS[i].palette) seen.add(k);
    return new Set(level.palette.filter((k) => !seen.has(k)));
  }, [level]);
  if (!level) return null;

  return (
    <div className="panel">
      <div className="panel-h">
        <span>Components</span>
        <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font)', fontWeight: 500 }}>
          drag onto board
        </span>
      </div>
      <div className="panel-b">
        {CATS.map((cat) => {
          const items = level.palette.filter((k) => CATALOG[k].category === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id} className="palette-group">
              <h4>{cat.label}</h4>
              <div className="palette-grid">
                {items.map((k) => {
                  const spec = CATALOG[k];
                  const t = tierOf(k, spec.tiers?.[0].id);
                  const cost = (t?.cost ?? spec.cost ?? 0) * (spec.perNode ? 3 : 1);
                  const cap = nominalCapacity(k, t?.id, { nodes: 3 });
                  return (
                    <div
                      key={k}
                      className="pal-item"
                      role="button"
                      tabIndex={0}
                      aria-label={`Add ${spec.name}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const c = viewCenterTiles();
                          addNode(k, c.x, c.y);
                        }
                      }}
                      draggable
                      title={`${spec.name}: ${spec.blurb}`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-pf-kind', k);
                        e.dataTransfer.effectAllowed = 'copy';
                        (window as any).__pfDragKind = k;
                      }}
                      onDragEnd={() => ((window as any).__pfDragKind = undefined)}
                      onClick={() => {
                        const c = viewCenterTiles();
                        addNode(k, c.x, c.y);
                      }}
                    >
                      {fresh.has(k) && <span className="new">NEW</span>}
                      <Icon name={spec.icon} size={18} color={spec.color} />
                      <span className="nm">{spec.name}</span>
                      <span className="cs">
                        ${cost}/mo{k !== 'dns' && k !== 'lb' ? ` · ${fmtNum(cap)}/s` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Lightweight animated SVG visuals for the mobile lectures.

import { useEffect, useMemo, useState } from 'react';
import { Icon, Markdown } from '../ui/common';
import { Widget } from '../ui/Widgets';
import type { DFrame, DNode, NodeKey, Visual } from './types';

const KIND: Record<NodeKey, { icon: string; color: string }> = {
  user: { icon: 'Users', color: '#94a3b8' },
  app: { icon: 'Server', color: '#34d399' },
  db: { icon: 'Database', color: '#818cf8' },
  cache: { icon: 'Zap', color: '#fbbf24' },
  lb: { icon: 'Split', color: '#f59e0b' },
  cdn: { icon: 'Globe', color: '#22d3ee' },
  queue: { icon: 'ListOrdered', color: '#e879f9' },
  worker: { icon: 'Cog', color: '#c084fc' },
  dns: { icon: 'Signpost', color: '#a78bfa' },
  s3: { icon: 'Archive', color: '#a3e635' },
  proxy: { icon: 'Shield', color: '#60a5fa' },
  gateway: { icon: 'ShieldCheck', color: '#f87171' },
  search: { icon: 'Search', color: '#facc15' },
  kv: { icon: 'KeyRound', color: '#fb7185' },
  doc: { icon: 'FileBraces', color: '#4ade80' },
  wide: { icon: 'Columns3', color: '#2dd4bf' },
  graph: { icon: 'Share2', color: '#f472b6' },
  router: { icon: 'Network', color: '#93c5fd' },
  region: { icon: 'Map', color: '#38bdf8' },
  note: { icon: 'Info', color: '#8a9bb3' },
  service: { icon: 'Boxes', color: '#2dd4bf' },
  lock: { icon: 'Lock', color: '#f5a524' },
  disk: { icon: 'Archive', color: '#8a9bb3' },
};

const NW = 74;
const NH = 34;
const px = (n: DNode) => ({ x: 6 + n.x * 82, y: 8 + n.y * 46 });

export function VisualView({ v }: { v: Visual }) {
  switch (v.kind) {
    case 'diagram':
      return <Diagram frames={v.frames} />;
    case 'widget':
      return <Widget id={v.id} />;
    case 'code':
      return (
        <pre className="st-code">
          <code>{v.code.trim()}</code>
        </pre>
      );
    case 'big':
      return (
        <div className="st-big">
          <b style={{ color: v.color ?? 'var(--accent)' }}>{v.value}</b>
          <span>{v.label}</span>
        </div>
      );
    case 'compare':
      return (
        <div className="st-compare">
          {[v.left, v.right].map((s, i) => (
            <div key={i} style={{ borderColor: (s.color ?? (i ? '#38bdf8' : '#f5a524')) + '88' }}>
              <h5 style={{ color: s.color ?? (i ? '#38bdf8' : '#f5a524') }}>{s.title}</h5>
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    case 'steps':
      return <Steps items={v.items} />;
  }
}

function Steps({ items }: { items: { title: string; text: string }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <div className="st-steps">
      {items.map((s, j) => (
        <div key={s.title} className={`st-step ${j === i ? 'on' : ''} ${j < i ? 'done' : ''}`} onClick={() => setI(j)}>
          <span>{j + 1}</span>
          <div>
            <b>{s.title}</b>
            {j === i && <Markdown text={s.text} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Animated architecture diagram. Multiple frames play like a short story. */
export function Diagram({ frames }: { frames: DFrame[] }) {
  const [f, setF] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setF(0);
  }, [frames]);
  useEffect(() => {
    if (frames.length < 2 || paused) return;
    const t = setTimeout(() => setF((x) => (x + 1) % frames.length), frames[f]?.ms ?? 3200);
    return () => clearTimeout(t);
  }, [f, frames, paused]);
  const frame = frames[Math.min(f, frames.length - 1)];
  // union of nodes across frames so nodes can fade in/out smoothly
  const allNodes = useMemo(() => {
    const m = new Map<string, DNode>();
    for (const fr of frames) for (const n of fr.nodes) if (!m.has(n.id)) m.set(n.id, n);
    return [...m.values()];
  }, [frames]);
  const maxY = Math.max(...allNodes.map((n) => n.y)) + 1;
  const height = 8 + maxY * 46;
  const maxX = Math.max(...allNodes.map((n) => n.x));
  const width = Math.max(340, 14 + maxX * 82 + NW);
  const cur = new Map(frame.nodes.map((n) => [n.id, n]));

  return (
    <div className="st-diagram" onClick={() => frames.length > 1 && setPaused((p) => !p)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>
        {frame.links.map((l, i) => {
          const a = cur.get(l.from);
          const b = cur.get(l.to);
          if (!a || !b) return null;
          const pa = px(a);
          const pb = px(b);
          const ca = { x: pa.x + NW / 2, y: pa.y + NH / 2 };
          const cb = { x: pb.x + NW / 2, y: pb.y + NH / 2 };
          const s = edgePoint(ca, cb);
          const e = edgePoint(cb, ca);
          const d = `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
          const back = `M ${e.x} ${e.y} L ${s.x} ${s.y}`;
          const rate = l.rate ?? 2;
          const dur = l.speed ?? 1.6;
          const color = l.color ?? '#38bdf8';
          const key = `${f}-${i}`;
          return (
            <g key={key}>
              <path d={d} stroke={l.dashed ? '#a78bfa' : '#2a3a52'} strokeWidth={l.dashed ? 2 : 4} strokeDasharray={l.dashed ? '4 4' : undefined} fill="none" strokeLinecap="round" />
              {Array.from({ length: rate }, (_, k) => (
                <circle key={k} r={3.2} fill={color}>
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} begin={`-${(k * dur) / Math.max(1, rate)}s`} />
                </circle>
              ))}
              {l.back &&
                Array.from({ length: Math.max(1, rate - 1) }, (_, k) => (
                  <circle key={`b${k}`} r={2.4} fill="#34d399" opacity={0.85}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={back} begin={`-${dur / 2 + (k * dur) / Math.max(1, rate)}s`} />
                  </circle>
                ))}
              {l.label && (
                <text x={(s.x + e.x) / 2} y={(s.y + e.y) / 2 - 5} textAnchor="middle" fontSize="8.5" fill="#9fb0c8" fontFamily="Inter, sans-serif">
                  {l.label}
                </text>
              )}
            </g>
          );
        })}
        {allNodes.map((n0) => {
          const n = cur.get(n0.id);
          const visible = !!n;
          const node = n ?? n0;
          const p = px(node);
          const spec = KIND[node.k];
          const st = node.state;
          return (
            <g key={n0.id} className={`st-node ${st ?? ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: visible ? (st === 'dim' ? 0.35 : 1) : 0 }}>
              <rect width={NW} height={NH} rx={7} fill="#131b27" stroke={st === 'down' ? '#f43f5e' : st === 'new' ? '#f5a524' : spec.color + '99'} strokeWidth={st === 'new' ? 2 : 1.2} strokeDasharray={st === 'down' ? '4 3' : undefined} />
              <rect x={0} y={6} width={3} height={NH - 12} rx={1.5} fill={spec.color} />
              <svg x={7} y={9} width={16} height={16} overflow="visible">
                <Icon name={spec.icon} size={16} color={st === 'down' ? '#f43f5e' : spec.color} />
              </svg>
              <NodeLabel text={node.label} />
              {st === 'down' && (
                <text x={NW - 10} y={13} fontSize={11} fill="#f43f5e" fontWeight={700} textAnchor="middle">
                  ✕
                </text>
              )}
              {node.badge && (
                <g>
                  <rect x={NW - 26} y={-7} width={30} height={13} rx={6.5} fill="#0a0e15" stroke="#f5a524" />
                  <text x={NW - 11} y={2.5} fontSize={7.5} fill="#f5a524" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight={700}>
                    {node.badge}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {(frame.caption || frames.length > 1) && (
        <div className="st-caption">
          {frames.length > 1 && (
            <span className="st-dots">
              {frames.map((_, j) => (
                <i
                  key={j}
                  className={j === f ? 'on' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    setF(j);
                    setPaused(true);
                  }}
                />
              ))}
            </span>
          )}
          <span>{frame.caption}</span>
        </div>
      )}
    </div>
  );
}

/** One line when it fits, otherwise two smaller lines split at a space. */
function NodeLabel({ text }: { text: string }) {
  const props = { x: 27, fontWeight: 600, fill: '#e5edf7', fontFamily: 'Inter, sans-serif' } as const;
  if (text.length <= 10) {
    return (
      <text {...props} y={21} fontSize={9.5}>
        {text}
      </text>
    );
  }
  const words = text.split(' ');
  let a = '';
  let i = 0;
  while (i < words.length && (a + ' ' + words[i]).trim().length <= 11) a = (a + ' ' + words[i++]).trim();
  if (!a) a = words[i++] ?? '';
  let b = words.slice(i).join(' ');
  if (a.length > 12) a = a.slice(0, 11) + '…';
  if (b.length > 12) b = b.slice(0, 11) + '…';
  return (
    <text {...props} fontSize={8.2}>
      <tspan x={27} y={b ? 15.5 : 20}>
        {a}
      </tspan>
      {b && (
        <tspan x={27} y={25.5}>
          {b}
        </tspan>
      )}
    </text>
  );
}

function edgePoint(c: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = Math.abs(dx) > 0 ? NW / 2 / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 0 ? NH / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

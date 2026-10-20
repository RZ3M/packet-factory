// Interactive explainers for concepts that don't fit on a factory floor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Zipf, hash32 } from '../engine/rng';
import type { WidgetId } from '../content/types';
import { LATENCY_NUMBERS, fmtNs } from '../content/numbers';

export function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'queueing':
      return <QueueingWidget />;
    case 'zipf':
      return <ZipfWidget />;
    case 'hashring':
      return <HashRingWidget />;
    case 'latency':
      return <LatencyWidget />;
  }
}

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const loop = (ts: number) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, ts / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// ---------------------------------------------------------------------------
// Queueing: utilization vs waiting time, with a live single-server queue

function QueueingWidget() {
  const [rho, setRho] = useState(0.7);
  const svcMs = 20;
  const sim = useRef({ q: 0, busyUntil: 0, nextArrival: 0, served: 0, lastT: 0 });
  const ref = useCanvas(
    (ctx, w, h, t) => {
      // tiny M/M/1 for the animation (service rate 6/s visual)
      const s = sim.current;
      const mu = 6;
      const lambda = rho * mu;
      if (!s.lastT) s.lastT = t;
      const exp = (m: number) => -Math.log(1 - Math.random()) * m;
      while (s.nextArrival <= t) {
        if (s.nextArrival === 0) s.nextArrival = t;
        s.q++;
        s.nextArrival += exp(1 / lambda);
      }
      if (s.busyUntil <= t && s.q > 0) {
        s.q--;
        s.busyUntil = t + exp(1 / mu);
        s.served++;
      }
      // Wide: curve left, live queue right. Narrow (phones): curve on top, queue strip below.
      const narrow = w < 460;
      const qh = narrow ? 64 : 0;
      const cx = 12;
      const cw = (narrow ? w : w * 0.58) - 24;
      const ch = h - 44 - qh;
      const top = 22;
      const maxMult = 25;
      ctx.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top + ch);
      ctx.lineTo(cx + cw, top + ch);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const r = (i / 100) * 0.97;
        const mult = 1 / (1 - r);
        const x = cx + (r / 1) * cw;
        const y = top + ch - (Math.min(maxMult, mult) / maxMult) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#f5a524';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const mx = cx + rho * cw;
      const my = top + ch - (Math.min(maxMult, 1 / (1 - rho)) / maxMult) * ch;
      ctx.fillStyle = rho < 0.6 ? '#34d399' : rho < 0.85 ? '#fbbf24' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9bb3';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('utilization →', cx + 4, top + ch + 18);
      ctx.fillText('↑ response time', cx + 8, top - 6);
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.textAlign = 'center';
      ctx.fillText('50%', cx + 0.5 * cw, top + ch + 18);
      ctx.fillText('90%', cx + 0.9 * cw, top + ch + 18);
      ctx.textAlign = 'left';
      // live queue
      const qy = narrow ? h - qh / 2 : h / 2;
      const boxW = 76;
      const bx = w - boxW - 12;
      ctx.fillStyle = '#131b27';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, qy - 26, boxW, 52, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e5edf7';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Server', bx + boxW / 2, qy - 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = s.busyUntil > t ? '#38bdf8' : '#334155';
      ctx.beginPath();
      ctx.arc(bx + boxW / 2, qy + 11, 7, 0, Math.PI * 2);
      ctx.fill();
      const qLeft = narrow ? 12 : w * 0.62;
      const cols = Math.max(4, Math.floor((bx - 14 - qLeft) / 12));
      const shown = Math.min(s.q, cols * 2);
      for (let i = 0; i < shown; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.fillStyle = i >= cols ? '#f43f5e' : '#f5a524';
        ctx.fillRect(bx - 14 - col * 12, qy - 12 + row * 12, 9, 9);
      }
      ctx.fillStyle = '#8a9bb3';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText(`waiting: ${s.q}`, narrow ? 12 : qLeft, narrow ? qy + 24 : qy + 46);
    },
    [rho],
  );
  const mult = 1 / (1 - rho);
  return (
    <div className="widget">
      <canvas ref={ref} style={{ width: '100%', height: 220 }} className="wg-queue" />
      <div className="field" style={{ marginTop: 6 }}>
        <label>
          Utilization <span className="mono accent">{Math.round(rho * 100)}%</span>
        </label>
        <input className="range" type="range" min={0.1} max={0.97} step={0.01} value={rho} onChange={(e) => setRho(Number(e.target.value))} />
      </div>
      <div className="widget-out">
        Service time {svcMs} ms → response time ≈ <b className="mono">{Math.round(svcMs * mult)} ms</b> ({mult.toFixed(1)}× the work itself)
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zipf: why a small cache catches most requests

function ZipfWidget() {
  const [skew, setSkew] = useState(1);
  const [pct, setPct] = useState(10);
  const N = 10000;
  const z = useMemo(() => new Zipf(N, skew), [skew]);
  const hit = z.topShare(Math.round((pct / 100) * N));
  const ref = useCanvas(
    (ctx, w, h) => {
      const bars = 60;
      const bw = (w - 20) / bars;
      // popularity of rank buckets (log-ish spacing over the first 60 ranks scaled)
      const vals: number[] = [];
      for (let i = 0; i < bars; i++) {
        const lo = Math.floor(Math.pow(N, i / bars)) - 1;
        const hi = Math.max(lo + 1, Math.floor(Math.pow(N, (i + 1) / bars)) - 1);
        vals.push((z.topShare(hi) - (lo > 0 ? z.topShare(lo) : 0)) / (hi - lo));
      }
      const max = Math.max(...vals);
      const cutoff = Math.round((pct / 100) * N);
      for (let i = 0; i < bars; i++) {
        const rankHi = Math.floor(Math.pow(N, (i + 1) / bars));
        const bh = Math.max(2, (Math.sqrt(vals[i] / max)) * (h - 44));
        ctx.fillStyle = rankHi <= cutoff ? '#fbbf24' : '#334155';
        ctx.fillRect(10 + i * bw, h - 22 - bh, Math.max(1, bw - 1.5), bh);
      }
      ctx.fillStyle = '#8a9bb3';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('most popular', 10, h - 4);
      ctx.textAlign = 'right';
      ctx.fillText('long tail →', w - 10, h - 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('■ cached', 10, 14);
    },
    [skew, pct],
  );
  return (
    <div className="widget">
      <canvas ref={ref} style={{ width: '100%', height: 170 }} />
      <div className="field" style={{ marginTop: 6 }}>
        <label>
          Cache holds the top <span className="mono accent">{pct}% of items</span>
        </label>
        <input className="range" type="range" min={1} max={60} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </div>
      <div className="seg" style={{ marginTop: 8 }}>
        {[
          [0.6, 'flat'],
          [1, 'typical web'],
          [1.2, 'very skewed'],
        ].map(([v, l]) => (
          <button key={String(v)} className={skew === v ? 'on' : ''} onClick={() => setSkew(v as number)}>
            {l}
          </button>
        ))}
      </div>
      <div className="widget-out">
        Hit rate ≈ <b className="mono" style={{ fontSize: 18, color: '#fbbf24' }}>{Math.round(hit * 100)}%</b> of requests served from memory
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hash ring: mod-N vs consistent hashing when a node is added

function HashRingWidget() {
  const [n, setN] = useState(4);
  const [mode, setMode] = useState<'mod' | 'ring'>('ring');
  const KEYS = 90;
  const VN = 24;
  const colors = ['#38bdf8', '#fb923c', '#4ade80', '#c084fc', '#facc15', '#f472b6', '#2dd4bf', '#a3e635'];
  const owner = (key: number, nodes: number) => {
    if (mode === 'mod') return hash32(key * 7 + 1) % nodes;
    // consistent hashing with virtual nodes
    const kh = hash32(key * 7 + 1) / 4294967296;
    let best = -1;
    let bestPos = 2;
    let minNode = 0;
    let minPos = 2;
    for (let node = 0; node < nodes; node++) {
      for (let v = 0; v < VN; v++) {
        const p = hash32(node * 1000 + v * 7 + 13) / 4294967296;
        if (p >= kh && p < bestPos) {
          bestPos = p;
          best = node;
        }
        if (p < minPos) {
          minPos = p;
          minNode = node;
        }
      }
    }
    return best >= 0 ? best : minNode;
  };
  const before = useMemo(() => Array.from({ length: KEYS }, (_, k) => owner(k, n - 1)), [n, mode]);
  const after = useMemo(() => Array.from({ length: KEYS }, (_, k) => owner(k, n)), [n, mode]);
  const moved = after.filter((o, i) => o !== before[i]).length;
  const ref = useCanvas(
    (ctx, w, h, t) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 22;
      ctx.strokeStyle = '#253246';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < KEYS; k++) {
        const a = (hash32(k * 7 + 1) / 4294967296) * Math.PI * 2 - Math.PI / 2;
        const changed = after[k] !== before[k];
        const pulse = changed ? 1 + 0.4 * Math.sin(t * 6) : 1;
        ctx.fillStyle = colors[after[k] % colors.length];
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, (changed ? 4.5 : 3) * pulse, 0, Math.PI * 2);
        ctx.fill();
        if (changed) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      if (mode === 'ring') {
        for (let node = 0; node < n; node++) {
          for (let v = 0; v < VN; v++) {
            const p = hash32(node * 1000 + v * 7 + 13) / 4294967296;
            const a = p * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors[node % colors.length];
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
            ctx.lineTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5));
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = '#e5edf7';
      ctx.font = '700 26px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round((moved / KEYS) * 100)}%`, cx, cy);
      ctx.font = '13px Inter, sans-serif';
      ctx.fillStyle = '#8a9bb3';
      ctx.fillText('of keys moved', cx, cy + 22);
      ctx.fillText(`${n - 1} → ${n} nodes`, cx, cy + 39);
      ctx.textAlign = 'left';
    },
    [n, mode, before, after],
  );
  return (
    <div className="widget">
      <canvas ref={ref} style={{ width: '100%', height: 230 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <div className="seg">
          <button className={mode === 'mod' ? 'on' : ''} onClick={() => setMode('mod')}>
            hash mod N
          </button>
          <button className={mode === 'ring' ? 'on' : ''} onClick={() => setMode('ring')}>
            consistent ring
          </button>
        </div>
        <span className="stepper">
          <button className="btn sm icon" onClick={() => setN(Math.max(2, n - 1))}>
            −
          </button>
          <b>{n}</b>
          <button className="btn sm icon" onClick={() => setN(Math.min(8, n + 1))}>
            +
          </button>
        </span>
        <span className="muted wg-note">
          nodes · pulsing dots = keys that had to move
        </span>
      </div>
      <div className="widget-out">
        Ideal is ~{Math.round(100 / n)}% (only the new node's share). {mode === 'mod' ? 'Mod-N reshuffles almost everything.' : 'The ring only steals keys from neighbours.'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Latency: the ladder, log scale

function LatencyWidget() {
  const pick = ['Main memory reference', 'Read 4 KB randomly from SSD', 'Round trip within same datacenter', 'Read 1 MB sequentially from SSD', 'HDD seek', 'Send packet CA → Netherlands → CA'];
  const rows = LATENCY_NUMBERS.filter((l) => pick.includes(l.op));
  const minLog = Math.log10(50);
  const maxLog = Math.log10(150_000_000);
  return (
    <div className="widget" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((l) => {
        const f = (Math.log10(l.ns) - minLog) / (maxLog - minLog);
        return (
          <div key={l.op} className="wg-lat">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{l.op}</span>
              <b className="mono">{fmtNs(l.ns)}</b>
            </div>
            <div className="bar-h" style={{ height: 8 }}>
              <i style={{ width: `${Math.max(3, f * 100)}%`, background: `hsl(${200 - f * 190}, 80%, 60%)` }} />
            </div>
          </div>
        );
      })}
      <div className="widget-out">Log scale: every step right is ~10× slower. RAM → network → disk → oceans.</div>
    </div>
  );
}

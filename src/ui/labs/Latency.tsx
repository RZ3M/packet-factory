import { useState } from 'react';
import { LATENCY_NUMBERS, fmtNs } from '../../content/numbers';
import { Icon } from '../common';

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function deal() {
  // pick 5 with distinct magnitudes so the order is unambiguous
  const pool = shuffle(LATENCY_NUMBERS);
  const out: typeof LATENCY_NUMBERS = [];
  for (const x of pool) {
    if (out.every((o) => Math.max(o.ns, x.ns) / Math.min(o.ns, x.ns) >= 2.5)) out.push(x);
    if (out.length === 5) break;
  }
  return shuffle(out);
}

function humanScale(ns: number): string {
  // if an L1 reference (0.5 ns) took 1 second...
  const s = ns / 0.5;
  if (s < 60) return `${s.toFixed(0)} s`;
  if (s < 3600) return `${(s / 60).toFixed(0)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hours`;
  if (s < 86400 * 365) return `${(s / 86400).toFixed(0)} days`;
  return `${(s / 86400 / 365).toFixed(1)} years`;
}

export function LatencyLab() {
  const [hand, setHand] = useState(() => deal());
  const [order, setOrder] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, rounds: 0 });
  const correct = [...hand].sort((a, b) => a.ns - b.ns).map((x) => x.op);
  const isRight = checked && order.every((o, i) => o === correct[i]);

  const click = (op: string) => {
    if (checked) return;
    if (order.includes(op)) setOrder(order.filter((o) => o !== op));
    else {
      const next = [...order, op];
      setOrder(next);
      if (next.length === hand.length) {
        setChecked(true);
        const ok = next.every((o, i) => o === correct[i]);
        setScore((s) => ({ right: s.right + (ok ? 1 : 0), rounds: s.rounds + 1 }));
      }
    }
  };
  const again = () => {
    setHand(deal());
    setOrder([]);
    setChecked(false);
  };
  const maxLog = Math.log10(LATENCY_NUMBERS[LATENCY_NUMBERS.length - 1].ns);
  const minLog = Math.log10(0.5);

  return (
    <div className="cols2">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--display)' }}>Click from fastest → slowest</h3>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {score.right}/{score.rounds} perfect rounds
          </span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hand.map((h) => {
            const pos = order.indexOf(h.op);
            const right = checked && correct.indexOf(h.op) === pos;
            return (
              <button
                key={h.op}
                className={`quiz-opt ${checked ? (right ? 'correct' : 'wrong') : ''}`}
                onClick={() => click(h.op)}
                style={{ alignItems: 'center' }}
              >
                <span className="mono accent" style={{ width: 22 }}>
                  {pos >= 0 ? pos + 1 : '·'}
                </span>
                <span style={{ flex: 1 }}>{h.op}</span>
                {checked && (
                  <span className="mono muted">
                    {fmtNs(h.ns)} <span className="faint">#{correct.indexOf(h.op) + 1}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {checked && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <b className={isRight ? 'good' : 'bad'}>{isRight ? 'Perfect order!' : 'Not quite — check the numbers.'}</b>
            <button className="btn" onClick={again} style={{ marginLeft: 'auto' }}>
              Deal again <Icon name="RotateCcw" size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h4 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>Latency numbers every programmer should know</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {LATENCY_NUMBERS.map((l) => {
            const f = (Math.log10(l.ns) - minLog) / (maxLog - minLog);
            return (
              <div key={l.op} style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 8, fontSize: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{l.op}</span>
                    <span className="faint" style={{ fontSize: 10.5 }}>
                      ≈ {humanScale(l.ns)}
                    </span>
                  </div>
                  <div className="bar-h">
                    <i style={{ width: `${Math.max(2, f * 100)}%`, background: `hsl(${200 - f * 190}, 80%, 60%)` }} />
                  </div>
                </div>
                <span className="mono" style={{ textAlign: 'right' }}>
                  {fmtNs(l.ns)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="faint" style={{ fontSize: 11.5, marginBottom: 0 }}>
          Log scale. Grey column: if an L1 cache hit took one second. Memory is ~100× faster than SSD random reads; a cross-ocean round trip is ~300,000× slower than RAM. This is why caches exist.
        </p>
      </div>
    </div>
  );
}

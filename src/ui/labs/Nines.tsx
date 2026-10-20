import { useState } from 'react';
import { Icon } from '../common';

interface Tier {
  name: string;
  a: number; // availability fraction
  n: number; // parallel copies
}

const PRESET: Tier[] = [
  { name: 'DNS', a: 0.9999, n: 1 },
  { name: 'Load balancer', a: 0.999, n: 1 },
  { name: 'App servers', a: 0.99, n: 1 },
  { name: 'Cache', a: 0.999, n: 1 },
  { name: 'Database', a: 0.999, n: 1 },
];

const CHALLENGES = [
  { target: 0.999, label: 'Three 9s', tip: 'The weakest link dominates. Find it.' },
  { target: 0.9999, label: 'Four 9s', tip: 'Every tier in sequence needs redundancy.' },
  { target: 0.99999, label: 'Five 9s', tip: '5 minutes of downtime a year. Everything must be parallel.' },
];

export function downtime(a: number) {
  const down = 1 - a;
  const f = (sec: number) => {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
    return `${sec.toFixed(1)}s`;
  };
  return { year: f(down * 365.25 * 86400), month: f(down * 30.44 * 86400), week: f(down * 7 * 86400), day: f(down * 86400) };
}

export function nines(a: number): string {
  if (a >= 1) return '∞';
  return (-Math.log10(1 - a)).toFixed(2);
}

export function NinesLab() {
  const [tiers, setTiers] = useState<Tier[]>(PRESET);
  const total = tiers.reduce((acc, t) => acc * (1 - Math.pow(1 - t.a, t.n)), 1);
  const copies = tiers.reduce((s, t) => s + t.n, 0);
  const dt = downtime(total);
  const set = (i: number, patch: Partial<Tier>) => setTiers(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="cols2">
      <div className="card">
        <h3 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>Your request path (in sequence)</h3>
        {tiers.map((t, i) => {
          const eff = 1 - Math.pow(1 - t.a, t.n);
          return (
            <div key={t.name} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 70px', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
              <b>{t.name}</b>
              <select className="select" value={t.a} onChange={(e) => set(i, { a: Number(e.target.value) })}>
                {[0.99, 0.995, 0.999, 0.9995, 0.9999].map((v) => (
                  <option key={v} value={v}>
                    {(v * 100).toFixed(2)}% each
                  </option>
                ))}
              </select>
              <span className="stepper">
                <button className="btn sm icon" onClick={() => set(i, { n: Math.max(1, t.n - 1) })}>
                  −
                </button>
                <b>×{t.n}</b>
                <button className="btn sm icon" onClick={() => set(i, { n: Math.min(5, t.n + 1) })}>
                  +
                </button>
              </span>
              <span className="mono" style={{ textAlign: 'right', color: eff < total * 1.0000001 + 1e-12 && eff === Math.min(...tiers.map((x) => 1 - Math.pow(1 - x.a, x.n))) ? 'var(--bad)' : 'var(--muted)' }}>
                {nines(eff)}9s
              </span>
            </div>
          );
        })}
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="display" style={{ fontSize: 34, color: total >= 0.9999 ? 'var(--good)' : total >= 0.999 ? 'var(--warn)' : 'var(--bad)' }}>
              {(total * 100).toFixed(total > 0.9999 ? 4 : 3)}%
            </span>
            <span className="muted">≈ {nines(total)} nines · {copies} machines</span>
          </div>
          <div className="stats" style={{ marginTop: 10, gridTemplateColumns: 'repeat(4,1fr)' }}>
            {(['year', 'month', 'week', 'day'] as const).map((k) => (
              <div key={k} className="stat">
                <small>down / {k}</small>
                <b>{dt[k]}</b>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {CHALLENGES.map((c) => (
            <span key={c.label} className="pill" style={{ color: total >= c.target ? 'var(--good)' : undefined }} title={c.tip}>
              {total >= c.target ? <Icon name="CircleCheck" size={12} /> : <Icon name="Target" size={12} />} {c.label}
            </span>
          ))}
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setTiers(PRESET)}>
            Reset
          </button>
        </div>
      </div>
      <div className="card md">
        <h3 style={{ marginTop: 0 }}>The math</h3>
        <p>
          <b>In sequence</b> — a request must pass through every tier, so availabilities multiply and the total is <i>lower</i> than any single part:
        </p>
        <pre>
          <code>A(total) = A(foo) × A(bar)</code>
        </pre>
        <p>Two 99.9% components in sequence → 99.8%.</p>
        <p>
          <b>In parallel</b> — the tier is only down if <i>every</i> copy is down:
        </p>
        <pre>
          <code>A(total) = 1 − (1 − A(foo)) × (1 − A(bar))</code>
        </pre>
        <p>Two 99.9% copies in parallel → 99.9999%.</p>
        <table>
          <thead>
            <tr>
              <th>Availability</th>
              <th>Down / year</th>
              <th>Down / month</th>
              <th>Down / day</th>
            </tr>
          </thead>
          <tbody>
            {[0.99, 0.999, 0.9999, 0.99999].map((a) => {
              const d = downtime(a);
              return (
                <tr key={a}>
                  <td className="mono">{(a * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%</td>
                  <td>{d.year}</td>
                  <td>{d.month}</td>
                  <td>{d.day}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Caveat: parallel math assumes failures are independent. Copies in the same rack, region or deploy pipeline fail together — which is why real systems spread replicas across availability zones and regions.
        </p>
      </div>
    </div>
  );
}

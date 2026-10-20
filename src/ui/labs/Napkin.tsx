import { useMemo, useState } from 'react';
import { POWERS_OF_TWO } from '../../content/numbers';
import { useGame } from '../../game/store';
import { Icon } from '../common';

interface Problem {
  text: string;
  answer: number;
  unit: string;
  explain: string;
  kind: string;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const nice = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? n.toFixed(1) : n.toPrecision(2));

function makeProblem(): Problem {
  const k = pick(['dau', 'monthly', 'storage', 'bandwidth', 'cache', 'servers', 'pow2', 'peak']);
  switch (k) {
    case 'dau': {
      const users = pick([5, 10, 20, 50, 100, 300]);
      const per = pick([2, 5, 10, 20, 50]);
      const qps = (users * 1e6 * per) / 86400;
      return {
        kind: 'Traffic',
        text: `${users} million daily active users each make ${per} requests per day. What is the average request rate?`,
        answer: qps,
        unit: 'req/s',
        explain: `${users}M × ${per} = ${(users * per).toLocaleString()}M requests/day ÷ 86,400 s/day (≈ 10⁵) ≈ ${nice(qps)} req/s. Shortcut: 1M requests/day ≈ 12 req/s.`,
      };
    }
    case 'monthly': {
      const b = pick([1, 5, 10, 50, 100, 250]);
      const qps = (b * 1e9) / 2.5e6;
      return {
        kind: 'Traffic',
        text: `A service handles ${b} billion requests per month. Roughly how many requests per second is that on average?`,
        answer: qps,
        unit: 'req/s',
        explain: `A month has ~2.5 million seconds, so ${b}B ÷ 2.5M ≈ ${nice(qps)} req/s. The primer's rule of thumb: 400 req/s ≈ 1 billion requests/month.`,
      };
    }
    case 'peak': {
      const avg = pick([200, 400, 1000, 4000, 40000]);
      const f = pick([2, 3, 5]);
      return {
        kind: 'Traffic',
        text: `Average load is ${avg.toLocaleString()} req/s and traffic is not evenly distributed — the evening peak is about ${f}× average. What capacity do you provision for (before headroom)?`,
        answer: avg * f,
        unit: 'req/s',
        explain: `Design for peak, not average: ${avg.toLocaleString()} × ${f} = ${(avg * f).toLocaleString()} req/s — and then keep servers below ~70% at that peak.`,
      };
    }
    case 'storage': {
      const per = pick([1, 10, 100, 500]);
      const size = pick([1, 2, 10, 50]);
      const yearTB = (per * 1e6 * size * 1e3 * 365) / 1e12;
      return {
        kind: 'Storage',
        text: `Users create ${per} million new records per day, ${size} KB each. How much new storage per year (ignoring replication)?`,
        answer: yearTB,
        unit: 'TB',
        explain: `${per}M × ${size} KB = ${(per * size).toLocaleString()} GB/day × 365 ≈ ${nice(yearTB)} TB/year. Multiply by 3 for typical replication.`,
      };
    }
    case 'bandwidth': {
      const qps = pick([500, 1000, 5000, 20000]);
      const kb = pick([10, 50, 200, 500]);
      const mbps = (qps * kb) / 1000;
      return {
        kind: 'Bandwidth',
        text: `${qps.toLocaleString()} req/s, each response averaging ${kb} KB. What egress bandwidth do you need?`,
        answer: mbps,
        unit: 'MB/s',
        explain: `${qps.toLocaleString()} × ${kb} KB = ${nice(mbps)} MB/s (≈ ${nice(mbps * 8)} Mbps). A CDN would absorb most of this for static content.`,
      };
    }
    case 'cache': {
      const items = pick([10, 50, 100, 500]);
      const kb = pick([1, 2, 5, 10]);
      const gb = (items * 1e6 * 0.2 * kb * 1e3) / 1e9;
      return {
        kind: 'Memory',
        text: `You have ${items} million objects of ~${kb} KB. Following the 80/20 rule you cache the hottest 20%. How much cache memory?`,
        answer: gb,
        unit: 'GB',
        explain: `${items}M × 20% × ${kb} KB = ${nice(gb)} GB. ${gb > 64 ? 'That needs several cache nodes — shard the cache.' : 'That fits on a single large cache node.'}`,
      };
    }
    case 'servers': {
      const peak = pick([2000, 5000, 12000, 40000]);
      const per = pick([400, 800, 1500]);
      const n = Math.ceil(peak / (per * 0.7));
      return {
        kind: 'Capacity',
        text: `Peak traffic is ${peak.toLocaleString()} req/s. One app server handles ${per} req/s flat out, and you want them at most 70% busy at peak. How many servers?`,
        answer: n,
        unit: 'servers',
        explain: `${peak.toLocaleString()} ÷ (${per} × 0.7) = ${(peak / (per * 0.7)).toFixed(1)} → ${n} servers. Add one more for N+1 redundancy.`,
      };
    }
    default: {
      const row = pick(POWERS_OF_TWO.filter((p) => p.bytes));
      const asGB = Math.pow(2, row.power) / 1e9;
      return {
        kind: 'Powers of two',
        text: `How many gigabytes is 2^${row.power} bytes (decimal GB, roughly)?`,
        answer: asGB,
        unit: 'GB',
        explain: `2^${row.power} = ${row.exact} bytes ≈ ${row.bytes}. 2^10 ≈ 1 thousand, 2^20 ≈ 1 million, 2^30 ≈ 1 billion, 2^40 ≈ 1 trillion.`,
      };
    }
  }
}

export function NapkinLab() {
  const best = useGame((s) => s.progress.napkinBest);
  const updateProgress = useGame((s) => s.updateProgress);
  const [p, setP] = useState<Problem>(() => makeProblem());
  const [val, setVal] = useState('');
  const [result, setResult] = useState<null | boolean>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const v = useMemo(() => parseNum(val), [val]);

  const submit = () => {
    if (result !== null || !isFinite(v)) return;
    const ok = Math.abs(v - p.answer) <= p.answer * 0.35;
    setResult(ok);
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    const ns = ok ? streak + 1 : 0;
    setStreak(ns);
    if (ns > best) updateProgress((pr) => (pr.napkinBest = ns));
  };
  const next = () => {
    setP(makeProblem());
    setVal('');
    setResult(null);
  };

  return (
    <div className="cols2">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="pill">{p.kind}</span>
          <span className="mono muted" style={{ fontSize: 12 }}>
            streak {streak} · best {Math.max(best, streak)} · {score.right}/{score.total}
          </span>
        </div>
        <h3 style={{ margin: '0 0 14px', fontSize: 18, lineHeight: 1.45 }}>{p.text}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="numin"
            value={val}
            autoFocus
            placeholder="e.g. 1200 or 1.2k"
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') result === null ? submit() : next();
            }}
          />
          <span className="muted">{p.unit}</span>
          {result === null ? (
            <button className="btn primary" onClick={submit} disabled={!isFinite(v)}>
              Check
            </button>
          ) : (
            <button className="btn" onClick={next}>
              Next <Icon name="ArrowRight" size={14} />
            </button>
          )}
        </div>
        {result !== null && (
          <div className="quiz-explain" style={{ marginTop: 14, borderColor: result ? 'rgba(52,211,153,0.4)' : 'rgba(244,63,94,0.4)' }}>
            <b className={result ? 'good' : 'bad'}>{result ? 'Close enough — nice.' : 'Off by too much.'}</b> Answer ≈ <b className="mono">{nice(p.answer)}</b> {p.unit}.
            <br />
            {p.explain}
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 14 }}>
          Within ±35% counts. Interviewers care about the right order of magnitude and clear reasoning, not decimals. Accepts k / M / B suffixes.
        </p>
      </div>
      <div className="card">
        <h4 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>Cheat sheet</h4>
        <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>
            <b>86,400</b> s/day ≈ 10⁵ · <b>2.5 M</b> s/month
          </li>
          <li>1 req/s ≈ 2.5 M req/month · 40 req/s ≈ 100 M/month · 400 req/s ≈ 1 B/month</li>
          <li>1 M req/day ≈ 12 req/s</li>
          <li>Peak ≈ 2–3× average (more for spiky consumer apps)</li>
          <li>Read sequentially: HDD 30 MB/s · 1 Gbps net 100 MB/s · SSD 1 GB/s · RAM 4 GB/s</li>
          <li>~2,000 round trips/s inside a datacenter · 6–7 per second worldwide</li>
        </ul>
        <h4 style={{ fontFamily: 'var(--display)' }}>Powers of two</h4>
        <table className="md" style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <tbody>
            {POWERS_OF_TWO.map((r) => (
              <tr key={r.power}>
                <td className="mono" style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>
                  2^{r.power}
                </td>
                <td className="mono" style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>
                  {r.exact}
                </td>
                <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }} className="muted">
                  {r.approx}
                </td>
                <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>{r.bytes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseNum(s: string): number {
  const t = s.trim().toLowerCase().replace(/[, _]/g, '');
  const m = t.match(/^([0-9]*\.?[0-9]+)(k|m|b|t)?$/);
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2] as 'k'] ?? 1;
  return Number(m[1]) * mult;
}

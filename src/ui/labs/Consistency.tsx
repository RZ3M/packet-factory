import { useEffect, useRef, useState } from 'react';
import { Icon, Toggle } from '../common';

type Model = 'weak' | 'eventual' | 'strong';
interface Replica {
  id: 'A' | 'B' | 'C';
  v: number;
  pending: { v: number; at: number }[];
}
interface Log {
  t: number;
  msg: string;
  tone: 'good' | 'bad' | 'warn' | 'muted';
}

const MODEL_INFO: Record<Model, { title: string; text: string; examples: string }> = {
  weak: {
    title: 'Weak consistency',
    text: 'After a write, reads may or may not see it. Best-effort: some updates are simply never delivered.',
    examples: 'Memcached, VoIP, video chat, realtime multiplayer games — if you lose signal for a few seconds you do not get back what was said.',
  },
  eventual: {
    title: 'Eventual consistency',
    text: 'After a write, reads will eventually see it (typically within milliseconds). Data is replicated asynchronously.',
    examples: 'DNS, email, DynamoDB/Cassandra default reads. Works well in highly available systems.',
  },
  strong: {
    title: 'Strong consistency',
    text: 'After a write, every read sees it. Writes are replicated synchronously to a quorum before they are acknowledged.',
    examples: 'RDBMS, file systems, bank ledgers — anything that needs transactions.',
  },
};

export function ConsistencyLab() {
  const [model, setModel] = useState<Model>('eventual');
  const [delay, setDelay] = useState(2);
  const [partition, setPartition] = useState(false);
  const [reps, setReps] = useState<Replica[]>([
    { id: 'A', v: 0, pending: [] },
    { id: 'B', v: 0, pending: [] },
    { id: 'C', v: 0, pending: [] },
  ]);
  const [latest, setLatest] = useState(0);
  const [log, setLog] = useState<Log[]>([]);
  const [now, setNow] = useState(0);
  const t0 = useRef(performance.now());
  const state = useRef({ reps, partition });
  state.current = { reps, partition };

  useEffect(() => {
    const id = setInterval(() => {
      const t = (performance.now() - t0.current) / 1000;
      setNow(t);
      setReps((rs) =>
        rs.map((r) => {
          const part = state.current.partition && r.id === 'C';
          const due = r.pending.filter((p) => p.at <= t && !part);
          if (!due.length) return r;
          return { ...r, v: Math.max(r.v, ...due.map((d) => d.v)), pending: r.pending.filter((p) => !due.includes(p)) };
        }),
      );
    }, 100);
    return () => clearInterval(id);
  }, []);

  const push = (msg: string, tone: Log['tone']) => setLog((l) => [{ t: (performance.now() - t0.current) / 1000, msg, tone }, ...l].slice(0, 30));

  const write = () => {
    const v = latest + 1;
    const t = (performance.now() - t0.current) / 1000;
    if (model === 'strong') {
      // majority quorum: A + B reachable is enough; with partition C misses out until healed
      setLatest(v);
      setReps((rs) => rs.map((r) => (r.id === 'C' && partition ? { ...r, pending: [...r.pending, { v, at: t }] } : { ...r, v })));
      push(`write x=${v} → acknowledged after a synchronous quorum round trip (A+B${partition ? '' : '+C'})`, 'good');
      return;
    }
    setLatest(v);
    setReps((rs) =>
      rs.map((r) => {
        if (r.id === 'A') return { ...r, v };
        if (model === 'weak' && Math.random() < 0.35) return r; // best-effort: update dropped
        return { ...r, pending: [...r.pending, { v, at: t + delay * (0.6 + Math.random() * 0.8) }] };
      }),
    );
    push(`write x=${v} at A → acknowledged immediately; replicating ${model === 'weak' ? 'best-effort' : 'asynchronously'}`, 'muted');
  };

  const read = (id: Replica['id']) => {
    const r = reps.find((x) => x.id === id)!;
    if (model === 'strong' && partition && id === 'C') {
      push(`read C → ERROR: C cannot reach a quorum. CP system chooses consistency over availability.`, 'bad');
      return;
    }
    const v = model === 'strong' ? latest : r.v;
    if (v < latest) push(`read ${id} → x=${v}  (stale! latest is ${latest})${partition && id === 'C' ? ' — AP system stays available during the partition' : ''}`, 'warn');
    else push(`read ${id} → x=${v}  ✓ latest`, 'good');
  };

  const info = MODEL_INFO[model];
  return (
    <div className="cols2">
      <div className="card">
        <div className="seg" style={{ marginBottom: 14 }}>
          {(['weak', 'eventual', 'strong'] as Model[]).map((m) => (
            <button key={m} className={model === m ? 'on' : ''} onClick={() => setModel(m)}>
              {m}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {reps.map((r) => {
            const stale = (model === 'strong' ? latest : r.v) < latest;
            const cut = partition && r.id === 'C';
            return (
              <div
                key={r.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${cut ? 'var(--bad)' : stale ? 'var(--warn)' : 'var(--border2)'}`,
                  background: 'var(--bg2)',
                  textAlign: 'center',
                  opacity: cut ? 0.75 : 1,
                }}
              >
                <div className="display" style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Replica {r.id}
                  {r.id === 'A' ? ' (leader)' : ''}
                </div>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: stale ? 'var(--warn)' : 'var(--text)' }}>
                  x={model === 'strong' && !cut ? latest : r.v}
                </div>
                <div className="faint" style={{ fontSize: 11, minHeight: 16 }}>
                  {cut ? 'partitioned' : r.pending.length ? `incoming v${Math.max(...r.pending.map((p) => p.v))} in ${Math.max(0, Math.min(...r.pending.map((p) => p.at)) - now).toFixed(1)}s` : 'in sync'}
                </div>
                <button className="btn sm" style={{ marginTop: 8 }} onClick={() => read(r.id)}>
                  Read {r.id}
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={write}>
            <Icon name="Zap" size={14} /> Write x = {latest + 1} at A
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Toggle on={partition} onChange={setPartition} /> Partition C from the others
          </label>
        </div>
        {model !== 'strong' && (
          <div className="field">
            <label>
              Replication delay <span className="mono accent">{delay.toFixed(1)} s</span>
            </label>
            <input className="range" type="range" min={0.5} max={6} step={0.5} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
          </div>
        )}
        <div className="log" style={{ marginTop: 12, maxHeight: 220 }}>
          {log.map((l, i) => (
            <div key={i}>
              <span className="t">{l.t.toFixed(1)}s</span>
              <span className={l.tone === 'muted' ? 'muted' : l.tone}>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card md">
        <h3 style={{ marginTop: 0 }}>{info.title}</h3>
        <p>{info.text}</p>
        <p className="muted">
          <b>Seen in:</b> {info.examples}
        </p>
        <h3>CAP theorem</h3>
        <p>
          In a distributed system you can only guarantee two of <b>Consistency</b> (every read gets the latest write or an error), <b>Availability</b> (every request gets a non-error response) and <b>Partition tolerance</b> (the system keeps working despite network failures).
        </p>
        <p>
          Networks are unreliable, so partition tolerance is not optional — the real choice is what to do <i>during</i> a partition:
        </p>
        <ul>
          <li>
            <b>CP</b> — refuse (error/timeout) rather than risk stale data. Good when the business needs atomic reads and writes. Try <i>strong</i> + partition, then read C.
          </li>
          <li>
            <b>AP</b> — answer with the most recent data you have, which may be stale, and reconcile when the partition heals. Good for eventual consistency and staying up. Try <i>eventual</i> + partition.
          </li>
        </ul>
      </div>
    </div>
  );
}

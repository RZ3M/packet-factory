import { useState } from 'react';
import { CATALOG } from '../engine/catalog';
import { fmtMs } from '../engine/evaluate';
import type { ReqType } from '../engine/types';
import { FAIL_LABEL, REQ_META, REQ_TYPES } from '../engine/types';
import { useGame } from '../game/store';
import { Icon, fmtNum } from './common';

export function Overview() {
  const level = useGame((s) => s.level);
  const sim = useGame((s) => s.sim);
  useGame((s) => s.tick);
  if (!level) return null;
  const isSandbox = level.id === 'sandbox';
  const mix: Partial<Record<ReqType, number>> = {};
  for (const s of level.sources) {
    if (s.bot) continue;
    const m = sim ? sim.mixAt(s, sim.now) : s.mix;
    for (const k in m) mix[k as ReqType] = (mix[k as ReqType] ?? 0) + (m[k as ReqType] ?? 0);
  }
  const total = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const hasBots = level.sources.some((s) => s.bot);

  return (
    <>
      {isSandbox && <SandboxControls />}
      <div className="panel">
        <div className="panel-h">
          <span>Traffic mix</span>
        </div>
        <div className="panel-b legend">
          {REQ_TYPES.filter((t) => (mix[t] ?? 0) > 0).map((t) => (
            <div key={t} title={REQ_META[t].desc}>
              <span className="dot" style={{ background: REQ_META[t].color, boxShadow: `0 0 8px ${REQ_META[t].color}` }} />
              <b style={{ width: 52 }}>{REQ_META[t].label}</b>
              <span className="muted" style={{ flex: 1, fontSize: 11.5 }}>
                {REQ_META[t].desc}
              </span>
              <span className="mono">{Math.round(((mix[t] ?? 0) / total) * 100)}%</span>
            </div>
          ))}
          {hasBots && (
            <div>
              <span className="dot" style={{ background: '#f43f5e' }} />
              <b style={{ width: 52 }}>Bots</b>
              <span className="muted" style={{ flex: 1, fontSize: 11.5 }}>
                A botnet floods you during the run
              </span>
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <span className="dot" style={{ background: '#c4b5fd' }} />
            <b style={{ width: 52 }}>Internal</b>
            <span className="muted" style={{ flex: 1, fontSize: 11.5 }}>
              Replication, cache flushes, session lookups
            </span>
          </div>
        </div>
      </div>
      <EventLog />
      <Traces />
      {!sim && (
        <div className="panel">
          <div className="panel-h">
            <span>Controls</span>
          </div>
          <div className="panel-b" style={{ fontSize: 12, lineHeight: 1.9 }} >
            <div><kbd>drag</kbd> component from palette · <kbd>click</kbd> to select</div>
            <div><kbd>drag</kbd> from a glowing <b>output port</b> to wire</div>
            <div><kbd>Shift</kbd>+wire connects <i>every</i> server of that kind</div>
            <div><kbd>Ctrl D</kbd> duplicate with wires · <kbd>Del</kbd> delete</div>
            <div><kbd>Space</kbd> run/pause · <kbd>1</kbd>–<kbd>4</kbd> speed · <kbd>Ctrl Z</kbd> undo</div>
            <div><kbd>drag</kbd> empty space to pan · <kbd>wheel</kbd> to zoom</div>
          </div>
        </div>
      )}
    </>
  );
}

function EventLog() {
  const sim = useGame((s) => s.sim);
  if (!sim || !sim.log.length) return null;
  const colors = { info: 'var(--muted)', warn: 'var(--warn)', bad: 'var(--bad)', good: 'var(--good)' };
  return (
    <div className="panel">
      <div className="panel-h">
        <span>Event log</span>
      </div>
      <div className="panel-b log">
        {[...sim.log].reverse().slice(0, 40).map((l, i) => (
          <div key={i}>
            <span className="t">{Math.floor(l.t)}s</span>
            <span style={{ color: colors[l.level] }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Traces() {
  const sim = useGame((s) => s.sim);
  const [open, setOpen] = useState<number | null>(null);
  if (!sim || !sim.traces.length) return null;
  const list = [...sim.traces].reverse().slice(0, 8);
  return (
    <div className="panel">
      <div className="panel-h">
        <span>Request traces</span>
        <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font)', fontWeight: 500 }}>
          sampled
        </span>
      </div>
      <div className="panel-b">
        {list.map((t) => {
          const max = Math.max(1, t.latency);
          let acc = 0;
          return (
            <div key={t.id} className="trace">
              <div className="trace-h" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <span className="dot" style={{ background: REQ_META[t.type].color }} />
                <b style={{ fontSize: 12 }}>{REQ_META[t.type].label}</b>
                <span className="muted" style={{ fontSize: 11 }}>
                  {t.hops.length} hops
                </span>
                <span style={{ marginLeft: 'auto' }} className={`mono ${t.ok ? (t.stale ? 'warn' : 'good') : 'bad'}`}>
                  {t.ok ? fmtMs(t.latency) : FAIL_LABEL[t.reason!] ?? 'failed'}
                  {t.stale ? ' · stale' : ''}
                </span>
              </div>
              {open === t.id && (
                <div className="trace-b">
                  {t.hops.map((h, i) => {
                    const left = (acc / max) * 100;
                    acc += h.wait + h.svc;
                    return (
                      <div key={i} className="wf">
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name}>
                          {h.name}
                        </span>
                        <div className="bar">
                          <i style={{ left: `${left}%`, width: `${Math.max(0.8, (h.wait / max) * 100)}%`, background: '#f59e0b88' }} title="waiting in queue" />
                          <i style={{ left: `${left + (h.wait / max) * 100}%`, width: `${Math.max(0.8, (h.svc / max) * 100)}%`, background: '#38bdf8' }} title="being processed" />
                        </div>
                        <span className="mono muted" style={{ textAlign: 'right' }}>
                          {h.note ? <b className={h.note === 'HIT' ? 'good' : h.note === 'MISS' ? 'warn' : ''}>{h.note} </b> : null}
                          {fmtMs(h.wait + h.svc)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="faint" style={{ fontSize: 10.5, marginTop: 6 }}>
                    <span style={{ color: '#f59e0b' }}>■</span> queued &nbsp; <span style={{ color: '#38bdf8' }}>■</span> working · remaining time is network round trips
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SandboxControls() {
  const level = useGame((s) => s.level)!;
  const sim = useGame((s) => s.sim);
  const design = useGame((s) => s.design);
  const [, force] = useState(0);
  const src = level.sources[0];
  const rps = src.phases[src.phases.length - 1].rps;
  const setRps = (v: number) => {
    src.phases = [{ at: 0, rps: v }];
    force((x) => x + 1);
  };
  const setMix = (t: ReqType, v: number) => {
    src.mix = { ...src.mix, [t]: v };
    for (const p of src.phases) delete p.mix;
    force((x) => x + 1);
  };
  const regions = [...new Set(design.nodes.map((n) => n.region ?? 'us'))];
  return (
    <div className="panel">
      <div className="panel-h">
        <span>Traffic</span>
        <span className="mono accent">{fmtNum(rps)}/s</span>
      </div>
      <div className="panel-b">
        <input className="range" type="range" min={0} max={9000} step={50} value={rps} onChange={(e) => setRps(Number(e.target.value))} />
        {(['read', 'write', 'static', 'job', 'search', 'ingest'] as ReqType[]).map((t) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 34px', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: REQ_META[t].color }}>{REQ_META[t].label}</span>
            <input className="range" type="range" min={0} max={100} value={src.mix[t] ?? 0} onChange={(e) => setMix(t, Number(e.target.value))} />
            <span className="mono">{src.mix[t] ?? 0}</span>
          </div>
        ))}
        <div className="panel-h" style={{ padding: '12px 0 6px' }}>
          <span>Chaos</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            className="btn sm danger"
            disabled={!sim}
            onClick={() => {
              const targets = [...sim!.nodes.values()].filter((n) => n.kind !== 'users' && n.up);
              if (targets.length) sim!.crash(targets[Math.floor(Math.random() * targets.length)], { reason: 'chaos', recoverAfter: 20 });
            }}
          >
            <Icon name="Flame" size={13} /> Random crash
          </button>
          <button className="btn sm" disabled={!sim} onClick={() => setRps(Math.min(9000, rps * 3))}>
            <Icon name="Zap" size={13} /> 3× spike
          </button>
          {regions.length > 1 && (
            <button
              className="btn sm"
              disabled={!sim}
              onClick={() => sim!.partitions.push({ a: regions[0] as any, b: regions[1] as any, until: sim!.now + 20 })}
            >
              <Icon name="Scale" size={13} /> Partition {regions[0]}/{regions[1]} 20s
            </button>
          )}
          <button
            className="btn sm"
            disabled={!sim}
            onClick={() => {
              for (const n of sim!.nodes.values()) if (n.kind === 'cache') n.cache?.clear();
            }}
          >
            <Icon name="Zap" size={13} /> Flush caches
          </button>
          <button
            className="btn sm danger"
            onClick={() =>
              useGame.getState().askConfirm({
                title: 'Clear the board?',
                body: 'Removes everything except the Users node. Undo with Ctrl+Z.',
                confirmLabel: 'Clear board',
                danger: true,
                onConfirm: useGame.getState().clearDesign,
              })
            }
          >
            <Icon name="Trash" size={13} /> Clear board
          </button>
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Select a component and use <b>Crash</b> in its inspector to kill it specifically. {CATALOG.app.name}s are cheap; databases are not.
        </div>
      </div>
    </div>
  );
}

import { nodeCost } from '../engine/catalog';
import { fmtMs } from '../engine/evaluate';
import type { Design } from '../engine/types';
import { CHAPTERS } from '../content/levels';
import type { Level } from '../content/types';
import { useGame } from '../game/store';
import { Icon, fmtMoney, fmtNum } from './common';

export function designCost(design: Design, level: Level | null): number {
  return design.nodes.reduce((s, n) => s + nodeCost(n.kind, n.tier, n.config, { staticKeys: level?.keyspace.staticKeys }), 0);
}

export function TopBar() {
  const level = useGame((s) => s.level);
  const phase = useGame((s) => s.phase);
  const speed = useGame((s) => s.speed);
  const sim = useGame((s) => s.sim);
  const design = useGame((s) => s.design);
  useGame((s) => s.tick);
  const { togglePlay, reset, setSpeed, go } = useGame.getState();
  if (!level) return null;

  const live = sim ? sim.stats.recent(3) : null;
  const cost = sim ? sim.costRate() : designCost(design, level);
  const t = sim?.now ?? 0;
  const dur = level.duration;
  const chap = CHAPTERS.find((c) => c.id === level.chapter);
  const showStale = level.objectives.some((o) => o.kind === 'stale');
  const showJobs = level.objectives.some((o) => o.kind === 'jobP95');
  const isSandbox = level.id === 'sandbox';

  return (
    <div className="topbar">
      <button className="btn ghost icon" title="Back to map" onClick={() => go(isSandbox ? 'home' : 'map')}>
        <Icon name="ChevronLeft" size={18} />
      </button>
      <div className="title">
        <span style={{ color: chap?.color ?? 'var(--accent)' }}>{isSandbox ? 'Free build' : `Level ${level.id} · ${chap?.title ?? ''}`}</span>
        <b>{level.title}</b>
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
        <button className={`btn ${phase === 'running' ? '' : 'primary'}`} onClick={togglePlay} title="Run / pause (Space)" style={{ minWidth: 92 }}>
          <Icon name={phase === 'running' ? 'Pause' : 'Play'} size={15} />
          {phase === 'build' ? 'Run' : phase === 'running' ? 'Pause' : phase === 'paused' ? 'Resume' : 'Run again'}
        </button>
        <button className="btn icon" onClick={reset} title="Stop & reset" disabled={phase === 'build'}>
          <Icon name="RotateCcw" size={15} />
        </button>
        <div className="seg" title="Simulation speed (keys 1–4)">
          {[1, 2, 4, 8].map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      {!isSandbox && (
        <div className="timebar" title="Simulated time">
          <div className="label">
            <span>{Math.floor(t)}s</span>
            <span>{dur}s</span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${(t / dur) * 100}%` }} />
          </div>
          {(level.chaos ?? []).filter((c) => c.type !== 'notice').map((c, i) => (
            <div key={i} className="mark" style={{ left: `${(c.at / dur) * 100}%` }} title={c.note ?? c.type} />
          ))}
        </div>
      )}
      {isSandbox && <span className="mono muted" style={{ fontSize: 12 }}>t = {Math.floor(t)}s</span>}
      <div className="kpis">
        <Kpi label="Traffic" value={live ? `${fmtNum(live.rps)}/s` : '—'} />
        <Kpi label="Success" value={live && live.rps > 0 ? `${(live.success * 100).toFixed(live.success > 0.999 ? 2 : 1)}%` : '—'} color={live && live.rps > 0 ? (live.success >= 0.99 ? 'var(--good)' : live.success >= 0.95 ? 'var(--warn)' : 'var(--bad)') : undefined} />
        <Kpi label="p95" value={live && live.rps > 0 ? fmtMs(live.p95) : '—'} />
        {showStale && <Kpi label="Stale" value={live ? `${(live.staleRate * 100).toFixed(2)}%` : '—'} />}
        {showJobs && <Kpi label="Jobs/s" value={live ? fmtNum(live.jobsPerSec) : '—'} />}
        <Kpi label="Cost / mo" value={fmtMoney(cost)} color="var(--accent2)" />
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b style={{ color }}>{value}</b>
    </div>
  );
}

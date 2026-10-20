import { useEffect, useRef, useState } from 'react';
import { fmtMs } from '../engine/evaluate';
import { Simulation } from '../engine/sim';
import { TILE } from '../game/rules';
import { demoLevel, statKey, statLabel, statValue } from '../content/demo';
import type { DemoSpec, DemoStat } from '../content/types';
import { bounds } from '../render/geometry';
import { Renderer } from '../render/renderer';
import { Icon, fmtNum } from './common';

/** A live mini-board running the real simulation engine on a scripted design. */
export function DemoPlayer({ spec, height = 250 }: { spec: DemoSpec; height?: number }) {
  const [scene, setScene] = useState(0);
  const [run, setRun] = useState(0);
  const [, setTick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const sc = spec.scenes[Math.min(scene, spec.scenes.length - 1)];

  useEffect(() => {
    const c = canvas.current!;
    const r = new Renderer(c);
    const level = demoLevel(spec, sc);
    const fakeLevel = { board: { regions: spec.regions } } as any;
    const start = () => {
      const sim = new Simulation(level, structuredClone(sc.design));
      sim.start();
      simRef.current = sim;
    };
    start();
    const fit = () => {
      const b = wrap.current!.getBoundingClientRect();
      r.resize(b.width, b.height);
      let bb = bounds(sc.design);
      for (const reg of spec.regions ?? []) {
        const x0 = Math.min(bb.x, reg.x * TILE);
        const y0 = Math.min(bb.y, reg.y * TILE);
        const x1 = Math.max(bb.x + bb.w, (reg.x + reg.w) * TILE);
        const y1 = Math.max(bb.y + bb.h, (reg.y + reg.h) * TILE);
        bb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      const z = Math.max(0.3, Math.min(1.15, Math.min(b.width / (bb.w + 70), b.height / (bb.h + 60))));
      r.cam.z = z;
      r.cam.x = b.width / 2 - (bb.x + bb.w / 2) * z;
      r.cam.y = b.height / 2 - (bb.y + bb.h / 2) * z;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap.current!);
    let raf = 0;
    let last = performance.now();
    let lastTick = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      let sim = simRef.current!;
      if (sim.finished) {
        start();
        sim = simRef.current!;
      }
      sim.advance(dt * (spec.speed ?? 1.5));
      r.ingest(sim, sc.design, ts / 1000, spec.speed ?? 1.5);
      r.draw({
        design: sc.design,
        sim,
        selection: null,
        hoverNode: null,
        hoverEdge: null,
        wiring: null,
        level: fakeLevel,
        now: ts / 1000,
        speed: spec.speed ?? 1.5,
        running: true,
        ghost: null,
        highlight: null,
      });
      if (ts - lastTick > 250) {
        lastTick = ts;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene, run, spec]);

  const sim = simRef.current;
  const stats: DemoStat[] = spec.stats ?? ['rps', 'success', 'p95'];
  const dur = demoLevel(spec, sc).duration;

  return (
    <div className="demo">
      {spec.scenes.length > 1 && (
        <div className="demo-tabs">
          {spec.scenes.map((s, i) => (
            <button key={s.label} className={i === scene ? 'on' : ''} onClick={() => setScene(i)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="demo-board" ref={wrap} style={{ height }}>
        <canvas ref={canvas} />
        <span className="demo-live">
          <i /> LIVE · {sim ? `${Math.floor(sim.now)}s / ${dur}s` : ''}
        </span>
        <button className="demo-restart" title="Restart this demo" onClick={() => setRun((x) => x + 1)}>
          <Icon name="RotateCcw" size={12} />
        </button>
      </div>
      <div className="demo-stats">
        {stats.map((s) => {
          const key = statKey(s);
          const v = sim ? statValue(sim, key) : 0;
          return (
            <div key={key} className="demo-stat">
              <small>{statLabel(s)}</small>
              <b style={{ color: statColor(key, v) }}>{fmtStat(key, v)}</b>
            </div>
          );
        })}
      </div>
      {sc.note && <div className="demo-note">{sc.note}</div>}
    </div>
  );
}

function fmtStat(key: string, v: number): string {
  if (key.endsWith('.util') || key.endsWith('.hit') || key === 'success' || key === 'stale') return `${v.toFixed(key === 'stale' ? 1 : v >= 99.95 || v < 10 ? 1 : 0)}%`;
  if (key === 'p95' || key === 'p50' || key === 'readP95' || key === 'jobP95' || key.endsWith('.lag')) return fmtMs(v);
  if (key === 'cost') return `$${Math.round(v)}`;
  if (key === 'rps' || key.endsWith('.rps')) return `${fmtNum(v)}/s`;
  return fmtNum(v);
}

function statColor(key: string, v: number): string | undefined {
  if (key === 'success') return v >= 99 ? 'var(--good)' : v >= 95 ? 'var(--warn)' : 'var(--bad)';
  if (key.endsWith('.util')) return v < 60 ? 'var(--good)' : v < 85 ? 'var(--warn)' : 'var(--bad)';
  if ((key === 'dataLoss' || key === 'conflicts' || key === 'breaches' || key === 'failed' || key === 'anomalies') && v > 0) return 'var(--bad)';
  if (key === 'stale' && v > 1) return 'var(--warn)';
  return undefined;
}

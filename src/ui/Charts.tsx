import { fmtMs } from '../engine/evaluate';
import { useGame } from '../game/store';
import { TimeChart, fmtMoney, fmtNum } from './common';

export function Charts() {
  const sim = useGame((s) => s.sim);
  const level = useGame((s) => s.level);
  useGame((s) => s.tick);
  const secs = sim ? sim.stats.seconds.slice(-90) : [];
  const ok = secs.map((s) => s.ok);
  const fail = secs.map((s) => s.fail);
  const p50 = secs.map((s) => s.lat.pct(0.5));
  const p95 = secs.map((s) => s.lat.pct(0.95));
  const cost = secs.map((s) => s.cost);
  const offset = sim ? Math.max(0, sim.stats.seconds.length - 90) : 0;
  const marks = (level?.chaos ?? []).filter((c) => c.type !== 'notice').map((c) => Math.round(c.at) - offset - 1).filter((m) => m >= 0 && m < secs.length);
  const last = secs[secs.length - 1];
  return (
    <div className="charts">
      <div className="chart">
        <div className="ct">
          Requests / s
          {last && (
            <>
              <span className="good">{fmtNum(last.ok)} ok</span>
              {last.fail > 0 && <span className="bad">{fmtNum(last.fail)} failed</span>}
            </>
          )}
        </div>
        <TimeChart
          series={[
            { data: ok, color: '#34d399', fill: true, stack: true },
            { data: fail, color: '#f43f5e', fill: true, stack: true },
          ]}
          marks={marks}
          yFmt={fmtNum}
        />
      </div>
      <div className="chart">
        <div className="ct">
          Latency
          <span style={{ color: '#38bdf8' }}>p50</span>
          <span style={{ color: '#f5a524' }}>p95{last && last.ok ? ` ${fmtMs(last.lat.pct(0.95))}` : ''}</span>
        </div>
        <TimeChart
          series={[
            { data: p50, color: '#38bdf8' },
            { data: p95, color: '#f5a524', fill: true },
          ]}
          marks={marks}
          yFmt={(v) => fmtMs(v)}
        />
      </div>
      <div className="chart">
        <div className="ct">
          Cost $/mo
          {last && <span className="accent">{fmtMoney(last.cost)}</span>}
        </div>
        <TimeChart series={[{ data: cost, color: '#ffcb6b', fill: true }]} marks={marks} yFmt={(v) => fmtMoney(v)} />
      </div>
    </div>
  );
}

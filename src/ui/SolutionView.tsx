import { useEffect, useMemo, useState } from 'react';
import { CATALOG } from '../engine/catalog';
import { formatObjectiveValue, objectiveLabel } from '../engine/evaluate';
import { measureCached, type Measurement } from '../engine/measure';
import type { Level } from '../content/types';
import type { DemoSpec } from '../content/types';
import { useGame } from '../game/store';
import { utilColor } from '../render/renderer';
import { Icon, Markdown, Modal, Stars, fmtNum } from './common';
import { DemoPlayer } from './DemoPlayer';

/** Full "why the reference design works" breakdown for a level. */
export function SolutionBody({ level }: { level: Level }) {
  const usedSolution = useGame((s) => s.usedSolution);
  const completed = useGame((s) => !!s.progress.levels[level.id]?.completed);
  const reveal = useGame((s) => s.revealSolution);
  const gated = !completed && !usedSolution;

  if (gated) {
    return (
      <div className="solution-gate">
        <Icon name="Eye" size={28} color="#f5a524" />
        <h3>Spoiler ahead</h3>
        <p className="muted">
          This walks through the reference design and the reasoning behind every choice. You haven't beaten this level yet — peeking caps it at <b>1 star</b>. Worth one more attempt first?
        </p>
        <button className="btn primary" onClick={reveal}>
          Show me why it works
        </button>
      </div>
    );
  }
  return <Breakdown level={level} />;
}

function Breakdown({ level }: { level: Level }) {
  const ex = level.explain;
  const [sol, setSol] = useState<Measurement | null>(null);
  const [traps, setTraps] = useState<(Measurement | null)[]>(() => (level.traps ?? []).map(() => null));

  useEffect(() => {
    let alive = true;
    setSol(null);
    measureCached(`${level.id}:solution`, level, level.solution).then((m) => alive && setSol(m));
    (level.traps ?? []).forEach((t, i) =>
      measureCached(`${level.id}:trap:${t.name}`, level, t.design).then((m) => {
        if (!alive) return;
        setTraps((prev) => {
          const next = [...prev];
          next[i] = m;
          return next;
        });
      }),
    );
    return () => {
      alive = false;
    };
  }, [level]);

  const demo: DemoSpec = useMemo(
    () => ({
      scenes: [{ label: 'Reference design', design: level.solution }],
      level: { ...level },
      speed: Math.max(3, Math.round(level.duration / 25)),
      regions: level.board?.regions,
      stats: ['rps', 'success', 'p95', 'cost'],
    }),
    [level],
  );
  const byId = new Map(level.solution.nodes.map((n) => [n.id, n]));

  return (
    <div className="solution-grid">
      <div>
        {ex ? (
          <>
            <div className="sol-section">The core idea</div>
            <Markdown text={ex.idea} />
            <div className="sol-section">Every choice, explained</div>
            {ex.choices.map((c, i) => {
              const n = c.node ? byId.get(c.node) : undefined;
              const spec = n ? CATALOG[n.kind] : undefined;
              const m = sol?.nodes.find((x) => x.id === c.node);
              return (
                <div key={i} className="choice">
                  <div className="choice-h">
                    {spec ? <Icon name={spec.icon} size={16} color={spec.color} /> : <Icon name="Lightbulb" size={16} color="#facc15" />}
                    <b>{c.title}</b>
                    {n && (
                      <span className="pill" style={{ marginLeft: 'auto' }}>
                        {n.name ?? spec?.name}
                        {n.tier ? ` · ${n.tier}` : ''}
                      </span>
                    )}
                    {m && (
                      <span className="pill mono" style={{ color: utilColor(m.peakUtil) }} title="Peak utilization in the measured run">
                        peak {Math.round(m.peakUtil * 100)}%
                      </span>
                    )}
                  </div>
                  <Markdown text={c.why} />
                </div>
              );
            })}
          </>
        ) : (
          <p className="muted">No written breakdown for this level yet.</p>
        )}
        {(level.traps?.length ?? 0) > 0 && (
          <>
            <div className="sol-section">Why not…?</div>
            {level.traps!.map((t, i) => {
              const m = traps[i];
              const missed = m?.ev.results.filter((r) => !r.met) ?? [];
              return (
                <div key={t.name} className="choice whynot">
                  <div className="choice-h">
                    <Icon name="CircleX" size={16} color="#f43f5e" />
                    <b>…{t.name}?</b>
                    <span style={{ marginLeft: 'auto' }}>{m ? <Stars n={m.ev.stars} size={13} /> : <span className="faint mono">running…</span>}</span>
                  </div>
                  {ex?.whyNot?.[t.name] && <Markdown text={ex.whyNot[t.name]} />}
                  {m && missed.length > 0 && (
                    <div className="missed">
                      {missed.map((r, j) => (
                        <span key={j}>
                          ✕ {objectiveLabel(r.obj)} — got <b className="mono">{formatObjectiveValue(r.obj, r.value)}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        {ex?.takeaway && (
          <div className="interview-box">
            <h4>
              <Icon name="GraduationCap" size={15} /> Take this into the interview
            </h4>
            <Markdown text={ex.takeaway} />
          </div>
        )}
        {level.interview && (
          <>
            <div className="sol-section">The primer's reference design</div>
            <Markdown text={level.interview.reference} />
          </>
        )}
      </div>
      <div className="solution-side">
        <div className="sol-section" style={{ marginTop: 0 }}>
          Watch it run
        </div>
        <DemoPlayer spec={demo} height={300} />
        <div className="sol-section">Measured on this level's traffic</div>
        {!sol ? (
          <div className="faint mono" style={{ fontSize: 12, padding: 8 }}>
            Running the full level in the background…
          </div>
        ) : (
          <>
            <div className="measure">
              <div className="measure-row head">
                <span>Component</span>
                <span>Peak busy</span>
                <span>Avg</span>
                <span>Load</span>
              </div>
              {sol.nodes.map((n) => (
                <div key={n.id} className="measure-row">
                  <span title={n.name}>
                    <Icon name={CATALOG[n.kind].icon} size={12} color={CATALOG[n.kind].color} /> {n.name}
                  </span>
                  <span>
                    <span className="bar-h" style={{ display: 'inline-block', width: 56, verticalAlign: 'middle', marginRight: 6 }}>
                      <i style={{ width: `${Math.min(100, n.peakUtil * 100)}%`, background: utilColor(n.peakUtil) }} />
                    </span>
                    <b className="mono" style={{ color: utilColor(n.peakUtil) }}>
                      {Math.round(n.peakUtil * 100)}%
                    </b>
                  </span>
                  <span className="mono muted">{Math.round(n.avgUtil * 100)}%</span>
                  <span className="mono muted">{fmtNum(n.avgRps)}/s</span>
                </div>
              ))}
            </div>
            <div className="faint" style={{ fontSize: 11, margin: '6px 2px 10px' }}>
              Green = comfortable headroom, amber = busy, red = near saturation. Good designs keep peaks under ~70–85%.
            </div>
            {sol.ev.results.map((r, i) => (
              <div key={i} className={`obj ${r.met ? 'met' : 'miss'}`}>
                <span className="ic">{r.met ? <Icon name="CircleCheck" size={14} color="#34d399" /> : <Icon name="CircleX" size={14} color="#f43f5e" />}</span>
                <div style={{ flex: 1, fontSize: 12.5 }}>
                  {objectiveLabel(r.obj)}
                  {(r.obj.star ?? 1) > 1 && <span className="star-tag">{'★'.repeat(r.obj.star!)}</span>}
                </div>
                <b className="mono" style={{ fontSize: 12 }}>
                  {formatObjectiveValue(r.obj, r.value)}
                </b>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function SolutionModal() {
  const level = useGame((s) => s.level)!;
  const usedSolution = useGame((s) => s.usedSolution);
  const completed = useGame((s) => !!s.progress.levels[level.id]?.completed);
  const { setModal, loadSolution } = useGame.getState();
  return (
    <Modal width={1180} onClose={() => setModal(null)}>
      <div className="modal-h">
        <div className="eyebrow">Why it works · Level {level.id}</div>
        <h2>{level.title}: the reference design</h2>
      </div>
      <div className="modal-b">
        <SolutionBody level={level} />
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={() => setModal(null)} style={{ marginRight: 'auto' }}>
          Close
        </button>
        {(completed || usedSolution) && (
          <button className="btn primary" onClick={loadSolution}>
            <Icon name="Boxes" size={15} /> Load this design onto the board
          </button>
        )}
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { diagnose, formatObjectiveValue, objectiveLabel } from '../engine/evaluate';
import { CODEX_BY_ID } from '../content/codex';
import { LEVELS } from '../content/levels';
import { useGame } from '../game/store';
import { Icon, Markdown, Modal, Stars } from './common';
import { Quiz } from './Quiz';
import { SolutionBody } from './SolutionView';

export function Results() {
  const level = useGame((s) => s.level)!;
  const ev = useGame((s) => s.evaluation);
  const sim = useGame((s) => s.sim);
  const usedSolution = useGame((s) => s.usedSolution);
  const { setModal, reset, openLevel, go, updateProgress } = useGame.getState();
  const [tab, setTab] = useState<'results' | 'debrief' | 'quiz' | 'why'>('results');
  const issues = useMemo(() => (sim ? diagnose(sim) : []), [sim]);
  if (!ev) return null;
  const idx = LEVELS.findIndex((l) => l.id === level.id);
  const next = LEVELS[idx + 1];
  const stars = usedSolution ? Math.min(1, ev.stars) : ev.stars;
  const headline = !ev.passed ? 'Outage report' : stars === 3 ? 'Flawless deployment' : stars === 2 ? 'Solid design' : 'It works… mostly';

  return (
    <Modal width={tab === 'why' ? 1180 : 900} onClose={() => setModal(null)}>
      <div className="modal-h" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: ev.passed ? 'var(--good)' : 'var(--bad)' }}>
            {ev.passed ? 'Level complete' : 'Objectives missed'} · {level.id}
          </div>
          <h2>{headline}</h2>
          <div className="tabs">
            {(['results', 'debrief', 'why', 'quiz'] as const).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t === 'results' ? 'Results' : t === 'debrief' ? 'What you learned' : t === 'quiz' ? `Quiz (${level.quiz.length})` : 'Why the solution works'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Stars n={stars} size={34} />
          {usedSolution && ev.stars > 1 && (
            <div className="faint" style={{ fontSize: 11 }}>
              capped — solution viewed
            </div>
          )}
        </div>
      </div>
      <div className="modal-b">
        {tab === 'results' && (
          <div className="cols2">
            <div>
              {ev.results.map((r, i) => (
                <div key={i} className={`obj ${r.met ? 'met' : 'miss'}`}>
                  <span className="ic">{r.met ? <Icon name="CircleCheck" size={16} color="#34d399" /> : <Icon name="CircleX" size={16} color="#f43f5e" />}</span>
                  <div style={{ flex: 1 }}>
                    {objectiveLabel(r.obj)}
                    {(r.obj.star ?? 1) > 1 && <span className="star-tag">{'★'.repeat(r.obj.star!)}</span>}
                  </div>
                  <b className={`mono ${r.met ? 'good' : 'bad'}`}>{formatObjectiveValue(r.obj, r.value)}</b>
                </div>
              ))}
              {sim && (
                <div className="stats" style={{ marginTop: 12 }}>
                  <MiniStat label="Requests" value={Math.round(sim.stats.offered).toLocaleString()} />
                  <MiniStat label="Failed" value={Math.round(sim.stats.fail).toLocaleString()} />
                  <MiniStat label="p99" value={formatObjectiveValue({ kind: 'p99', target: 0 }, sim.stats.lat.pct(0.99))} />
                </div>
              )}
            </div>
            <div>
              <div className="panel-h" style={{ padding: '0 0 8px' }}>
                <span>Post-mortem</span>
              </div>
              {issues.length === 0 && <div className="muted">No significant problems found. Clean run.</div>}
              {issues.map((is, i) => (
                <div key={i} className={`issue ${is.severity}`}>
                  <div>
                    <b>{is.title}</b>
                    <p>{is.detail}</p>
                    {is.codex && CODEX_BY_ID.get(is.codex) && (
                      <button className="btn sm ghost" style={{ marginTop: 4, paddingLeft: 0 }} onClick={() => go('codex', { codexId: is.codex })}>
                        <Icon name="BookOpen" size={12} /> {CODEX_BY_ID.get(is.codex)!.title}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'debrief' && <Markdown text={level.debrief} />}
        {tab === 'quiz' && (
          <Quiz
            questions={level.quiz}
            onDone={(c, t) =>
              updateProgress((p) => {
                const lp = p.levels[level.id] ?? { stars: 0, completed: false };
                p.levels[level.id] = { ...lp, quizCorrect: Math.max(lp.quizCorrect ?? 0, c), quizTotal: t };
              })
            }
          />
        )}
        {tab === 'why' && <SolutionBody level={level} />}
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={() => go('map')} style={{ marginRight: 'auto' }}>
          <Icon name="Map" size={15} /> Level map
        </button>
        {!ev.passed && (
          <button
            className="btn ghost"
            onClick={() => setTab('why')}
          >
            <Icon name="Eye" size={15} /> Show solution
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            reset();
            setModal(null);
          }}
        >
          <Icon name="RotateCcw" size={15} /> {ev.passed ? 'Improve design' : 'Fix & retry'}
        </button>
        {ev.passed && next && (
          <button className="btn primary" onClick={() => openLevel(next.id)}>
            Next: {next.title} <Icon name="ArrowRight" size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

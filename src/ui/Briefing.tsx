import { useMemo } from 'react';
import { CATALOG } from '../engine/catalog';
import { objectiveLabel } from '../engine/evaluate';
import type { NodeKind } from '../engine/types';
import { CODEX_BY_ID } from '../content/codex';
import { CHAPTERS, LEVELS } from '../content/levels';
import type { Level } from '../content/types';
import { useGame } from '../game/store';
import { Icon, Markdown, Modal, TimeChart, fmtNum } from './common';

export function trafficProfile(level: Level, points = 80): { total: number[]; bots: number[]; max: number } {
  const total: number[] = [];
  const bots: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * level.duration;
    let sum = 0;
    let b = 0;
    for (const s of level.sources) {
      const r = rateAt(s.phases, t);
      if (s.bot) b += r;
      else sum += r;
    }
    total.push(sum);
    bots.push(b);
  }
  return { total, bots, max: Math.max(...total.map((v, i) => v + bots[i])) };
}

function rateAt(ph: { at: number; rps: number }[], t: number): number {
  if (!ph.length) return 0;
  if (t <= ph[0].at) return ph[0].rps;
  for (let i = 0; i < ph.length - 1; i++) {
    const a = ph[i];
    const b = ph[i + 1];
    if (t >= a.at && t < b.at) return b.at === a.at ? b.rps : a.rps + ((b.rps - a.rps) * (t - a.at)) / (b.at - a.at);
  }
  return ph[ph.length - 1].rps;
}

export function BriefingBody() {
  const level = useGame((s) => s.level)!;
  const { go } = useGame.getState();
  const prof = useMemo(() => trafficProfile(level), [level]);
  const newKinds = useMemo(() => {
    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const seen = new Set<NodeKind>();
    for (let i = 0; i < idx; i++) for (const k of LEVELS[i].palette) seen.add(k);
    return level.palette.filter((k) => !seen.has(k));
  }, [level]);
  const marks = (level.chaos ?? []).filter((c) => c.type !== 'notice').map((c) => Math.round((c.at / level.duration) * 79));
  return (
        <div className="cols2">
      <div>
        <Markdown text={level.brief} />
        {level.learn.length > 0 && (
          <>
            <h4 style={{ margin: '16px 0 6px', fontFamily: 'var(--display)' }}>You'll learn</h4>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13.5 }}>
              {level.learn.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div>
        {level.objectives.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div className="panel-h" style={{ padding: '0 0 8px' }}>
              <span>Objectives</span>
            </div>
            {level.objectives.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 6, alignItems: 'center' }}>
                <span className="accent" style={{ width: 34, flex: 'none', fontSize: 11 }}>
                  {'★'.repeat(o.star ?? 1)}
                </span>
                {objectiveLabel(o)}
              </div>
            ))}
          </div>
        )}
        {level.id !== 'sandbox' && (
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div className="panel-h" style={{ padding: '0 0 4px' }}>
              <span>Expected traffic</span>
              <span className="mono accent">peak {fmtNum(prof.max)}/s</span>
            </div>
            <div className="chart" style={{ height: 92, border: 0, background: 'transparent' }}>
              <TimeChart
                series={[
                  { data: prof.total, color: '#38bdf8', fill: true, stack: true },
                  ...(prof.bots.some((b) => b > 0) ? [{ data: prof.bots, color: '#f43f5e', fill: true, stack: true }] : []),
                ]}
                marks={marks}
                yFmt={fmtNum}
              />
            </div>
            <div className="faint" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
              <span>0s</span>
              <span>{marks.length ? <span className="bad">┆ incident</span> : null}</span>
              <span>{level.duration}s</span>
            </div>
          </div>
        )}
        {newKinds.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div className="panel-h" style={{ padding: '0 0 8px' }}>
              <span>New components</span>
            </div>
            {newKinds.map((k) => (
              <div key={k} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <Icon name={CATALOG[k].icon} size={18} color={CATALOG[k].color} />
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                  <b>{CATALOG[k].name}</b>
                  <div className="muted">{CATALOG[k].blurb}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {level.concepts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {level.concepts.map((c) => {
              const e = CODEX_BY_ID.get(c);
              if (!e) return null;
              return (
                <button key={c} className="pill" style={{ cursor: 'pointer' }} onClick={() => go('codex', { codexId: c })}>
                  <Icon name="BookOpen" size={11} /> {e.title}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Briefing() {
  const level = useGame((s) => s.level)!;
  const phase = useGame((s) => s.phase);
  const { setModal } = useGame.getState();
  const chap = CHAPTERS.find((c) => c.id === level.chapter);
  const close = () => setModal(null);

  return (
    <Modal onClose={close}>
      <div className="modal-h">
        <div className="eyebrow" style={{ color: chap?.color }}>
          {level.id === 'sandbox' ? 'Sandbox' : `Level ${level.id} · ${chap?.title}`}
        </div>
        <h2>{level.title}</h2>
        <div className="muted">{level.tagline}</div>
      </div>
      <div className="modal-b">
        <BriefingBody />
      </div>
      <div className="modal-f">
        <span className="faint" style={{ marginRight: 'auto', fontSize: 12 }}>
          Design first, then press <kbd>Space</kbd> to run. You can keep editing while it runs.
        </span>
        <button className="btn primary lg" onClick={close}>
          {phase === 'build' ? 'Start building' : 'Back to the board'} <Icon name="ArrowRight" size={16} />
        </button>
      </div>
    </Modal>
  );
}

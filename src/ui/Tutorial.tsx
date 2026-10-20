import { useEffect } from 'react';
import type { TutorialCheck } from '../content/types';
import { useGame } from '../game/store';
import { Icon, Markdown } from './common';

function checkStep(c: TutorialCheck): boolean {
  const st = useGame.getState();
  const d = st.design;
  switch (c.type) {
    case 'node':
      return d.nodes.filter((n) => n.kind === c.kind).length >= (c.count ?? 1);
    case 'edge':
      return d.edges.some((e) => d.nodes.find((n) => n.id === e.from)?.kind === c.from && d.nodes.find((n) => n.id === e.to)?.kind === c.to);
    case 'select':
      return st.selection?.type === 'node' && d.nodes.find((n) => n.id === st.selection!.id)?.kind === c.kind;
    case 'running':
      return st.phase !== 'build';
    case 'tier':
      return d.nodes.some((n) => n.kind === c.kind && n.tier === c.tier);
    case 'config':
      return d.nodes.some((n) => n.kind === c.kind && n.config[c.key] === c.value);
    case 'manual':
      return false;
  }
}

export function Tutorial() {
  const level = useGame((s) => s.level);
  const step = useGame((s) => s.tutorialStep);
  const modal = useGame((s) => s.modal);
  const show = useGame((s) => s.progress.settings.showTutorial);
  useGame((s) => s.tick);
  useGame((s) => s.design);
  useGame((s) => s.selection);
  useGame((s) => s.phase);
  const steps = level?.tutorial;
  const cur = steps?.[step];

  useEffect(() => {
    if (!cur || modal) return;
    if (checkStep(cur.check)) {
      const t = setTimeout(() => useGame.getState().advanceTutorial(), 350);
      return () => clearTimeout(t);
    }
  });

  if (!steps || !cur || modal || !show) return null;
  return (
    <div className="coach">
      <Icon name="Sparkles" size={20} color="#38bdf8" />
      <div style={{ flex: 1 }}>
        <Markdown text={cur.text} />
        <div className="steps">
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>
      {cur.check.type === 'manual' ? (
        <button className="btn sm primary" onClick={() => useGame.getState().advanceTutorial()}>
          Got it
        </button>
      ) : (
        <button className="btn sm ghost" title="Skip tutorial" onClick={() => useGame.getState().updateProgress((p) => (p.settings.showTutorial = false))}>
          Skip
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`} onClick={() => dismiss(t.id)}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

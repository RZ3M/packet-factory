import { useEffect, useState } from 'react';
import { CHAPTERS } from '../content/levels';
import type { LessonStep } from '../content/types';
import { useGame } from '../game/store';
import { BriefingBody } from './Briefing';
import { Icon, Markdown, Modal } from './common';
import { DemoPlayer } from './DemoPlayer';
import { Widget } from './Widgets';

/** One lesson page: explanation on the left, live demo / widget on the right. */
export function LessonStepView({ step }: { step: LessonStep }) {
  const visual = step.demo || step.widget;
  return (
    <div className={visual ? 'lesson-grid' : 'lesson-solo'}>
      <div>
        <h3 className="lesson-title">{step.title}</h3>
        <Markdown text={step.body} />
        {step.tip && (
          <div className="lesson-tip">
            <b>
              <Icon name="MousePointer2" size={13} /> In the game
            </b>
            <Markdown text={step.tip} />
          </div>
        )}
      </div>
      {visual && <div>{step.demo ? <DemoPlayer key={step.title} spec={step.demo} /> : <Widget id={step.widget!} />}</div>}
    </div>
  );
}

export function LessonModal({ atMission }: { atMission?: boolean }) {
  const level = useGame((s) => s.level)!;
  const phase = useGame((s) => s.phase);
  const { setModal, updateProgress } = useGame.getState();
  const steps = level.lesson ?? [];
  const missionIdx = steps.length;
  const [i, setI] = useState(atMission ? missionIdx : 0);
  const chap = CHAPTERS.find((c) => c.id === level.chapter);
  const close = () => setModal(null);

  useEffect(() => {
    if (i === missionIdx && steps.length) {
      updateProgress((p) => {
        if (!p.lessonsSeen.includes(level.id)) p.lessonsSeen.push(level.id);
      });
    }
  }, [i]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') setI((x) => Math.min(missionIdx, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [missionIdx]);

  const step = i < missionIdx ? steps[i] : null;
  return (
    <Modal width={1080} onClose={close}>
      <div className="modal-h">
        <div className="eyebrow" style={{ color: chap?.color }}>
          {step ? `Lesson · Level ${level.id}` : `Level ${level.id} · ${chap?.title ?? ''}`}
        </div>
        <h2>{step ? level.title : `Your mission: ${level.title}`}</h2>
        {steps.length > 0 && (
          <div className="lesson-steps">
            {steps.map((s, j) => (
              <button key={s.title} className={j === i ? 'on' : j < i ? 'done' : ''} onClick={() => setI(j)}>
                <span>{j + 1}</span> {s.title}
              </button>
            ))}
            <button className={i === missionIdx ? 'on mission' : 'mission'} onClick={() => setI(missionIdx)}>
              <Icon name="Target" size={12} /> Mission
            </button>
          </div>
        )}
      </div>
      <div className="modal-b" style={{ minHeight: 380 }}>
        {step ? <LessonStepView step={step} /> : <BriefingBody />}
      </div>
      <div className="modal-f">
        {i > 0 && (
          <button className="btn ghost" onClick={() => setI(i - 1)}>
            <Icon name="ChevronLeft" size={15} /> Back
          </button>
        )}
        <span className="faint" style={{ marginRight: 'auto', fontSize: 12 }}>
          {step ? (
            <>
              <kbd>←</kbd> <kbd>→</kbd> to navigate · the demos are the real simulator
            </>
          ) : (
            <>
              Design first, then press <kbd>Space</kbd> to run. Replay this lesson any time from the Objectives panel.
            </>
          )}
        </span>
        {step && (
          <button className="btn ghost" onClick={() => setI(missionIdx)}>
            Skip to mission
          </button>
        )}
        {step ? (
          <button className="btn primary" onClick={() => setI(i + 1)}>
            {i + 1 === missionIdx ? 'Your mission' : 'Next'} <Icon name="ArrowRight" size={15} />
          </button>
        ) : (
          <button className="btn primary lg" onClick={close}>
            {phase === 'build' ? 'Start building' : 'Back to the board'} <Icon name="ArrowRight" size={16} />
          </button>
        )}
      </div>
    </Modal>
  );
}

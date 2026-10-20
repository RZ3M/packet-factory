import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { BriefingBody } from './Briefing';
import { Icon, Markdown, Modal } from './common';
import { LessonStepView } from './Lesson';
import { Quiz } from './Quiz';

/** Where the player was in each capstone's interview, so reopening it resumes there. */
const memory = new Map<string, { step: number; sub: number; vals: string[]; checked: boolean }>();

export function InterviewModal() {
  const level = useGame((s) => s.level)!;
  const phase = useGame((s) => s.phase);
  const iv = level.interview!;
  const { setModal } = useGame.getState();
  const saved = memory.get(level.id);
  const [step, setStep] = useState(saved?.step ?? 0);
  const [sub, setSub] = useState(saved?.sub ?? 0);
  const [vals, setVals] = useState<string[]>(() => saved?.vals ?? iv.estimates.map(() => ''));
  const [checked, setChecked] = useState(saved?.checked ?? false);

  useEffect(() => {
    memory.set(level.id, { step, sub, vals, checked });
  }, [level.id, step, sub, vals, checked]);

  const patterns = level.lesson ?? [];
  const steps = ['The question', 'Step 1 · Clarify', 'Back of the envelope', ...(patterns.length ? ['Key patterns'] : []), 'Build'];
  const buildIdx = steps.length - 1;
  const patIdx = patterns.length ? 3 : -1;
  const close = () => setModal(null);

  const next = () => {
    if (step === patIdx && sub < patterns.length - 1) setSub(sub + 1);
    else setStep(Math.min(buildIdx, step + 1));
  };
  const back = () => {
    if (step === patIdx && sub > 0) setSub(sub - 1);
    else {
      const to = step - 1;
      if (to === patIdx) setSub(patterns.length - 1);
      setStep(Math.max(0, to));
    }
  };
  const lastBeforeBuild = step === buildIdx - 1 && (step !== patIdx || sub === patterns.length - 1);

  return (
    <Modal width={step === patIdx || step === buildIdx ? 1080 : 860} onClose={close}>
      <div className="modal-h">
        <div className="eyebrow">Interview capstone · {level.id}</div>
        <h2>{level.title}</h2>
        <div className="tabs">
          {steps.map((s, i) => (
            <button key={s} className={step === i ? 'on' : ''} onClick={() => setStep(i)}>
              {i + 1}. {s}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-b">
        {step === 0 && (
          <>
            <div className="interview-box">
              <h4>
                <Icon name="GraduationCap" size={15} /> Interviewer
              </h4>
              <Markdown text={iv.prompt} />
            </div>
            <Markdown
              text={`A system design interview is an **open-ended conversation you lead**. The primer's four steps:

1. **Outline use cases, constraints and assumptions** — who uses it, how, how much traffic, read/write ratio.
2. **Create a high-level design** — sketch the main components and connections.
3. **Design core components** — dive into the interesting parts (schemas, APIs, algorithms).
4. **Scale the design** — find bottlenecks and fix them: load balancers, horizontal scaling, caching, sharding, async.

This capstone walks you through step 1, the estimates and the key patterns, then you build steps 2–4 on the board and the simulator plays the role of production traffic. You can come back to any tab at any time.`}
            />
          </>
        )}
        {step === 1 && <Quiz questions={iv.clarify} persistKey={`clarify:${level.id}`} />}
        {step === 2 && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Handy conversions: <b className="mono">2.5 million seconds per month</b> · 1 req/s ≈ 2.5M req/month · 40 req/s ≈ 100M/month · 400 req/s ≈ 1B/month. Answers within the tolerance count.
            </p>
            {iv.estimates.map((e, i) => {
              const v = Number(vals[i].replace(/[,_\s]/g, ''));
              const ok = checked && isFinite(v) && Math.abs(v - e.answer) <= Math.abs(e.answer) * e.tolerance;
              return (
                <div key={i} className="quiz-q">
                  <h4>
                    <span className="accent mono" style={{ marginRight: 8 }}>
                      E{i + 1}
                    </span>
                    {e.q}
                  </h4>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="numin"
                      value={vals[i]}
                      placeholder="your estimate"
                      onChange={(ev) => {
                        const nv = [...vals];
                        nv[i] = ev.target.value;
                        setVals(nv);
                        setChecked(false);
                      }}
                    />
                    <span className="muted">{e.unit}</span>
                    {checked && (ok ? <Icon name="CircleCheck" size={18} color="#34d399" /> : <Icon name="CircleX" size={18} color="#f43f5e" />)}
                  </div>
                  {checked && (
                    <div className="quiz-explain" style={{ marginTop: 8 }}>
                      ≈ <b className="mono">{e.answer.toLocaleString()}</b> {e.unit}. {e.explain}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn" onClick={() => setChecked(true)}>
              <Icon name="Calculator" size={14} /> Check my math
            </button>
          </div>
        )}
        {step === patIdx && (
          <>
            <div className="lesson-steps" style={{ marginBottom: 12 }}>
              {patterns.map((p, j) => (
                <button key={p.title} className={j === sub ? 'on' : j < sub ? 'done' : ''} onClick={() => setSub(j)}>
                  <span>{j + 1}</span> {p.title}
                </button>
              ))}
            </div>
            <LessonStepView step={patterns[Math.min(sub, patterns.length - 1)]} />
          </>
        )}
        {step === buildIdx && <BriefingBody />}
      </div>
      <div className="modal-f">
        {step > 0 && (
          <button className="btn ghost" onClick={back}>
            <Icon name="ChevronLeft" size={15} /> Back
          </button>
        )}
        <span className="faint" style={{ marginRight: 'auto', fontSize: 12 }}>
          {step === buildIdx ? (
            <>
              Reopen this interview any time with <b>Brief</b> in the Objectives panel.
            </>
          ) : null}
        </span>
        {step === buildIdx ? (
          <button className="btn primary lg" onClick={close}>
            {phase === 'build' ? 'Start building' : 'Back to the board'} <Icon name="ArrowRight" size={16} />
          </button>
        ) : (
          <button className="btn primary" onClick={next}>
            {lastBeforeBuild ? 'See the brief & build' : 'Next'} <Icon name="ArrowRight" size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import type { QuizQ } from '../content/types';
import { Icon } from './common';

/** Answers kept across remounts (e.g. switching interview tabs) when a persistKey is given. */
const remembered = new Map<string, (number | null)[]>();

export function Quiz({ questions, onDone, persistKey }: { questions: QuizQ[]; onDone?: (correct: number, total: number) => void; persistKey?: string }) {
  const [picked, setPickedState] = useState<(number | null)[]>(() => (persistKey && remembered.get(persistKey)) || questions.map(() => null));
  const setPicked = (p: (number | null)[]) => {
    if (persistKey) remembered.set(persistKey, p);
    setPickedState(p);
  };
  const answered = picked.filter((p) => p !== null).length;
  const correct = picked.filter((p, i) => p === questions[i].answer).length;

  const pick = (qi: number, oi: number) => {
    if (picked[qi] !== null) return;
    const next = [...picked];
    next[qi] = oi;
    setPicked(next);
    if (next.every((p) => p !== null)) onDone?.(next.filter((p, i) => p === questions[i].answer).length, questions.length);
  };

  if (!questions.length) return <div className="muted">No questions for this level.</div>;
  return (
    <div>
      {questions.map((q, qi) => (
        <div key={qi} className="quiz-q">
          <h4>
            <span className="accent mono" style={{ marginRight: 8 }}>
              Q{qi + 1}
            </span>
            {q.q}
          </h4>
          {q.options.map((o, oi) => {
            const p = picked[qi];
            const cls = p === null ? '' : oi === q.answer ? 'correct' : p === oi ? 'wrong' : '';
            return (
              <button key={oi} className={`quiz-opt ${cls}`} disabled={p !== null} onClick={() => pick(qi, oi)}>
                <span className="mono faint">{String.fromCharCode(65 + oi)}</span>
                <span style={{ flex: 1 }}>{o}</span>
                {p !== null && oi === q.answer && <Icon name="Check" size={15} color="#34d399" />}
                {p === oi && oi !== q.answer && <Icon name="X" size={15} color="#f43f5e" />}
              </button>
            );
          })}
          {picked[qi] !== null && <div className="quiz-explain">{q.explain}</div>}
        </div>
      ))}
      {answered === questions.length && (
        <div className="card" style={{ textAlign: 'center', padding: 12 }}>
          <b className="display" style={{ fontSize: 18 }}>
            {correct} / {questions.length} correct
          </b>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {correct === questions.length ? 'Interview-ready on this topic.' : 'Re-read the explanations — these come up in interviews.'}
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { DRILL } from '../content/drill';
import { LEVELS } from '../content/levels';
import type { QuizQ } from '../content/types';
import { useGame } from '../game/store';
import { Icon } from './common';

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function Drill() {
  const progress = useGame((s) => s.progress);
  const { go, updateProgress } = useGame.getState();
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const pool = useMemo(() => {
    const qs: (QuizQ & { src: string })[] = [];
    for (const l of LEVELS) {
      if (onlyUnlocked && !progress.levels[l.id]?.completed) continue;
      for (const q of l.quiz) qs.push({ ...q, src: `${l.id} ${l.title}` });
    }
    for (const q of DRILL) qs.push({ ...q, src: q.topic });
    return qs;
  }, [onlyUnlocked, progress.levels]);
  const [round, setRound] = useState(0);
  const deck = useMemo(() => shuffle(pool).slice(0, 10), [pool, round]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const q = deck[i];
  const done = i >= deck.length;

  const choose = (oi: number) => {
    if (picked !== null) return;
    setPicked(oi);
    if (oi === q.answer) setRight((r) => r + 1);
  };
  const next = () => {
    const ni = i + 1;
    setI(ni);
    setPicked(null);
    if (ni >= deck.length && right > progress.drillBest) updateProgress((p) => (p.drillBest = right));
  };
  const restart = () => {
    setRound((r) => r + 1);
    setI(0);
    setPicked(null);
    setRight(0);
  };

  return (
    <div className="screen">
      <div className="wrapw" style={{ maxWidth: 760 }}>
        <div className="pagehead">
          <button className="btn ghost icon" onClick={() => go('home')}>
            <Icon name="ChevronLeft" size={18} />
          </button>
          <h1>Interview drill</h1>
          <span className="pill">best {progress.drillBest}/10</span>
          <label className="muted" style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyUnlocked} onChange={(e) => setOnlyUnlocked(e.target.checked)} /> only completed levels
          </label>
        </div>
        {done ? (
          <div className="card" style={{ textAlign: 'center', padding: 30 }}>
            <Icon name="Trophy" size={36} color="#f5a524" />
            <h2 className="display" style={{ fontSize: 30, margin: '10px 0 4px' }}>
              {right} / {deck.length}
            </h2>
            <p className="muted">{right >= 9 ? 'You would breeze through this round.' : right >= 7 ? 'Strong. Review the misses in the Codex.' : 'Keep drilling — read the explanations, they are the point.'}</p>
            <button className="btn primary" onClick={restart}>
              <Icon name="RotateCcw" size={14} /> Another round
            </button>
          </div>
        ) : q ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="pill">{q.src}</span>
              <span className="mono muted">
                {i + 1}/{deck.length} · {right} right
              </span>
            </div>
            <h3 style={{ margin: '0 0 14px', fontSize: 18, lineHeight: 1.45 }}>{q.q}</h3>
            {q.options.map((o, oi) => {
              const cls = picked === null ? '' : oi === q.answer ? 'correct' : picked === oi ? 'wrong' : '';
              return (
                <button key={oi} className={`quiz-opt ${cls}`} disabled={picked !== null} onClick={() => choose(oi)}>
                  <span className="mono faint">{String.fromCharCode(65 + oi)}</span>
                  <span style={{ flex: 1 }}>{o}</span>
                </button>
              );
            })}
            {picked !== null && (
              <>
                <div className="quiz-explain">{q.explain}</div>
                <div style={{ textAlign: 'right', marginTop: 12 }}>
                  <button className="btn primary" onClick={next}>
                    {i + 1 >= deck.length ? 'Finish' : 'Next'} <Icon name="ArrowRight" size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="muted">Complete some levels to unlock questions.</div>
        )}
      </div>
    </div>
  );
}

import { CHAPTERS, LEVELS } from '../content/levels';
import { useGame } from '../game/store';
import { Icon, Stars, Toggle } from './common';

export function isUnlocked(id: string, progress: ReturnType<typeof useGame.getState>['progress']): boolean {
  if (progress.settings.unlockAll) return true;
  const idx = LEVELS.findIndex((l) => l.id === id);
  if (idx <= 0) return true;
  return !!progress.levels[LEVELS[idx - 1].id]?.completed || !!progress.levels[id]?.completed;
}

export function LevelSelect() {
  const progress = useGame((s) => s.progress);
  const { go, openLevel, updateProgress } = useGame.getState();
  const next = LEVELS.find((l) => !progress.levels[l.id]?.completed);
  const totalStars = Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  return (
    <div className="screen">
      <div className="wrapw">
        <div className="pagehead">
          <button className="btn ghost icon" onClick={() => go('home')} title="Home">
            <Icon name="ChevronLeft" size={18} />
          </button>
          <h1>Campaign</h1>
          <span className="pill">
            <Stars n={1} max={1} size={12} /> {totalStars} / {LEVELS.length * 3}
          </span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }} className="muted">
            Unlock all levels
            <Toggle on={progress.settings.unlockAll} onChange={(v) => updateProgress((p) => (p.settings.unlockAll = v))} />
          </label>
        </div>
        {CHAPTERS.map((ch) => {
          const levels = LEVELS.filter((l) => l.chapter === ch.id);
          if (!levels.length) return null;
          const stars = levels.reduce((s, l) => s + (progress.levels[l.id]?.stars ?? 0), 0);
          return (
            <section key={ch.id} className="chapter">
              <div className="chapter-h">
                <span className="num" style={{ color: ch.color }}>
                  Chapter {ch.id}
                </span>
                <h2>{ch.title}</h2>
                <span className="muted" style={{ fontSize: 13 }}>
                  {ch.subtitle}
                </span>
                <span className="pill" style={{ marginLeft: 'auto' }}>
                  {stars} / {levels.length * 3} ★
                </span>
                <p>{ch.blurb}</p>
              </div>
              <div className="line">
                {levels.map((l) => {
                  const lp = progress.levels[l.id];
                  const unlocked = isUnlocked(l.id, progress);
                  const isNext = next?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      className={`lvl ${!unlocked ? 'locked' : ''} ${lp?.completed ? 'done' : ''} ${isNext && unlocked ? 'next' : ''}`}
                      onClick={() => unlocked && openLevel(l.id)}
                      style={{ borderTop: `3px solid ${ch.color}${lp?.completed ? '' : '55'}` }}
                    >
                      <span className="id">
                        {l.id}
                        {l.interview ? ' · interview' : ''}
                      </span>
                      <b>{l.title}</b>
                      <span className="tg">{l.tagline}</span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {unlocked ? <Stars n={lp?.stars ?? 0} size={15} /> : <Icon name="Lock" size={14} color="#5b6b82" />}
                        {isNext && unlocked && <span className="pill" style={{ color: 'var(--accent)' }}>next</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

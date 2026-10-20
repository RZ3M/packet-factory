import { useEffect, useMemo, useRef, useState } from 'react';
import { CODEX, CODEX_BY_ID, CODEX_SECTIONS } from '../content/codex';
import { LEVELS } from '../content/levels';
import { useGame } from '../game/store';
import { isUnlocked } from './LevelSelect';
import { Icon, Markdown } from './common';

export function CodexScreen() {
  const codexId = useGame((s) => s.codexId);
  const progress = useGame((s) => s.progress);
  const level = useGame((s) => s.level);
  const { go, openLevel } = useGame.getState();
  const [q, setQ] = useState('');
  const main = useRef<HTMLDivElement>(null);
  const entry = CODEX_BY_ID.get(codexId ?? '') ?? CODEX[0];
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [entry.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return CODEX;
    return CODEX.filter((c) => c.title.toLowerCase().includes(s) || c.tldr.toLowerCase().includes(s) || c.body.toLowerCase().includes(s));
  }, [q]);
  const usedIn = LEVELS.filter((l) => l.concepts.includes(entry.id));
  const back = level && level.id ? () => go('game') : () => go('home');

  return (
    <div className="codex">
      <nav className="codex-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn ghost icon" onClick={back} title={level ? 'Back to the level' : 'Home'}>
            <Icon name="ChevronLeft" size={18} />
          </button>
          <b className="display" style={{ fontSize: 18 }}>
            Codex
          </b>
          <span className="pill" style={{ marginLeft: 'auto' }}>
            {progress.codexSeen.length}/{CODEX.length}
          </span>
        </div>
        <input placeholder="Search topics…" value={q} onChange={(e) => setQ(e.target.value)} />
        {CODEX_SECTIONS.map((sec) => {
          const items = filtered.filter((c) => c.section === sec);
          if (!items.length) return null;
          return (
            <div key={sec}>
              <h5>{sec}</h5>
              {items.map((c) => (
                <button key={c.id} className={`it ${c.id === entry.id ? 'on' : ''}`} onClick={() => go('codex', { codexId: c.id })}>
                  {progress.codexSeen.includes(c.id) ? <Icon name="Check" size={12} color="#34d399" /> : <span style={{ width: 12 }} />}
                  {c.title}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <main className="codex-main" ref={main}>
        <article className="codex-art">
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {entry.section}
          </div>
          <h1>{entry.title}</h1>
          <div className="tldr">{entry.tldr}</div>
          <Markdown text={entry.body} />
          {(entry.pros?.length || entry.cons?.length) && (
            <div className="procon">
              {entry.pros?.length ? (
                <div>
                  <h4 className="good">Advantages</h4>
                  <ul>
                    {entry.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {entry.cons?.length ? (
                <div>
                  <h4 className="bad">Disadvantages</h4>
                  <ul>
                    {entry.cons.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
          {entry.interview?.length ? (
            <div className="interview-box">
              <h4>
                <Icon name="GraduationCap" size={15} /> In the interview
              </h4>
              <ul>
                {entry.interview.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {usedIn.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="faint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Practice it in
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {usedIn.map((l) => (
                  <button key={l.id} className="pill" style={{ cursor: 'pointer' }} disabled={!isUnlocked(l.id, progress)} onClick={() => openLevel(l.id)}>
                    <Icon name="Play" size={10} /> {l.id} {l.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {entry.related?.length ? (
            <div style={{ marginTop: 14 }}>
              <div className="faint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Related
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {entry.related.map((r) => {
                  const e = CODEX_BY_ID.get(r);
                  return e ? (
                    <button key={r} className="pill" style={{ cursor: 'pointer' }} onClick={() => go('codex', { codexId: r })}>
                      {e.title}
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          ) : null}
          <p style={{ marginTop: 22, fontSize: 12.5 }} className="muted">
            Go deeper:{' '}
            <a href={entry.primer} target="_blank" rel="noreferrer">
              System Design Primer — {entry.title} ↗
            </a>
          </p>
          <p className="faint" style={{ fontSize: 11, marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            Adapted from{' '}
            <a href="https://github.com/donnemartin/system-design-primer" target="_blank" rel="noreferrer">
              The System Design Primer
            </a>{' '}
            by Donne Martin, licensed{' '}
            <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            . Condensed, reorganized and extended for this game.
          </p>
        </article>
      </main>
    </div>
  );
}

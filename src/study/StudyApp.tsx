// Mobile-first Study mode: animated lectures, interview prep, library and flashcards.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CODEX } from '../content/codex';
import { DRILL } from '../content/drill';
import { LEVELS, LEVEL_BY_ID } from '../content/levels';
import type { QuizQ } from '../content/types';
import { useGame } from '../game/store';
import { Icon, Markdown } from '../ui/common';
import './icons';
import './study.css';
import { CARDS, DECKS } from './content/cards';
import { LECTURE_BY_ID, LECTURES, nextLecture, TRACKS } from './content/index';
import { designToFrames, EXTRA_QUESTIONS, SOLVED } from './content/interview';
import { ARCHITECTURES, BLOGS, COMPANIES, READING_TIPS } from './content/library';
import { OOD } from './content/ood';
import { isDue, streak, useStudy, type Grade } from './progress';
import type { Flashcard, Slide } from './types';
import { Diagram, VisualView } from './Visuals';

type Tab = 'learn' | 'interview' | 'library' | 'practice';
type Route =
  | { p: 'track'; id: string }
  | { p: 'lecture'; id: string }
  | { p: 'solved'; id: string }
  | { p: 'ood'; id: string }
  | { p: 'cards'; deck?: string }
  | { p: 'quiz' };

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'learn', label: 'Learn', icon: 'BookOpen' },
  { id: 'interview', label: 'Interview', icon: 'GraduationCap' },
  { id: 'library', label: 'Library', icon: 'Library' },
  { id: 'practice', label: 'Practice', icon: 'Layers3' },
];

const CODEX_BY_ID = new Map(CODEX.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Shell + navigation (browser back button pops the in-app stack)

export function StudyApp() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorageGet('pf-study-tab') as Tab) || 'learn');
  const [stack, setStack] = useState<Route[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    sessionStorageSet('pf-study-tab', tab);
  }, [tab]);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [tab, stack.length]);

  const push = useCallback((r: Route) => {
    history.pushState({ study: true }, '');
    setStack((s) => [...s, r]);
  }, []);
  const back = useCallback(() => history.back(), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const switchTab = (t: Tab) => {
    if (stack.length) history.go(-stack.length);
    setStack([]);
    setTab(t);
  };

  const top = stack[stack.length - 1];
  const nav: Nav = { push, back, replace };

  if (top?.p === 'lecture') return <LecturePlayer key={top.id} id={top.id} nav={nav} />;
  if (top?.p === 'cards') return <CardSession deck={top.deck} nav={nav} />;
  if (top?.p === 'quiz') return <QuizSession nav={nav} />;

  let body: ReactNode;
  if (top?.p === 'track') body = <TrackPage id={top.id} nav={nav} />;
  else if (top?.p === 'solved') body = <SolvedPage id={top.id} nav={nav} />;
  else if (top?.p === 'ood') body = <OodPage id={top.id} nav={nav} />;
  else if (tab === 'learn') body = <LearnHome nav={nav} />;
  else if (tab === 'interview') body = <InterviewHome nav={nav} />;
  else if (tab === 'library') body = <LibraryHome />;
  else body = <PracticeHome nav={nav} />;

  return (
    <div className="st-app">
      <header className="st-top">
        {top ? (
          <button className="st-icon-btn" onClick={back} aria-label="Back">
            <Icon name="ChevronLeft" size={20} />
          </button>
        ) : (
          <div className="st-brand">
            <span className="st-logo">PF</span>
            <b>Study</b>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="st-chip" onClick={() => useGame.getState().go('home')}>
          <Icon name="Gamepad2" size={14} /> Play the game
        </button>
      </header>
      <main className="st-scroll" ref={scrollRef}>
        <div className="st-page">{body}</div>
      </main>
      <nav className="st-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id && !top ? 'on' : tab === t.id ? 'half' : ''} onClick={() => switchTab(t.id)}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

interface Nav {
  push: (r: Route) => void;
  back: () => void;
  replace: (r: Route) => void;
}

function sessionStorageGet(k: string) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Learn

function LearnHome({ nav }: { nav: Nav }) {
  const done = useStudy((s) => s.lectures);
  const last = useStudy((s) => s.last);
  const total = LECTURES.length;
  const finished = LECTURES.filter((e) => done[e.lecture.id]).length;
  const resume = (last && !done[last] ? last : undefined) ?? LECTURES.find((e) => !done[e.lecture.id])?.lecture.id;
  const resumeEntry = resume ? LECTURE_BY_ID.get(resume) : undefined;

  return (
    <>
      <h1 className="st-h1">System design, one bite at a time</h1>
      <p className="st-lead">Short animated lectures covering the whole System Design Primer. Tap a diagram to pause it.</p>
      <div className="st-progress-card">
        <Ring value={finished / total} color="var(--accent)" />
        <div>
          <b>
            {finished} / {total} lectures
          </b>
          <span>{Math.round((finished / total) * 100)}% of the primer covered</span>
        </div>
      </div>
      {resumeEntry && (
        <button className="st-resume" style={{ ['--c' as any]: resumeEntry.track.color }} onClick={() => nav.push({ p: 'lecture', id: resumeEntry.lecture.id })}>
          <span className="st-resume-k">{last === resume ? 'Continue' : 'Up next'}</span>
          <b>{resumeEntry.lecture.title}</b>
          <span>
            {resumeEntry.track.title} · {resumeEntry.lecture.minutes} min
          </span>
          <Icon name="Play" size={22} className="st-resume-play" />
        </button>
      )}
      <h2 className="st-h2">Tracks</h2>
      <div className="st-list">
        {TRACKS.map((t) => {
          const n = t.lectures.filter((l) => done[l.id]).length;
          return (
            <button key={t.id} className="st-row" onClick={() => nav.push({ p: 'track', id: t.id })}>
              <span className="st-row-icon" style={{ background: t.color + '22', color: t.color }}>
                <Icon name={t.icon} size={20} />
              </span>
              <span className="st-row-main">
                <b>{t.title}</b>
                <span>{t.blurb}</span>
                <Bar value={n / t.lectures.length} color={t.color} />
              </span>
              <span className="st-row-meta">
                {n}/{t.lectures.length}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function TrackPage({ id, nav }: { id: string; nav: Nav }) {
  const t = TRACKS.find((x) => x.id === id)!;
  const done = useStudy((s) => s.lectures);
  return (
    <>
      <div className="st-track-head" style={{ ['--c' as any]: t.color }}>
        <span className="st-row-icon big" style={{ background: t.color + '22', color: t.color }}>
          <Icon name={t.icon} size={26} />
        </span>
        <h1 className="st-h1">{t.title}</h1>
        <p className="st-lead">{t.blurb}</p>
      </div>
      <div className="st-list">
        {t.lectures.map((l, i) => (
          <button key={l.id} className="st-row" onClick={() => nav.push({ p: 'lecture', id: l.id })}>
            <span className={`st-num ${done[l.id] ? 'done' : ''}`} style={{ ['--c' as any]: t.color }}>
              {done[l.id] ? <Icon name="Check" size={15} /> : i + 1}
            </span>
            <span className="st-row-main">
              <b>{l.title}</b>
              <span>{l.blurb}</span>
            </span>
            <span className="st-row-meta">
              {l.minutes} min
              <br />
              {l.slides.length} slides
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function LecturePlayer({ id, nav }: { id: string; nav: Nav }) {
  const entry = LECTURE_BY_ID.get(id)!;
  const { lecture, track } = entry;
  const saved = useStudy.getState().slide[id] ?? 0;
  const [i, setI] = useState(Math.min(saved, lecture.slides.length - 1));
  const [finished, setFinished] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = lecture.slides.length;

  useEffect(() => {
    useStudy.getState().setSlide(id, i);
  }, [id, i]);

  const next = useCallback(() => {
    if (i < n - 1) setI(i + 1);
    else {
      useStudy.getState().completeLecture(id);
      useStudy.getState().setSlide(id, 0);
      setFinished(true);
    }
  }, [i, n, id]);
  const prev = useCallback(() => {
    if (finished) setFinished(false);
    else if (i > 0) setI(i - 1);
  }, [i, finished]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  };

  const nextId = nextLecture(id);
  const codex = lecture.codex ? CODEX_BY_ID.get(lecture.codex) : undefined;

  return (
    <div className="st-player" style={{ ['--c' as any]: track.color }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="st-player-top">
        <button className="st-icon-btn" onClick={nav.back} aria-label="Close">
          <Icon name="X" size={20} />
        </button>
        <div className="st-player-title">
          <span>{track.title}</span>
          <b>{lecture.title}</b>
        </div>
        <span className="st-player-count">{finished ? '✓' : `${i + 1}/${n}`}</span>
      </header>
      <div className="st-segs">
        {lecture.slides.map((_, j) => (
          <i key={j} className={finished || j < i ? 'done' : j === i ? 'on' : ''} onClick={() => (setFinished(false), setI(j))} />
        ))}
      </div>
      <div className="st-player-body">
        {finished ? (
          <div className="st-slide st-finish" key="done">
            <div className="st-finish-badge">
              <Icon name="CircleCheck" size={44} />
            </div>
            <h2>Lecture complete</h2>
            <p className="st-lead">Recap:</p>
            <ul className="st-recap">
              {lecture.slides.map((s) => (
                <li key={s.t}>{s.t}</li>
              ))}
            </ul>
            {codex && (
              <details className="st-deep">
                <summary>
                  <Icon name="BookOpen" size={15} /> Deep dive: {codex.title}
                </summary>
                <p className="st-tldr">{codex.tldr}</p>
                <Markdown text={codex.body} />
                {codex.interview && codex.interview.length > 0 && (
                  <>
                    <h4>In the interview</h4>
                    <ul>
                      {codex.interview.map((x) => (
                        <li key={x}>
                          <Markdown text={x} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            )}
          </div>
        ) : (
          <SlideView key={i} slide={lecture.slides[i]} />
        )}
      </div>
      <footer className="st-player-nav">
        <button className="st-btn ghost" onClick={prev} disabled={i === 0 && !finished}>
          <Icon name="ChevronLeft" size={18} /> Back
        </button>
        {finished ? (
          nextId ? (
            <button className="st-btn primary" onClick={() => nav.replace({ p: 'lecture', id: nextId })}>
              Next lecture <Icon name="ChevronRight" size={18} />
            </button>
          ) : (
            <button className="st-btn primary" onClick={nav.back}>
              Done <Icon name="Check" size={18} />
            </button>
          )
        ) : (
          <button className="st-btn primary" onClick={next}>
            {i === n - 1 ? 'Finish' : 'Next'} <Icon name={i === n - 1 ? 'Check' : 'ChevronRight'} size={18} />
          </button>
        )}
      </footer>
    </div>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  return (
    <div className="st-slide">
      <h2>{slide.t}</h2>
      {slide.v && (
        <div className="st-visual">
          <VisualView v={slide.v} />
        </div>
      )}
      {slide.b && <Markdown text={slide.b} className="st-body" />}
      {slide.pts && (
        <ul className="st-pts">
          {slide.pts.map((p, k) => (
            <li key={p} style={{ animationDelay: `${120 + k * 110}ms` }}>
              <Markdown text={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interview

function InterviewHome({ nav }: { nav: Nav }) {
  const [open, setOpen] = useState<string | null>(null);
  const done = useStudy((s) => s.lectures);
  const playbook = TRACKS.find((t) => t.id === 'playbook')!;
  return (
    <>
      <h1 className="st-h1">Interview prep</h1>
      <p className="st-lead">How to run the interview, worked solutions, OOD questions and a bank of extra prompts.</p>

      <h2 className="st-h2">
        <Icon name="Route" size={17} /> How to approach a question
      </h2>
      <div className="st-steps-static">
        {[
          ['Clarify', 'Use cases, users, scale, read/write ratio, what\'s out of scope.'],
          ['Estimate', 'QPS, storage, bandwidth — they pick your architecture.'],
          ['High-level design', 'Boxes and arrows for the core use cases.'],
          ['Deep dive', 'Data model, APIs, the hardest component.'],
          ['Scale', 'Find bottlenecks, add LB, cache, replicas, shards, queues. Say the trade-offs.'],
        ].map(([t, d], i) => (
          <div key={t} className="st-step-static">
            <span>{i + 1}</span>
            <div>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="st-list">
        {playbook.lectures.map((l) => (
          <button key={l.id} className="st-row compact" onClick={() => nav.push({ p: 'lecture', id: l.id })}>
            <span className={`st-num ${done[l.id] ? 'done' : ''}`} style={{ ['--c' as any]: playbook.color }}>
              {done[l.id] ? <Icon name="Check" size={15} /> : <Icon name="Play" size={13} />}
            </span>
            <span className="st-row-main">
              <b>{l.title}</b>
              <span>{l.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <h2 className="st-h2">
        <Icon name="Target" size={17} /> Solved system design questions
      </h2>
      <div className="st-list">
        {SOLVED.map((l) => (
          <button key={l.id} className="st-row" onClick={() => nav.push({ p: 'solved', id: l.id })}>
            <span className="st-row-icon" style={{ background: '#f5a52422', color: '#f5a524' }}>
              <Icon name="Target" size={19} />
            </span>
            <span className="st-row-main">
              <b>{l.title}</b>
              <span>{l.tagline}</span>
            </span>
            <Icon name="ChevronRight" size={18} className="st-chev" />
          </button>
        ))}
      </div>

      <h2 className="st-h2">
        <Icon name="Boxes" size={17} /> Object-oriented design
      </h2>
      <div className="st-grid2">
        {OOD.map((o) => (
          <button key={o.id} className="st-tile" onClick={() => nav.push({ p: 'ood', id: o.id })}>
            <Icon name={o.icon} size={22} color="#f472b6" />
            <b>{o.title}</b>
          </button>
        ))}
      </div>

      <h2 className="st-h2">
        <Icon name="Sparkles" size={17} /> More questions
      </h2>
      <p className="st-note">Approach sketches for the primer's additional questions. Tap one to expand.</p>
      <div className="st-list">
        {EXTRA_QUESTIONS.map((q) => (
          <div key={q.id} className={`st-acc ${open === q.id ? 'open' : ''}`}>
            <button className="st-acc-head" onClick={() => setOpen(open === q.id ? null : q.id)}>
              <b>{q.title}</b>
              <Icon name="ChevronRight" size={18} className="st-chev" />
            </button>
            {open === q.id && (
              <div className="st-acc-body">
                <p className="st-core">{q.core}</p>
                <ol className="st-olist">
                  {q.steps.map(([t, d]) => (
                    <li key={t}>
                      <b>{t}.</b> <Markdown text={d} />
                    </li>
                  ))}
                </ol>
                <Links links={q.links} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function SolvedPage({ id }: { id: string; nav: Nav }) {
  const level = LEVEL_BY_ID.get(id)!;
  const iv = level.interview!;
  const [sec, setSec] = useState<'q' | 'est' | 'design' | 'why'>('q');
  const frames = useMemo(() => designToFrames(level.solution, 'Reference design, as built in the game.'), [level]);
  const ex = level.explain;
  return (
    <>
      <span className="st-kicker">Interview · {level.id}</span>
      <h1 className="st-h1">{level.title}</h1>
      <div className="st-seg sticky">
        {(
          [
            ['q', 'Question'],
            ['est', 'Estimate'],
            ['design', 'Design'],
            ['why', 'Why'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>
            {label}
          </button>
        ))}
      </div>
      {sec === 'q' && (
        <>
          <div className="st-prompt">
            <Markdown text={iv.prompt} />
          </div>
          <h3 className="st-h3">Step 1 · Clarify</h3>
          <p className="st-note">Pick an answer to check your instincts.</p>
          {iv.clarify.map((q, k) => (
            <MCQ key={k} q={q} />
          ))}
        </>
      )}
      {sec === 'est' && (
        <>
          <h3 className="st-h3">Back-of-the-envelope</h3>
          <p className="st-note">Work it out yourself first, then reveal.</p>
          {iv.estimates.map((e, k) => (
            <Reveal key={k} q={e.q} a={`**≈ ${e.answer.toLocaleString()} ${e.unit}**\n\n${e.explain}`} />
          ))}
        </>
      )}
      {sec === 'design' && (
        <>
          <div className="st-visual">
            <Diagram frames={frames} />
          </div>
          <Markdown text={iv.reference} className="st-body" />
        </>
      )}
      {sec === 'why' && ex && (
        <>
          <Markdown text={ex.idea} className="st-body" />
          <h3 className="st-h3">Every choice, explained</h3>
          {ex.choices.map((c) => (
            <div key={c.title} className="st-card">
              <b>{c.title}</b>
              <Markdown text={c.why} />
            </div>
          ))}
          {ex.whyNot && Object.keys(ex.whyNot).length > 0 && (
            <>
              <h3 className="st-h3">Tempting designs that fail</h3>
              {Object.entries(ex.whyNot).map(([k, v]) => (
                <div key={k} className="st-card bad">
                  <b>
                    <Icon name="CircleX" size={15} /> {k}
                  </b>
                  <Markdown text={v} />
                </div>
              ))}
            </>
          )}
          {ex.takeaway && (
            <div className="st-takeaway">
              <Icon name="Lightbulb" size={18} />
              <Markdown text={ex.takeaway} />
            </div>
          )}
        </>
      )}
      <button className="st-btn ghost wide" style={{ marginTop: 20 }} onClick={() => useGame.getState().openLevel(level.id)}>
        <Icon name="Gamepad2" size={16} /> Build it in the game (desktop)
      </button>
    </>
  );
}

function OodPage({ id }: { id: string; nav: Nav }) {
  const o = OOD.find((x) => x.id === id)!;
  const [code, setCode] = useState(false);
  return (
    <>
      <span className="st-kicker">Object-oriented design</span>
      <h1 className="st-h1">{o.title}</h1>
      <div className="st-prompt">
        <Markdown text={o.prompt} />
      </div>
      <h3 className="st-h3">Clarify & assume</h3>
      <ul className="st-pts static">
        {o.clarify.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h3 className="st-h3">Classes</h3>
      <div className="st-classes">
        {o.classes.map((c, k) => (
          <div key={c.name} className="st-class" style={{ animationDelay: `${k * 80}ms` }}>
            <code>{c.name}</code>
            <span>{c.role}</span>
          </div>
        ))}
      </div>
      <h3 className="st-h3">Why this design</h3>
      <VisualView v={{ kind: 'steps', items: o.why.map((w) => ({ title: w.title, text: w.text })) }} />
      <h3 className="st-h3">Solution code</h3>
      {code ? (
        <pre className="st-code tall">
          <code>{o.code}</code>
        </pre>
      ) : (
        <button className="st-btn ghost wide" onClick={() => setCode(true)}>
          <Icon name="Eye" size={16} /> Show Python solution
        </button>
      )}
      <h3 className="st-h3">Likely follow-ups</h3>
      <ul className="st-pts static">
        {o.followups.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="st-note">Class layout adapted from the System Design Primer (CC BY 4.0).</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Library

function LibraryHome() {
  const [seg, setSeg] = useState<'systems' | 'companies' | 'blogs'>('systems');
  const [open, setOpen] = useState<string | null>(null);
  const types = [...new Set(ARCHITECTURES.map((a) => a.type))];
  return (
    <>
      <h1 className="st-h1">Library</h1>
      <p className="st-lead">How real systems are built, and where to read more.</p>
      <div className="st-seg">
        <button className={seg === 'systems' ? 'on' : ''} onClick={() => setSeg('systems')}>
          Systems
        </button>
        <button className={seg === 'companies' ? 'on' : ''} onClick={() => setSeg('companies')}>
          Companies
        </button>
        <button className={seg === 'blogs' ? 'on' : ''} onClick={() => setSeg('blogs')}>
          Eng blogs
        </button>
      </div>

      {seg === 'systems' &&
        types.map((t) => (
          <div key={t}>
            <h3 className="st-h3">{t}</h3>
            <div className="st-list">
              {ARCHITECTURES.filter((a) => a.type === t).map((a) => (
                <div key={a.id} className={`st-acc ${open === a.id ? 'open' : ''}`}>
                  <button className="st-acc-head" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <span>
                      <b>{a.name}</b>
                      <small>{a.from}</small>
                    </span>
                    <Icon name="ChevronRight" size={18} className="st-chev" />
                  </button>
                  {open === a.id && (
                    <div className="st-acc-body">
                      <Markdown text={a.idea} className="st-core" />
                      <ul className="st-pts">
                        {a.how.map((h, k) => (
                          <li key={h} style={{ animationDelay: `${k * 90}ms` }}>
                            {h}
                          </li>
                        ))}
                      </ul>
                      <div className="st-takeaway">
                        <Icon name="Lightbulb" size={18} />
                        <span>{a.lesson}</span>
                      </div>
                      <Links links={a.links} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

      {seg === 'companies' && (
        <>
          <p className="st-note">Skim for shared patterns: what broke, what fixed it, what it cost.</p>
          <div className="st-list">
            {COMPANIES.map((co) => (
              <div key={co.id} className={`st-acc ${open === co.id ? 'open' : ''}`}>
                <button className="st-acc-head" onClick={() => setOpen(open === co.id ? null : co.id)}>
                  <span>
                    <b>{co.name}</b>
                    <small>{co.headline}</small>
                  </span>
                  <Icon name="ChevronRight" size={18} className="st-chev" />
                </button>
                {open === co.id && (
                  <div className="st-acc-body">
                    <ul className="st-pts">
                      {co.lessons.map((x, k) => (
                        <li key={x} style={{ animationDelay: `${k * 90}ms` }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                    <Links links={co.links} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {seg === 'blogs' && (
        <>
          <h3 className="st-h3">How to use engineering blogs</h3>
          <div className="st-steps-static">
            {READING_TIPS.map((t, i) => (
              <div key={t.title} className="st-step-static">
                <span>{i + 1}</span>
                <div>
                  <b>{t.title}</b>
                  <p>{t.text}</p>
                </div>
              </div>
            ))}
          </div>
          <h3 className="st-h3">Blogs</h3>
          <div className="st-list">
            {BLOGS.map((b) => (
              <a key={b.name} className="st-row compact link" href={b.url} target="_blank" rel="noreferrer">
                <span className="st-row-icon sm" style={{ background: '#38bdf822', color: '#38bdf8' }}>
                  <Icon name="Newspaper" size={16} />
                </span>
                <span className="st-row-main">
                  <b>{b.name}</b>
                  <span>{b.known}</span>
                </span>
                <Icon name="ExternalLink" size={15} className="st-chev" />
              </a>
            ))}
          </div>
          <p className="st-note">Hundreds more blogs, by company:</p>
          <Links links={[{ label: 'kilimchoi/engineering-blogs', url: 'https://github.com/kilimchoi/engineering-blogs' }]} />
        </>
      )}
    </>
  );
}

function Links({ links }: { links: { label: string; url: string }[] }) {
  return (
    <div className="st-links">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          <Icon name="ExternalLink" size={13} /> {l.label}
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice: flashcards (Leitner boxes) + quick quiz

function PracticeHome({ nav }: { nav: Nav }) {
  const cards = useStudy((s) => s.cards);
  const days = useStudy((s) => s.reviewDays);
  const now = Date.now();
  const due = CARDS.filter((c) => cards[c.id] && isDue(cards[c.id], now)).length;
  const fresh = CARDS.filter((c) => !cards[c.id]).length;
  const mastered = CARDS.filter((c) => (cards[c.id]?.box ?? 0) >= 3).length;
  return (
    <>
      <h1 className="st-h1">Practice</h1>
      <p className="st-lead">Flashcards with spaced repetition: cards you know come back less often.</p>
      <div className="st-stats">
        <div>
          <b>{due}</b>
          <span>due</span>
        </div>
        <div>
          <b>{mastered}</b>
          <span>mastered</span>
        </div>
        <div>
          <b>
            {streak(days)}
            <Icon name="Flame" size={16} color="#f97316" />
          </b>
          <span>day streak</span>
        </div>
      </div>
      <button className="st-resume" style={{ ['--c' as any]: '#a78bfa' }} onClick={() => nav.push({ p: 'cards' })}>
        <span className="st-resume-k">Daily review</span>
        <b>{due > 0 ? `${due} due + new cards` : fresh > 0 ? 'Learn new cards' : 'All caught up'}</b>
        <span>Up to 20 cards, mixed topics</span>
        <Icon name="Play" size={22} className="st-resume-play" />
      </button>
      <button className="st-resume" style={{ ['--c' as any]: '#34d399' }} onClick={() => nav.push({ p: 'quiz' })}>
        <span className="st-resume-k">Quick quiz</span>
        <b>10 multiple-choice questions</b>
        <span>From the game's levels and the interview drill</span>
        <Icon name="Brain" size={22} className="st-resume-play" />
      </button>
      <h2 className="st-h2">Decks</h2>
      <div className="st-grid2">
        {DECKS.map((d) => {
          const list = CARDS.filter((c) => c.deck === d.id);
          const m = list.filter((c) => (cards[c.id]?.box ?? 0) >= 3).length;
          const dd = list.filter((c) => cards[c.id] && isDue(cards[c.id], now)).length;
          return (
            <button key={d.id} className="st-tile deck" onClick={() => nav.push({ p: 'cards', deck: d.id })}>
              <Icon name={d.icon} size={20} color={d.color} />
              <b>{d.title}</b>
              <span>
                {list.length} cards{dd ? ` · ${dd} due` : ''}
              </span>
              <Bar value={m / list.length} color={d.color} />
            </button>
          );
        })}
      </div>
      <button
        className="st-link-btn"
        onClick={() => {
          if (confirmSafe('Reset all flashcard progress?')) useStudy.getState().resetCards();
        }}
      >
        Reset flashcard progress
      </button>
    </>
  );
}

function confirmSafe(msg: string) {
  try {
    return window.confirm(msg);
  } catch {
    return false;
  }
}

function buildQueue(deck: string | undefined): Flashcard[] {
  const states = useStudy.getState().cards;
  const now = Date.now();
  const pool = deck ? CARDS.filter((c) => c.deck === deck) : CARDS;
  const due = shuffle(pool.filter((c) => states[c.id] && isDue(states[c.id], now))).sort((a, b) => states[a.id].box - states[b.id].box);
  const fresh = shuffle(pool.filter((c) => !states[c.id]));
  if (deck) {
    const rest = shuffle(pool.filter((c) => states[c.id] && !isDue(states[c.id], now)));
    return [...due, ...fresh, ...rest].slice(0, 25);
  }
  return [...due.slice(0, 20), ...fresh].slice(0, 20);
}

function CardSession({ deck, nav }: { deck?: string; nav: Nav }) {
  const [queue, setQueue] = useState<Flashcard[]>(() => buildQueue(deck));
  const [total] = useState(queue.length);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Record<Grade, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const card = queue[0];
  const meta = DECKS.find((d) => d.id === (card?.deck ?? deck));

  const grade = (g: Grade) => {
    useStudy.getState().grade(card.id, g);
    setTally((t) => ({ ...t, [g]: t[g] + 1 }));
    setFlipped(false);
    setQueue((q) => {
      const rest = q.slice(1);
      if (g === 'again') rest.splice(Math.min(3, rest.length), 0, card);
      return rest;
    });
  };

  const reviewed = tally.again + tally.hard + tally.good + tally.easy;
  return (
    <div className="st-player" style={{ ['--c' as any]: meta?.color ?? '#a78bfa' }}>
      <header className="st-player-top">
        <button className="st-icon-btn" onClick={nav.back} aria-label="Close">
          <Icon name="X" size={20} />
        </button>
        <div className="st-player-title">
          <span>{deck ? 'Deck' : 'Daily review'}</span>
          <b>{deck ? meta?.title : 'Mixed topics'}</b>
        </div>
        <span className="st-player-count">{queue.length} left</span>
      </header>
      <div className="st-bar-top">
        <i style={{ width: `${total ? (Math.min(reviewed, total) / total) * 100 : 100}%` }} />
      </div>
      <div className="st-player-body st-center">
        {card ? (
          <>
            <div className={`st-flash ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)} key={card.id + reviewed}>
              <div className="st-flash-inner">
                <div className="st-flash-face front">
                  <span className="st-flash-deck">{DECKS.find((d) => d.id === card.deck)?.title}</span>
                  <Markdown text={card.q} className="st-flash-q" />
                  <span className="st-flash-hint">Tap to reveal</span>
                </div>
                <div className="st-flash-face back">
                  <span className="st-flash-deck">Answer</span>
                  <Markdown text={card.a} className="st-flash-a" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="st-slide st-finish">
            <div className="st-finish-badge">
              <Icon name="Trophy" size={44} />
            </div>
            <h2>{total ? 'Session complete' : 'Nothing due'}</h2>
            <p className="st-lead">{total ? `You reviewed ${reviewed} cards.` : 'Come back tomorrow, or pick a deck to practice anyway.'}</p>
            {total > 0 && (
              <div className="st-stats">
                <div>
                  <b style={{ color: '#f43f5e' }}>{tally.again}</b>
                  <span>again</span>
                </div>
                <div>
                  <b style={{ color: '#fbbf24' }}>{tally.hard}</b>
                  <span>hard</span>
                </div>
                <div>
                  <b style={{ color: '#34d399' }}>{tally.good + tally.easy}</b>
                  <span>knew it</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <footer className="st-player-nav">
        {!card ? (
          <button className="st-btn primary wide" onClick={nav.back}>
            Done <Icon name="Check" size={18} />
          </button>
        ) : flipped ? (
          <div className="st-grades">
            <button className="again" onClick={() => grade('again')}>
              Again
              <small>now</small>
            </button>
            <button className="hard" onClick={() => grade('hard')}>
              Hard
              <small>1d</small>
            </button>
            <button className="good" onClick={() => grade('good')}>
              Good
              <small>{label(useStudy.getState().cards[card.id]?.box, 1)}</small>
            </button>
            <button className="easy" onClick={() => grade('easy')}>
              Easy
              <small>{label(useStudy.getState().cards[card.id]?.box, 2)}</small>
            </button>
          </div>
        ) : (
          <button className="st-btn primary wide" onClick={() => setFlipped(true)}>
            Show answer
          </button>
        )}
      </footer>
    </div>
  );
}

const label = (box: number | undefined, step: number) => {
  const days = [0, 1, 3, 7, 16, 35][Math.min((box ?? 0) + step, 5)];
  return `${days}d`;
};

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const QUIZ_POOL: (QuizQ & { from: string })[] = [
  ...LEVELS.flatMap((l) => l.quiz.map((q) => ({ ...q, from: l.title }))),
  ...DRILL.map((q) => ({ ...q, from: q.topic })),
];

function QuizSession({ nav }: { nav: Nav }) {
  const [qs, setQs] = useState(() => shuffle(QUIZ_POOL).slice(0, 10));
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = qs[i];
  const done = i >= qs.length;
  const choose = (k: number) => {
    if (pick !== null) return;
    setPick(k);
    if (k === q.answer) setScore((s) => s + 1);
  };
  return (
    <div className="st-player" style={{ ['--c' as any]: '#34d399' }}>
      <header className="st-player-top">
        <button className="st-icon-btn" onClick={nav.back} aria-label="Close">
          <Icon name="X" size={20} />
        </button>
        <div className="st-player-title">
          <span>Quick quiz</span>
          <b>{done ? 'Results' : q.from}</b>
        </div>
        <span className="st-player-count">{done ? `${score}/10` : `${i + 1}/${qs.length}`}</span>
      </header>
      <div className="st-segs">
        {qs.map((_, j) => (
          <i key={j} className={j < i ? 'done' : j === i ? 'on' : ''} />
        ))}
      </div>
      <div className="st-player-body">
        {done ? (
          <div className="st-slide st-finish">
            <div className="st-finish-badge">
              <Icon name={score >= 8 ? 'Trophy' : 'Brain'} size={44} />
            </div>
            <h2>
              {score} / {qs.length}
            </h2>
            <p className="st-lead">{score >= 8 ? 'Interview-ready on these topics.' : score >= 5 ? 'Solid — review the misses in the lectures.' : 'Worth another pass through the lectures.'}</p>
          </div>
        ) : (
          <div className="st-slide" key={i}>
            <h2 className="st-q">{q.q}</h2>
            <div className="st-options">
              {q.options.map((o, k) => (
                <button key={k} className={pick === null ? '' : k === q.answer ? 'right' : k === pick ? 'wrong' : 'dim'} onClick={() => choose(k)}>
                  <span>{String.fromCharCode(65 + k)}</span>
                  {o}
                </button>
              ))}
            </div>
            {pick !== null && (
              <div className={`st-explain ${pick === q.answer ? 'ok' : 'bad'}`}>
                <b>{pick === q.answer ? 'Correct' : 'Not quite'}</b>
                <Markdown text={q.explain} />
              </div>
            )}
          </div>
        )}
      </div>
      <footer className="st-player-nav">
        {done ? (
          <>
            <button className="st-btn ghost" onClick={nav.back}>
              Done
            </button>
            <button
              className="st-btn primary"
              onClick={() => {
                setQs(shuffle(QUIZ_POOL).slice(0, 10));
                setI(0);
                setPick(null);
                setScore(0);
              }}
            >
              <Icon name="RotateCcw" size={16} /> New quiz
            </button>
          </>
        ) : (
          <button
            className="st-btn primary wide"
            disabled={pick === null}
            onClick={() => {
              setI(i + 1);
              setPick(null);
            }}
          >
            {i === qs.length - 1 ? 'See results' : 'Next'} <Icon name="ChevronRight" size={18} />
          </button>
        )}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces

function MCQ({ q }: { q: QuizQ }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="st-card">
      <b>{q.q}</b>
      <div className="st-options small">
        {q.options.map((o, k) => (
          <button key={k} className={pick === null ? '' : k === q.answer ? 'right' : k === pick ? 'wrong' : 'dim'} onClick={() => pick === null && setPick(k)}>
            <span>{String.fromCharCode(65 + k)}</span>
            {o}
          </button>
        ))}
      </div>
      {pick !== null && <Markdown text={q.explain} className="st-explain-inline" />}
    </div>
  );
}

function Reveal({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="st-card">
      <b>{q}</b>
      {open ? (
        <Markdown text={a} className="st-explain-inline" />
      ) : (
        <button className="st-btn ghost small" onClick={() => setOpen(true)}>
          <Icon name="Eye" size={14} /> Reveal
        </button>
      )}
    </div>
  );
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={r} stroke="var(--border)" strokeWidth={6} fill="none" />
      <circle cx={28} cy={28} r={r} stroke={color} strokeWidth={6} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset .6s' }} />
      <text x={28} y={32} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className="st-bar">
      <i style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </span>
  );
}

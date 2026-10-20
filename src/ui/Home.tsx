import { useEffect, useRef } from 'react';
import { CODEX } from '../content/codex';
import { LEVELS } from '../content/levels';
import { useGame } from '../game/store';
import { Icon, Stars } from './common';

export function Home() {
  const progress = useGame((s) => s.progress);
  const { go, openLevel } = useGame.getState();
  const totalStars = Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);
  const done = LEVELS.filter((l) => progress.levels[l.id]?.completed).length;
  const nextLevel = LEVELS.find((l) => !progress.levels[l.id]?.completed) ?? LEVELS[LEVELS.length - 1];

  return (
    <div className="hero">
      <BeltBackground />
      <div className="hero-c">
        <div className="mono" style={{ color: 'var(--accent)', letterSpacing: '0.3em', fontSize: 12, marginBottom: 14 }}>
          A SYSTEM DESIGN GAME
        </div>
        <h1 className="logo">PACKET<br />FACTORY</h1>
        <p className="sub">
          Thousands of users are about to hit your servers. Wire up load balancers, caches, replicas, queues and shards — then watch every request ride the belts through your architecture, and see exactly where it breaks.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary lg" onClick={() => (done === 0 ? openLevel(LEVELS[0].id) : go('map'))}>
            <Icon name="Play" size={17} /> {done === 0 ? 'Start the campaign' : `Continue · ${nextLevel.title}`}
          </button>
          <button className="btn lg" onClick={() => go('map')}>
            <Icon name="Map" size={17} /> Level map
          </button>
        </div>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 18, fontSize: 13 }} className="muted">
          <span>
            <Stars n={1} max={1} size={13} /> {totalStars} / {LEVELS.length * 3} stars
          </span>
          <span>
            {done} / {LEVELS.length} levels
          </span>
          <span>
            {progress.codexSeen.length} / {CODEX.length} concepts read
          </span>
        </div>
        <div className="menu">
          <button className="menu-card" onClick={() => openLevel('sandbox')}>
            <b>
              <Icon name="Boxes" size={17} color="#34d399" /> Sandbox
            </b>
            <span>Everything unlocked. Dial the traffic, crash things on purpose.</span>
          </button>
          <button className="menu-card" onClick={() => go('codex')}>
            <b>
              <Icon name="BookOpen" size={17} color="#38bdf8" /> Codex
            </b>
            <span>Every topic from the System Design Primer, with trade-offs and interview tips.</span>
          </button>
          <button className="menu-card" onClick={() => go('labs')}>
            <b>
              <Icon name="FlaskConical" size={17} color="#c084fc" /> Labs
            </b>
            <span>Napkin math, latency numbers, availability math, TCP vs UDP, consistency.</span>
          </button>
          <button className="menu-card" onClick={() => go('drill')}>
            <b>
              <Icon name="GraduationCap" size={17} color="#f5a524" /> Interview drill
            </b>
            <span>Rapid-fire questions across everything you have unlocked.</span>
          </button>
          <button className="menu-card" onClick={() => go('study')}>
            <b>
              <Icon name="BookOpen" size={17} color="#a78bfa" /> Study mode
            </b>
            <span>Phone-friendly animated lectures, interview walkthroughs and flashcards.</span>
          </button>
        </div>
        <p className="faint" style={{ fontSize: 11.5, marginTop: 22 }}>
          Curriculum based on{' '}
          <a href="https://github.com/donnemartin/system-design-primer" target="_blank" rel="noreferrer">
            The System Design Primer
          </a>{' '}
          by Donne Martin (CC BY 4.0).
        </p>
      </div>
    </div>
  );
}

/** Decorative animated belts behind the title. */
function BeltBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const colors = ['#38bdf8', '#fb923c', '#4ade80', '#c084fc', '#facc15', '#2dd4bf'];
    const lanes: { y: number; speed: number; dir: number; items: { x: number; c: string }[] }[] = [];
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lanes.length = 0;
      const h = c.clientHeight;
      for (let y = 40; y < h; y += 58) {
        const items = [];
        for (let x = 0; x < c.clientWidth; x += 30 + Math.random() * 90) items.push({ x, c: colors[Math.floor(Math.random() * colors.length)] });
        lanes.push({ y, speed: 20 + Math.random() * 50, dir: Math.random() < 0.5 ? 1 : -1, items });
      }
    };
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const w = c.clientWidth;
      const h = c.clientHeight;
      ctx.fillStyle = '#0a0e15';
      ctx.fillRect(0, 0, w, h);
      for (const l of lanes) {
        ctx.strokeStyle = '#141d2a';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(0, l.y);
        ctx.lineTo(w, l.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(245,165,36,0.10)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 9]);
        ctx.lineDashOffset = -(t / 1000) * l.speed * l.dir;
        ctx.beginPath();
        ctx.moveTo(0, l.y);
        ctx.lineTo(w, l.y);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const it of l.items) {
          it.x += l.speed * l.dir * dt;
          if (it.x > w + 10) it.x = -10;
          if (it.x < -10) it.x = w + 10;
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = it.c;
          ctx.beginPath();
          ctx.arc(it.x, l.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(10,14,21,0.92)');
      g.addColorStop(1, 'rgba(10,14,21,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} />;
}

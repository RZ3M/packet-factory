import { create } from 'zustand';
import { CATALOG, defaultConfig, tierOf } from '../engine/catalog';
import { evaluate, type Evaluation } from '../engine/evaluate';
import { Simulation } from '../engine/sim';
import type { Design, DesignEdge, DesignNode, NodeKind, ReqType, TierId } from '../engine/types';
import { LEVEL_BY_ID } from '../content/levels';
import { SANDBOX } from '../content/sandbox';
import type { Level } from '../content/types';
import { connectError, freeSpot, nextId, nextName } from './rules';
import { loadProgress, saveProgress, type Progress } from './progress';

export type Screen = 'home' | 'map' | 'game' | 'codex' | 'labs' | 'drill' | 'study';

/** Phones (or #study links) land in Study mode; the game needs a big screen. */
function initialScreen(): Screen {
  try {
    if (location.hash === '#study') return 'study';
    if (location.hash === '#game') return 'home';
    if (window.matchMedia('(max-width: 720px)').matches) return 'study';
  } catch {
    /* non-browser (tests) */
  }
  return 'home';
}
export type Phase = 'build' | 'running' | 'paused' | 'done';
export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null;

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface Toast {
  id: number;
  msg: string;
  level: 'info' | 'warn' | 'bad' | 'good';
}

interface GameState {
  screen: Screen;
  codexId: string | null;
  labId: string | null;
  level: Level | null;
  design: Design;
  selection: Selection;
  sim: Simulation | null;
  phase: Phase;
  speed: number;
  tick: number;
  evaluation: Evaluation | null;
  modal: 'lesson' | 'brief' | 'results' | 'interview' | 'solution' | null;
  undoStack: Design[];
  redoStack: Design[];
  tutorialStep: number;
  hintsShown: number;
  usedSolution: boolean;
  toasts: Toast[];
  progress: Progress;
  focusRequest: number; // bump to ask the board to re-fit the camera
  confirmDialog: ConfirmRequest | null;
  askConfirm: (c: ConfirmRequest) => void;
  closeConfirm: () => void;

  go: (s: Screen, opts?: { codexId?: string; labId?: string }) => void;
  openLevel: (id: string) => void;
  setModal: (m: GameState['modal']) => void;

  addNode: (kind: NodeKind, x?: number, y?: number) => string | null;
  moveNode: (id: string, x: number, y: number) => void;
  commitMove: (before: Design) => void;
  updateNode: (id: string, patch: Partial<DesignNode> & { config?: Record<string, any> }) => void;
  setConfig: (id: string, key: string, value: any) => void;
  setTier: (id: string, tier: TierId) => void;
  connect: (from: string, to: string, all?: boolean) => string | null;
  setEdgeFilter: (id: string, filter: ReqType[] | undefined) => void;
  deleteSelection: () => void;
  duplicate: (id: string) => void;
  select: (s: Selection) => void;
  undo: () => void;
  redo: () => void;

  run: () => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  reset: () => void;
  setSpeed: (n: number) => void;
  bump: () => void;
  finish: () => void;
  loadSolution: () => void;
  revealSolution: () => void;
  clearDesign: () => void;
  promote: (id: string) => void;
  crashNode: (id: string) => void;

  advanceTutorial: () => void;
  showHint: () => void;
  toast: (msg: string, level?: Toast['level']) => void;
  dismissToast: (id: number) => void;
  updateProgress: (fn: (p: Progress) => void) => void;
}

let toastId = 0;

function clone(d: Design): Design {
  return { nodes: d.nodes.map((n) => ({ ...n, config: { ...n.config } })), edges: d.edges.map((e) => ({ ...e, filter: e.filter ? [...e.filter] : undefined })) };
}

export const useGame = create<GameState>((set, get) => {
  /** Apply a design change, keep undo history, and push it into a running sim. */
  const change = (fn: (d: Design) => Design | void, opts: { history?: boolean } = {}) => {
    const st = get();
    const before = clone(st.design);
    const draft = clone(st.design);
    const out = fn(draft) ?? draft;
    const undoStack = opts.history === false ? st.undoStack : [...st.undoStack.slice(-80), before];
    set({ design: out, undoStack, redoStack: opts.history === false ? st.redoStack : [] });
    if (st.sim && (st.phase === 'running' || st.phase === 'paused')) st.sim.applyDesign(out);
    persistDesign();
  };

  const persistDesign = () => {
    const { level, design, progress } = get();
    if (!level) return;
    progress.designs[level.id] = design;
    saveProgress(progress);
  };

  return {
    screen: initialScreen(),
    codexId: null,
    labId: null,
    level: null,
    design: { nodes: [], edges: [] },
    selection: null,
    sim: null,
    phase: 'build',
    speed: loadProgress().settings.speed ?? 2,
    tick: 0,
    evaluation: null,
    modal: null,
    undoStack: [],
    redoStack: [],
    tutorialStep: 0,
    hintsShown: 0,
    usedSolution: false,
    toasts: [],
    progress: loadProgress(),
    focusRequest: 0,
    confirmDialog: null,
    askConfirm: (confirmDialog) => set({ confirmDialog }),
    closeConfirm: () => set({ confirmDialog: null }),

    go: (screen, opts) => {
      if (screen !== 'game' && get().phase === 'running') set({ phase: 'paused' });
      set({ screen, codexId: opts?.codexId ?? get().codexId, labId: opts?.labId ?? null });
      if (opts?.codexId) {
        get().updateProgress((p) => {
          if (!p.codexSeen.includes(opts.codexId!)) p.codexSeen.push(opts.codexId!);
        });
      }
    },

    openLevel: (id) => {
      const level = id === 'sandbox' ? SANDBOX : LEVEL_BY_ID.get(id);
      if (!level) return;
      const saved = get().progress.designs[id];
      const design = clone(saved && saved.nodes.length ? saved : level.start);
      // make sure locked level nodes exist (e.g. users)
      for (const n of level.start.nodes) if (n.locked && !design.nodes.some((d) => d.id === n.id)) design.nodes.push({ ...n, config: { ...n.config } });
      set({
        screen: 'game',
        level,
        design,
        selection: null,
        sim: null,
        phase: 'build',
        evaluation: null,
        modal: level.interview ? 'interview' : level.lesson?.length && !get().progress.lessonsSeen.includes(id) ? 'lesson' : 'brief',
        undoStack: [],
        redoStack: [],
        tutorialStep: 0,
        hintsShown: 0,
        usedSolution: !!get().progress.levels[id]?.usedSolution,
        focusRequest: get().focusRequest + 1,
      });
    },

    setModal: (modal) => set({ modal }),

    addNode: (kind, x, y) => {
      const st = get();
      const lvl = st.level;
      if (lvl && !lvl.palette.includes(kind)) return null;
      let id = '';
      change((d) => {
        const spot = freeSpot(d, Math.round(x ?? 20), Math.round(y ?? 10));
        id = nextId(d, kind);
        const spec = CATALOG[kind];
        const node: DesignNode = {
          id,
          kind,
          x: spot.x,
          y: spot.y,
          name: nextName(d, kind),
          tier: spec.tiers ? spec.tiers[0].id : undefined,
          config: defaultConfig(kind),
          region: lvl?.board?.regions ? regionAt(lvl, spot.x, spot.y) : undefined,
        };
        d.nodes.push(node);
      });
      set({ selection: { type: 'node', id } });
      return id;
    },

    moveNode: (id, x, y) => {
      const st = get();
      const lvl = st.level;
      const design = { ...st.design, nodes: st.design.nodes.map((n) => (n.id === id ? { ...n, x, y, region: lvl?.board?.regions ? regionAt(lvl, x, y) ?? n.region : n.region } : n)) };
      set({ design });
    },

    commitMove: (before) => {
      const st = get();
      set({ undoStack: [...st.undoStack.slice(-80), before], redoStack: [] });
      if (st.sim && st.phase !== 'build' && st.phase !== 'done') st.sim.applyDesign(st.design);
      persistDesign();
    },

    updateNode: (id, patch) => {
      change((d) => {
        const n = d.nodes.find((x) => x.id === id);
        if (!n) return;
        Object.assign(n, { ...patch, config: { ...n.config, ...(patch.config ?? {}) } });
      });
    },

    setConfig: (id, key, value) => {
      const n = get().design.nodes.find((x) => x.id === id);
      if (!n) return;
      get().updateNode(id, { config: { [key]: value } });
      if (key === 'role' && value !== 'primary') {
        // replicas/standbys usually do not need write routes; nothing else to do
      }
    },

    setTier: (id, tier) => {
      const n = get().design.nodes.find((x) => x.id === id);
      if (!n || n.tier === tier) return;
      const st = get();
      if (st.phase === 'running' || st.phase === 'paused') {
        get().toast(`Resizing ${n.name ?? CATALOG[n.kind].name} — it restarts (vertical scaling means downtime).`, 'warn');
      }
      get().updateNode(id, { tier });
    },

    connect: (from, to, all) => {
      const st = get();
      const a = st.design.nodes.find((n) => n.id === from);
      const b = st.design.nodes.find((n) => n.id === to);
      if (!a || !b) return 'Missing component.';
      const err = connectError(st.design, a, b);
      if (err && !all) return err;
      const sources = all ? st.design.nodes.filter((n) => n.kind === a.kind) : [a];
      let made = 0;
      change((d) => {
        for (const s of sources) {
          if (connectError(d, s, b)) continue;
          d.edges.push({ id: `${s.id}>${b.id}`, from: s.id, to: b.id });
          made++;
          // auto-configure replication
          if (s.kind === 'sql' && b.kind === 'sql') {
            const mutual = d.edges.some((e) => e.from === b.id && e.to === s.id);
            const target = d.nodes.find((n) => n.id === b.id)!;
            const source = d.nodes.find((n) => n.id === s.id)!;
            if (mutual) {
              // wired both ways: master-master
              target.config.role = 'primary';
              source.config.role = 'primary';
            } else if ((target.config.role ?? 'primary') === 'primary') target.config.role = 'replica';
          }
        }
      });
      if (!made) return err ?? 'Nothing to connect.';
      if (all && made > 1) get().toast(`Connected ${made} × ${CATALOG[a.kind].name} → ${b.name ?? CATALOG[b.kind].name}`, 'info');
      return null;
    },

    setEdgeFilter: (id, filter) => {
      change((d) => {
        const e = d.edges.find((x) => x.id === id);
        if (e) e.filter = filter && filter.length ? filter : undefined;
      });
    },

    deleteSelection: () => {
      const st = get();
      const sel = st.selection;
      if (!sel) return;
      if (sel.type === 'node') {
        const n = st.design.nodes.find((x) => x.id === sel.id);
        if (!n || n.locked) {
          if (n?.locked) get().toast('That component is part of the scenario and cannot be removed.', 'warn');
          return;
        }
        change((d) => {
          d.nodes = d.nodes.filter((x) => x.id !== sel.id);
          d.edges = d.edges.filter((e) => e.from !== sel.id && e.to !== sel.id);
        });
      } else {
        change((d) => {
          d.edges = d.edges.filter((e) => e.id !== sel.id);
        });
      }
      set({ selection: null });
    },

    duplicate: (id) => {
      const st = get();
      const src = st.design.nodes.find((n) => n.id === id);
      if (!src || src.kind === 'users') return;
      if (st.level && !st.level.palette.includes(src.kind)) return;
      let newId = '';
      change((d) => {
        newId = nextId(d, src.kind);
        const spot = freeSpot(d, src.x, src.y + 6);
        const copy: DesignNode = { ...src, id: newId, x: spot.x, y: spot.y, locked: false, name: nextName(d, src.kind), config: { ...src.config } };
        if (copy.kind === 'sql' && copy.config.role === 'primary' && d.edges.some((e) => e.from === src.id && d.nodes.find((n) => n.id === e.to)?.kind === 'sql')) {
          copy.config.role = 'replica';
        }
        d.nodes.push(copy);
        const extra: DesignEdge[] = [];
        for (const e of d.edges) {
          if (e.to === src.id) extra.push({ ...e, id: `${e.from}>${newId}`, to: newId });
          if (e.from === src.id) {
            const target = d.nodes.find((n) => n.id === e.to);
            if (src.kind === 'sql' && target?.kind === 'sql') continue; // do not clone replication links
            extra.push({ ...e, id: `${newId}>${e.to}`, from: newId });
          }
        }
        for (const e of extra) if (!d.edges.some((x) => x.id === e.id)) d.edges.push(e);
      });
      set({ selection: { type: 'node', id: newId } });
    },

    select: (selection) => set({ selection }),

    undo: () => {
      const st = get();
      const prev = st.undoStack[st.undoStack.length - 1];
      if (!prev) return;
      set({ design: prev, undoStack: st.undoStack.slice(0, -1), redoStack: [...st.redoStack, clone(st.design)], selection: null });
      if (st.sim && st.phase !== 'build' && st.phase !== 'done') st.sim.applyDesign(prev);
      persistDesign();
    },

    redo: () => {
      const st = get();
      const next = st.redoStack[st.redoStack.length - 1];
      if (!next) return;
      set({ design: next, redoStack: st.redoStack.slice(0, -1), undoStack: [...st.undoStack, clone(st.design)], selection: null });
      if (st.sim && st.phase !== 'build' && st.phase !== 'done') st.sim.applyDesign(next);
      persistDesign();
    },

    run: () => {
      const st = get();
      if (!st.level) return;
      const sim = new Simulation(st.level, clone(st.design));
      sim.start();
      set({ sim, phase: 'running', evaluation: null, modal: null });
    },
    pause: () => {
      if (get().phase === 'running') set({ phase: 'paused' });
    },
    resume: () => {
      if (get().phase === 'paused') set({ phase: 'running' });
    },
    togglePlay: () => {
      const p = get().phase;
      if (p === 'build' || p === 'done') get().run();
      else if (p === 'running') get().pause();
      else get().resume();
    },
    reset: () => set({ sim: null, phase: 'build', evaluation: null }),
    setSpeed: (speed) => {
      set({ speed });
      get().updateProgress((p) => (p.settings.speed = speed));
    },
    bump: () => set({ tick: get().tick + 1 }),

    finish: () => {
      const st = get();
      if (!st.sim || !st.level || st.phase === 'done') return;
      const ev = evaluate(st.sim, st.level.objectives);
      set({ phase: 'done', evaluation: ev, modal: st.level.id === 'sandbox' ? null : 'results' });
      if (st.level.id === 'sandbox') return;
      get().updateProgress((p) => {
        const prev = p.levels[st.level!.id] ?? { stars: 0, completed: false };
        const stars = st.usedSolution ? Math.min(ev.stars, 1) : ev.stars;
        p.levels[st.level!.id] = {
          ...prev,
          stars: Math.max(prev.stars, stars),
          completed: prev.completed || ev.passed,
          usedSolution: prev.usedSolution || st.usedSolution,
          bestCost: ev.passed ? Math.min(prev.bestCost ?? Infinity, st.sim!.stats.costT ? st.sim!.stats.costInt / st.sim!.stats.costT : 0) : prev.bestCost,
        };
      });
    },

    loadSolution: () => {
      const st = get();
      if (!st.level) return;
      change(() => clone(st.level!.solution));
      set({ usedSolution: true, sim: null, phase: 'build', evaluation: null, modal: null, focusRequest: st.focusRequest + 1 });
      get().toast('Reference design loaded. Run it to see how it handles the load — stars are capped at 1 after peeking.', 'info');
    },

    revealSolution: () => {
      const st = get();
      if (!st.level) return;
      set({ usedSolution: true });
      get().updateProgress((p) => {
        const lp = p.levels[st.level!.id] ?? { stars: 0, completed: false };
        p.levels[st.level!.id] = { ...lp, usedSolution: true };
      });
    },

    clearDesign: () => {
      const st = get();
      if (!st.level) return;
      change(() => clone(st.level!.start));
      set({ sim: null, phase: 'build', evaluation: null, modal: null, selection: null, focusRequest: st.focusRequest + 1 });
      get().toast('Design reset to the starting layout. Ctrl+Z brings yours back.', 'info');
    },

    promote: (id) => {
      const st = get();
      const n = st.sim?.nodes.get(id);
      if (!st.sim || !n) return;
      const old = n.primary;
      if (!old) return;
      st.sim.promote(old, n);
    },

    crashNode: (id) => {
      const st = get();
      const n = st.sim?.nodes.get(id);
      if (!st.sim || !n) return;
      st.sim.crash(n, { reason: 'chaos', recoverAfter: 20 });
    },

    advanceTutorial: () => set({ tutorialStep: get().tutorialStep + 1 }),
    showHint: () => set({ hintsShown: Math.min((get().level?.hints.length ?? 0), get().hintsShown + 1) }),

    toast: (msg, level = 'info') => {
      const id = ++toastId;
      set({ toasts: [...get().toasts.slice(-4), { id, msg, level }] });
      setTimeout(() => get().dismissToast(id), 5200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    updateProgress: (fn) => {
      const p = { ...get().progress };
      fn(p);
      saveProgress(p);
      set({ progress: p });
    },
  };
});

export function regionAt(level: Level, x: number, y: number) {
  const regions = level.board?.regions;
  if (!regions) return undefined;
  for (const r of regions) if (x + 3 >= r.x && x + 3 < r.x + r.w && y + 2 >= r.y && y + 2 < r.y + r.h) return r.region;
  return undefined;
}

export function capacityLabel(n: DesignNode): string {
  const t = tierOf(n.kind, n.tier);
  return t ? t.label : '';
}

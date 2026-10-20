import { marked } from 'marked';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Zap,
  Star,
  Lock,
  BookOpen,
  FlaskConical,
  Boxes,
  GraduationCap,
  Target,
  Lightbulb,
  Eye,
  Copy,
  Trash,
  X,
  Check,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  Activity,
  Clock,
  DollarSign,
  Route,
  Funnel,
  ArrowRight,
  Undo2,
  Redo2,
  Maximize,
  CircleQuestionMark,
  Sparkles,
  Flame,
  Skull,
  ShieldAlert,
  Server,
  Database,
  Users,
  Signpost,
  Globe,
  Split,
  Shield,
  ShieldCheck,
  Cog,
  ListOrdered,
  RadioTower,
  KeyRound,
  FileBraces,
  Columns3,
  Share2,
  Search,
  Archive,
  Network,
  Box,
  Map,
  MousePointer2,
  Factory,
  Calculator,
  Timer,
  Wifi,
  Scale,
  Brain,
  Trophy,
  Settings,
  House,
  Crosshair,
  Swords,
  ScrollText,
  Layers,
  ArrowUpRight,
  Power,
} from 'lucide-react';

export const ICONS: Record<string, any> = {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Zap,
  Star,
  Lock,
  BookOpen,
  FlaskConical,
  Boxes,
  GraduationCap,
  Target,
  Lightbulb,
  Eye,
  Copy,
  Trash,
  X,
  Check,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  Activity,
  Clock,
  DollarSign,
  Route,
  Funnel,
  ArrowRight,
  Undo2,
  Redo2,
  Maximize,
  CircleQuestionMark,
  Sparkles,
  Flame,
  Skull,
  ShieldAlert,
  Server,
  Database,
  Users,
  Signpost,
  Globe,
  Split,
  Shield,
  ShieldCheck,
  Cog,
  ListOrdered,
  RadioTower,
  KeyRound,
  FileBraces,
  Columns3,
  Share2,
  Search,
  Archive,
  Network,
  Box,
  Map,
  MousePointer2,
  Factory,
  Calculator,
  Timer,
  Wifi,
  Scale,
  Brain,
  Trophy,
  Settings,
  House,
  Crosshair,
  Swords,
  ScrollText,
  Layers,
  ArrowUpRight,
  Power,
};

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text]);
  return <div className={`md ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Stars({ n, max = 3, size = 16 }: { n: number; max?: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <path
            d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"
            fill={i < n ? '#f5a524' : 'transparent'}
            stroke={i < n ? '#f5a524' : '#3b4a62'}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

export function Modal({ children, onClose, width }: { children: ReactNode; onClose?: () => void; width?: number }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} aria-pressed={on} disabled={disabled} />;
}

export function Icon({ name, size = 16, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  const C = ICONS[name] ?? Box;
  return <C size={size} color={color} className={className} strokeWidth={2} />;
}

/** Tiny line chart on canvas. */
export function Spark({ data, color = '#f5a524', max, height = 34, fill = true }: { data: number[]; color?: string; max?: number; height?: number; fill?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    const m = max ?? Math.max(1e-9, ...data);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 2 - (Math.min(v, m) / m) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (fill) {
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = color + '22';
      ctx.fill();
    }
  });
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />;
}

export interface Series {
  data: number[];
  color: string;
  fill?: boolean;
  dash?: boolean;
  stack?: boolean;
}

/** Multi-series time chart used under the board. */
export function TimeChart({ series, max, marks, yFmt }: { series: Series[]; max?: number; marks?: number[]; yFmt?: (v: number) => string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const n = Math.max(2, ...series.map((s) => s.data.length));
    let m = max ?? 0;
    if (!max) {
      const stacked = new Array(n).fill(0);
      for (const s of series) s.data.forEach((v, i) => (stacked[i] = s.stack ? stacked[i] + v : Math.max(stacked[i], v)));
      m = Math.max(1e-9, ...stacked) * 1.15;
    }
    const top = 22;
    const ph = h - top - 4;
    const X = (i: number) => (i / (n - 1)) * (w - 4) + 2;
    const Y = (v: number) => top + ph - (Math.min(v, m) / m) * ph;
    // gridline + label
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, top + ph / 2);
    ctx.lineTo(w, top + ph / 2);
    ctx.stroke();
    if (yFmt) {
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(yFmt(m), w - 6, top + 8);
      ctx.fillText(yFmt(m / 2), w - 6, top + ph / 2 - 3);
      ctx.textAlign = 'left';
    }
    if (marks) {
      ctx.strokeStyle = 'rgba(244,63,94,0.45)';
      ctx.setLineDash([3, 3]);
      for (const mk of marks) {
        ctx.beginPath();
        ctx.moveTo(X(mk), top);
        ctx.lineTo(X(mk), h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const base = new Array(n).fill(0);
    for (const s of series) {
      const pts = s.data.map((v, i) => {
        const y0 = s.stack ? base[i] : 0;
        const y1 = y0 + v;
        if (s.stack) base[i] = y1;
        return { x: X(i), y: Y(y1), y0: Y(y0) };
      });
      if (!pts.length) continue;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.fill) {
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y0);
        ctx.closePath();
        ctx.fillStyle = s.color + '40';
        ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      if (s.dash) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  return <canvas ref={ref} />;
}

export function fmtNum(n: number): string {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

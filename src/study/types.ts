// Content model for the mobile Study mode.

export type NodeKey =
  | 'user'
  | 'app'
  | 'db'
  | 'cache'
  | 'lb'
  | 'cdn'
  | 'queue'
  | 'worker'
  | 'dns'
  | 's3'
  | 'proxy'
  | 'gateway'
  | 'search'
  | 'kv'
  | 'doc'
  | 'wide'
  | 'graph'
  | 'router'
  | 'region'
  | 'note'
  | 'service'
  | 'lock'
  | 'disk';

export interface DNode {
  id: string;
  label: string;
  k: NodeKey;
  x: number; // grid units (0..3.6)
  y: number; // grid units
  state?: 'down' | 'hot' | 'new' | 'dim';
  badge?: string;
}

export interface DLink {
  from: string;
  to: string;
  color?: string; // dot colour
  rate?: number; // 0 = static line, 1..4 = dots in flight
  dashed?: boolean;
  label?: string;
  back?: boolean; // also animate a response back
  speed?: number; // seconds per trip
}

export interface DFrame {
  caption?: string;
  nodes: DNode[];
  links: DLink[];
  ms?: number;
}

export type Visual =
  | { kind: 'diagram'; frames: DFrame[] }
  | { kind: 'widget'; id: 'queueing' | 'zipf' | 'hashring' | 'latency' }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'big'; value: string; label: string; color?: string }
  | { kind: 'compare'; left: { title: string; points: string[]; color?: string }; right: { title: string; points: string[]; color?: string } }
  | { kind: 'steps'; items: { title: string; text: string }[] };

export interface Slide {
  t: string; // title
  b?: string; // markdown body (short!)
  v?: Visual;
  pts?: string[]; // key points
}

export interface Lecture {
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  codex?: string; // link to full notes
  slides: Slide[];
}

export interface Track {
  id: string;
  title: string;
  icon: string;
  color: string;
  blurb: string;
  lectures: Lecture[];
}

export interface Flashcard {
  id: string;
  deck: string;
  q: string;
  a: string; // markdown
}

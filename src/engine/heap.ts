// Binary min-heap of timed events for the discrete-event simulation.

export interface SimEvent {
  t: number;
  seq: number;
  fn: () => void;
}

export class EventHeap {
  private a: SimEvent[] = [];
  private seq = 0;

  get size() {
    return this.a.length;
  }

  push(t: number, fn: () => void) {
    const e = { t, seq: this.seq++, fn };
    const a = this.a;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[p], e)) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = e;
  }

  peekTime(): number {
    return this.a.length ? this.a[0].t : Infinity;
  }

  pop(): SimEvent | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mv = last;
        if (l < n && less(a[l], mv)) {
          m = l;
          mv = a[l];
        }
        if (r < n && less(a[r], mv)) {
          m = r;
          mv = a[r];
        }
        if (m === i) break;
        a[i] = a[m];
        i = m;
      }
      a[i] = last;
    }
    return top;
  }

  clear() {
    this.a = [];
  }
}

function less(x: SimEvent, y: SimEvent) {
  return x.t < y.t || (x.t === y.t && x.seq < y.seq);
}

/** Simple FIFO deque with O(1) push/shift. */
export class Deque<T> {
  private buf: (T | undefined)[] = new Array(16);
  private head = 0;
  private tail = 0;
  private n = 0;

  get length() {
    return this.n;
  }

  push(v: T) {
    if (this.n === this.buf.length) this.grow();
    this.buf[this.tail] = v;
    this.tail = (this.tail + 1) % this.buf.length;
    this.n++;
  }

  shift(): T | undefined {
    if (!this.n) return undefined;
    const v = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) % this.buf.length;
    this.n--;
    return v;
  }

  peek(): T | undefined {
    return this.n ? this.buf[this.head] : undefined;
  }

  drain(): T[] {
    const out: T[] = [];
    let v: T | undefined;
    while ((v = this.shift()) !== undefined) out.push(v);
    return out;
  }

  private grow() {
    const nb: (T | undefined)[] = new Array(this.buf.length * 2);
    for (let i = 0; i < this.n; i++) nb[i] = this.buf[(this.head + i) % this.buf.length];
    this.buf = nb;
    this.head = 0;
    this.tail = this.n;
  }
}

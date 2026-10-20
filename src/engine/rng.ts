// Seeded PRNG (mulberry32) plus samplers used by the simulation.

export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }
  /** Gamma(k=2)-distributed with the given mean (coefficient of variation ~0.7). */
  svc(mean: number): number {
    return (this.exp(mean) + this.exp(mean)) / 2;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
  weighted<K extends string>(weights: Partial<Record<K, number>>): K {
    let total = 0;
    for (const k in weights) total += weights[k] ?? 0;
    let r = this.next() * total;
    for (const k in weights) {
      r -= weights[k] ?? 0;
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0] as K;
  }
}

/** Zipf sampler over [0, n) with exponent s using a precomputed CDF. Key 0 is the hottest. */
export class Zipf {
  private cdf: Float64Array;
  constructor(public n: number, public s: number) {
    this.cdf = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += 1 / Math.pow(i + 1, s);
      this.cdf[i] = sum;
    }
    for (let i = 0; i < n; i++) this.cdf[i] /= sum;
  }
  sample(r: number): number {
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  /** Fraction of requests that land on the hottest `k` keys. */
  topShare(k: number): number {
    if (k <= 0) return 0;
    return this.cdf[Math.min(this.n, k) - 1];
  }
}

export function hash32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

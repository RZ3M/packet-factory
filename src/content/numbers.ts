// Reference numbers from the primer's appendix.

export const LATENCY_NUMBERS: { op: string; ns: number; note?: string }[] = [
  { op: 'L1 cache reference', ns: 0.5 },
  { op: 'Branch mispredict', ns: 5 },
  { op: 'L2 cache reference', ns: 7, note: '14× L1' },
  { op: 'Mutex lock/unlock', ns: 25 },
  { op: 'Main memory reference', ns: 100, note: '20× L2, 200× L1' },
  { op: 'Compress 1 KB with Zippy', ns: 10_000 },
  { op: 'Send 1 KB over 1 Gbps network', ns: 10_000 },
  { op: 'Read 4 KB randomly from SSD', ns: 150_000, note: '~1 GB/s SSD' },
  { op: 'Read 1 MB sequentially from memory', ns: 250_000 },
  { op: 'Round trip within same datacenter', ns: 500_000 },
  { op: 'Read 1 MB sequentially from SSD', ns: 1_000_000, note: '4× memory' },
  { op: 'HDD seek', ns: 10_000_000, note: '20× datacenter round trip' },
  { op: 'Read 1 MB sequentially from 1 Gbps', ns: 10_000_000, note: '40× memory, 10× SSD' },
  { op: 'Read 1 MB sequentially from HDD', ns: 30_000_000, note: '120× memory, 30× SSD' },
  { op: 'Send packet CA → Netherlands → CA', ns: 150_000_000 },
];

export const POWERS_OF_TWO: { power: number; exact: string; approx: string; bytes: string }[] = [
  { power: 7, exact: '128', approx: '', bytes: '' },
  { power: 8, exact: '256', approx: '', bytes: '' },
  { power: 10, exact: '1,024', approx: '1 thousand', bytes: '1 KB' },
  { power: 16, exact: '65,536', approx: '', bytes: '64 KB' },
  { power: 20, exact: '1,048,576', approx: '1 million', bytes: '1 MB' },
  { power: 30, exact: '1,073,741,824', approx: '1 billion', bytes: '1 GB' },
  { power: 32, exact: '4,294,967,296', approx: '', bytes: '4 GB' },
  { power: 40, exact: '1,099,511,627,776', approx: '1 trillion', bytes: '1 TB' },
];

export function fmtNs(ns: number): string {
  if (ns >= 1e6) return `${(ns / 1e6).toLocaleString()} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toLocaleString()} µs`;
  return `${ns} ns`;
}

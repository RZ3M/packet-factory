import { useEffect, useRef, useState } from 'react';
import { Quiz } from '../Quiz';

interface Pk {
  seq: number;
  sent: number; // time this transmission left
  arrive: number;
  lost: boolean;
  tries: number;
}

const QUESTIONS = [
  { q: 'Downloading a 2 GB installer', options: ['TCP', 'UDP'], answer: 0, explain: 'Every byte must arrive intact and in order — a corrupted installer is useless. TCP guarantees delivery and ordering.' },
  { q: 'A video call', options: ['TCP', 'UDP'], answer: 1, explain: 'A late frame is worse than a missing one. UDP lets the app skip lost packets instead of freezing while TCP retransmits.' },
  { q: 'Player positions in a fast multiplayer shooter', options: ['TCP', 'UDP'], answer: 1, explain: 'Only the latest position matters; retransmitting a stale one is wasted latency. Games send state over UDP and add their own light reliability where needed.' },
  { q: 'A DNS lookup', options: ['TCP', 'UDP'], answer: 1, explain: 'One small question, one small answer — no need for a handshake. DNS uses UDP (falling back to TCP for large responses and zone transfers).' },
  { q: 'Submitting a payment', options: ['TCP', 'UDP'], answer: 0, explain: 'You need reliable, ordered delivery and a clear acknowledgment. TCP (usually under HTTPS).' },
  { q: 'Streaming database replication to a replica', options: ['TCP', 'UDP'], answer: 0, explain: 'Replication logs must be applied completely and in order, or the replica diverges.' },
];

export function ProtocolLab() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loss, setLoss] = useState(0.08);
  const [rtt, setRtt] = useState(160);
  const params = useRef({ loss, rtt });
  params.current = { loss, rtt };
  const [stats, setStats] = useState({ udpLost: 0, udpTotal: 0, tcpAvg: 0, tcpMax: 0, udpAvg: 0, retrans: 0 });

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const start = performance.now();
    let nextSend = 0;
    let seq = 0;
    const udp: Pk[] = [];
    const tcp: Pk[] = [];
    const tcpArrived = new Map<number, number>(); // seq -> arrival time at receiver
    const tcpDelivered: { seq: number; t: number; lat: number }[] = [];
    const udpDelivered: { seq: number; t: number; lat: number }[] = [];
    let nextDeliver = 1;
    let udpLost = 0;
    let udpTotal = 0;
    let retrans = 0;
    const sentAt = new Map<number, number>();
    let lastStats = 0;

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const { loss: p, rtt: R } = params.current;
      const D = R / 2000;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // send
      while (t >= nextSend) {
        seq++;
        sentAt.set(seq, nextSend);
        const lostU = Math.random() < p;
        udp.push({ seq, sent: nextSend, arrive: nextSend + D * (0.9 + Math.random() * 0.2), lost: lostU, tries: 1 });
        udpTotal++;
        if (lostU) udpLost++;
        const lostT = Math.random() < p;
        tcp.push({ seq, sent: nextSend, arrive: nextSend + D * (0.9 + Math.random() * 0.2), lost: lostT, tries: 1 });
        nextSend += 0.12;
      }
      // tcp retransmit on timeout (RTO ≈ 2 × RTT after send)
      for (const pk of tcp) {
        if (pk.lost && t >= pk.sent + (2 * R) / 1000 && !(pk as any).retx) {
          (pk as any).retx = true;
          retrans++;
          const lost = Math.random() < p;
          tcp.push({ seq: pk.seq, sent: t, arrive: t + D * (0.9 + Math.random() * 0.2), lost, tries: pk.tries + 1 });
        }
        if (!pk.lost && t >= pk.arrive && !tcpArrived.has(pk.seq)) tcpArrived.set(pk.seq, pk.arrive);
      }
      // in-order delivery to the app
      while (tcpArrived.has(nextDeliver)) {
        const born = sentAt.get(nextDeliver)!;
        tcpDelivered.push({ seq: nextDeliver, t, lat: t - born });
        tcpArrived.delete(nextDeliver);
        nextDeliver++;
      }
      for (const pk of udp) if (!pk.lost && t >= pk.arrive && !(pk as any).done) {
        (pk as any).done = true;
        udpDelivered.push({ seq: pk.seq, t, lat: pk.arrive - pk.sent });
      }
      // gc
      while (udp.length && t - udp[0].sent > 6) udp.shift();
      while (tcp.length && t - tcp[0].sent > 12) tcp.shift();
      while (tcpDelivered.length > 200) tcpDelivered.shift();
      while (udpDelivered.length > 200) udpDelivered.shift();

      // draw
      ctx.fillStyle = '#0d131c';
      ctx.fillRect(0, 0, w, h);
      const lanes = [
        { y: h * 0.3, label: 'TCP', list: tcp, color: '#38bdf8' },
        { y: h * 0.72, label: 'UDP', list: udp, color: '#c084fc' },
      ];
      const x0 = 80;
      const x1 = w - 120;
      for (const lane of lanes) {
        ctx.strokeStyle = '#1e2a3b';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(x0, lane.y);
        ctx.lineTo(x1, lane.y);
        ctx.stroke();
        ctx.fillStyle = lane.color;
        ctx.font = '700 14px "Chakra Petch", sans-serif';
        ctx.fillText(lane.label, 16, lane.y + 5);
        ctx.fillStyle = '#8a9bb3';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('sender', x0 - 2, lane.y - 16);
        ctx.fillText('receiver', x1 - 40, lane.y - 16);
        for (const pk of lane.list) {
          const f = (t - pk.sent) / (pk.arrive - pk.sent);
          if (f < 0 || f > 1.02) continue;
          if (pk.lost && f > 0.55) {
            // falls off the belt
            const x = x0 + (x1 - x0) * 0.55;
            const drop = (f - 0.55) * 160;
            if (drop > 60) continue;
            ctx.globalAlpha = 1 - drop / 60;
            ctx.fillStyle = '#f43f5e';
            ctx.font = '700 13px Inter';
            ctx.fillText('✕', x - 4, lane.y + 5 + drop);
            ctx.globalAlpha = 1;
            continue;
          }
          const x = x0 + (x1 - x0) * Math.min(1, f);
          ctx.fillStyle = pk.tries > 1 ? '#fbbf24' : lane.color;
          ctx.beginPath();
          ctx.arc(x, lane.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // TCP receive buffer (head-of-line blocked)
      const buffered = [...tcpArrived.keys()].sort((a, b) => a - b);
      ctx.fillStyle = '#8a9bb3';
      ctx.font = '11px Inter';
      ctx.fillText(buffered.length ? `buffer: waiting for #${nextDeliver}` : 'buffer: empty', x1 + 8, lanes[0].y - 16);
      buffered.slice(0, 12).forEach((s, i) => {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x1 + 10 + (i % 6) * 14, lanes[0].y - 6 + Math.floor(i / 6) * 14, 10, 10);
      });
      // app timelines
      const tl = (list: { t: number }[], y: number, color: string) => {
        ctx.fillStyle = '#5b6b82';
        ctx.fillText('app', x1 + 8, y + 32);
        for (const d of list) {
          const age = t - d.t;
          if (age > 4) continue;
          const x = x1 + 100 - age * 22;
          ctx.fillStyle = color;
          ctx.fillRect(x, y + 22, 3, 12);
        }
      };
      tl(tcpDelivered, lanes[0].y, '#38bdf8');
      tl(udpDelivered, lanes[1].y, '#c084fc');

      if (t - lastStats > 0.5) {
        lastStats = t;
        const tl2 = tcpDelivered.slice(-60);
        const ul = udpDelivered.slice(-60);
        setStats({
          udpLost,
          udpTotal,
          retrans,
          tcpAvg: tl2.length ? (tl2.reduce((s, d) => s + d.lat, 0) / tl2.length) * 1000 : 0,
          tcpMax: tl2.length ? Math.max(...tl2.map((d) => d.lat)) * 1000 : 0,
          udpAvg: ul.length ? (ul.reduce((s, d) => s + d.lat, 0) / ul.length) * 1000 : 0,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <canvas ref={ref} style={{ width: '100%', height: 260, display: 'block' }} />
      </div>
      <div className="cols2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="field" style={{ marginTop: 0 }}>
            <label>
              Packet loss <span className="mono accent">{Math.round(loss * 100)}%</span>
            </label>
            <input className="range" type="range" min={0} max={0.3} step={0.01} value={loss} onChange={(e) => setLoss(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>
              Round-trip time <span className="mono accent">{rtt} ms</span>
            </label>
            <input className="range" type="range" min={20} max={400} step={10} value={rtt} onChange={(e) => setRtt(Number(e.target.value))} />
          </div>
          <div className="stats" style={{ marginTop: 14 }}>
            <div className="stat">
              <small>TCP avg delay</small>
              <b style={{ color: '#38bdf8' }}>{Math.round(stats.tcpAvg)} ms</b>
            </div>
            <div className="stat">
              <small>TCP worst</small>
              <b style={{ color: stats.tcpMax > rtt * 2 ? 'var(--bad)' : '#38bdf8' }}>{Math.round(stats.tcpMax)} ms</b>
            </div>
            <div className="stat">
              <small>Retransmits</small>
              <b>{stats.retrans}</b>
            </div>
            <div className="stat">
              <small>UDP avg delay</small>
              <b style={{ color: '#c084fc' }}>{Math.round(stats.udpAvg)} ms</b>
            </div>
            <div className="stat">
              <small>UDP lost</small>
              <b style={{ color: 'var(--bad)' }}>{stats.udpTotal ? ((stats.udpLost / stats.udpTotal) * 100).toFixed(1) : 0}%</b>
            </div>
            <div className="stat">
              <small>TCP lost</small>
              <b className="good">0%</b>
            </div>
          </div>
          <div className="md" style={{ fontSize: 13, marginTop: 10 }}>
            <p>
              <b style={{ color: '#38bdf8' }}>TCP</b> is connection-oriented: a handshake, sequence numbers, acknowledgements, retransmission and flow/congestion control. Every byte arrives, in order — but one lost packet stalls everything behind it (<b>head-of-line blocking</b>, the amber buffer).
            </p>
            <p>
              <b style={{ color: '#c084fc' }}>UDP</b> is connectionless datagrams: no handshake, no ordering, no retries. Lower and steadier latency; the application decides what to do about loss.
            </p>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>Pick the protocol</h3>
          <Quiz questions={QUESTIONS} />
        </div>
      </div>
    </>
  );
}

import { useGame } from '../game/store';
import { Icon } from './common';
import { NapkinLab } from './labs/Napkin';
import { LatencyLab } from './labs/Latency';
import { NinesLab } from './labs/Nines';
import { ProtocolLab } from './labs/Protocol';
import { ConsistencyLab } from './labs/Consistency';
import { HttpLab } from './labs/Http';

const LABS = [
  { id: 'napkin', title: 'Napkin Math', icon: 'Calculator', color: '#f5a524', blurb: 'Back-of-the-envelope estimation drills: QPS, storage, bandwidth, memory. The interview warm-up.', C: NapkinLab },
  { id: 'latency', title: 'Latency Ladder', icon: 'Timer', color: '#38bdf8', blurb: 'Order operations by latency — L1 cache to a trans-Atlantic round trip — and see the numbers to scale.', C: LatencyLab },
  { id: 'nines', title: 'Counting Nines', icon: 'Activity', color: '#34d399', blurb: 'Availability in sequence vs in parallel. How many 9s does your architecture really have?', C: NinesLab },
  { id: 'protocol', title: 'TCP vs UDP', icon: 'Wifi', color: '#c084fc', blurb: 'Push packets over a lossy link. Watch retransmits and head-of-line blocking versus drops.', C: ProtocolLab },
  { id: 'consistency', title: 'Consistency & CAP', icon: 'Scale', color: '#fb923c', blurb: 'Weak, eventual and strong consistency on a replicated register — then cut the network.', C: ConsistencyLab },
  { id: 'http', title: 'HTTP, REST & RPC', icon: 'Route', color: '#2dd4bf', blurb: 'Idempotency, safe methods, and when to reach for RPC instead of REST.', C: HttpLab },
];

export function Labs() {
  const labId = useGame((s) => s.labId);
  const { go } = useGame.getState();
  const lab = LABS.find((l) => l.id === labId);
  return (
    <div className="screen">
      <div className="wrapw">
        <div className="pagehead">
          <button className="btn ghost icon" onClick={() => (lab ? go('labs') : go('home'))} title="Back">
            <Icon name="ChevronLeft" size={18} />
          </button>
          <h1>{lab ? lab.title : 'Labs'}</h1>
          {!lab && <span className="muted">Interactive drills for the concepts that do not fit on a factory floor.</span>}
        </div>
        {lab ? (
          <lab.C />
        ) : (
          <div className="cards">
            {LABS.map((l) => (
              <button key={l.id} className="card lab-card" onClick={() => go('labs', { labId: l.id })}>
                <b>
                  <Icon name={l.icon} size={18} color={l.color} /> {l.title}
                </b>
                <p>{l.blurb}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

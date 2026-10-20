import { CATALOG, nodeCost, nominalCapacity, type ConfigField } from '../engine/catalog';
import { fmtMs } from '../engine/evaluate';
import type { NodeView } from '../engine/sim';
import type { DesignNode, ReqType } from '../engine/types';
import { FAIL_LABEL, REGION_LABEL, REQ_META, REQ_TYPES } from '../engine/types';
import { CODEX_BY_ID } from '../content/codex';
import { useGame } from '../game/store';
import { utilColor, fmtRate } from '../render/renderer';
import { Icon, Spark, Toggle, fmtMoney, fmtNum } from './common';
import { Overview } from './Overview';

export function Inspector() {
  const sel = useGame((s) => s.selection);
  const design = useGame((s) => s.design);
  if (sel?.type === 'node') {
    const n = design.nodes.find((x) => x.id === sel.id);
    if (n) return <NodeInspector n={n} />;
  }
  if (sel?.type === 'edge') {
    const e = design.edges.find((x) => x.id === sel.id);
    if (e) return <EdgeInspector id={e.id} />;
  }
  return <Overview />;
}

function NodeInspector({ n }: { n: DesignNode }) {
  const level = useGame((s) => s.level);
  const sim = useGame((s) => s.sim);
  const phase = useGame((s) => s.phase);
  useGame((s) => s.tick);
  const { updateNode, setConfig, setTier, duplicate, deleteSelection, go, promote, crashNode } = useGame.getState();
  const spec = CATALOG[n.kind];
  const sn = sim?.nodes.get(n.id);
  const v: NodeView | undefined = sn?.view;
  const features = level?.features ?? [];
  const fields = spec.fields.filter((f) => (!f.feature || features.includes(f.feature)) && (!f.showIf || f.showIf(n.config)));
  const cost = nodeCost(n.kind, n.tier, n.config, { staticKeys: level?.keyspace.staticKeys });
  const cap = v?.capacity ?? nominalCapacity(n.kind, n.tier, n.config);
  const codex = CODEX_BY_ID.get(spec.codex);
  const isSandbox = level?.id === 'sandbox';
  const canPromote = sn && sn.kind === 'sql' && sn.role !== 'primary' && sn.primary && !sn.primary.up && sn.up;

  return (
    <div className="panel">
      <div className="insp-h">
        <div className="ico" style={{ background: spec.color + '1f', border: `1px solid ${spec.color}55` }}>
          <Icon name={spec.icon} size={20} color={spec.color} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <input value={n.name ?? spec.name} onChange={(e) => updateNode(n.id, { name: e.target.value })} disabled={n.kind === 'users'} />
          <div className="muted" style={{ fontSize: 11.5, paddingLeft: 5 }}>
            {spec.name}
            {n.region ? ` · ${REGION_LABEL[n.region]}` : ''}
            {n.locked ? ' · scenario' : ''}
          </div>
        </div>
      </div>
      <div className="panel-b">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, margin: '0 0 10px' }}>
          {spec.blurb}
        </p>

        {n.kind !== 'users' && (
          <>
            <div className="stats">
              <Stat label="Util" value={v ? `${Math.round(v.util * 100)}%` : '—'} color={v ? utilColor(v.util) : undefined} />
              <Stat label="In" value={v ? `${fmtRate(v.rps)}/s` : '—'} />
              <Stat label="Capacity" value={`~${fmtNum(cap)}/s`} />
              <Stat label="Queue" value={v ? fmtRate(v.queue) : '—'} color={v && v.queue > 0 ? 'var(--warn)' : undefined} />
              <Stat label="Errors" value={v ? `${fmtRate(v.drops)}/s` : '—'} color={v && v.drops > 0.5 ? 'var(--bad)' : undefined} />
              <Stat label="Cost" value={`${fmtMoney(v?.cost ?? cost)}`} />
              {(n.kind === 'cache' || n.kind === 'cdn') && <Stat label="Hit rate" value={v ? `${Math.round(v.hitRate * 100)}%` : '—'} />}
              {n.kind === 'sql' && v?.role && v.role !== 'primary' && <Stat label="Repl. lag" value={v ? fmtMs(v.lag * 1000) : '—'} />}
              {n.kind === 'sql' && <Stat label="Role" value={v?.role ?? n.config.role ?? 'primary'} />}
              {n.kind === 'cache' && (v?.pending ?? 0) > 0 && <Stat label="Unflushed" value={fmtRate(v!.pending)} color="var(--warn)" />}
              {(n.kind === 'app' || n.kind === 'worker') && <Stat label="Instances" value={`${v?.instances ?? n.config.instances ?? 1}${v?.bootingInstances ? `+${v.bootingInstances}` : ''}`} />}
            </div>
            {v && v.utilHist.length > 2 && (
              <div style={{ marginTop: 8 }}>
                <div className="faint" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                  Utilization
                </div>
                <Spark data={v.utilHist} color={utilColor(v.util)} max={1} />
              </div>
            )}
            {v && Object.keys(v.dropBy).length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5 }}>
                {Object.entries(v.dropBy)
                  .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                  .slice(0, 3)
                  .map(([r, c]) => (
                    <div key={r} className="bad" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>✕ {FAIL_LABEL[r as keyof typeof FAIL_LABEL]}</span>
                      <span className="mono">{fmtNum(c ?? 0)}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {spec.tiers && (
          <div className="field">
            <label>
              Size (vertical scaling)
              {phase === 'running' && <span className="warn" style={{ fontSize: 10.5, fontWeight: 500 }}>resizing restarts it</span>}
            </label>
            <div className="tiers">
              {spec.tiers.map((t) => (
                <button key={t.id} className={`tier ${n.tier === t.id ? 'on' : ''}`} onClick={() => setTier(n.id, t.id)}>
                  <b>
                    {t.id} · {t.label}
                  </b>
                  <span>
                    ${t.cost}/mo · {t.mem ? `${fmtNum(t.mem)} obj` : `${fmtNum(nominalCapacity(n.kind, t.id, { ...n.config, instances: 1 }))}/s`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {fields.map((f) => (
          <Field key={f.key} f={f} value={n.config[f.key] ?? f.default} onChange={(val) => setConfig(n.id, f.key, val)} />
        ))}

        {n.kind !== 'users' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => duplicate(n.id)} title="Duplicate with wires (Ctrl+D)" disabled={!level?.palette.includes(n.kind)}>
              <Icon name="Copy" size={13} /> Duplicate
            </button>
            <button className="btn sm danger" onClick={deleteSelection} disabled={n.locked} title="Delete (Del)">
              <Icon name="Trash" size={13} /> Delete
            </button>
            {canPromote && (
              <button className="btn sm primary" onClick={() => promote(n.id)} title="Manually fail over to this replica">
                <Icon name="ArrowUpRight" size={13} /> Promote to primary
              </button>
            )}
            {isSandbox && sim && (
              <button className="btn sm danger" onClick={() => crashNode(n.id)} title="Crash it (recovers after 20s)">
                <Icon name="Flame" size={13} /> Crash
              </button>
            )}
          </div>
        )}
        {codex && (
          <button className="btn sm ghost" style={{ marginTop: 10, width: '100%', justifyContent: 'flex-start' }} onClick={() => go('codex', { codexId: codex.id })}>
            <Icon name="BookOpen" size={13} /> Learn: {codex.title}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ f, value, onChange }: { f: ConfigField; value: any; onChange: (v: any) => void }) {
  if (f.type === 'toggle') {
    return (
      <div className="field">
        <label>
          {f.label}
          <Toggle on={!!value} onChange={onChange} />
        </label>
        <div className="help">{f.help}</div>
      </div>
    );
  }
  if (f.type === 'number') {
    return (
      <div className="field">
        <label>
          {f.label}
          <span className="stepper">
            <button className="btn sm icon" onClick={() => onChange(Math.max(f.min ?? 0, Number(value) - (f.step ?? 1)))}>
              −
            </button>
            <b>{value}</b>
            <button className="btn sm icon" onClick={() => onChange(Math.min(f.max ?? 99, Number(value) + (f.step ?? 1)))}>
              +
            </button>
          </span>
        </label>
        <div className="help">{f.help}</div>
      </div>
    );
  }
  const opts = f.options ?? [];
  const rich = opts.some((o) => o.hint);
  return (
    <div className="field">
      <label>{f.label}</label>
      {rich ? (
        <div className="opts">
          {opts.map((o) => (
            <button key={String(o.value)} className={`opt ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
              <b>{o.label}</b>
              {o.hint && <span>{o.hint}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="seg" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {opts.map((o) => (
            <button key={String(o.value)} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} style={{ flex: 1 }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="help">{f.help}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b style={{ color }}>{value}</b>
    </div>
  );
}

const L7_SENDERS = ['proxy', 'gateway', 'app', 'worker', 'cache', 'cdn', 'dns', 'users'];

function EdgeInspector({ id }: { id: string }) {
  const design = useGame((s) => s.design);
  const sim = useGame((s) => s.sim);
  useGame((s) => s.tick);
  const { setEdgeFilter, deleteSelection } = useGame.getState();
  const e = design.edges.find((x) => x.id === id)!;
  const from = design.nodes.find((n) => n.id === e.from)!;
  const to = design.nodes.find((n) => n.id === e.to)!;
  const se = sim?.edgeById.get(id);
  const repl = from.kind === 'sql' && to.kind === 'sql';
  const honors = L7_SENDERS.includes(from.kind) || (from.kind === 'lb' && from.config.layer === 'L7');
  const rates = REQ_TYPES.map((t, i) => ({ t, r: se?.rate[i] ?? 0 })).filter((x) => x.r > 0.05);
  const total = rates.reduce((s, x) => s + x.r, 0);
  const filter = e.filter;
  const toggle = (t: ReqType) => {
    const cur = new Set(filter ?? REQ_TYPES);
    if (cur.has(t)) cur.delete(t);
    else cur.add(t);
    setEdgeFilter(id, cur.size === REQ_TYPES.length ? undefined : [...cur]);
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <span>{repl ? 'Replication link' : 'Belt'}</span>
      </div>
      <div className="panel-b">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {from.name ?? CATALOG[from.kind].name} <span className="muted">→</span> {to.name ?? CATALOG[to.kind].name}
        </div>
        {repl ? (
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Every write committed on the primary is shipped to this database and re-applied there. That costs the replica capacity and arrives a little later — the gap is <b>replication lag</b>. Wire it both ways between two primaries for master-master.
            {se ? (
              <>
                <br />
                <br />
                Shipping <b className="mono">{fmtNum(se.ghostRate)}</b> writes/s.
              </>
            ) : null}
          </p>
        ) : (
          <>
            <div className="faint" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Flow {sim ? `· ${fmtNum(total)}/s` : ''}
            </div>
            {rates.length ? (
              rates.map((x) => (
                <div key={x.t} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 50px', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: REQ_META[x.t].color }}>{REQ_META[x.t].label}</span>
                  <div className="bar-h">
                    <i style={{ width: `${(x.r / total) * 100}%`, background: REQ_META[x.t].color }} />
                  </div>
                  <span className="mono" style={{ textAlign: 'right' }}>
                    {fmtNum(x.r)}
                  </span>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                {sim ? 'Nothing flowing on this belt.' : 'Run the simulation to see flow.'}
              </div>
            )}
            <div className="field">
              <label>
                <span>
                  <Icon name="Funnel" size={12} /> Allowed request types
                </span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {REQ_TYPES.map((t) => {
                  const on = !filter || filter.includes(t);
                  return (
                    <button
                      key={t}
                      className="pill"
                      onClick={() => toggle(t)}
                      style={{ cursor: 'pointer', borderColor: on ? REQ_META[t].color + '88' : 'transparent', color: on ? REQ_META[t].color : 'var(--faint)', background: on ? REQ_META[t].color + '14' : undefined }}
                    >
                      <span className="dot" style={{ background: on ? REQ_META[t].color : '#334155' }} />
                      {REQ_META[t].label}
                    </button>
                  );
                })}
              </div>
              <div className="help">
                {honors
                  ? 'Like a filter splitter: only the checked request types may travel this belt. Use it to send static files one way and API calls another.'
                  : 'This sender is a Layer 4 load balancer — it only sees IPs and ports, so it ignores filters. Switch it to Layer 7 to route by request type.'}
              </div>
            </div>
          </>
        )}
        <button className="btn sm danger" style={{ marginTop: 12 }} onClick={deleteSelection}>
          <Icon name="Trash" size={13} /> Remove {repl ? 'link' : 'belt'}
        </button>
      </div>
    </div>
  );
}

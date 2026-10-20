import { formatObjectiveValue, objectiveLabel, objectiveMet, objectiveValue } from '../engine/evaluate';
import { useGame } from '../game/store';
import { Icon, Markdown } from './common';

export function Mission() {
  const level = useGame((s) => s.level);
  const sim = useGame((s) => s.sim);
  const hintsShown = useGame((s) => s.hintsShown);
  useGame((s) => s.tick);
  const { setModal, showHint, clearDesign, askConfirm } = useGame.getState();
  if (!level || level.id === 'sandbox') return null;
  const scoring = !!sim && sim.stats.scoring && sim.stats.offered > 0;

  return (
    <div className="panel">
      <div className="panel-h">
        <span>Objectives</span>
        <span style={{ display: 'flex', gap: 2 }}>
          {level.lesson?.length && !level.interview ? (
            <button className="btn sm ghost" onClick={() => setModal('lesson')} title="Replay the lesson for this level">
              <Icon name="GraduationCap" size={13} /> Lesson
            </button>
          ) : null}
          <button className="btn sm ghost" onClick={() => setModal(level.interview ? 'interview' : 'brief')}>
            <Icon name="ScrollText" size={13} /> Brief
          </button>
        </span>
      </div>
      <div className="panel-b">
        {level.objectives.map((o, i) => {
          const v = scoring ? objectiveValue(sim!, o) : null;
          const met = v !== null ? objectiveMet(o, v) : null;
          const star = o.star ?? 1;
          return (
            <div key={i} className={`obj ${met === true ? 'met' : met === false ? 'miss' : ''}`}>
              <span className="ic">
                {met === null ? (
                  <Icon name="Target" size={15} color="#5b6b82" />
                ) : met ? (
                  <Icon name="CircleCheck" size={15} color="#34d399" />
                ) : (
                  <Icon name="CircleX" size={15} color="#f43f5e" />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {objectiveLabel(o)}
                  {star > 1 && <span className="star-tag">{'★'.repeat(star)}</span>}
                </div>
                {v !== null && <div className={`v ${met ? 'good' : 'bad'}`}>now: {formatObjectiveValue(o, v)}</div>}
              </div>
            </div>
          );
        })}
        <div className="faint" style={{ fontSize: 11, margin: '2px 0 10px' }}>
          ★ required · ★★ / ★★★ bonus stars. Scored over the whole run{level.warmup ? ` after a ${level.warmup}s warm-up` : ''}.
        </div>
        {level.hints.slice(0, hintsShown).map((h, i) => (
          <div key={i} className="obj" style={{ borderColor: 'rgba(250,204,21,0.3)' }}>
            <span className="ic">
              <Icon name="Lightbulb" size={15} color="#facc15" />
            </span>
            <Markdown text={h} className="hint-md" />
          </div>
        ))}
        <button className="btn sm" onClick={showHint} disabled={hintsShown >= level.hints.length} style={{ width: '100%', marginBottom: 6 }}>
          <Icon name="Lightbulb" size={13} /> {hintsShown >= level.hints.length ? 'No more hints' : `Hint (${level.hints.length - hintsShown} left)`}
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn sm"
            style={{ flex: 1 }}
            title="Throw away your changes and start from the level's original layout"
            onClick={() =>
              askConfirm({
                title: 'Reset your design?',
                body: 'Everything you built on this level is replaced by the original starting layout. You can still undo with Ctrl+Z.',
                confirmLabel: 'Reset design',
                danger: true,
                onConfirm: clearDesign,
              })
            }
          >
            <Icon name="RotateCcw" size={13} /> Reset
          </button>
          <button
            className="btn sm"
            style={{ flex: 1 }}
            title="See the reference design and why every choice in it works"
            onClick={() => setModal('solution')}
          >
            <Icon name="Eye" size={13} /> Solution
          </button>
        </div>
      </div>
    </div>
  );
}

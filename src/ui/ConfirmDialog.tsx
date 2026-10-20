import { useGame } from '../game/store';
import { Modal } from './common';

/** In-game replacement for window.confirm (which embedded browsers may block). */
export function ConfirmDialog() {
  const c = useGame((s) => s.confirmDialog);
  const close = useGame((s) => s.closeConfirm);
  if (!c) return null;
  return (
    <Modal width={460} onClose={close}>
      <div className="modal-h">
        <h2 style={{ fontSize: 21 }}>{c.title}</h2>
      </div>
      <div className="modal-b">
        <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
          {c.body}
        </p>
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button
          className={`btn ${c.danger ? 'danger' : 'primary'}`}
          autoFocus
          onClick={() => {
            close();
            c.onConfirm();
          }}
        >
          {c.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

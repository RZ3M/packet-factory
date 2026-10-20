import { useEffect } from 'react';
import { useGame } from '../game/store';
import { Board } from './Board';
import { Charts } from './Charts';
import { ConfirmDialog } from './ConfirmDialog';
import { Inspector } from './Inspector';
import { InterviewModal } from './Interview';
import { LessonModal } from './Lesson';
import { Mission } from './Mission';
import { Palette } from './Palette';
import { Results } from './Results';
import { SolutionModal } from './SolutionView';
import { TopBar } from './TopBar';
import { Toasts, Tutorial } from './Tutorial';

export function GameScreen() {
  const modal = useGame((s) => s.modal);
  const design = useGame((s) => s.design);
  const level = useGame((s) => s.level);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const st = useGame.getState();
      if (st.modal || st.confirmDialog) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        st.togglePlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelection();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (st.selection?.type === 'node') st.duplicate(st.selection.id);
      } else if (!mod && ['1', '2', '3', '4'].includes(e.key)) {
        st.setSpeed([1, 2, 4, 8][Number(e.key) - 1]);
      } else if (e.key === 'Escape') {
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onlyUsers = design.nodes.length <= (level?.sources.length ?? 1);

  return (
    <div className="game">
      <TopBar />
      <div className="leftcol">
        <Palette />
        <Mission />
      </div>
      <div className="center">
        <div className="board">
          <Board />
          <div className="board-overlay">
            <Tutorial />
            {onlyUsers && !level?.tutorial && (
              <div className="empty-hint">
                <div className="display" style={{ fontSize: 18 }}>Drag components from the left</div>
                <div style={{ fontSize: 13 }}>then wire them from their glowing output ports</div>
              </div>
            )}
            <div className="board-hint">
              <span>
                <kbd>Space</kbd> run
              </span>
              <span>
                <kbd>Shift</kbd>+drag wire = connect all
              </span>
              <span>
                <kbd>Ctrl D</kbd> duplicate
              </span>
              <span>
                <kbd>Del</kbd> delete
              </span>
            </div>
          </div>
        </div>
        <Charts />
      </div>
      <div className="rightcol">
        <Inspector />
      </div>
      <Toasts />
      {modal === 'lesson' && <LessonModal />}
      {modal === 'brief' && <LessonModal atMission />}
      {modal === 'interview' && <InterviewModal />}
      {modal === 'results' && <Results />}
      {modal === 'solution' && <SolutionModal />}
      <ConfirmDialog />
    </div>
  );
}

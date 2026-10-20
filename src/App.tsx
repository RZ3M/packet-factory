import { useGame } from './game/store';
import { CodexScreen } from './ui/CodexScreen';
import { Drill } from './ui/Drill';
import { GameScreen } from './ui/GameScreen';
import { Home } from './ui/Home';
import { Labs } from './ui/Labs';
import { LevelSelect } from './ui/LevelSelect';
import { StudyApp } from './study/StudyApp';

export function App() {
  const screen = useGame((s) => s.screen);
  switch (screen) {
    case 'home':
      return <Home />;
    case 'map':
      return <LevelSelect />;
    case 'game':
      return <GameScreen />;
    case 'codex':
      return <CodexScreen />;
    case 'labs':
      return <Labs />;
    case 'drill':
      return <Drill />;
    case 'study':
      return <StudyApp />;
  }
}

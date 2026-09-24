import { useCallback, useState } from 'react';
import { Scene, type CamPreset } from './components/Scene';
import { UI } from './components/UI';
import type { AnimName, MeshStats } from './components/Soldier';

function App() {
  const [level, setLevel] = useState(3);
  const [wireframe, setWireframe] = useState(false);
  const [tint, setTint] = useState('#cccccc');
  const [animation, setAnimation] = useState<AnimName>('Idle');
  const [autoRotate, setAutoRotate] = useState(false);
  const [camPreset, setCamPreset] = useState<CamPreset>('full');
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [fps, setFps] = useState(0);

  const onStats = useCallback((s: MeshStats) => setStats(s), []);
  const onBusy = useCallback((b: boolean) => setBusy(b), []);
  const onFps = useCallback((f: number) => setFps(f), []);

  return (
    <div className="relative w-full h-screen bg-[#07090c] overflow-hidden">
      <div className="absolute inset-0">
        <Scene
          level={level}
          wireframe={wireframe}
          tint={tint}
          animation={animation}
          autoRotate={autoRotate}
          camPreset={camPreset}
          onStats={onStats}
          onBusy={onBusy}
          onFps={onFps}
        />
      </div>
      <UI
        level={level}
        setLevel={setLevel}
        wireframe={wireframe}
        setWireframe={setWireframe}
        tint={tint}
        setTint={setTint}
        animation={animation}
        setAnimation={setAnimation}
        autoRotate={autoRotate}
        setAutoRotate={setAutoRotate}
        camPreset={camPreset}
        setCamPreset={setCamPreset}
        stats={stats}
        busy={busy}
        fps={fps}
      />
    </div>
  );
}

export default App;

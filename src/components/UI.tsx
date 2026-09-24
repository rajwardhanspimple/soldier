import { useProgress } from '@react-three/drei';
import type { AnimName, MeshStats } from './Soldier';
import type { CamPreset } from './Scene';

export const LEVELS = [
  { level: 0, label: 'Base', tris: '11.4K' },
  { level: 1, label: 'Sub 1', tris: '45.5K' },
  { level: 2, label: 'Sub 2', tris: '182K' },
  { level: 3, label: 'Sub 3', tris: '728K' },
  { level: 4, label: 'Sub 4', tris: '2.9M' },
];

export const TINTS = [
  { name: 'Original', value: '#cccccc' },
  { name: 'Black Ops', value: '#707070' },
  { name: 'Navy', value: '#8a9bbd' },
  { name: 'Ranger Green', value: '#9aa585' },
  { name: 'Coyote', value: '#c9b394' },
];

const ANIMS: { id: AnimName; label: string }[] = [
  { id: 'Idle', label: 'Idle' },
  { id: 'Walk', label: 'Patrol' },
  { id: 'Run', label: 'Breach Run' },
  { id: 'TPose', label: 'T-Pose' },
];

const CAMS: { id: CamPreset; label: string }[] = [
  { id: 'full', label: 'Full body' },
  { id: 'head', label: 'Helmet / visor' },
  { id: 'gear', label: 'Vest / gear' },
  { id: 'back', label: 'Rear' },
];

interface UIProps {
  level: number;
  setLevel: (n: number) => void;
  wireframe: boolean;
  setWireframe: (b: boolean) => void;
  tint: string;
  setTint: (t: string) => void;
  animation: AnimName;
  setAnimation: (a: AnimName) => void;
  autoRotate: boolean;
  setAutoRotate: (b: boolean) => void;
  camPreset: CamPreset;
  setCamPreset: (c: CamPreset) => void;
  stats: MeshStats | null;
  busy: boolean;
  fps: number;
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-black/55 backdrop-blur-md border border-white/10 rounded-lg p-4 ${className}`}>
      <div className="text-[10px] tracking-[0.25em] uppercase text-sky-300/80 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({
  items, value, onChange,
}: { items: { id: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0,1fr))` }}>
      {items.map((it) => (
        <button
          key={String(it.id)}
          onClick={() => onChange(it.id)}
          className={`px-2 py-1.5 rounded text-[11px] leading-tight transition border ${
            value === it.id
              ? 'bg-sky-400 text-black border-sky-300 font-semibold'
              : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
          }`}
        >
          {it.label}
          {it.sub && <div className={`text-[9px] ${value === it.id ? 'text-black/70' : 'text-white/45'}`}>{it.sub}</div>}
        </button>
      ))}
    </div>
  );
}

export function UI(p: UIProps) {
  const { progress, active } = useProgress();
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <div className="absolute inset-0 pointer-events-none text-white font-sans select-none">
      {/* Loading */}
      {active && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07090c] pointer-events-auto z-50">
          <div className="w-72">
            <div className="text-xs tracking-[0.3em] uppercase text-sky-300 mb-2">Loading operator</div>
            <div className="h-1 bg-white/10 rounded overflow-hidden">
              <div className="h-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-right text-[11px] text-white/50 mt-1">{progress.toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="absolute top-5 left-5 right-5 flex justify-between items-start gap-4">
        <div>
          <div className="text-[10px] tracking-[0.35em] uppercase text-sky-300/80">Tactical Unit · Operator 01</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">SWAT Operator</h1>
          <div className="text-xs text-white/50 mt-1">Rigged PBR character · Loop-subdivided in real time</div>
        </div>

        <Panel title="Live mesh stats" className="pointer-events-auto min-w-[220px]">
          <div className="space-y-1.5 text-xs font-mono">
            <Row k="Triangles" v={p.stats ? fmt(p.stats.triangles) : '—'} strong />
            <Row k="Vertices" v={p.stats ? fmt(p.stats.vertices) : '—'} />
            <Row k="Subdivision" v={`Level ${p.level}`} />
            <Row k="Last compute" v={p.stats?.computeMs != null ? `${p.stats.computeMs} ms` : '—'} />
            <Row k="Frame rate" v={`${p.fps} fps`} />
          </div>
          {p.busy && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-300">
              <span className="inline-block w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
              Subdividing mesh…
            </div>
          )}
        </Panel>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-col gap-3 w-full md:w-[380px] pointer-events-auto">
          <Panel title="Mesh density (real triangles)">
            <Seg
              items={LEVELS.map((l) => ({ id: l.level, label: l.label, sub: l.tris }))}
              value={p.level}
              onChange={p.setLevel}
            />
            <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
              Each level runs Loop subdivision, which splits every triangle into 4 and smooths the surface.
              Skin weights come along, so animation still works. Level 4 is heavy on the GPU.
            </p>
          </Panel>
          <Panel title="Animation">
            <Seg items={ANIMS} value={p.animation} onChange={p.setAnimation} />
          </Panel>
        </div>

        <div className="flex flex-col gap-3 w-full md:w-[340px] pointer-events-auto">
          <Panel title="Camera">
            <Seg items={CAMS} value={p.camPreset} onChange={p.setCamPreset} />
          </Panel>
          <Panel title="Gear tint & display">
            <div className="flex gap-2 mb-3">
              {TINTS.map((t) => (
                <button
                  key={t.value}
                  title={t.name}
                  onClick={() => p.setTint(t.value)}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    p.tint === t.value ? 'border-sky-400 scale-110' : 'border-white/20 hover:border-white/50'
                  }`}
                  style={{ background: t.value }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Toggle label="Wireframe" on={p.wireframe} set={p.setWireframe} />
              <Toggle label="Auto-rotate" on={p.autoRotate} set={p.setAutoRotate} />
            </div>
          </Panel>
        </div>
      </div>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/30 hidden md:block">
        Drag to orbit · Scroll to zoom · Right-drag to pan
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-white/50">{k}</span>
      <span className={strong ? 'text-sky-300 font-bold' : 'text-white'}>{v}</span>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (b: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      className={`flex-1 flex items-center justify-between gap-2 px-3 py-1.5 rounded border text-[11px] transition ${
        on ? 'bg-sky-400/15 border-sky-400/60 text-sky-200' : 'bg-white/5 border-white/10 text-white/70'
      }`}
    >
      {label}
      <span className={`w-7 h-4 rounded-full relative transition ${on ? 'bg-sky-400' : 'bg-white/20'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

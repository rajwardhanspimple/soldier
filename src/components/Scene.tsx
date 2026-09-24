import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Grid, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Soldier, type AnimName, type MeshStats } from './Soldier';

export type CamPreset = 'full' | 'head' | 'gear' | 'back';

interface SceneProps {
  level: number;
  wireframe: boolean;
  tint: string;
  animation: AnimName;
  autoRotate: boolean;
  camPreset: CamPreset;
  onStats: (s: MeshStats) => void;
  onBusy: (b: boolean) => void;
  onFps: (fps: number) => void;
}

const PRESETS: Record<CamPreset, [number, number, number, number, number, number]> = {
  full: [0.9, 1.35, 3.6, 0, 0.95, 0],
  head: [0.25, 1.68, 0.85, 0, 1.6, 0],
  gear: [0.55, 1.25, 1.4, 0, 1.2, 0],
  back: [-0.8, 1.5, -2.6, 0, 1.0, 0],
};

function CameraRig({ preset, autoRotate }: { preset: CamPreset; autoRotate: boolean }) {
  const ref = useRef<CameraControls>(null);
  useEffect(() => {
    const p = PRESETS[preset];
    ref.current?.setLookAt(p[0], p[1], p[2], p[3], p[4], p[5], true);
  }, [preset]);
  useFrame((_, dt) => {
    if (autoRotate && ref.current) ref.current.azimuthAngle += dt * 0.25;
  });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={0.5}
      maxDistance={8}
      maxPolarAngle={Math.PI / 2 - 0.02}
      smoothTime={0.6}
    />
  );
}

function FpsMeter({ onFps }: { onFps: (f: number) => void }) {
  const acc = useRef({ t: 0, n: 0 });
  useFrame((_, dt) => {
    acc.current.t += dt;
    acc.current.n++;
    if (acc.current.t >= 0.5) {
      onFps(Math.round(acc.current.n / acc.current.t));
      acc.current.t = 0;
      acc.current.n = 0;
    }
  });
  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={512} frames={1}>
      <color attach="background" args={['#050608']} />
      {/* Key softbox */}
      <Lightformer form="rect" intensity={4} color="#fff4e6" position={[3, 3, 4]} scale={[4, 3, 1]} target={[0, 1, 0]} />
      {/* Fill */}
      <Lightformer form="rect" intensity={1.2} color="#dde6ff" position={[-4, 2, 3]} scale={[3, 3, 1]} target={[0, 1, 0]} />
      {/* Top strip */}
      <Lightformer form="rect" intensity={2.5} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[6, 1, 1]} />
      {/* Rim strips */}
      <Lightformer form="rect" intensity={6} color="#6fb6ff" position={[-3, 2, -4]} scale={[0.6, 5, 1]} target={[0, 1, 0]} />
      <Lightformer form="rect" intensity={5} color="#ffb070" position={[3.5, 2, -3.5]} scale={[0.6, 5, 1]} target={[0, 1, 0]} />
      <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 1.5, 6]} scale={2} />
    </Environment>
  );
}

export function Scene(props: SceneProps) {
  const { level, wireframe, tint, animation, autoRotate, camPreset, onStats, onBusy, onFps } = props;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0.9, 1.35, 3.6], fov: 35, near: 0.05, far: 60 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <color attach="background" args={['#07090c']} />
      <fog attach="fog" args={['#07090c', 6, 16]} />

      <ambientLight intensity={0.08} />
      <directionalLight
        position={[2.5, 5, 3.5]}
        intensity={2.2}
        color="#fff1e0"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-0.5}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
      />
      <spotLight position={[-3, 3, -3]} intensity={30} angle={0.5} penumbra={1} color="#4ea8ff" distance={12} />
      <spotLight position={[3, 2.5, -3]} intensity={22} angle={0.5} penumbra={1} color="#ff9a52" distance={12} />

      <Suspense fallback={null}>
        <StudioEnvironment />
        <Soldier
          level={level}
          wireframe={wireframe}
          tint={tint}
          animation={animation}
          onStats={onStats}
          onBusy={onBusy}
        />
      </Suspense>

      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.001, 0]}>
        <circleGeometry args={[12, 96]} />
        <meshStandardMaterial color="#0c0e11" roughness={0.9} metalness={0.1} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} opacity={0.75} scale={4} blur={2.4} far={1.6} resolution={1024} color="#000000" />
      <Grid
        position={[0, 0.002, 0]}
        args={[20, 20]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#1b2530"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#23445e"
        fadeDistance={12}
        fadeStrength={1.5}
        infiniteGrid
      />

      <CameraRig preset={camPreset} autoRotate={autoRotate} />
      <FpsMeter onFps={onFps} />

      <EffectComposer multisampling={4}>
        <Bloom intensity={0.35} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.25} darkness={0.75} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

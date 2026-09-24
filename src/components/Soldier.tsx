import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import soldierUrl from '../assets/soldier.glb?url';
import SubdivWorker from '../lib/subdivide.worker?worker&inline';
import type { BuiltGeometry } from '../lib/loop';

export type AnimName = 'Idle' | 'Walk' | 'Run' | 'TPose';

export interface MeshStats {
  triangles: number;
  vertices: number;
  computeMs: number | null;
}

interface SoldierProps {
  level: number;
  wireframe: boolean;
  tint: string;
  animation: AnimName;
  onStats: (s: MeshStats) => void;
  onBusy: (busy: boolean) => void;
}

function toGeometry(g: BuiltGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(g.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(g.skinWeight, 4));
  geo.setIndex(new THREE.BufferAttribute(g.index, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function countGeo(geo: THREE.BufferGeometry) {
  const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  return { tris, verts: geo.attributes.position.count };
}

export function Soldier({ level, wireframe, tint, animation, onStats, onBusy }: SoldierProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(soldierUrl);
  const { actions } = useAnimations(animations, group);

  // Collect skinned meshes once
  const meshes = useMemo(() => {
    const list: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) list.push(o as THREE.SkinnedMesh);
    });
    return list;
  }, [scene]);

  // Geometry cache: meshName -> level -> geometry
  const cache = useRef(new Map<string, Map<number, THREE.BufferGeometry>>());
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const pending = useRef(new Map<string, BuiltGeometry>());
  const lastMs = useRef<number | null>(null);

  // Setup meshes, materials and worker
  useEffect(() => {
    const w = new SubdivWorker();
    worker.current = w;
    meshes.forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const lvMap = new Map<number, THREE.BufferGeometry>();
      lvMap.set(0, m.geometry);
      cache.current.set(m.name, lvMap);

      const g = m.geometry;
      const pos = g.attributes.position.array as Float32Array;
      const uv = g.attributes.uv.array as Float32Array;
      const si = Uint16Array.from(g.attributes.skinIndex.array as ArrayLike<number>);
      const sw = Float32Array.from(g.attributes.skinWeight.array as ArrayLike<number>);
      const idx = Uint32Array.from(g.index!.array as ArrayLike<number>);
      w.postMessage({
        type: 'init',
        meshId: m.name,
        position: Float32Array.from(pos),
        uv: Float32Array.from(uv),
        skinIndex: si,
        skinWeight: sw,
        index: idx,
      });

      const mat = m.material as THREE.MeshStandardMaterial;
      const isVisor = m.name.toLowerCase().includes('visor');
      mat.roughness = isVisor ? 0.12 : 0.78;
      mat.metalness = isVisor ? 0.85 : 0.05;
      mat.envMapIntensity = isVisor ? 2.2 : 1.1;
      if (mat.map) {
        mat.map.anisotropy = 16;
        mat.map.colorSpace = THREE.SRGBColorSpace;
      }
      if (mat.normalMap) {
        mat.normalMap.anisotropy = 16;
        mat.normalScale.set(1.4, 1.4);
      }
      mat.needsUpdate = true;
    });
    return () => w.terminate();
  }, [meshes]);

  // Report stats helper
  const report = () => {
    let tris = 0, verts = 0;
    meshes.forEach((m) => {
      const c = countGeo(m.geometry);
      tris += c.tris;
      verts += c.verts;
    });
    onStats({ triangles: tris, vertices: verts, computeMs: lastMs.current });
  };

  // Level switching
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const missing = meshes.filter((m) => !cache.current.get(m.name)?.has(level));
    const apply = () => {
      meshes.forEach((m) => {
        const geo = cache.current.get(m.name)!.get(level)!;
        m.geometry = geo;
      });
      report();
      onBusy(false);
    };
    if (missing.length === 0) {
      apply();
      return;
    }
    onBusy(true);
    const rid = ++requestId.current;
    pending.current.clear();
    let maxMs = 0;
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (d.type !== 'result' || d.requestId !== rid) return;
      maxMs = Math.max(maxMs, d.ms);
      cache.current.get(d.meshId)!.set(d.level, toGeometry(d.geometry));
      pending.current.set(d.meshId, d.geometry);
      if (missing.every((m) => cache.current.get(m.name)!.has(level))) {
        w.removeEventListener('message', handler);
        lastMs.current = Math.round(maxMs);
        apply();
      }
    };
    w.addEventListener('message', handler);
    missing.forEach((m) => w.postMessage({ type: 'level', meshId: m.name, level, requestId: rid }));
    return () => w.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, meshes]);

  // Material options
  useEffect(() => {
    meshes.forEach((m) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.wireframe = wireframe;
      if (!m.name.toLowerCase().includes('visor')) mat.color.set(tint);
    });
  }, [meshes, wireframe, tint]);

  // Animation crossfade
  useEffect(() => {
    const action = actions[animation];
    if (!action) return;
    action.reset().setEffectiveWeight(1).fadeIn(0.4).play();
    return () => {
      action.fadeOut(0.4);
    };
  }, [actions, animation]);

  return (
    <group ref={group} rotation={[0, Math.PI, 0]} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(soldierUrl);

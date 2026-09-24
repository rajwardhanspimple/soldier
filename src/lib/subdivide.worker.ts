import { buildGeometry, createBaseLevel, subdivide, type MeshLevel } from './loop';

interface InitMsg {
  type: 'init';
  meshId: string;
  position: Float32Array;
  uv: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
}
interface LevelMsg {
  type: 'level';
  meshId: string;
  level: number;
  requestId: number;
}

const chains = new Map<string, MeshLevel[]>();

self.onmessage = (ev: MessageEvent<InitMsg | LevelMsg>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    chains.set(msg.meshId, [createBaseLevel(msg.position, msg.uv, msg.skinIndex, msg.skinWeight, msg.index)]);
    return;
  }
  const chain = chains.get(msg.meshId);
  if (!chain) return;
  const t0 = performance.now();
  while (chain.length <= msg.level) chain.push(subdivide(chain[chain.length - 1]));
  const g = buildGeometry(chain[msg.level]);
  const ms = performance.now() - t0;
  (self as unknown as Worker).postMessage(
    { type: 'result', meshId: msg.meshId, level: msg.level, requestId: msg.requestId, geometry: g, ms },
    [g.position.buffer, g.normal.buffer, g.uv.buffer, g.skinIndex.buffer, g.skinWeight.buffer, g.index.buffer]
  );
};

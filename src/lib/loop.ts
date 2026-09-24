/**
 * Loop subdivision for skinned, textured triangle meshes.
 *
 * Topology (smoothing) runs on "welded" vertices (vertices sharing a position),
 * so UV seams don't tear the surface open. Per-corner attributes (UV, skin
 * indices/weights) are carried on "attribute" vertices and linearly interpolated.
 * Every level multiplies the triangle count by 4.
 */

export interface MeshLevel {
  wp: Float64Array; // welded positions (W*3)
  wid: Uint32Array; // attribute vertex -> welded id (V)
  uv: Float32Array; // V*2
  si: Uint16Array; // V*4 skin joint indices
  sw: Float32Array; // V*4 skin weights
  idx: Uint32Array; // T*3 triangle indices into attribute vertices
}

export interface BuiltGeometry {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  triangles: number;
  vertices: number;
}

/** Weld attribute vertices by position to create the base level. */
export function createBaseLevel(
  position: Float32Array,
  uv: Float32Array,
  si: Uint16Array,
  sw: Float32Array,
  idx: Uint32Array
): MeshLevel {
  const V = position.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < V; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const tol = diag * 1e-6;

  const map = new Map<string, number>();
  const wid = new Uint32Array(V);
  const wpList: number[] = [];
  for (let i = 0; i < V; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    const key = `${Math.round(x / tol)}_${Math.round(y / tol)}_${Math.round(z / tol)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = wpList.length / 3;
      map.set(key, id);
      wpList.push(x, y, z);
    }
    wid[i] = id;
  }
  // normalize source skin weights (source data does not always sum to 1)
  const nsw = sw.slice();
  for (let i = 0; i < V; i++) {
    const s = nsw[i * 4] + nsw[i * 4 + 1] + nsw[i * 4 + 2] + nsw[i * 4 + 3];
    if (s > 0) for (let k = 0; k < 4; k++) nsw[i * 4 + k] /= s;
    else nsw[i * 4] = 1;
  }
  return {
    wp: Float64Array.from(wpList),
    wid,
    uv: uv.slice(),
    si: si.slice(),
    sw: nsw,
    idx: idx.slice(),
  };
}

/** Merge two sets of 4 skin influences (weighted 50/50), keep strongest 4. */
function mergeSkin(
  si: Uint16Array, sw: Float32Array, a: number, b: number,
  outSi: Uint16Array, outSw: Float32Array, o: number,
  tj: number[], tw: number[]
) {
  let n = 0;
  for (let s = 0; s < 2; s++) {
    const v = s === 0 ? a : b;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k] * 0.5;
      if (w <= 0) continue;
      const j = si[v * 4 + k];
      let found = -1;
      for (let m = 0; m < n; m++) if (tj[m] === j) { found = m; break; }
      if (found >= 0) tw[found] += w;
      else { tj[n] = j; tw[n] = w; n++; }
    }
  }
  // partial selection sort for top 4
  let total = 0;
  for (let k = 0; k < 4; k++) {
    let best = -1, bw = -1;
    for (let m = k; m < n; m++) if (tw[m] > bw) { bw = tw[m]; best = m; }
    if (best < 0) { outSi[o * 4 + k] = 0; outSw[o * 4 + k] = 0; continue; }
    const tjj = tj[k], tww = tw[k];
    tj[k] = tj[best]; tw[k] = tw[best];
    tj[best] = tjj; tw[best] = tww;
    outSi[o * 4 + k] = tj[k];
    outSw[o * 4 + k] = tw[k];
    total += tw[k];
  }
  if (total > 0) for (let k = 0; k < 4; k++) outSw[o * 4 + k] /= total;
}

export function subdivide(L: MeshLevel): MeshLevel {
  const { wp, wid, uv, si, sw, idx } = L;
  const W = wp.length / 3;
  const V = wid.length;
  const T = idx.length / 3;
  const maxE = T * 3;

  // Welded edges
  const wEdgeMap = new Map<number, number>();
  const ea = new Uint32Array(maxE);
  const eb = new Uint32Array(maxE);
  const eFaces = new Uint8Array(maxE);
  const eOpp = new Float64Array(maxE * 3);
  let E = 0;

  // Attribute edges -> new attribute vertex
  const aEdgeMap = new Map<number, number>();
  const aEdgeA = new Uint32Array(maxE);
  const aEdgeB = new Uint32Array(maxE);
  const aEdgeW = new Uint32Array(maxE); // welded edge id
  let AE = 0;

  const triMid = new Uint32Array(T * 3); // attribute mid-vertex index per tri edge (offset later)

  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t * 3 + k];
      const b = idx[t * 3 + ((k + 1) % 3)];
      const c = idx[t * 3 + ((k + 2) % 3)];
      const wa = wid[a], wb = wid[b], wc = wid[c];
      const lo = wa < wb ? wa : wb, hi = wa < wb ? wb : wa;
      const wkey = lo * W + hi;
      let e = wEdgeMap.get(wkey);
      if (e === undefined) {
        e = E++;
        wEdgeMap.set(wkey, e);
        ea[e] = lo; eb[e] = hi;
      }
      if (eFaces[e] < 255) eFaces[e]++;
      eOpp[e * 3] += wp[wc * 3];
      eOpp[e * 3 + 1] += wp[wc * 3 + 1];
      eOpp[e * 3 + 2] += wp[wc * 3 + 2];

      const alo = a < b ? a : b, ahi = a < b ? b : a;
      const akey = alo * V + ahi;
      let ae = aEdgeMap.get(akey);
      if (ae === undefined) {
        ae = AE++;
        aEdgeMap.set(akey, ae);
        aEdgeA[ae] = alo; aEdgeB[ae] = ahi; aEdgeW[ae] = e;
      }
      triMid[t * 3 + k] = ae;
    }
  }

  // Per welded vertex accumulation
  const valence = new Uint32Array(W);
  const nSum = new Float64Array(W * 3);
  const bCount = new Uint32Array(W);
  const bSum = new Float64Array(W * 3);
  for (let e = 0; e < E; e++) {
    const a = ea[e], b = eb[e];
    valence[a]++; valence[b]++;
    for (let c = 0; c < 3; c++) {
      nSum[a * 3 + c] += wp[b * 3 + c];
      nSum[b * 3 + c] += wp[a * 3 + c];
    }
    if (eFaces[e] !== 2) {
      bCount[a]++; bCount[b]++;
      for (let c = 0; c < 3; c++) {
        bSum[a * 3 + c] += wp[b * 3 + c];
        bSum[b * 3 + c] += wp[a * 3 + c];
      }
    }
  }

  const nwp = new Float64Array((W + E) * 3);
  for (let v = 0; v < W; v++) {
    const o = v * 3;
    if (bCount[v] > 0) {
      if (bCount[v] === 2) {
        for (let c = 0; c < 3; c++) nwp[o + c] = 0.75 * wp[o + c] + 0.125 * bSum[o + c];
      } else {
        for (let c = 0; c < 3; c++) nwp[o + c] = wp[o + c];
      }
    } else {
      const n = valence[v];
      if (n < 3) { for (let c = 0; c < 3; c++) nwp[o + c] = wp[o + c]; continue; }
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const self = 1 - n * beta;
      for (let c = 0; c < 3; c++) nwp[o + c] = self * wp[o + c] + beta * nSum[o + c];
    }
  }
  for (let e = 0; e < E; e++) {
    const o = (W + e) * 3;
    const a = ea[e] * 3, b = eb[e] * 3;
    if (eFaces[e] === 2) {
      for (let c = 0; c < 3; c++) nwp[o + c] = 0.375 * (wp[a + c] + wp[b + c]) + 0.125 * eOpp[e * 3 + c];
    } else {
      for (let c = 0; c < 3; c++) nwp[o + c] = 0.5 * (wp[a + c] + wp[b + c]);
    }
  }

  // Attribute vertices
  const NV = V + AE;
  const nwid = new Uint32Array(NV);
  const nuv = new Float32Array(NV * 2);
  const nsi = new Uint16Array(NV * 4);
  const nsw = new Float32Array(NV * 4);
  nwid.set(wid);
  nuv.set(uv);
  nsi.set(si);
  nsw.set(sw);
  const tj = [0, 0, 0, 0, 0, 0, 0, 0];
  const tw = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let ae = 0; ae < AE; ae++) {
    const o = V + ae;
    const a = aEdgeA[ae], b = aEdgeB[ae];
    nwid[o] = W + aEdgeW[ae];
    nuv[o * 2] = 0.5 * (uv[a * 2] + uv[b * 2]);
    nuv[o * 2 + 1] = 0.5 * (uv[a * 2 + 1] + uv[b * 2 + 1]);
    mergeSkin(si, sw, a, b, nsi, nsw, o, tj, tw);
  }

  // Triangles
  const nidx = new Uint32Array(T * 12);
  for (let t = 0; t < T; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const ab = V + triMid[t * 3], bc = V + triMid[t * 3 + 1], ca = V + triMid[t * 3 + 2];
    const o = t * 12;
    nidx[o] = a; nidx[o + 1] = ab; nidx[o + 2] = ca;
    nidx[o + 3] = ab; nidx[o + 4] = b; nidx[o + 5] = bc;
    nidx[o + 6] = ca; nidx[o + 7] = bc; nidx[o + 8] = c;
    nidx[o + 9] = ab; nidx[o + 10] = bc; nidx[o + 11] = ca;
  }

  return { wp: nwp, wid: nwid, uv: nuv, si: nsi, sw: nsw, idx: nidx };
}

/** Expand a level into GPU-ready arrays with smooth (welded) normals. */
export function buildGeometry(L: MeshLevel): BuiltGeometry {
  const { wp, wid, uv, si, sw, idx } = L;
  const W = wp.length / 3;
  const V = wid.length;
  const T = idx.length / 3;
  const wn = new Float64Array(W * 3);
  for (let t = 0; t < T; t++) {
    const a = wid[idx[t * 3]] * 3, b = wid[idx[t * 3 + 1]] * 3, c = wid[idx[t * 3 + 2]] * 3;
    const e1x = wp[b] - wp[a], e1y = wp[b + 1] - wp[a + 1], e1z = wp[b + 2] - wp[a + 2];
    const e2x = wp[c] - wp[a], e2y = wp[c + 1] - wp[a + 1], e2z = wp[c + 2] - wp[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    wn[a] += nx; wn[a + 1] += ny; wn[a + 2] += nz;
    wn[b] += nx; wn[b + 1] += ny; wn[b + 2] += nz;
    wn[c] += nx; wn[c + 1] += ny; wn[c + 2] += nz;
  }
  for (let v = 0; v < W; v++) {
    const o = v * 3;
    const l = Math.hypot(wn[o], wn[o + 1], wn[o + 2]) || 1;
    wn[o] /= l; wn[o + 1] /= l; wn[o + 2] /= l;
  }
  const position = new Float32Array(V * 3);
  const normal = new Float32Array(V * 3);
  for (let v = 0; v < V; v++) {
    const w = wid[v] * 3;
    position[v * 3] = wp[w]; position[v * 3 + 1] = wp[w + 1]; position[v * 3 + 2] = wp[w + 2];
    normal[v * 3] = wn[w]; normal[v * 3 + 1] = wn[w + 1]; normal[v * 3 + 2] = wn[w + 2];
  }
  return {
    position,
    normal,
    uv: uv.slice(),
    skinIndex: si.slice(),
    skinWeight: sw.slice(),
    index: idx.slice(),
    triangles: T,
    vertices: V,
  };
}

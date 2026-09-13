/**
 * terrain.js — 程序化地形（高度图 + 顶点色带 + biome 调色）
 *
 * 关键联动：terrainSeed = splitSeed(master, 1)，biome token 从 master 派生。
 * 这样同一颗 master seed 下地形"长得什么样"和"描述什么基调"是内在绑定的。
 */

import { makeNoise2D } from './noise.js';
import { terrainSeedFromMaster, biomeFromSeed } from '../seed.js';

/**
 * 创建高度图
 * @returns {object} { heightMap, colorMap, resolution, size, biome, masterSeed }
 */
export function createTerrain({ size = 200, resolution = 128,
                                scale = 0.02, octaves = 6, heightScale = 20,
                                masterSeed = 1337 } = {}) {
  const seed = terrainSeedFromMaster(masterSeed);
  const biome = biomeFromSeed(masterSeed);
  const { fbm } = makeNoise2D(seed);
  const HALF = size * 0.5;

  const heightMap = new Float32Array((resolution + 1) * (resolution + 1));
  const colorMap  = new Float32Array((resolution + 1) * (resolution + 1) * 3);

  for (let z = 0; z <= resolution; z++) {
    for (let x = 0; x <= resolution; x++) {
      const wx = (x / resolution) * size - HALF;
      const wz = (z / resolution) * size - HALF;
      const h = fbm(wx * scale, wz * scale, { octaves, persistence: 0.5, lacunarity: 2.0 })
                * heightScale * biome.heightMul;
      const i = z * (resolution + 1) + x;
      heightMap[i] = h;
      const c = biomeColor(h / heightScale, biome.id);
      colorMap[i * 3]     = c[0];
      colorMap[i * 3 + 1] = c[1];
      colorMap[i * 3 + 2] = c[2];
    }
  }

  return { heightMap, colorMap, resolution, size, biome, masterSeed };
}

/** biome 高度带调色（参考 RPG 项目 bandColor 思路） */
function biomeColor(t, biomeId) {
  // t ≈ -1 ~ 1
  const B = {
    forest:    [ [-1.0,[.55,.50,.35]], [-0.05,[.30,.45,.20]], [0.45,[.35,.33,.28]], [0.75,[.92,.92,.95]] ],
    tundra:    [ [-1.0,[.60,.68,.75]], [-0.05,[.55,.60,.65]], [0.45,[.75,.78,.80]], [0.75,[.95,.97,.98]] ],
    volcano:   [ [-1.0,[.20,.15,.10]], [ 0.0,[.40,.20,.10]], [ 0.5,[.70,.25,.05]], [ 0.8,[.95,.45,.10]] ],
    ruins:     [ [-1.0,[.40,.38,.32]], [ 0.0,[.55,.52,.45]], [ 0.45,[.65,.60,.50]], [ 0.8,[.75,.70,.60]] ],
    underdark: [ [-1.0,[.10,.10,.12]], [ 0.0,[.20,.20,.24]], [ 0.45,[.30,.28,.34]], [ 0.8,[.40,.35,.45]] ],
  }[biomeId] || B.forest;
  for (let i = B.length - 1; i >= 0; i--) {
    if (t >= B[i][0]) {
      const nxt = B[i + 1];
      if (!nxt) return B[i][1];
      const span = nxt[0] - B[i][0];
      const f = Math.min(1, Math.max(0, (t - B[i][0]) / (span || 1)));
      return [
        B[i][1][0] + (nxt[1][0] - B[i][1][0]) * f,
        B[i][1][1] + (nxt[1][1] - B[i][1][1]) * f,
        B[i][1][2] + (nxt[1][2] - B[i][1][2]) * f,
      ];
    }
  }
  return B[0][1];
}

/** 双线性插值查询 */
export function heightAt(terrain, wx, wz) {
  const { heightMap, resolution, size } = terrain;
  const gx = ((wx + size * 0.5) / size) * resolution;
  const gz = ((wz + size * 0.5) / size) * resolution;
  const ix = Math.max(0, Math.min(resolution - 1, Math.floor(gx)));
  const iz = Math.max(0, Math.min(resolution - 1, Math.floor(gz)));
  const fx = gx - ix, fz = gz - iz;
  const W = resolution + 1;
  const h00 = heightMap[iz * W + ix];
  const h10 = heightMap[iz * W + ix + 1];
  const h01 = heightMap[(iz + 1) * W + ix];
  const h11 = heightMap[(iz + 1) * W + ix + 1];
  return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
}

export default { createTerrain, heightAt };

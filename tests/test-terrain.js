/** test-terrain.js — 程序化地形测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain, heightAt } from '../src/gen/terrain.js';
import { BIOMES } from '../src/seed.js';

test('createTerrain 返回结构正确', () => {
  const t = createTerrain({ masterSeed: 7 });
  assert.ok(t.heightMap instanceof Float32Array);
  assert.ok(t.colorMap instanceof Float32Array);
  assert.equal(t.colorMap.length, t.heightMap.length * 3);
  assert.equal(t.resolution, 128);
  assert.equal(t.size, 200);
});

test('heightMap 值域合理（-heightScale ~ heightScale）', () => {
  const t = createTerrain({ heightScale: 20, masterSeed: 7 });
  let min = Infinity, max = -Infinity;
  for (const h of t.heightMap) { min = Math.min(min, h); max = Math.max(max, h); }
  assert.ok(min >= -25 && max <= 25, `height 越界: ${min} ~ ${max}`);
});

test('heightAt 双线性插值与网格点对齐', () => {
  const t = createTerrain({ size: 200, resolution: 32, heightScale: 10, masterSeed: 1 });
  // 在网格点处，插值应与 heightMap 一致
  const h0 = heightAt(t, -100, -100);  // 左下角
  assert.ok(Math.abs(h0 - t.heightMap[0]) < 1e-6, `grid point mismatch: ${h0} vs ${t.heightMap[0]}`);
});

test('heightAt 边界外不抛出', () => {
  const t = createTerrain({ size: 100, resolution: 32, heightScale: 10, masterSeed: 1 });
  const a = heightAt(t, -200, -200);
  const b = heightAt(t, 200, 200);
  assert.ok(typeof a === 'number' && isFinite(a));
  assert.ok(typeof b === 'number' && isFinite(b));
});

test('biomeFromSeed 驱动 biome 字段', () => {
  const ids = new Set();
  for (let s = 0; s < 20; s++) ids.add(createTerrain({ masterSeed: s }).biome.id);
  assert.equal(ids.size, 5, `biome 覆盖不足: ${[...ids].join(',')}`);
});

test('biome.heightMul 影响地形起伏（volcano 应有更大波动）', () => {
  const forest = createTerrain({ masterSeed: 0, heightScale: 20 });
  const volcano = createTerrain({ masterSeed: 2, heightScale: 20 });
  function std(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const var_ = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(var_);
  }
  // volcano 的 heightMul 1.4 > forest 的 1.0，标准差应更大
  assert.ok(std(volcano.heightMap) > std(forest.heightMap) * 0.9,
    `volcano std ${std(volcano.heightMap).toFixed(2)} should be > ${std(forest.heightMap).toFixed(2) * 0.9}`);
});

test('不同 seed 生成不同地形', () => {
  const a = createTerrain({ masterSeed: 1 });
  const b = createTerrain({ masterSeed: 2 });
  let diff = 0;
  for (let i = 0; i < a.heightMap.length; i++) {
    if (a.heightMap[i] !== b.heightMap[i]) diff++;
  }
  assert.ok(diff > a.heightMap.length * 0.9, `不同 seed 差异太少: ${diff}`);
});

test('同一 seed 生成相同地形（确定性）', () => {
  const a = createTerrain({ masterSeed: 5 });
  const b = createTerrain({ masterSeed: 5 });
  for (let i = 0; i < a.heightMap.length; i++) {
    assert.equal(a.heightMap[i], b.heightMap[i]);
  }
});

test('colorMap 值域 [0,1]', () => {
  const t = createTerrain({ masterSeed: 7 });
  for (let i = 0; i < t.colorMap.length; i++) {
    const v = t.colorMap[i];
    assert.ok(v >= 0 && v <= 1, `color out of range at ${i}: ${v}`);
  }
});

test('biome 调色差异：forest vs volcano 平均色不同', () => {
  const f = createTerrain({ masterSeed: 0 });
  const v = createTerrain({ masterSeed: 2 });
  function avgColor(t) {
    const arr = t.colorMap;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < arr.length; i += 3) { r += arr[i]; g += arr[i + 1]; b += arr[i + 2]; }
    const n = arr.length / 3;
    return [r / n, g / n, b / n];
  }
  const fc = avgColor(f), vc = avgColor(v);
  const diff = Math.abs(fc[0] - vc[0]) + Math.abs(fc[1] - vc[1]) + Math.abs(fc[2] - vc[2]);
  assert.ok(diff > 0.3, `biome 调色差异不足: ${diff.toFixed(3)} ${fc} vs ${vc}`);
});

/** test-seed.js — 种子系统与联动一致性测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, splitSeed, BIOMES, biomeFromSeed,
  descSeedFromMaster, terrainSeedFromMaster, scatterSeedFromMaster } from '../src/seed.js';

test('mulberry32 确定性：同一初始值产生相同序列', () => {
  const a = mulberry32(1234);
  const b = mulberry32(1234);
  for (let i = 0; i < 1000; i++) {
    assert.equal(a(), b());
  }
});

test('mulberry32 不同种子产生不同序列', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let diff = 0;
  for (let i = 0; i < 1000; i++) {
    if (a() !== b()) diff++;
  }
  assert.ok(diff > 900, `不同种子序列差异太少: ${diff}`);
});

test('mulberry32 值域 [0,1)', () => {
  const r = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `值越界: ${v}`);
  }
});

test('splitSeed 不同 index 产生不同种子', () => {
  const seeds = new Set();
  for (let i = 0; i < 20; i++) seeds.add(splitSeed(999, i));
  assert.equal(seeds.size, 20, 'splitSeed 应产生 20 个不同种子');
});

test('splitSeed 同一 (seed,index) 返回相同值', () => {
  assert.equal(splitSeed(42, 3), splitSeed(42, 3));
});

test('BIOMES 数量与 id 集合', () => {
  const ids = BIOMES.map(b => b.id);
  assert.deepEqual(ids, ['forest', 'tundra', 'volcano', 'ruins', 'underdark']);
});

test('biomeFromSeed 确定性', () => {
  const b1 = biomeFromSeed(17);
  const b2 = biomeFromSeed(17);
  assert.equal(b1.id, b2.id);
});

test('biomeFromSeed 均匀覆盖（至少 5 个 seed 里 5 个 biome 都出现）', () => {
  const ids = new Set();
  for (let s = 0; s < 20; s++) ids.add(biomeFromSeed(s).id);
  assert.equal(ids.size, 5, `biome 覆盖不足: ${[...ids].join(',')}`);
});

test('三派生种子互不相同（地形/描述/散布）', () => {
  const t = terrainSeedFromMaster(7);
  const d = descSeedFromMaster(7);
  const s = scatterSeedFromMaster(7);
  assert.notEqual(t, d);
  assert.notEqual(d, s);
  assert.notEqual(t, s);
});

test('同一主种子的三派生结果一致（重复调用）', () => {
  assert.equal(terrainSeedFromMaster(3), terrainSeedFromMaster(3));
  assert.equal(descSeedFromMaster(3), descSeedFromMaster(3));
  assert.equal(scatterSeedFromMaster(3), scatterSeedFromMaster(3));
});

test('不同主种子派生不同', () => {
  assert.notEqual(terrainSeedFromMaster(3), terrainSeedFromMaster(4));
  assert.notEqual(descSeedFromMaster(3), descSeedFromMaster(4));
});

/**
 * test-hardness.js — 硬核整合测试（用户特别要求的 hardness 测试）
 *
 * 验证文档 7.5 联动的核心命题：
 *   同一颗 masterSeed 同时驱动：
 *   (1) 地形几何（heightMap）
 *   (2) 地形调色（colorMap）
 *   (3) biome 分类
 *   (4) 描述文本的基调
 *
 * 测试类型：
 *   - 确定性重放：同一 seed 反复生成结果一致（CI 可重放）
 *   - 跨子系统一致性：地形"长得像 X biome"且描述"说 X biome 的话"
 *   - 多样性下限：30 个不同 seed 的地形/描述都不应重复
 *   - 鲁棒性：边界值（seed=0, seed=MAX_SAFE, 负数）不崩溃
 *   - 性能：5000 次 describeWorldSync 应在 500ms 内完成（Web Worker 兜底预期）
 *
 * 用法：node --test tests/test-hardness.js  或  node tests/test-hardness.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/gen/terrain.js';
import { describeWorldSync } from '../src/gen/describe-world.js';
import { mulberry32, splitSeed, BIOMES, biomeFromSeed } from '../src/seed.js';

// ============ 1. 确定性重放 ============

test('hardness [determinism] 同一 seed 反复地形生成结果一致', () => {
  const a = createTerrain({ masterSeed: 42 });
  const b = createTerrain({ masterSeed: 42 });
  for (let i = 0; i < a.heightMap.length; i++) {
    assert.equal(a.heightMap[i], b.heightMap[i]);
  }
  for (let i = 0; i < a.colorMap.length; i++) {
    assert.equal(a.colorMap[i], b.colorMap[i]);
  }
});

test('hardness [determinism] 同一 seed 反复描述生成结果一致', () => {
  const a = describeWorldSync({ masterSeed: 777 });
  const b = describeWorldSync({ masterSeed: 777 });
  assert.equal(a.full, b.full);
});

test('hardness [determinism] 100 次地形重放全部一致', () => {
  const base = createTerrain({ masterSeed: 3 });
  for (let k = 0; k < 100; k++) {
    const t = createTerrain({ masterSeed: 3 });
    for (let i = 0; i < t.heightMap.length; i++) {
      assert.equal(t.heightMap[i], base.heightMap[i]);
    }
  }
});

// ============ 2. 跨子系统一致性 ============

test('hardness [coherence] biome 与描述词根语义对齐', () => {
  // 验证：biome = volcano 时，描述应出现 "灼热/猩红/熔岩/火山" 之一
  // biome = tundra 时，描述应出现 "霜/雪/冰冷/苍白" 之一
  const BIO_WORDS = {
    forest: ['林', '青翠', '静谧', '生长', '古老', '幽深'],
    tundra: ['霜', '雪', '冰冷', '苍白', '辽阔'],
    volcano: ['熔岩', '火山', '猩红', '灼热', '滚烫', '焦黑'],
    ruins: ['遗迹', '石碑', '破碎', '蒙尘', '风化'],
    underdark: ['幽暗', '石廊', '幽光', '回声', '冰冷', '潮湿', '神秘'],
  };
  for (let s = 0; s < 25; s++) {
    const terrain = createTerrain({ masterSeed: s });
    const desc = describeWorldSync({ masterSeed: s });
    assert.equal(terrain.biome.id, desc.biome.id,
      `seed ${s} biome 不一致`);
    const words = BIO_WORDS[desc.biome.id];
    const hit = words.some(w => desc.full.includes(w));
    assert.ok(hit, `seed ${s} ${desc.biome.id}: 描述未含词根: "${desc.full}"`);
  }
});

test('hardness [coherence] 火山地形波动 > 雪原地形波动', () => {
  // 找一颗 volcano seed 和一颗 tundra seed
  let volcanoSeed = -1, tundraSeed = -1;
  for (let s = 0; s < 50 && (volcanoSeed < 0 || tundraSeed < 0); s++) {
    const b = biomeFromSeed(s);
    if (b.id === 'volcano' && volcanoSeed < 0) volcanoSeed = s;
    if (b.id === 'tundra' && tundraSeed < 0) tundraSeed = s;
  }
  assert.ok(volcanoSeed >= 0, `未找到 volcano seed (tried 0..50), got ${volcanoSeed}`);
  assert.ok(tundraSeed >= 0, `未找到 tundra seed (tried 0..50), got ${tundraSeed}`);

  const vt = createTerrain({ masterSeed: volcanoSeed, heightScale: 20 });
  const tt = createTerrain({ masterSeed: tundraSeed, heightScale: 20 });
  const arr = Array.from(vt.heightMap);
  const arr2 = Array.from(tt.heightMap);
  const std = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  };
  assert.ok(std(arr) > std(arr2),
    `volcano std(${std(arr).toFixed(2)}) 应 > tundra std(${std(arr2).toFixed(2)})`);
});

test('hardness [coherence] 同一 seed 内：地形色与 biome 语义相符', () => {
  // volcano 平均色应偏红：r 分量 > g 且 > b
  let vSeed = -1;
  for (let s = 0; s < 50; s++) if (biomeFromSeed(s).id === 'volcano') { vSeed = s; break; }
  const t = createTerrain({ masterSeed: vSeed });
  const arr = t.colorMap;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < arr.length; i += 3) { r += arr[i]; g += arr[i + 1]; b += arr[i + 2]; }
  const n = arr.length / 3;
  assert.ok(r / n > g / n && r / n > b / n,
    `volcano 应偏红: r=${(r/n).toFixed(2)} g=${(g/n).toFixed(2)} b=${(b/n).toFixed(2)}`);
});

// ============ 3. 多样性下限 ============

test('hardness [diversity] 50 个 seed 的 50 种描述互不相同', () => {
  const out = new Set();
  for (let s = 0; s < 50; s++) out.add(describeWorldSync({ masterSeed: s }).full);
  assert.equal(out.size, 50, `50 个 seed 只产出 ${out.size} 种不同描述`);
});

test('hardness [diversity] 50 个 seed 的地形至少 50 种不同', () => {
  const sigs = new Set();
  for (let s = 0; s < 50; s++) {
    const t = createTerrain({ masterSeed: s, resolution: 32 });
    const sig = t.heightMap.slice(0, 20).reduce((a, v) => a + v.toFixed(2) + ',', '');
    sigs.add(sig);
  }
  assert.equal(sigs.size, 50, `50 个 seed 地形签名不足: ${sigs.size}`);
});

test('hardness [diversity] 50 个 seed 覆盖全部 5 个 biome', () => {
  const ids = new Set();
  for (let s = 0; s < 50; s++) ids.add(biomeFromSeed(s).id);
  assert.equal(ids.size, 5);
});

// ============ 4. 鲁棒性 / 边界值 ============

test('hardness [robustness] seed=0 不崩溃', () => {
  const t = createTerrain({ masterSeed: 0 });
  const d = describeWorldSync({ masterSeed: 0 });
  assert.ok(t.heightMap.length > 0);
  assert.ok(d.full.length > 0);
});

test('hardness [robustness] seed=Number.MAX_SAFE_INTEGER 不崩溃', () => {
  const t = createTerrain({ masterSeed: Number.MAX_SAFE_INTEGER });
  const d = describeWorldSync({ masterSeed: Number.MAX_SAFE_INTEGER });
  assert.ok(t.heightMap.length > 0);
  assert.ok(d.full.length > 0);
});

test('hardness [robustness] 负数 seed 不崩溃', () => {
  const t = createTerrain({ masterSeed: -1337 });
  const d = describeWorldSync({ masterSeed: -1337 });
  assert.ok(t.heightMap.length > 0);
  assert.ok(d.full.length > 0);
});

test('hardness [robustness] 极小 resolution 不崩溃', () => {
  const t = createTerrain({ masterSeed: 7, resolution: 1 });
  assert.ok(t.heightMap.length > 0);
});

test('hardness [robustness] 极大 heightScale 数值稳定', () => {
  const t = createTerrain({ masterSeed: 7, heightScale: 200 });
  for (const v of t.heightMap) {
    assert.ok(isFinite(v), `非有限值: ${v}`);
  }
});

// ============ 5. 性能 ============

test('hardness [performance] 5000 次 describeWorldSync < 500ms', () => {
  const start = performance.now();
  for (let s = 0; s < 5000; s++) describeWorldSync({ masterSeed: s });
  const dt = performance.now() - start;
  assert.ok(dt < 500, `耗时 ${dt.toFixed(1)}ms，超 500ms`);
});

test('hardness [performance] 100 次地形生成 < 3000ms', () => {
  const start = performance.now();
  for (let s = 0; s < 100; s++) createTerrain({ masterSeed: s, resolution: 64 });
  const dt = performance.now() - start;
  assert.ok(dt < 3000, `耗时 ${dt.toFixed(1)}ms，超 3000ms`);
});

// ============ 6. 联动命题的核心断言 ============

test('hardness [integration] 主 seed 唯一决定所有子系统输出', () => {
  // 同一 masterSeed 三次运行，所有子系统输出应完全相同
  const seeds = [7, 42, 1337, 9999];
  for (const s of seeds) {
    const [t1, t2] = [createTerrain({ masterSeed: s, resolution: 32 }),
                      createTerrain({ masterSeed: s, resolution: 32 })];
    const [d1, d2] = [describeWorldSync({ masterSeed: s }),
                      describeWorldSync({ masterSeed: s })];
    for (let i = 0; i < t1.heightMap.length; i++) {
      assert.equal(t1.heightMap[i], t2.heightMap[i]);
    }
    assert.equal(d1.full, d2.full);
    assert.equal(t1.biome.id, d1.biome.id);
  }
});

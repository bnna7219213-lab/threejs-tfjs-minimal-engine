/** test-describe-world.js — 描述生成层联动一致性测试（差异化核心） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorldSync } from '../src/gen/describe-world.js';
import { biomeFromSeed } from '../src/seed.js';

test('describeWorldSync 返回结构完整', () => {
  const out = describeWorldSync({ masterSeed: 7 });
  assert.ok(out.masterSeed === 7);
  assert.ok(out.biome && out.biome.id);
  assert.ok(typeof out.full === 'string' && out.full.length > 0);
  assert.ok(Array.isArray(out.conditioningTokens));
});

test('describeWorldSync 确定性：同一 seed 两次结果相同', () => {
  const a = describeWorldSync({ masterSeed: 13 });
  const b = describeWorldSync({ masterSeed: 13 });
  assert.equal(a.full, b.full);
  assert.deepEqual(a.conditioningTokens, b.conditioningTokens);
});

test('联动一致性：biome 与 describeWorldSync 中 biome 一致', () => {
  for (let s = 0; s < 20; s++) {
    const bio = biomeFromSeed(s).id;
    const desc = describeWorldSync({ masterSeed: s });
    assert.equal(desc.biome.id, bio,
      `seed ${s}: biomeFromSeed=${bio}, desc.biome=${desc.biome.id}`);
  }
});

test('联动一致性：conditioningTokens 等于 biome.tokens 拆分', () => {
  for (let s = 0; s < 20; s++) {
    const bio = biomeFromSeed(s);
    const desc = describeWorldSync({ masterSeed: s });
    const expected = bio.tokens.split('·');
    assert.deepEqual(desc.conditioningTokens, expected,
      `seed ${s} tokens: ${desc.conditioningTokens} vs ${expected}`);
  }
});

test('不同 seed 输出不同描述', () => {
  const out = new Set();
  for (let s = 0; s < 30; s++) {
    out.add(describeWorldSync({ masterSeed: s }).full);
  }
  assert.ok(out.size >= 25, `30 个 seed 只产出 ${out.size} 种不同描述`);
});

test('输出描述不含深度标记或原始占位符', () => {
  for (let s = 0; s < 20; s++) {
    const out = describeWorldSync({ masterSeed: s }).full;
    assert.ok(!out.includes('[DEPTH:'), `含深度标记: "${out}"`);
    assert.ok(!out.includes('<'), `含未展开占位: "${out}"`);
  }
});

test('描述包含 biome 相关词根', () => {
  const BIO_WORDS = {
    forest: ['林', '苔', '藤蔓', '青翠', '静谧', '古老', '幽深'],
    tundra: ['霜', '雪', '冰原', '苍白', '冰冷', '辽阔', '坚硬'],
    volcano: ['熔岩', '火山', '猩红', '灼热', '滚烫', '焦黑'],
    ruins: ['遗迹', '石碑', '破碎', '蒙尘', '残破', '风化'],
    underdark: ['幽暗', '石廊', '幽光', '回声', '冰冷', '潮湿', '神秘', '回音'],
  };
  for (let s = 0; s < 25; s++) {
    const desc = describeWorldSync({ masterSeed: s });
    const words = BIO_WORDS[desc.biome.id] || [];
    const hit = words.some(w => desc.full.includes(w));
    assert.ok(hit, `seed ${s} biome=${desc.biome.id} 描述未命中词根: "${desc.full}"`);
  }
});

test('5 个 biome 各至少被 1 个 seed 覆盖（在 20 个 seed 内）', () => {
  const ids = new Set();
  for (let s = 0; s < 20; s++) ids.add(describeWorldSync({ masterSeed: s }).biome.id);
  assert.equal(ids.size, 5, `biome 覆盖不足: ${[...ids].join(',')}`);
});

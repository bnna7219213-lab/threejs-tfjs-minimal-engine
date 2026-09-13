/** test-grammar.js — 文法生成层测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { expand, defaultFill, generateDesc, DEFAULT_RULES, DEFAULT_GLOSSARY } from '../src/gen/grammar.js';
import { mulberry32 } from '../src/seed.js';

test('expand 无占位符直接返回模板', () => {
  const rules = { start: 'hello world' };
  const rand = mulberry32(1);
  assert.equal(expand(rules, 'start', defaultFill, 'forest', rand), 'hello world');
});

test('expand 多模板分支按 rand 选择', () => {
  const rules = { a: 'A|B|C' };
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    seen.add(expand(rules, 'a', defaultFill, 'forest', mulberry32(s)));
  }
  assert.ok(seen.has('A') && seen.has('B') && seen.has('C'),
    `200 次尝试未覆盖所有分支: ${[...seen].join(',')}`);
});

test('expand 嵌套占位展开（多代）', () => {
  const rules = {
    s: '<x>',
    x: '<y>',
    y: 'OK',
  };
  assert.equal(expand(rules, 's', defaultFill, 'forest', mulberry32(1)), 'OK');
});

test('defaultFill 按 biome 抽词（不抛出，返回字符串）', () => {
  const rand = mulberry32(7);
  for (const b of ['forest', 'tundra', 'volcano', 'ruins', 'underdark']) {
    const v = defaultFill('adjectives', b, rand);
    assert.ok(typeof v === 'string' && v.length > 0,
      `${b}.adjectives 抽词失败`);
  }
});

test('defaultFill 未知 biome 回退到 forest', () => {
  const v = defaultFill('adjectives', 'unknown', mulberry32(1));
  assert.ok(typeof v === 'string' && v.length > 0);
});

test('generateDesc 输出包含中文标点（句号）', () => {
  const out = generateDesc({ biomeId: 'forest', rand: mulberry32(1) });
  assert.ok(/。/.test(out), `输出应含句号: "${out}"`);
});

test('generateDesc 输出包含 biome 词根中的字', () => {
  const out = generateDesc({ biomeId: 'volcano', rand: mulberry32(1) });
  const volcanoWords = ['灼热', '猩红', '滚烫', '焦黑', '脉动', '熔岩', '火山', '灰烬', '硫气', '流火'];
  const hit = volcanoWords.some(w => out.includes(w));
  assert.ok(hit, `未命中 volcano 词根: "${out}"`);
});

test('generateDesc 确定性：同一 rand 输出相同', () => {
  const a = generateDesc({ biomeId: 'tundra', rand: mulberry32(99) });
  const b = generateDesc({ biomeId: 'tundra', rand: mulberry32(99) });
  assert.equal(a, b);
});

test('generateDesc 最大深度防护', () => {
  const rules = {
    a: '<b>',
    b: '<a>',   // 循环引用
  };
  const out = expand(rules, 'a', defaultFill, 'forest', mulberry32(1), 0, 4);
  assert.ok(out.includes('[DEPTH:'), `应出现深度标记: "${out}"`);
});

test('generateDesc 不同 biome 输出不同（多 seed 采样）', () => {
  const outForest = new Set();
  const outVolcano = new Set();
  for (let s = 0; s < 30; s++) {
    outForest.add(generateDesc({ biomeId: 'forest', rand: mulberry32(s * 2) }));
    outVolcano.add(generateDesc({ biomeId: 'volcano', rand: mulberry32(s * 2) }));
  }
  // 两个 biome 的词根几乎不重叠，输出多样性应明显
  assert.ok(outForest.size >= 5, `forest 多样性不足: ${outForest.size}`);
  assert.ok(outVolcano.size >= 5, `volcano 多样性不足: ${outVolcano.size}`);
});

test('defaultFill 抽词不重复过多（500 次抽 500 次，去重应 >1）', () => {
  const words = new Set();
  const rand = mulberry32(3);
  for (let i = 0; i < 500; i++) words.add(defaultFill('nouns', 'forest', rand));
  assert.ok(words.size >= 3, `森林名词多样性不足: ${words.size}`);
});

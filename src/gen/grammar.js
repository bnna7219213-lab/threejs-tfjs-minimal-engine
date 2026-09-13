/**
 * grammar.js — Tracery-style 上下文无关文法模板生成
 *
 * 文档第 7.4 节"混合架构"的核心：
 * 语法结构交给文法（保证语法永远合法），具体形容词/风味短语由生成器（LSTM / fallback）填充。
 *
 * 用法：expand(rules, start, fillFn, maxDepth)
 *   rules: { adjective: "cold|warm|dark|bright", ... }
 *   start: 起始符号名
 *   fillFn(token): 若 token 匹配规则名，由文法展开；否则视为叶节点直接输出
 *   maxDepth: 防止循环引用导致无限递归
 */

// 默认词根表：按 biome 分类的形容词 / 名词 / 动作词
// 文档 7.5 联动的关键：biome 决定此处的词根选择，
// 与地形生成用同一颗 masterSeed 派生出的 biome token 挂钩。
export const DEFAULT_GLOSSARY = {
  forest:    { adjectives: ['古老', '青翠', '幽深', '静谧', '潮湿'], nouns: ['林', '苔', '藤蔓', '溪流', '鹿影'], verbs: ['生长', '摇曳', '低语', '漫过'] },
  tundra:    { adjectives: ['苍白', '冰冷', '坚硬', '沉默', '辽阔'], nouns: ['霜', '雪', '冰原', '冻土', '孤鹰'], verbs: ['凝结', '覆盖', '吹过', '冻结'] },
  volcano:   { adjectives: ['灼热', '猩红', '滚烫', '焦黑', '脉动'], nouns: ['熔岩', '火山', '灰烬', '硫气', '流火'], verbs: ['喷涌', '燃烧', '涌动', '灼烧'] },
  ruins:     { adjectives: ['破碎', '古老', '蒙尘', '沉默', '残破'], nouns: ['遗迹', '石碑', '废墟', '尘缘', '裂痕'], verbs: ['倾覆', '埋没', '风化', '遗留'] },
  underdark: { adjectives: ['幽暗', '潮湿', '冰冷', '回音', '神秘'], nouns: ['石廊', '暗流', '幽光', '菌菇', '回声'], verbs: ['渗透', '弥漫', '回荡', '潜伏'] },
};

export const DEFAULT_RULES = Object.freeze({
  // 句子结构
  'desc': '<adjective><terrain>，<atmosphere>。',
  'atmosphere': '<adjective><noun> <verb>',

  // 模板化占位：语法合法，但 <adj> 具体词由填充器决定
  'phrase': '<adjective> 的 <noun>',
});

/**
 * 展开规则
 * @param {object} rules      规则表（字符串模板或数组）
 * @param {string} start      起始符号
 * @param {function} fill     当遇到 <wordClass> 时由 fill(wordClass, biomeId, seed) 提供具体词
 * @param {string} biomeId    当前 biome
 * @param {function} rand     PRNG () => [0,1)
 * @param {number} [depth]
 * @param {number} [maxDepth]
 */
export function expand(rules, start, fill, biomeId, rand, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return `[DEPTH:${start}]`;

  let rule = rules[start];
  if (typeof rule === 'string') rule = rule.split('|');
  if (!Array.isArray(rule)) return start;

  const template = rule[Math.floor(rand() * rule.length)];
  let out = '';
  const re = /<(\/?)([^>]+)>/g;
  let m, last = 0;
  while ((m = re.exec(template)) !== null) {
    out += template.slice(last, m.index);
    if (m[1] === '/') {
      // end-of-block 语法简化：此实现不追踪嵌套块，直接忽略（可后续加栈）
    } else {
      const sub = rules[m[2]];
      if (Array.isArray(sub) || typeof sub === 'string') {
        out += expand(rules, m[2], fill, biomeId, rand, depth + 1, maxDepth);
      } else {
        // 未知符号 -> 交给 fill 当作"叶节点词"
        const filled = fill(m[2], biomeId, rand);
        out += filled;
      }
    }
    last = m.index + m[0].length;
  }
  out += template.slice(last);
  return out;
}

/**
 * 默认填充器：从 DEFAULT_GLOSSARY 按 biome 抽词。
 */
export function defaultFill(wordClass, biomeId, rand) {
  const g = DEFAULT_GLOSSARY[biomeId] || DEFAULT_GLOSSARY.forest;
  const pool = g[wordClass] || g.adjectives;
  return pool[Math.floor(rand() * pool.length)];
}

/**
 * 一次完整描述生成：
 * - 规则 + 词根 按 biome 展开
 * - 若提供 fillFn（由 LSTM 预测），则用它替换 defaultFill
 */
export function generateDesc({ rules = DEFAULT_RULES,
                                glossary = DEFAULT_GLOSSARY,
                                biomeId = 'forest',
                                rand,
                                fillFn = null,
                                maxDepth = 6 } = {}) {
  const fill = fillFn ?
    (w, b, r) => { const v = fillFn(w, b, r); return v ?? defaultFill(w, b, r); } :
    defaultFill;

  return expand(rules, 'desc', fill, biomeId, rand, 0, maxDepth);
}

export default { DEFAULT_GLOSSARY, DEFAULT_RULES, expand, defaultFill, generateDesc };

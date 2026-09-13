/**
 * describe-world.js — 描述生成层入口（差异化核心）
 *
 * 关键设计：
 * - 一颗 masterSeed 派生 biome、地形 seed、描述 seed、散布 seed
 * - biome token 既是地形调色的条件，也是文法词根的选择条件
 * - 生成链路：grammar(确定性) → LSTM(可选) 叠加
 * - 文档 7.5："同一颗种子既决定地形长什么样，也决定描述的基调"
 */

import { mulberry32, splitSeed, biomeFromSeed, descSeedFromMaster } from '../seed.js';
import { generateDesc, DEFAULT_RULES, DEFAULT_GLOSSARY } from './grammar.js';
import { generate as lstmGenerate, setVocab } from './lstm.js';

/**
 * 主入口：给定 masterSeed 和可选的 LSTM 模型状态，产出"这片区域的样子 + 描述"
 *
 * @param {object} opts
 * @param {number} opts.masterSeed
 * @param {boolean} opts.useLstm   启用 LSTM 后处理（需要模型已加载）
 * @param {object} [opts.rules]     自定义文法规则
 * @param {object} [opts.glossary]  自定义词根
 * @param {number} [opts.length=32] LSTM 生成长度
 * @param {number} [opts.temperature=0.7]
 * @returns {Promise<object>} {
 *   masterSeed,
 *   biome: { id, name, tokens },
 *   grammar: string,            // 文法展开结果（确定性、语法合法）
 *   lstm: string,                // LSTM 生成的风味短语（可选）
 *   full: string,                // 合并后的完整描述
 *   conditioningTokens: string[] // 传给 LSTM 的 prefix
 * }
 */
export async function describeWorld({ masterSeed, useLstm = false,
                                      rules = DEFAULT_RULES,
                                      glossary = DEFAULT_GLOSSARY,
                                      length = 32,
                                      temperature = 0.7 } = {}) {
  const rand = mulberry32(descSeedFromMaster(masterSeed));
  const biome = biomeFromSeed(masterSeed);
  const tokens = biome.tokens.split('·');

  // 文法层（确定性，保证语法正确）
  const grammar = generateDesc({ rules, glossary, biomeId: biome.id, rand });

  let lstm = '';
  if (useLstm) {
    // conditioning token：把 biome tokens 拼成 prefix 传给 LSTM
    const prefix = tokens.join('');
    setVocab('的了着在了不亦且而与有为幽暗潮湿静谧古老青翠灼热猩红冰冷苍白破碎回音森林绿叶霜雪白寒熔焰红岩石纹古尘幽暝石暗生长摇曳低语漫过凝结覆盖吹过冻结喷涌燃烧涌动灼烧倾覆埋没风化遗留渗透弥漫回荡潜伏');
    lstm = await lstmGenerate({ seedText: prefix, length, temperature, rand });
  }

  const full = grammar + (lstm ? ' · ' + lstm : '');
  return {
    masterSeed,
    biome: { id: biome.id, name: biome.name, tokens: biome.tokens },
    grammar,
    lstm,
    full,
    conditioningTokens: tokens,
  };
}

/**
 * 纯同步版本（不依赖 tfjs，用于 Node 测试/CI）
 */
export function describeWorldSync({ masterSeed, rules = DEFAULT_RULES,
                                    glossary = DEFAULT_GLOSSARY } = {}) {
  const rand = mulberry32(descSeedFromMaster(masterSeed));
  const biome = biomeFromSeed(masterSeed);
  return {
    masterSeed,
    biome: { id: biome.id, name: biome.name, tokens: biome.tokens },
    full: generateDesc({ rules, glossary, biomeId: biome.id, rand }),
    conditioningTokens: biome.tokens.split('·'),
  };
}

export default { describeWorld, describeWorldSync };

/**
 * seed.js — 32 位整数种子工具
 *
 * 联动锚点：一颗种子同时驱动 地形生成（fbm 置换表）、
 * biome token（区域/类别）、描述生成的 conditioning token。
 *
 * 确定性保证：mulberry32 是纯数学的确定性 PRNG，同一 seed 每次返回
 * 完全相同的随机序列，便于 CI 重放。
 */

/**
 * 经典 mulberry32：无状态、纯 JS、无依赖，同一初始值返回相同序列。
 */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从 32 位 seed 派生独立的 n 个种子，用于"一颗种子派生出互不干扰的多路随机流"。
 * 用 splitmix32 变换，避免相邻 seed 落在相近轨道上。
 */
export function splitSeed(seed, index) {
  let x = (seed >>> 0) + 0x9E3779B1 + (index >>> 0);
  x = (x ^ (x >>> 16)) * 0x45D9F3B;
  x = (x ^ (x >>> 16)) * 0x45D9F3B;
  return (x ^ (x >>> 16)) >>> 0;
}

/** 预定义的 biome 类别（决定地形调色 + 描述文法的词表） */
export const BIOMES = Object.freeze([
  { id: 'forest',   name: '森林',   tokens: '森·林·绿·叶',        heightMul: 1.0, density: 1.0 },
  { id: 'tundra',   name: '雪原',   tokens: '霜·雪·白·寒',        heightMul: 0.7, density: 0.6 },
  { id: 'volcano',  name: '熔焰',   tokens: '熔·焰·红·岩',        heightMul: 1.4, density: 0.4 },
  { id: 'ruins',    name: '遗迹',   tokens: '石·纹·古·尘',        heightMul: 0.9, density: 0.5 },
  { id: 'underdark',name: '幽暝',   tokens: '幽·暝·石·暗',        heightMul: 0.8, density: 0.7 },
]);

/**
 * 从种子派生 biome token —— 用 seed % BIOMES.length 保证确定性、均匀分布。
 * 描述生成层会把这个 token 作为 conditioning prefix 的前缀。
 */
export function biomeFromSeed(seed) {
  const idx = ((seed % BIOMES.length) + BIOMES.length) % BIOMES.length;
  return BIOMES[idx];
}

/**
 * 派生"描述生成"的种子 —— 与地形种子使用不同 split 通道，
 * 保证两者各自独立但均由同一个主 seed 唯一决定。
 */
export function descSeedFromMaster(masterSeed) {
  return splitSeed(masterSeed, 3);
}

/**
 * 派生"地形生成"的种子
 */
export function terrainSeedFromMaster(masterSeed) {
  return splitSeed(masterSeed, 1);
}

/**
 * 派生"散布（植被/物件）"的种子
 */
export function scatterSeedFromMaster(masterSeed) {
  return splitSeed(masterSeed, 2);
}

export default { mulberry32, splitSeed, BIOMES, biomeFromSeed,
  descSeedFromMaster, terrainSeedFromMaster, scatterSeedFromMaster };

/**
 * lstm.js — 字符级 LSTM 描述生成器（TF.js 层接口 + 兜底）
 *
 * 文档 7.3/7.4：
 * - 运行时集成在 Web Worker 里，不占主线程渲染/物理预算
 * - 字符级 LSTM：1~2 层、128~256 隐藏单元
 * - 浏览器端可选 WASM 后端（避免与 WebGPURenderer 抢 GPU）
 * - 条件生成：把 biome token 作为 conditioning prefix 传给采样起点
 *
 * Node 环境或 tfjs 未加载时，自动使用确定性字符 n-gram fallback，
 * 保证测试和离线环境都能跑。
 */

let _tf = null;
let _model = null;
let _chars = '';
let _charToIdx = new Map();
let _idxToChar = new Map();

/** 设置 TF.js 实例（Node 用 @tensorflow/tfjs-node，浏览器用 @tensorflow/tfjs） */
export function setTF(tf) { _tf = tf; }

/** 从 JSON 路径加载模型（浏览器：tf.loadLayersModel(url)） */
export async function loadModel(path) {
  if (!_tf) return null;
  try {
    _model = await _tf.loadLayersModel(path);
    return _model;
  } catch (e) {
    console.warn('[lstm] model load failed:', e.message);
    return null;
  }
}

/** 训练好的字符集 */
export function setVocab(chars) {
  _chars = chars;
  _charToIdx = new Map();
  _idxToChar = new Map();
  for (let i = 0; i < chars.length; i++) {
    _charToIdx.set(chars[i], i);
    _idxToChar.set(i, chars[i]);
  }
}

/**
 * 用 LSTM 生成文本
 * @param {string} seedText  conditioning 前缀（如 biome tokens）
 * @param {number} length    生成长度
 * @param {number} temperature 采样温度（0=贪心，>0 越高越随机）
 * @param {function} rand  PRNG (seed) => [0,1)
 * @returns {string}
 */
export async function generate({ seedText = '', length = 20, temperature = 0.9, rand } = {}) {
  if (_tf && _model) {
    return await _lstmGenerate(seedText, length, temperature, rand);
  }
  // 兜底：确定性的字符 n-gram + rand
  return _fallbackGenerate(seedText, length, rand);
}

async function _lstmGenerate(seedText, length, temperature, rand) {
  if (!_chars.length) return seedText;
  let seq = seedText.split('').filter(c => _charToIdx.has(c));
  const SEQ_LEN = 40;
  while (seq.length < SEQ_LEN) seq.push(_chars[0]);
  seq = seq.slice(-SEQ_LEN);

  let out = '';
  for (let i = 0; i < length; i++) {
    const arr = new Array(SEQ_LEN * _chars.length).fill(0);
    for (let j = 0; j < SEQ_LEN; j++) {
      const idx = _charToIdx.get(seq[j]);
      if (idx === undefined) continue;
      arr[j * _chars.length + idx] = 1;
    }
    const input = _tf.tensor2d(arr, [SEQ_LEN, _chars.length]);
    const pred = _model.predict(input);
    const probs = (await pred.data()).slice();
    input.dispose(); pred.dispose();

    const next = softmaxSample(probs, temperature, rand);
    const ch = _idxToChar.get(next);
    if (!ch) break;
    out += ch;
    seq.shift(); seq.push(ch);
    if (seq.length < SEQ_LEN) seq.unshift(_chars[0]);
  }
  return out;
}

/** 确定性兜底：根据 seedText 里的字符 + rand 从词根里挑字 */
function _fallbackGenerate(seedText, length, rand) {
  const pool = '的着了在是与不亦且而有为之一二三五六七八九十幽暗潮湿静谧古老青翠灼热猩红冰冷苍白破碎回音';
  let out = '';
  // 把 seedText 中出现过的字符作为"温度"权重高的来源
  for (let i = 0; i < length; i++) {
    const r = rand();
    // 每 3 个字符里有一次偏 seedText，其余随机 pool
    const src = (r < 0.33 && seedText.length) ?
      seedText : pool;
    out += src[Math.floor(rand() * src.length)];
  }
  return out;
}

function softmaxSample(logits, temperature, rand) {
  const n = logits.length;
  const scaled = new Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = logits[i] / Math.max(temperature, 1e-8);
    scaled[i] = v;
    if (v > max) max = v;
  }
  let sum = 0;
  const exps = new Array(n);
  for (let i = 0; i < n; i++) { exps[i] = Math.exp(scaled[i] - max); sum += exps[i]; }
  const r = rand();
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += exps[i] / sum;
    if (r <= acc) return i;
  }
  return n - 1;
}

export default { setTF, loadModel, setVocab, generate };

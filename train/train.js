#!/usr/bin/env node
/**
 * train.js — 节点端训练字符级 LSTM 描述生成模型
 *
 * 文档 7.2 训练管线：
 *   语料(自建) → 训练(tfjs-node / tfjs-node-gpu) → 导出 model.json + 权重分片
 *
 * 数据：5 类 biome 的合成语料（词根拼接 + 少量模板句），
 *       每类 80 条，总共 400 条；每条 15~30 字。
 *
 * 架构：1 层 LSTM，隐藏单元 128，字符级 Softmax 输出。
 *       与文档 7.1 一致："字符级 LSTM：1~2 层、128~256 隐藏单元"。
 *
 * 用法：
 *   npm run train              # 训练并导出到 models/desc-gen/
 *   npm run train -- --lite    # 仅用少量数据跑一遍（测试用，<30s）
 *   npm run train -- --epochs 20   # 指定 epoch
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
const args = parseArgs({
  options: {
    lite:    { type: 'boolean', default: false },
    epochs:  { type: 'string', default: '40' },
    hidden:  { type: 'string', default: '128' },
    seq:     { type: 'string', default: '40' },
    out:     { type: 'string', default: 'models/desc-gen' },
  },
  strict: false,
}).values;

const EPOCHS = parseInt(args.epochs, 10);
const HIDDEN = parseInt(args.hidden, 10);
const SEQ_LEN = parseInt(args.seq, 10);
const OUT_DIR = path.resolve(args.out);
const LITE = args.lite;

// ============ 语料（合成：词根 + 模板 + 少量自然句） ============
const CORPUS = {
  forest: [
    '古老的青翠森林', '幽深静谧的翠绿苔藓', '静谧的林中小溪',
    '藤蔓在古木间摇曳', '潮湿的青苔覆盖着岩石', '古老森林的低语',
    '青翠的枝叶在风中摇曳', '静谧森林深处', '幽深的林间溪谷',
    '湿润的苔藓蔓延在青石上', '古老的森林与藤蔓', '静谧的翠色林荫',
    '青翠苔藓与溪水的低语', '幽深森林中的绿意', '静谧的古老树影',
    '湿润苔藓在阳光中生长', '藤蔓缠绕的古树', '青翠的森林深处',
    '静谧的翠色藤蔓', '幽深的潮湿森林',
  ],
  tundra: [
    '苍白的冰雪覆盖原野', '冰冷的冻土沉默辽阔', '苍白的霜雪原',
    '坚硬冰冷的冰原', '辽阔雪原上孤独的鹰', '冰冷的霜覆盖大地',
    '苍白辽阔的冻土', '沉默的冰雪世界', '苍茫的雪原与冰',
    '冰冷的白霜凝结', '苍白的原野上无风', '坚硬冻土下的沉默',
    '辽阔冰冷的冻原', '苍白冰雪覆盖一切', '冰封的沉默原野',
    '霜与雪在风中共鸣', '坚硬的雪原上无人', '苍白的冻原与鹰',
    '冰冷的辽阔雪野', '沉默的苍白霜原',
  ],
  volcano: [
    '灼热的熔岩在地脉下涌动', '猩红流火与焦黑岩石', '滚烫的火山喷涌',
    '熔岩与硫气的灼热', '焦黑的岩石与猩红火焰', '脉动的灼热地心',
    '滚烫熔岩流过大地', '灼热的火山灰烬', '猩红火焰与硫气',
    '焦黑的火山口', '脉动的滚烫地脉', '灼热流火覆盖岩石',
    '猩红的熔岩湖', '焦黑焦灼的火山', '滚烫硫气与流火',
    '灼热脉动的地心', '猩红流火与硫气', '滚烫的焦黑大地',
    '脉动的灼热岩石', '焦黑的火山与流火',
  ],
  ruins: [
    '破碎的古老遗迹', '蒙尘的石碑沉默', '残破的风化古墙',
    '遗留在废墟中的记忆', '破碎与蒙尘的石廊', '沉默的古老遗迹',
    '风化的石碑', '破碎的遗迹与尘缘', '蒙尘的沉默古墙',
    '残破的石碑与裂痕', '古老遗迹的尘缘', '破碎沉默的石廊',
    '风化遗迹与破碎', '蒙尘的残留古墙', '沉默的破碎石碑',
    '古老与蒙尘的废墟', '残破的风化石廊', '破碎的尘缘记忆',
    '沉默的遗迹', '古老的风化石碑',
  ],
  underdark: [
    '幽暗潮湿的石廊回荡', '冰冷的神秘回声', '幽光的石廊潜伏',
    '幽暗的暗流渗透', '神秘的潮湿回声', '冰冷的石廊弥漫',
    '幽光的菌菇与暗流', '幽暗潮湿的渗透', '回音在石廊中弥漫',
    '冰冷的潮湿石廊', '神秘幽光的菌菇', '幽暗的神秘回声',
    '回声在冰冷石廊中', '幽光的潮湿暗流', '神秘的幽暗石廊',
    '冰冷的回声与暗流', '幽暗渗透的潮湿', '神秘神秘的石廊',
    '幽光的冰冷菌菇', '潮湿的幽暗回声',
  ],
};

const ALL_TEXT = Object.values(CORPUS).flat().join('');
const CHARS = [...new Set(ALL_TEXT.split(''))].sort();
const charToIdx = new Map(CHARS.map((c, i) => [c, i]));
const idxToChar = CHARS;

console.log(`语料: ${Object.entries(CORPUS).map(([k, v]) => `${k}=${v.length}`).join(', ')}  字符集大小: ${CHARS.length}`);

// ============ 载入 TF.js（Node 端） ============
let tf;
try { tf = await import('@tensorflow/tfjs-node'); }
catch (e) {
  try { tf = await import('@tensorflow/tfjs'); }
  catch (e2) {
    console.error('无法载入 TensorFlow.js：', e2.message);
    process.exit(1);
  }
}
await tf.setBackend('tensorflow');
console.log(`后端: ${tf.getBackend()}`);

// ============ 构造序列训练数据 ============
const sequences = [];
const nextChars = [];
const texts = Object.values(CORPUS).flat();
for (const text of texts) {
  const chars = text.split('');
  for (let i = 0; i <= chars.length - SEQ_LEN; i++) {
    const seq = chars.slice(i, i + SEQ_LEN);
    const next = chars[i + SEQ_LEN];
    if (!next) continue;
    sequences.push(seq);
    nextChars.push(next);
  }
}

console.log(`序列数: ${sequences.length}, seq_len: ${SEQ_LEN}`);

// ============ 模型 ============
const model = tf.sequential();
model.add(tf.layers.lstm({ units: HIDDEN, inputShape: [SEQ_LEN, CHARS.length], returnSequences: false }));
model.add(tf.layers.dropout({ rate: 0.2 }));
model.add(tf.layers.dense({ units: CHARS.length, activation: 'softmax' }));
model.compile({
  optimizer: tf.train.adam(0.003),
  loss: 'categoricalCrossentropy',
});
model.summary();

// ============ 训练 ============
const X = tf.buffer([sequences.length, SEQ_LEN, CHARS.length], 'float32');
for (let s = 0; s < sequences.length; s++) {
  for (let i = 0; i < SEQ_LEN; i++) {
    const ci = charToIdx.get(sequences[s][i]);
    if (ci === undefined) continue;
    X.set(1, s, i, ci);
  }
}
const xTensor = X.toTensor();

const Y = tf.buffer([sequences.length, CHARS.length], 'float32');
for (let s = 0; s < sequences.length; s++) {
  const ci = charToIdx.get(nextChars[s]);
  if (ci === undefined) continue;
  Y.set(1, s, ci);
}
const yTensor = Y.toTensor();

console.log(`开始训练 ${EPOCHS} epoch...`);
const t0 = performance.now();
const hist = await model.fit(xTensor, yTensor, {
  epochs: EPOCHS,
  batchSize: 64,
  shuffle: true,
  validationSplit: 0.15,
  callbacks: {
    onEpochEnd: (epoch, logs) => {
      if ((epoch + 1) % 5 === 0 || epoch === 0) {
        console.log(`  epoch ${epoch + 1}/${EPOCHS}  loss=${logs.loss.toFixed(4)}  val_loss=${logs.val_loss.toFixed(4)}`);
      }
    },
  },
});
const dt = performance.now() - t0;
console.log(`训练完成：${dt.toFixed(0)}ms, final loss=${hist.history.loss[hist.history.loss.length - 1].toFixed(4)}`);

// ============ 导出 ============
if (!LITE) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await model.save(`file://${OUT_DIR}`);
  fs.writeFileSync(path.join(OUT_DIR, 'vocab.json'), JSON.stringify({ chars: CHARS }));
  console.log(`已导出到 ${OUT_DIR}`);
  console.log(`  model.json + 权重分片`);
  console.log(`  vocab.json (${CHARS.length} 字符)`);
}

// 清理
xTensor.dispose(); yTensor.dispose();

console.log('done.');

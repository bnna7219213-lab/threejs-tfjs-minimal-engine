# threejs-tfjs-minimal-engine

Three.js + TensorFlow.js 最小游戏引擎 —— 对标 Unity 6/7 原型层能力。

**核心差异化**（文档 §7.5）：一颗 `masterSeed` 同时驱动
地形几何、biome 分类、描述生成 —— 让"这片区域长什么样"和"这片区域的文字基调"内在绑定，
而不是复刻 Unity 功能的缩水版。

## 架构（对应文档 §2 分层）

```
┌─ index.html (演示入口: 一颗 seed → 地形 + biome + 描述) ─┐
├─ src/seed.js              种子派生 (mulberry32 + splitSeed)
├─ src/gen/noise.js         Perlin 梯度噪声 + fBm
├─ src/gen/terrain.js       程序化地形 (heightMap + 顶点色 + biome 调色)
├─ src/gen/grammar.js       Tracery-style 文法 (保证语法合法)
├─ src/gen/lstm.js          字符级 LSTM (tfjs 层接口 + 兜底)
├─ src/gen/describe-world.js 描述生成层入口 (差异化核心)
├─ src/world.js             ECS-lite World + System 骨架
├─ src/physics.js           AABB 碰撞 + 半隐式欧拉积分
├─ train/train.js           Node 端训练 (tfjs-node / wasm)
├─ tests/                   76 项 Node 测试 (含 hardness harness)
└─ server.js                npm start 静态服务
```

## 快速开始

```bash
# 无需依赖即可跑全部测试（tfjs 仅在训练脚本中导入）
node --test tests/*.js

# 硬核整合测试
npm run test:hard

# 训练描述生成模型（需要 tfjs-node，首次约 1-2min）
npm install
npm run train -- --lite          # 快速试跑
npm run train                    # 完整训练 40 epoch，导出到 models/desc-gen/

# 启动演示
npm start      # 或 直接打开 index.html
```

## 联动机制（§7.5 落地）

```
masterSeed (用户输入 / 随机)
  │
  ├─ splitSeed(seed, 1) → terrainSeed → fBm 噪声 → 高度图 + biome 高度带调色
  ├─ splitSeed(seed, 2) → scatterSeed → 植被散布
  ├─ splitSeed(seed, 3) → descSeed    → 文法展开 + LSTM conditioning
  └─ biomeFromSeed(seed) → {id, name, tokens, heightMul}
       ├─ 决定地形起伏幅度 (heightMul: forest=1.0, volcano=1.4, tundra=0.7)
       ├─ 决定地形调色 (bandColor 分 biome)
       ├─ 决定文法词根 (GLOSSARY[biomeId].adjectives / nouns)
       └─ 决定 LSTM conditioning prefix (tokens 拼接)
```

同一颗 seed 下，地形"长得像 volcano" ↔ 描述"提到灼热/熔岩/流火" ↔ 地形色偏红。

## 测试结构（76 项）

| 文件 | 覆盖 |
|---|---|
| `tests/test-seed.js` | PRNG 确定性、splitSeed 独立性、biome 覆盖 |
| `tests/test-physics.js` | AABB 相交/MTV、半隐式欧拉积分 |
| `tests/test-world.js` | ECS 增删查改、System 优先级 |
| `tests/test-grammar.js` | 展开/嵌套/分支、默认填充、深度防护 |
| `tests/test-terrain.js` | 高度域/插值/biome 调色/确定性 |
| `tests/test-describe-world.js` | 联动一致性、词根语义、多样性 |
| `tests/test-hardness.js` | **硬核 harness**：确定性重放、跨子系统语义对齐、多样性下限、边界鲁棒性、性能预算 |

## 与 Unity 原型层能力对照（文档 §8 精简版）

| 子系统 | 本方案 | Unity 6/7 |
|---|---|---|
| 渲染 | Three.js WebGPURenderer + TSL | URP / 7 新增 Surface Cache GI |
| 物理 | 自研 ODE 骨架（简单碰撞） | PhysX（关节/布料/载具开箱） |
| 实体 | ECS-lite + Object3D | GameObject+Component |
| 生成式内容 | **TF.js 本地小模型，运行时内容生成（差异化优势）** | MCP 面向开发期 AI 协作，非运行时 |
| 平台分发 | 浏览器，零安装 | 需构建导出各平台 |

## 明确不追（文档 §10）

可视化场景编辑器、主机认证导出、生产级实时 GI、多人网络同步、Asset Store 生态。

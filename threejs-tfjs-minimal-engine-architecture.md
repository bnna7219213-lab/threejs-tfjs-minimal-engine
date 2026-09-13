# Three.js + TensorFlow.js 最小游戏引擎架构研究
### 对标 Unity 原型层能力

> 摘要:本文档面向"用 Three.js + TensorFlow.js 搭建可对标 Unity 原型层能力的最小游戏引擎"这一命题,给出分层架构、关键子系统的技术选型理由,以及与 Unity 6/7 在原型阶段的能力对照。目标读者是准备动手实现的开发者本人,因此偏重决策依据而非教程式讲解。

---

## 0. 前提说明:Unity 7 的真实状态

Unity 7 于 2026 年 7 月 21 日在 Unite Seoul 大会上公布,私有/公开 beta 定于 2026 年 12 月开始,正式版计划 2027 年第一季度(3 月底前)发布——现在(2026 年 8 月)还拿不到它本身做实操对比。

它被官方定位为 Unity 6 架构的直接延伸,不要求重建工程或更换编程语言,尽量把兼容性问题降到最低。真正新增的内容集中在几点:默认脚本后端切换到 CoreCLR(替换用了二十年的 Mono),带来近乎瞬时的 Play Mode 启动、只重载改动部分的增量式 Domain Reload、shader 编译最多提速 90%;渲染管线加入实时全局光照 Surface Cache GI;以及一套面向 AI coding agent 的免费 MCP 协议,让外部智能体可以直接接入引擎参与开发。

值得注意的是,Unity 官方这次把 Unity 7 的定位从"渲染+脚本引擎"改成了"开发者、美术、制作人和 AI coding agent 协同工作的生产平台"。这个战略押注和这次研究的方向是一致的——把生成式 AI(这里是 TensorFlow.js 的描述生成层)从项目一开始就设计成引擎的一等公民,而不是后期外挂的功能。

由于 Unity 7 的原型层工作流基本沿用 Unity 6(GameObject/Component 模型、Editor 流程不变),下文的"Unity 原型层能力"统一按 Unity 6/7 共享的基线来对标,不单独区分版本号。

## 1. 范围界定:"最小"和"原型层"分别意味着什么

"最小引擎"不是"功能阉割版 Unity",而是明确排除掉对早期原型验证没有直接价值的部分。

**明确排除**
- 可视化场景编辑器 / 拖拽式 Inspector(继续靠代码 + 浏览器 DevTools)
- 主机认证与原生导出打包流程
- 完整的多人网络同步 / 回滚 netcode
- 资源商店生态
- 生产级全局光照(Surface Cache GI 这类)

**必须覆盖(即"原型层"的下限)**
- 稳定的渲染循环(60fps 目标,自动降级)
- 基础 3D 物理(碰撞、简单刚体响应)
- 输入统一抽象(键鼠 + 手柄 + 触屏)
- 资源加载管线(至少 glTF + 纹理 + 音频)
- 一套可维护的实体组织方式,而不是把状态硬编码进 `Object3D.userData`
- 一个可以独立扩展的生成式内容层(这次研究的重点)

这个范围划分决定了后面每个子系统的取舍原则:凡是能用一行代码解决就不重新发明。

## 2. 总体分层架构

```
┌───────────────────────────────────────────┐
│  应用层 / 游戏逻辑 (systems, rule engine)    │
├───────────────────────────────────────────┤
│  内容生成层  TensorFlow.js 描述生成          │  ← 本次研究重点
├────────────────┬──────────────┬───────────┤
│  ECS-lite      │  物理         │  输入/音频  │
├────────────────┴──────────────┴───────────┤
│  资源管线 (glTF / 纹理 / 音频加载与缓存)       │
├───────────────────────────────────────────┤
│  渲染层  Three.js WebGPURenderer + TSL      │
├───────────────────────────────────────────┤
│  核心循环 (rAF,定步长物理,变步长渲染)         │
└───────────────────────────────────────────┘
```

这个分层刻意让"内容生成层"和 ECS/物理平级,而不是塞进渲染层或资源管线——它产出的是数据(文本/参数),既可能驱动 UI 显示,也可能驱动程序化几何生成的种子,不应该被绑死在某一个具体子系统里。

## 3. 渲染层:Three.js WebGPURenderer + TSL

2026 年的新项目应该直接从 `WebGPURenderer` 起步,而不是先写 WebGL 再"以后 migrate"。自 r171 起 WebGPURenderer 已经是生产可用状态,配合 Three.js Shading Language(TSL)可以一套 shader 代码同时编译到 WGSL 和 GLSL,WebGPU 不可用时自动回退 WebGL2,目前全球浏览器覆盖率大约 95%。对"最小引擎"来说这几乎是免费的确定性收益:

```js
import { WebGPURenderer } from 'three/webgpu';
const renderer = new WebGPURenderer({ antialias: true }); // 不支持时自动回退 WebGL2
```

几个直接影响架构决策的点:

- **后处理**:新的 `RenderPipeline` 围绕 WebGPURenderer 原生设计,取代了只认 WebGL 的 `EffectComposer`,效果本身也用 TSL 编写、可以运行时热替换(切 bloom 开关只需重新赋值 `outputNode`)。
- **计算着色器**:WebGPU 的 compute shader 把粒子系统规模上限从 WebGL 时代常见的 5 万级别推到了 100 万级以上——直接对应你之前 RPG 项目里的粒子系统,如果要做群体行为/大规模特效,值得迁移到 compute-driven 的实现。
- **GI 差距**:Unity 7 主推的 Surface Cache GI 这类生产级实时全局光照,Three.js 目前没有对等的开箱方案,只能靠烘焙光照贴图/light probe 近似。这是"最小引擎"明确不追的差距,不建议在这上面投入时间。

## 4. 实体组织:ECS-lite 桥接层

Three.js 的 Object3D 场景图不是 Unity 的 GameObject+Component 模型,直接把游戏状态塞进 `object3D.userData` 会很快失控。但"最小"的原则下也不需要 DOTS 那种 archetype 内存布局优化——一个轻量的 Map-based ECS 外壳配合 Object3D 做视觉表现层就够用:

```js
class World {
  #comps = new Map();      // type -> Map<entityId, data>
  #nextId = 1;
  createEntity() { return this.#nextId++; }
  add(id, type, data) {
    if (!this.#comps.has(type)) this.#comps.set(type, new Map());
    this.#comps.get(type).set(id, data);
  }
  query(...types) {
    const [first, ...rest] = types.map(t => this.#comps.get(t) ?? new Map());
    return [...first.keys()].filter(id => rest.every(m => m.has(id)));
  }
}
```

`Object3D` 本身可以作为一个组件类型(比如 `Transform`)存进去,entity id 反向挂在 `object3D.userData.eid` 上,便于从射线检测结果找回 entity。RPG 项目里已有的"rule engine",在这一层可以直接泛化成 ECS 的 system 注册机制,不需要另起一套。

## 5. 物理层:复用还是替换

RPG 项目里已经有一套经过散度定理数值验证的自研 ODE 求解器——这次不建议推倒重来。对"原型层"够用的碰撞检测+简单刚体响应,自研方案的优势是完全可控,和 ECS/资源管线的耦合可以按项目需要定制。

需要"升级"的信号很明确,出现了再换:

- 需要稳定的关节约束(布娃娃、载具)→ 评估 Rapier(WASM,确定性好,社区活跃)
- 单帧碰撞体数量上到几千+ → 评估用 compute shader 做 broad-phase(WebGPU 这块和渲染层的技术栈是通的)

## 6. 输入 / 音频 / UI(简述)

这三块对"原型层"来说复杂度不高,按标准做法即可:统一输入事件总线(把键鼠/手柄/触屏抽象成语义事件,而不是原始按键码)、Web Audio API 配合 `PannerNode` 做基础空间音效、UI 优先用 HTML/CSS 覆盖层而不是在 canvas 里手搓——省下的时间应该花在下面这一层。

## 7. TensorFlow.js 描述生成层

这是这次研究里唯一真正"新"的子系统,拆成模型选择、训练部署、运行时性能、条件生成、联动点、验证策略六部分。

### 7.1 模型选择

浏览器端文本生成的标准做法——TensorFlow 官方 `tfjs-examples` 仓库里的 `lstm-text-generation` 至今仍是这个方向的 canonical 参考——是字符级 LSTM:1~2 层、128~256 隐藏单元,在 Node.js 里训练(比浏览器内训练快),字符级词表小,天然适合生成奇幻物品名/自造词。如果需要更连贯的多句输出,可以换成一个 2~4 层的微型 Transformer decoder,但要接受推理开销和训练数据量同步上升。

### 7.2 训练 → 部署管线

```
语料(自建,按 类别/稀有度/biome 打标签)
   → 训练 (Python/Keras 或 tfjs-node)
   → 导出 model.json + 权重分片
   → 浏览器 tf.loadLayersModel() 一次性加载,常驻内存
```

### 7.3 运行时集成与性能

推理必须放进 Web Worker,绝不能占主线程的渲染/物理预算。后端选择上有个容易忽视的坑:TensorFlow.js 的 WebGPU 后端虽然存在,但发布节奏明显慢于 WebGL 后端(npm 上版本更新间隔以年计),而且如果和 Three.js 的 WebGPURenderer 同时抢 GPU 资源/设备上下文,会增加不必要的复杂度。对字符级 LSTM 这种量级的小模型,更稳妥的选择是 WebGL 后端,或者干脆用 WASM 后端(`tfjs-backend-wasm`)完全绕开 GPU 竞争——几百 KB 到几 MB 的模型在 WASM 上推理延迟通常是个位数毫秒,单次生成请求完全不需要纠结性能。

```js
// worker.js (module worker: new Worker(url, { type: 'module' }))
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';

let model;
(async () => {
  await tf.setBackend('wasm');
  model = await tf.loadLayersModel('/models/desc-gen/model.json');
})();

onmessage = async (e) => {
  const text = await generateText(model, e.data.seed, e.data.temperature);
  postMessage(text);
};
```

### 7.4 条件生成与混合架构

纯字符级 LSTM 没有"控制"能力,给一个类别前缀 token(比如 `<武器><稀有>`)作为采样起点是最便宜的条件化方式。更进一步、也更符合"最小"原则的做法,是把语法结构交给一层轻量的上下文无关文法模板(Tracery 风格,保证语法永远合法),只让 LSTM 负责填充具体的形容词/风味短语——这样能大幅降低模型规模和语料需求,同时保留"生成式"的变化感。

还有一个值得摆上台面的设计分叉:本地小模型 vs 云端大模型 API(比如通过 Claude API 做描述生成)。后者输出质量和连贯性会明显更好,但引入网络依赖,牺牲了你过去几个项目一直坚持的"单文件、零依赖、离线可跑"的特性。这个特性重要就选本地 TF.js 小模型;可以接受联网,架构会简单很多,但严格说不在这次"最小引擎"的定义范围内。

### 7.5 一个值得利用的联动点

世界生成系统已经有 biome/种子驱动的地形生成(fractal terrain + Poisson disk scattering)。把同一个种子/biome token 同时喂给地形生成器和描述生成模型,可以做到"同一颗种子既决定了这片区域长什么样,也决定了这片区域的文字描述基调"——这是让"最小引擎"和 Unity 原型产生真正差异化的地方,而不只是复刻 Unity 功能的缩小版。

### 7.6 验证策略

延续世界生成项目里用 Node.js harness 做数值验证的思路,这一层可以加:held-out 语料上的困惑度(perplexity)回归阈值、重复率/n-gram 多样性检测(抓退化成"的的的的"这种输出)、固定随机种子下的确定性重放用于 CI、以及一层黑名单过滤兜底。

## 8. 与 Unity 原型层能力对照

| 子系统 | 本方案 | Unity 6/7 原型层 | 差距评估 |
|---|---|---|---|
| 渲染 | Three.js WebGPURenderer+TSL,compute 驱动百万级粒子 | URP,Unity 7 新增 Surface Cache GI 实时全局光照 | GI 质量有明显差距;粒子规模级别相当 |
| 物理 | 自研 ODE 求解器(已验证)/ 按需上 Rapier | 内置 PhysX,关节/布料/载具等开箱即用 | 复杂约束场景有差距,简单碰撞对原型足够 |
| 实体组织 | 轻量 ECS 外壳 + Object3D | GameObject+Component(或 DOTS ECS) | Unity 方案经工业验证;自建版本更贴合项目但需自己维护 |
| 编辑器/工具链 | 无可视化编辑器,代码优先 | 完整 Editor、Scene 视图、Prefab 系统 | 明显差距,Unity 最大护城河,本方案不追求 |
| 迭代速度 | 浏览器 HMR/单文件即时刷新,无需编译 | CoreCLR 增量 Domain Reload + 近瞬时 Play Mode | 目标一致,实现路径不同 |
| 生成式内容 | TensorFlow.js 本地小模型,离线训练/浏览器推理 | 官方 MCP 面向开发期 AI agent 协作,非运行时游戏内容生成 | 本方案在"运行时生成内容"这个具体维度上是差异化优势 |
| 平台分发 | 任意现代浏览器,零安装,~95% WebGPU 覆盖+WebGL2 兜底 | 需构建导出各平台,含主机认证 | Web 分发对原型验证有优势;正式发行 Unity 占优 |
| 资源生态 | 基本靠自建/开源(glTF、CC0 素材) | Asset Store 海量现成资源 | 明显差距 |

## 9. 工程组织与分阶段路线图

沿用过去项目"开发用 ES module 拆分 + 可选打包成单文件 HTML 分发,配 Node.js harness 做数值/行为验证"的模式,规模变大后建议按阶段推进,每个阶段结束都应该是一个可运行、可测试的状态,而不是等全部写完才第一次集成:

1. **Stage 0 核心循环**:rAF 循环、WebGPURenderer 初始化(带能力探测和 WebGL2 兜底)、输入事件总线
2. **Stage 1 ECS + 物理**:World/System 骨架接入现有 ODE 求解器,基础碰撞
3. **Stage 2 资源与呈现**:glTF 加载与缓存、Web Audio 封装、HTML/CSS UI 层
4. **Stage 3 生成层**:训练 pipeline 搭建 → 导出 → Worker 内运行时集成 → 与程序化地形生成的种子联动(见 7.5)
5. **Stage 4 打磨**:compute-driven 粒子/群体行为、RenderPipeline 后处理、性能画像;如果未来要多人或回放功能,确定性层要在这一阶段前就设计好,后补代价很高

## 10. 明确不追的差距

诚实列一下这套方案不会、也不该去够的地方,避免后期返工:可视化场景编辑与美术友好的 Inspector 工具;主机认证与原生导出;生产级实时全局光照;成熟的多人网络同步/回滚 netcode;大规模资源商店生态。这些不是"最小引擎"的失败,而是范围定义本身就排除了它们——项目一旦需要其中任何一项,那已经不是"最小"阶段的问题了。

---

## 参考资料

- [Unity says Unity 7 game engine coming in Q1 2027 – GamesBeat](https://gamesbeat.com/unity-says-ai-enabled-unity-7-game-engine-coming-in-q1-2027/)
- [Unity 7 game engine announced with neural network integration and agent coding – GameGPU](https://en.gamegpu.com/news/igry/anonsirovan-igrovoj-dvizhok-unity-7-s-integratsiej-nejrosetej-i-koding-agentov)
- [Unity 7: A Game Developer's Revolution on the Horizon – exoa.dev](https://exoa.dev/blog/unity-7-next-gen-platform-revolution)
- [Migrate Three.js to WebGPU (2026) — The Complete Checklist – Utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- [What's New in Three.js (2026) – Utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [tfjs-examples: lstm-text-generation – TensorFlow 官方仓库](https://github.com/tensorflow/tfjs-examples/tree/master/lstm-text-generation)

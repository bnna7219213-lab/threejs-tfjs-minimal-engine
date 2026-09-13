# threejs-tfjs-minimal-engine v0.3 规划

## 一句话

LSTM 把自然语言翻译成 SDF 操作序列，Marching Cubes 把 SDF 场提取为 Mesh，Three.js 渲染。**神经符号（Neuro-Symbolic）完整链路**——神经网络负责理解语义和规划，符号系统负责精确执行几何。

---

## 核心矛盾

```
纯黑盒 3D 生成（3D-GAN / NeRF）：
  ❌ 不可解释 —— 无法知道为什么生成这个形状
  ❌ 不可编辑 —— 改不了一个参数
  ❌ 几何有伪影 —— 非水密 mesh，法线错乱
  ❌ 需要大量 3D 标注数据

程序化 SDF + 神经解码：
  ✅ 每一步操作可读（操作序列就是中间表示）
  ✅ 用户可修改参数 / 增删操作
  ✅ SDF 数学保证水密 mesh，法线即梯度 ∇f
  ✅ 合成数据自监督，无需人工标注
```

---

## 当前状态

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | LOD 组件树 + 噪声位移 | ✅ |
| Phase 2 | Catmull-Clark 细分 + InstancedMesh | ✅ |
| Phase 2.5 | OBJ/MTL/JSON 导出 + NLP 命令 | ✅ |
| **Phase 3** | **SDF + Marching Cubes + TF.js** | **🔜 当前** |

> ⚠️ 之前的 Phase 3（export/NLP/LOD 面板）是临时命名，与这里的 Phase 3 无关。

---

## 完整 Pipeline

```
文本: "a round table with 4 thin legs"
  ↓  [LSTM Encoder]
context vector (768-dim)
  ↓  [LSTM Decoder / 自回归]
操作序列 Token 流
  ↓  ┌──────────────────────────────────┐
  │   cylinder(radius=0.5, h=0.1)       │ ← 操作 token
  │   translate(y=0.8)                  │
  │   cylinder(radius=0.05, h=0.8)      │
  │   for_loop(4, rotateZ(90°))         │
  └──────────────────────────────────┘
  ↓  [SDF Program Executor / CSG]
三维 SDF 网格 (N×N×N 距离场)
  ↓  [Marching Cubes]
三角 Mesh (vertices + faces + normals)
  ↓  [Three.js / Raymarching Shader]
实时渲染 + 交互
```

---

## 三层架构

### Layer 1: LSTM 序列解码器

**输入：** 文本 → Embedding
**输出：** SDF 操作序列（token + 参数）

```
class SDFProgramDecoder:
  LSTM(hidden_dim=256, layers=2)
  op_head  : Linear(256 → vocab_size)  # 预测下一个操作
  arg_head : Linear(256 → 4)           # 预测参数 (x, y, z, r)

  forward(context, target_seq=null):
    h, c = init_state(context)
    for t in max_ops:
      if target_seq:
        input_t = target_seq[t]          # Teacher forcing
      else:
        input_t = argmax(op_head(h))     # 自回归
      out, (h,c) = LSTM(input_t, (h,c))
      yield (op_head(out), arg_head(out))
```

**为什么用 LSTM：** 轻量（浏览器可跑），序列操作生成不需要 Transformer 的全局注意力。生产环境可升级 T5/LLaMA。

### Layer 2: SDF 程序化执行器

每个操作对应一个**可微 SDF 基元**，用 CSG 布尔运算组合：

```
sphere(c, r):     |p - c| - r
box(c, s):        max(|p-c|, 0) + min(max(|p-c|), 0)
cylinder(axis, r, h): max(|p_xy - axis| - r, |p_z| - h/2)

CSG:
  union(A,B):      min(A, B)
  subtract(A,B):   max(A, -B)
  intersect(A,B):  max(A, B)
  smooth_union(A,B,k): smoothMin(A, B, k)   ← 平滑过渡
```

**执行：**

```
SDF_program_executor:
  grid = N×N×N 坐标场 (范围 [-1,1]³)
  sdf = +∞
  for each op in op_sequence:
    d = primitive_sdf(grid, op.kwargs)
    if op.mode == 'union':      sdf = min(sdf, d)
    elif op.mode == 'subtract': sdf = max(sdf, -d)
    elif op.mode == 'intersect':sdf = max(sdf, d)
  return sdf
```

**核心价值：** 操作序列是可编辑的中间表示——用户可以修改参数、增删操作、重排序。这是黑盒生成无法做到的。

### Layer 3: Marching Cubes 网格提取

```
for each cube in grid:
  if 8 顶点 SDF 符号不全相同:
    查 128 面三角化表（256 配置简化）
    线性插值求表面精确交点
    法线 = ∇f (SDF 梯度)
return vertices, faces, normals
```

**性能：** 50³ 网格 → ~7,500 面，CPU 实时。100³ → ~60,000 面，需 Web Worker。

---

## 训练策略

### 方案 A：模仿学习（启动快，推荐）

```
数据: (文本描述, SDF 操作序列) 配对 —— 程序化合成，无需标注

损失:
  loss_op  = CrossEntropy(pred_op, gt_op)
  loss_arg = MSE(pred_args, gt_args)
  total    = loss_op + loss_arg
```

### 方案 B：端到端可微（最终目标）

```
LSTM → SDF → [Soft MC / DMTet] → Chamfer Distance

损失: chamfer_distance(pred_mesh.vertices, gt_mesh.vertices)
梯度一路反传到 LSTM 参数
```

> ⚠️ Marching Cubes 本身不可微，用 Soft Rasterizer 或 DMTet 替代实现端到端。

---

## 渲染方式

**方式 A：Mesh 导出（通用）**
```
SDF → Marching Cubes → .GLTF / .OBJ → Three.js 加载
```

**方式 B：Raymarching Shader（实时，无需提取 Mesh）**
```glsl
float map(vec3 p) {
  float top = sdSphere(p - vec3(0,0.8,0), 0.5);
  float leg = sdCylinder(p - vec3(0.3,0.4,0.3), 0.05, 0.8);
  return min(top, leg);  // union
}
for(int i=0; i<100; i++) { p = ro + rd*t; d = map(p); t += d; }
```
无限精度缩放，SDF 参数变化即实时渲染。

---

## 实施计划

| 阶段 | 内容 | 工期 | 产出 |
|------|------|------|------|
| 3a | SDF 原语库 + CSG 运算 | 1 周 | `src/sdf/primitives.js` |
| 3b | Marching Cubes 实现 | 2 周 | `src/sdf/marching-cubes.js` |
| 3c | SDF 可视化 Demo | 1 周 | `sdf-demo.html` |
| 3d | LSTM SDF 解码器 + TF.js | 3 周 | `src/tf/sdf-decoder.js` |
| 3e | 端到端整合 | 2 周 | `index.html` 集成 |

**总计：9 周**

---

## 为什么这是 NLP→3D 的基础？

```
Phase 1-2 (当前):
  NLP → 选组件 → 拼装 → Catmull-Clark
  受限于组件库数量（100 组件 = 100 种形状）

Phase 3 (SDF):
  NLP → 预测 SDF 操作序列 → 数学组合 → MC
  理论上可生成任意形状（受 SDF 原语组合能力限制）

NLP 预测连续参数（SDF 权重/位置）比预测离散选择（选哪个组件）
更容易训练、更连续、可微分优化。
```

---

## 路线图

```
Phase 1  ✅  LOD + 组件树 + 噪声位移
Phase 2  ✅  Catmull-Clark + InstancedMesh
Phase 2.5✅  Export + NLP 命令
Phase 3  🔜  SDF + Marching Cubes + TF.js  ← 当前
Phase 4  🔜  概念图引擎
Phase 5  🔜  参数化模型生成器
Phase 6  🔜  NLP → 参数表解析器
Phase 7  🔜  TF.js 视觉编码器
Phase 8  🔜  强化学习优化
Phase 9  🔜  多语言 NLP 引擎
Phase 10 🔜  综合 Demo
```
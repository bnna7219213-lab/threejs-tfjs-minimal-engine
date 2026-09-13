/**
 * primitives.js — 符号距离场 (SDF) 原语 + CSG 布尔运算 + 仿射变换
 *
 * 设计原则：
 *   1. 所有原语返回一个函数 f(point) -> number，即"查询接口"
 *   2. CSG 运算组合两个 SDF 函数，返回新的 SDF 函数
 *   3. 仿射变换对 SDF 函数做逆变换（把查询点变换到原始空间再求值）
 *   4. 纯函数、无副作用、可测试
 *
 * 数学约定：f(p) > 0 = 外部，f(p) = 0 = 表面，f(p) < 0 = 内部
 */

// ═══════════════════════════════════════════════════
// 基础数学工具
// ═══════════════════════════════════════════════════

const EPSILON = 1e-6;

function vec3(x, y, z) { return { x, y, z }; }

function dist(p, q) {
  const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function length(p) { return Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z); }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// ═══════════════════════════════════════════════════
// SDF 原语工厂函数
//
// 每个原语返回一个 SDF 函数: f(point) -> number
// 这样可以通过组合构建复杂形状
// ═══════════════════════════════════════════════════

/**
 * 球体 SDF
 * @param {vec3} center - 中心
 * @param {number} radius - 半径
 * @returns {(p: vec3) => number}
 */
export function sdfSphere(center = {x:0,y:0,z:0}, radius = 1.0) {
  return function(p) {
    return dist(p, center) - radius;
  };
}

/**
 * 盒体 SDF（精确）
 * 参考: https://www.shadertoy.com/view/4sfSWr
 * @param {vec3} center - 中心
 * @param {vec3} halfSize - 半尺寸 {x, y, z}
 * @returns {(p: vec3) => number}
 */
export function sdfBox(center = {x:0,y:0,z:0}, halfSize = {x:1,y:1,z:1}) {
  return function(p) {
    const q = {
      x: Math.abs(p.x - center.x) - halfSize.x,
      y: Math.abs(p.y - center.y) - halfSize.y,
      z: Math.abs(p.z - center.z) - halfSize.z
    };
    // 外部距离 = 超出各轴的最大值 + 最小（负值）的贡献
    const outside = Math.sqrt(
      Math.max(q.x, 0) * Math.max(q.x, 0) +
      Math.max(q.y, 0) * Math.max(q.y, 0) +
      Math.max(q.z, 0) * Math.max(q.z, 0)
    );
    // 内部/表面 = 各轴超出的最小值（负值表示在内部）
    const inside = Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
    return outside + inside;
  };
}

/**
 * 圆柱体 SDF（沿 Z 轴）
 * @param {vec3} center - 中心
 * @param {number} radius - 半径
 * @param {number} height - 高度
 * @returns {(p: vec3) => number}
 */
export function sdfCylinder(center = {x:0,y:0,z:0}, radius = 0.5, height = 1.0) {
  return function(p) {
    const dxz = Math.sqrt(
      Math.max(p.x - center.x, 0) * Math.max(p.x - center.x, 0) +
      Math.max(p.z - center.z, 0) * Math.max(p.z - center.z, 0)
    ) - radius;
    const dy = Math.abs(p.y - center.y) - height / 2;
    return Math.max(dxz, dy);
  };
}

/**
 * 圆环 (Torus) SDF
 * @param {number} R - 主半径（中心到管中心）
 * @param {number} r - 管半径
 * @param {vec3} center - 中心（默认原点）
 * @returns {(p: vec3) => number}
 */
export function sdfTorus(R = 1.0, r = 0.3, center = {x:0,y:0,z:0}) {
  return function(p) {
    const q = {
      x: Math.sqrt((p.x - center.x) * (p.x - center.x) + (p.z - center.z) * (p.z - center.z)) - R,
      y: p.y - center.y
    };
    return Math.sqrt(q.x * q.x + q.y * q.y) - r;
  };
}

/**
 * 锥体 SDF（沿 Y 轴，顶点向上）
 * @param {vec3} apex - 顶点
 * @param {number} baseRadius - 底面半径
 * @param {number} height - 高度
 * @returns {(p: vec3) => number}
 */
export function sdfCone(apex = {x:0,y:1,z:0}, baseRadius = 0.5, height = 1.0) {
  const base = { x: apex.x, y: apex.y - height, z: apex.z };
  const halfAngle = Math.atan2(baseRadius, height);
  return function(p) {
    const dy = p.y - (apex.y + base.y) / 2;
    const h = apex.y - base.y;
    const tanA = Math.tan(halfAngle);
    const dxz = length({
      x: p.x - apex.x,
      y: 0,
      z: p.z - apex.z
    });
    const q = { x: dxz - (h/2 + dy) * tanA, y: dy - h/2 };
    return length(q) * Math.sign(q.x * Math.sign(q.y) + Math.max(q.x, q.y) > 0 ? 1 : -1);
  };
}

/**
 * 胶囊体 SDF（沿 Y 轴）
 * @param {vec3} p1 - 一端中心
 * @param {vec3} p2 - 另一端中心
 * @param {number} radius - 半径
 * @returns {(p: vec3) => number}
 */
export function sdfCapsule(p1 = {x:0,y:0,z:0}, p2 = {x:0,y:1,z:0}, radius = 0.2) {
  return function(p) {
    // 找 p 到线段 p1-p2 的最近点
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const t = clamp(
      ((p.x - p1.x) * dx + (p.y - p1.y) * dy + (p.z - p1.z) * dz) /
      (dx*dx + dy*dy + dz*dz),
      0, 1
    );
    const nearest = {
      x: p1.x + t * dx,
      y: p1.y + t * dy,
      z: p1.z + t * dz
    };
    return dist(p, nearest) - radius;
  };
}

/**
 * 平面 SDF（沿 Y 轴法线，上方为正）
 * @param {number} y - 平面高度
 * @returns {(p: vec3) => number}
 */
export function sdfPlane(y = 0) {
  return function(p) {
    return p.y - y;
  };
}

// ═══════════════════════════════════════════════════
// CSG 布尔运算
//
// 组合两个 SDF 函数返回新 SDF 函数
// ═══════════════════════════════════════════════════

/**
 * Union: f(p) = min(fA, fB)
 * A 或 B 覆盖的空间
 */
export function csgUnion(sdfA, sdfB) {
  return function(p) { return Math.min(sdfA(p), sdfB(p)); };
}

/**
 * Intersect: f(p) = max(fA, fB)
 * A 且 B 都覆盖的空间
 */
export function csgIntersect(sdfA, sdfB) {
  return function(p) { return Math.max(sdfA(p), sdfB(p)); };
}

/**
 * Subtract: f(p) = max(fA, -fB)
 * A 减去 B
 */
export function csgSubtract(sdfA, sdfB) {
  return function(p) { return Math.max(sdfA(p), -sdfB(p)); };
}

/**
 * Smooth Union: 平滑合并，k 控制过渡平滑度
 * k = 0 → 锐角 union，k 越大越圆滑
 * 参考: Inigo Quilez smooth min/max
 */
export function csgSmoothUnion(sdfA, sdfB, k = 0.5) {
  return function(p) {
    const a = sdfA(p), b = sdfB(p);
    const h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return b * (1 - h) + a * h - k * h * (1 - h);
  };
}

/**
 * Smooth Subtract: 平滑挖空
 */
export function csgSmoothSubtract(sdfA, sdfB, k = 0.5) {
  return function(p) {
    const a = sdfA(p), b = -sdfB(p);
    const h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return b * (1 - h) + a * h - k * h * (1 - h);
  };
}

/**
 * 多对象 Union（数组折叠）
 */
export function csgUnionN(sdfArray) {
  if (sdfArray.length === 0) {
    // 空场景 = 全部在外部（距离为正无穷）
    return function() { return 1e9; };
  }
  return sdfArray.reduce(csgUnion);
}

// ═══════════════════════════════════════════════════
// 仿射变换（对 SDF 做逆变换）
//
// 原理：对变换后的形状求 SDF，
// 等价于对原始形状求 SDF(p⁻¹)，即把查询点
// 反变换到原始空间再计算
// ═══════════════════════════════════════════════════

/**
 * 平移变换
 * @param {function} sdf - 原始 SDF 函数
 * @param {vec3} offset - 平移量
 * @returns {(p: vec3) => number}
 */
export function sdfTranslate(sdf, offset = {x:0,y:0,z:0}) {
  return function(p) {
    return sdf({
      x: p.x - offset.x,
      y: p.y - offset.y,
      z: p.z - offset.z
    });
  };
}

/**
 * 绕 Y 轴旋转
 * @param {function} sdf - 原始 SDF 函数
 * @param {number} angle - 弧度
 * @returns {(p: vec3) => number}
 */
export function sdfRotateY(sdf, angle = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return function(p) {
    // 逆旋转：把查询点反向旋转
    return sdf({
      x: p.x * cos + p.z * sin,
      y: p.y,
      z: -p.x * sin + p.z * cos
    });
  };
}

/**
 * 缩放变换
 * @param {function} sdf - 原始 SDF 函数
 * @param {number} sx - x 方向缩放
 * @param {number} sy - y 方向缩放
 * @param {number} sz - z 方向缩放
 * @returns {(p: vec3) => number}
 */
export function sdfScale(sdf, sx = 1, sy = 1, sz = 1) {
  // 平均缩放因子用于近似距离修正
  const avgScale = (Math.abs(sx) + Math.abs(sy) + Math.abs(sz)) / 3;
  return function(p) {
    return sdf({ x: p.x / sx, y: p.y / sy, z: p.z / sz }) * avgScale;
  };
}

/**
 * 镜像（沿指定轴翻转）
 * @param {function} sdf
 * @param {string} axis - 'x' | 'y' | 'z'
 */
export function sdfMirror(sdf, axis = 'x') {
  if (axis === 'x') return function(p) { return sdf({ x: -p.x, y: p.y, z: p.z }); };
  if (axis === 'y') return function(p) { return sdf({ x: p.x, y: -p.y, z: p.z }); };
  if (axis === 'z') return function(p) { return sdf({ x: p.x, y: p.y, z: -p.z }); };
  return sdf;
}

// ═══════════════════════════════════════════════════
// SDF 工具函数
// ═══════════════════════════════════════════════════

/**
 * 计算 SDF 在点 p 处的法线（数值梯度）
 * @param {function} sdf - SDF 函数
 * @param {vec3} p - 查询点
 * @param {number} eps - 差分步长
 * @returns {vec3} 归一化法线
 */
export function sdfNormal(sdf, p, eps = EPSILON) {
  const e = vec3(eps, 0, 0);
  const dx = (sdf({ x: p.x + eps, y: p.y, z: p.z }) - sdf({ x: p.x - eps, y: p.y, z: p.z })) / (2 * eps);
  const dy = (sdf({ x: p.x, y: p.y + eps, z: p.z }) - sdf({ x: p.x, y: p.y - eps, z: p.z })) / (2 * eps);
  const dz = (sdf({ x: p.x, y: p.y, z: p.z + eps }) - sdf({ x: p.x, y: p.y, z: p.z - eps })) / (2 * eps);
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
  return vec3(dx / len, dy / len, dz / len);
}

/**
 * 将 SDF 函数在网格上采样为 Float32Array
 * @param {function} sdf - SDF 函数
 * @param {number} resolution - 每轴分辨率
 * @param {number} extent - 范围 [-extent, extent]
 * @returns {Float32Array} 一维距离场
 */
export function sdfSample(sdf, resolution = 64, extent = 1.0) {
  const n = resolution;
  const arr = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = (x / (n - 1) - 0.5) * 2 * extent;
        const py = (y / (n - 1) - 0.5) * 2 * extent;
        const pz = (z / (n - 1) - 0.5) * 2 * extent;
        arr[z * n * n + y * n + x] = sdf({ x: px, y: py, z: pz });
      }
    }
  }
  return arr;
}

// ═══════════════════════════════════════════════════
// 导出汇总
// ═══════════════════════════════════════════════════

export const SDF = {
  vec3,
  sphere: sdfSphere,
  box: sdfBox,
  cylinder: sdfCylinder,
  torus: sdfTorus,
  cone: sdfCone,
  capsule: sdfCapsule,
  plane: sdfPlane,
  union: csgUnion,
  intersect: csgIntersect,
  subtract: csgSubtract,
  smoothUnion: csgSmoothUnion,
  smoothSubtract: csgSmoothSubtract,
  unionN: csgUnionN,
  translate: sdfTranslate,
  rotateY: sdfRotateY,
  scale: sdfScale,
  mirror: sdfMirror,
  normal: sdfNormal,
  sample: sdfSample
};
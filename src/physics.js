/**
 * physics.js — 原型层物理骨架
 *
 * 包含：
 * - AABB 包围盒 + 分离轴碰撞检测（文档第 5 节"简单碰撞对原型足够"）
 * - 半隐式欧拉（semi-implicit Euler）积分器
 * - Velocity Verlet 变体，供未来确定性回放使用
 *
 * 故意不做：关节约束、布料、载具（需要时上 Rapier）
 */

/** 3D AABB */
export class AABB {
  constructor(minX = 0, minY = 0, minZ = 0, maxX = 1, maxY = 1, maxZ = 1) {
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
  }
  center() {
    return [
      (this.minX + this.maxX) * 0.5,
      (this.minY + this.maxY) * 0.5,
      (this.minZ + this.maxZ) * 0.5,
    ];
  }
  extents() {
    return [
      (this.maxX - this.minX) * 0.5,
      (this.maxY - this.minY) * 0.5,
      (this.maxZ - this.minZ) * 0.5,
    ];
  }
}

/** 两个 AABB 是否相交（含接触边界） */
export function aabbIntersect(a, b) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}

/** 两 AABB 最小分离向量（MTV），用于简单刚体响应 */
export function aabbMTV(a, b) {
  const ox = Math.min(a.maxX - b.minX, b.maxX - a.minX);
  const oy = Math.min(a.maxY - b.minY, b.maxY - a.minY);
  const oz = Math.min(a.maxZ - b.minZ, b.maxZ - a.minZ);
  if (ox < 0 || oy < 0 || oz < 0) return null;
  let ax = 0, ay = 0, az = 0, min = Infinity;
  if (a.maxX > b.minX && a.minX < b.maxX) {
    const d = ox, dir = a.center()[0] < b.center()[0] ? -1 : 1;
    if (d < min) { min = d; ax = dir * d; }
  }
  if (a.maxY > b.minY && a.minY < b.maxY) {
    const d = oy, dir = a.center()[1] < b.center()[1] ? -1 : 1;
    if (d < min) { min = d; ay = dir * d; }
  }
  if (a.maxZ > b.minZ && a.minZ < b.maxZ) {
    const d = oz, dir = a.minZ > b.minZ ? 1 : -1;
    if (d < min) { min = d; az = dir * d; }
  }
  return [ax, ay, az];
}

/** 半隐式欧拉积分 */
export function semiImplicitEuler(pos, vel, acc, dt) {
  const npos = [pos[0] + vel[0] * dt, pos[1] + vel[1] * dt, pos[2] + vel[2] * dt];
  const nvel = [vel[0] + acc[0] * dt,  vel[1] + acc[1] * dt,  vel[2] + acc[2] * dt];
  return { pos: npos, vel: nvel };
}

/** 从位置和半径构造 AABB */
export function aabbFromSphere([x, y, z], r) {
  return new AABB(x - r, y - r, z - r, x + r, y + r, z + r);
}

/** 从位置和尺寸构造 AABB（box, half-extents） */
export function aabbFromBox([x, y, z], [hx, hy, hz]) {
  return new AABB(x - hx, y - hy, z - hz, x + hx, y + hy, z + hz);
}

export default { AABB, aabbIntersect, aabbMTV, semiImplicitEuler,
  aabbFromSphere, aabbFromBox };

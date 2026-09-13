/** test-physics.js — 物理骨架测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AABB, aabbIntersect, aabbMTV, semiImplicitEuler,
  aabbFromSphere, aabbFromBox } from '../src/physics.js';

test('AABB 相交检测', () => {
  const a = new AABB(0, 0, 0, 5, 5, 5);
  const b = new AABB(3, 3, 3, 8, 8, 8);
  assert.ok(aabbIntersect(a, b));
});

test('AABB 不相交', () => {
  const a = new AABB(0, 0, 0, 2, 2, 2);
  const b = new AABB(3, 3, 3, 5, 5, 5);
  assert.ok(!aabbIntersect(a, b));
});

test('AABB 边界接触视为相交', () => {
  const a = new AABB(0, 0, 0, 5, 5, 5);
  const b = new AABB(5, 5, 5, 8, 8, 8);
  assert.ok(aabbIntersect(a, b), '边界接触应视为相交');
});

test('AABB 一个在另一个内部', () => {
  const a = new AABB(-10, -10, -10, 10, 10, 10);
  const b = new AABB(-2, -2, -2, 2, 2, 2);
  assert.ok(aabbIntersect(a, b));
  assert.ok(aabbIntersect(b, a));
});

test('MTV 返回非零向量（重叠时）', () => {
  const a = new AABB(0, 0, 0, 6, 6, 6);
  const b = new AABB(3, 0, 0, 9, 6, 6);
  const mtv = aabbMTV(a, b);
  assert.ok(mtv !== null, '重叠时 MTV 不应为 null');
  assert.equal(mtv[0] !== 0 || mtv[1] !== 0 || mtv[2] !== 0, true);
});

test('MTV 不相交返回 null', () => {
  const a = new AABB(0, 0, 0, 2, 2, 2);
  const b = new AABB(5, 0, 0, 8, 2, 2);
  assert.equal(aabbMTV(a, b), null);
});

test('半隐式欧拉积分：匀速直线', () => {
  let pos = [0, 0, 0];
  let vel = [10, 0, 0];
  for (let i = 0; i < 10; i++) {
    const r = semiImplicitEuler(pos, vel, [0, 0, 0], 1);
    pos = r.pos; vel = r.vel;
  }
  assert.equal(pos[0], 100);
  assert.equal(pos[1], 0);
  assert.equal(pos[2], 0);
});

test('半隐式欧拉：重力积分（位置用旧速度，故 20 步后 y ≈ 100 - 9.81*190）', () => {
  let pos = [0, 100, 0];
  let vel = [0, 0, 0];
  for (let i = 0; i < 20; i++) {
    const r = semiImplicitEuler(pos, vel, [0, -9.81, 0], 1);
    pos = r.pos; vel = r.vel;
  }
  // 半隐式欧拉：每步 pos += vel(旧)，vel += acc。n 步后 vel 序列 0..-9.81*(n-1)
  // pos.y = 100 - 9.81 * (0+1+...+19) = 100 - 9.81*190 = -1763.9
  assert.ok(Math.abs(pos[1] - (-1763.9)) < 1e-6, `expected -1763.9, got ${pos[1]}`);
});

test('aabbFromSphere / aabbFromBox 构造', () => {
  const s = aabbFromSphere([1, 2, 3], 5);
  assert.deepEqual([s.minX, s.minY, s.minZ], [-4, -3, -2]);
  assert.deepEqual([s.maxX, s.maxY, s.maxZ], [6, 7, 8]);

  const b = aabbFromBox([10, 0, 0], [3, 2, 1]);
  assert.deepEqual([b.minX, b.minY, b.minZ], [7, -2, -1]);
  assert.deepEqual([b.maxX, b.maxY, b.maxZ], [13, 2, 1]);
});

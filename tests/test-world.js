/** test-world.js — ECS 世界骨架测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, SystemBase } from '../src/world.js';

test('createEntity 递增', () => {
  const w = new World();
  assert.equal(w.createEntity(), 1);
  assert.equal(w.createEntity(), 2);
  assert.equal(w.createEntity(), 3);
});

test('add / get 基本读写', () => {
  const w = new World();
  const e = w.createEntity();
  w.add(e, 'pos', [1, 2, 3]);
  assert.deepEqual(w.get(e, 'pos'), [1, 2, 3]);
});

test('remove 后 get 返回 undefined', () => {
  const w = new World();
  const e = w.createEntity();
  w.add(e, 'pos', [1, 2, 3]);
  w.remove(e, 'pos');
  assert.equal(w.get(e, 'pos'), undefined);
});

test('removeEntity 移除所有组件', () => {
  const w = new World();
  const e = w.createEntity();
  w.add(e, 'pos', [1, 2, 3]);
  w.add(e, 'vel', [0, 0, 0]);
  w.removeEntity(e);
  assert.equal(w.get(e, 'pos'), undefined);
  assert.equal(w.get(e, 'vel'), undefined);
});

test('query 单类型', () => {
  const w = new World();
  const a = w.createEntity();
  const b = w.createEntity();
  w.add(a, 'pos', [0, 0, 0]);
  w.add(b, 'pos', [1, 0, 0]);
  const c = w.createEntity();
  w.add(c, 'vel', [0, 0, 0]);
  assert.deepEqual(w.query('pos'), [a, b]);
});

test('query 多类型交集', () => {
  const w = new World();
  const a = w.createEntity();
  w.add(a, 'pos', [0, 0, 0]);
  w.add(a, 'vel', [1, 0, 0]);
  const b = w.createEntity();
  w.add(b, 'pos', [1, 0, 0]);
  assert.deepEqual(w.query('pos', 'vel'), [a]);
});

test('queryData 返回组件对象', () => {
  const w = new World();
  const a = w.createEntity();
  w.add(a, 'pos', [3, 4, 5]);
  w.add(a, 'vel', [1, 0, 0]);
  const out = w.queryData('pos', 'vel');
  assert.deepEqual(out, [{ pos: [3, 4, 5], vel: [1, 0, 0] }]);
});

test('has 多类型判定', () => {
  const w = new World();
  const a = w.createEntity();
  w.add(a, 'pos', [0, 0, 0]);
  w.add(a, 'vel', [0, 0, 0]);
  assert.ok(w.has(a, 'pos', 'vel'));
  assert.ok(!w.has(a, 'pos', 'render'));
});

test('registerSystem 按 priority 排序执行', () => {
  const w = new World();
  const order = [];
  w.registerSystem({ id: 'z', priority: 100, update() { order.push('z'); } });
  w.registerSystem({ id: 'a', priority: 1,   update() { order.push('a'); } });
  w.registerSystem({ id: 'm', priority: 50,  update() { order.push('m'); } });
  w.tick(0.016);
  assert.deepEqual(order, ['a', 'm', 'z']);
});

test('SystemBase 骨架：enabled=false 时 step 不执行', () => {
  const w = new World();
  const sys = new SystemBase();
  sys.enabled = false;
  let ran = false;
  sys.step = () => { ran = true; };
  w.registerSystem(sys);
  w.tick(1);
  assert.equal(ran, false);
});

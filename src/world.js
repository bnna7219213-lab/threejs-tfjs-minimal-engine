/**
 * world.js — ECS-lite 世界骨架
 *
 * 与文档第 4 节一致：轻量 Map-based ECS 外壳 + Object3D 作为视觉表现。
 * 组件类型用字符串，query 按类型交集过滤。
 */

export class World {
  constructor() {
    this._comps = new Map();   // type -> Map<id, data>
    this._nextId = 1;
    this._systems = [];
    this._running = false;
  }

  createEntity() { return this._nextId++; }

  add(id, type, data) {
    if (!this._comps.has(type)) this._comps.set(type, new Map());
    this._comps.get(type).set(id, data);
  }

  get(id, type) { return this._comps.get(type)?.get(id); }

  remove(id, type) { this._comps.get(type)?.delete(id); }

  removeEntity(id) { for (const m of this._comps.values()) m.delete(id); }

  has(id, ...types) { return types.every(t => this._comps.get(t)?.has(id)); }

  query(...types) {
    const maps = types.map(t => this._comps.get(t) ?? new Map());
    const [first, ...rest] = maps;
    return [...first.keys()].filter(id => rest.every(m => m.has(id)));
  }

  queryData(...types) {
    return this.query(...types).map(id =>
      Object.fromEntries(types.map(t => [t, this.get(id, t)]))
    );
  }

  registerSystem(sys) {
    if (typeof sys === 'function') sys = { update: sys };
    if (!sys.id) sys.id = `sys_${this._systems.length}`;
    if (sys.priority === undefined) sys.priority = 0;
    this._systems.push(sys);
    this._systems.sort((a, b) => a.priority - b.priority);
    return sys;
  }

  tick(dt) {
    for (const sys of this._systems) {
      sys.update && sys.update.call(sys, this, dt);
    }
  }
}

/** 常用系统骨架 */
export class SystemBase {
  constructor() { this.priority = 10; this.enabled = true; }
  update(world, dt) { if (this.enabled) this.step(world, dt); }
  step(world, dt) {}
}

export default { World, SystemBase };

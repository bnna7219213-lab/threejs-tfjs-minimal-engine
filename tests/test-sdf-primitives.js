/**
 * test-sdf-primitives.js — SDF 原语 + CSG + 变换 测试
 *
 * 测试策略：
 *   1. 每个原语在已知位置/距离的点验证 SDF 值
 *   2. CSG 运算验证组合后 SDF 的正确性
 *   3. 变换验证变换前后 SDF 的一致性
 *   4. 边界值（表面点）验证
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  sdfSphere, sdfBox, sdfCylinder, sdfTorus, sdfCapsule, sdfPlane,
  csgUnion, csgIntersect, csgSubtract, csgSmoothUnion, csgUnionN,
  sdfTranslate, sdfRotateY, sdfScale, sdfMirror,
  sdfNormal, sdfSample
} from '../src/sdf/primitives.js';

const EPS = 0.01;

function approx(a, b, tol = EPS) {
  assert.ok(Math.abs(a - b) < tol, `Expected ${a} ≈ ${b} (tol=${tol})`);
}

describe('SDF: 球体 (Sphere)', () => {
  const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);

  it('球心在内部，距离为 -radius', () => {
    approx(sphere({x:0,y:0,z:0}), -1.0);
  });

  it('表面点距离 ≈ 0', () => {
    approx(sphere({x:1,y:0,z:0}), 0);
    approx(sphere({x:0,y:1,z:0}), 0);
    approx(sphere({x:0,y:0,z:1}), 0);
  });

  it('外部点距离为正', () => {
    approx(sphere({x:2,y:0,z:0}), 1.0);
    approx(sphere({x:0,y:2,z:0}), 1.0);
  });

  it('对角点距离正确', () => {
    approx(sphere({x:1,y:1,z:1}), Math.sqrt(3) - 1, 0.01);
  });
});

describe('SDF: 盒体 (Box)', () => {
  const box = sdfBox({x:0,y:0,z:0}, {x:1,y:1,z:1});

  it('中心在内部，距离 = -1 (到最近面)', () => {
    approx(box({x:0,y:0,z:0}), -1.0);
  });

  it('面中心在表面', () => {
    approx(box({x:1,y:0,z:0}), 0);
    approx(box({x:-1,y:0,z:0}), 0);
    approx(box({x:0,y:1,z:0}), 0);
  });

  it('角点在表面 (1,1,1)', () => {
    approx(box({x:1,y:1,z:1}), 0);
  });

  it('外部点：正上方距离正确', () => {
    approx(box({x:0,y:2,z:0}), 1.0);
  });

  it('外部点：角外距离 = √3 - 0 ≈ 1.73', () => {
    // (2,2,2): q=(1,1,1), outside=√3, inside=0 → √3
    approx(box({x:2,y:2,z:2}), Math.sqrt(3), 0.01);
  });

  it('面外距离 = |x-1| = 0.5', () => {
    approx(box({x:1.5,y:0,z:0}), 0.5);
  });

  it('不等比例盒体', () => {
    const flatBox = sdfBox({x:0,y:0,z:0}, {x:2,y:0.5,z:1});
    approx(flatBox({x:0,y:0,z:0}), -0.5);  // 最近面 = y 面
    approx(flatBox({x:2,y:0,z:0}), 0);     // 角点
  });
});

describe('SDF: 圆柱体 (Cylinder, 沿 Y 轴)', () => {
  const cyl = sdfCylinder({x:0,y:0,z:0}, 0.5, 1.0);

  it('中心在内部，距离 = -0.5 (到最近面/顶)', () => {
    approx(cyl({x:0,y:0,z:0}), -0.5);
  });

  it('面中心在表面 (半径方向)', () => {
    approx(cyl({x:0.5,y:0,z:0}), 0);
  });

  it('顶面中心在表面 (高度方向)', () => {
    approx(cyl({x:0,y:0.5,z:0}), 0);
  });

  it('外部：半径方向', () => {
    approx(cyl({x:1,y:0,z:0}), 0.5);
  });

  it('外部：高度方向', () => {
    approx(cyl({x:0,y:1,z:0}), 0.5);
  });
});

describe('SDF: 圆环 (Torus)', () => {
  const torus = sdfTorus(1.0, 0.3);

  it('环管中心点 (1,0,0) 在内部，距离 = -0.3', () => {
    approx(torus({x:1,y:0,z:0}), -0.3);
  });

  it('环内边缘点 (0.7,0,0) 在表面', () => {
    approx(torus({x:0.7,y:0,z:0}), 0);
  });

  it('环外边缘点 (1.3,0,0) 在表面', () => {
    approx(torus({x:1.3,y:0,z:0}), 0);
  });

  it('原点 (0,0,0) 在外部，距离 ≈ 0.7', () => {
    // q = (sqrt(0)-1, 0) = (-1, 0), length=1, 1-0.3=0.7
    approx(torus({x:0,y:0,z:0}), 0.7, 0.01);
  });
});

describe('SDF: 胶囊 (Capsule)', () => {
  const cap = sdfCapsule({x:0,y:0,z:0}, {x:0,y:2,z:0}, 0.2);

  it('线段中点 (0,1,0) 在内部，距离 = -0.2', () => {
    approx(cap({x:0,y:1,z:0}), -0.2);
  });

  it('线段端点 (0,0,0) 在内部，距离 = -0.2', () => {
    approx(cap({x:0,y:0,z:0}), -0.2);
  });

  it('表面点 (0.2,1,0) 在表面', () => {
    approx(cap({x:0.2,y:1,z:0}), 0);
  });

  it('外部点 (1,1,0) 在外部', () => {
    approx(cap({x:1,y:1,z:0}), 0.8, 0.01);
  });
});

describe('SDF: 平面 (Plane)', () => {
  const plane = sdfPlane(0.5);

  it('上方点在外部（正距离）', () => {
    approx(plane({x:0,y:1,z:0}), 0.5);
  });

  it('平面上距离 = 0', () => {
    approx(plane({x:0,y:0.5,z:0}), 0);
  });

  it('下方点在内部（负距离）', () => {
    approx(plane({x:0,y:0,z:0}), -0.5);
  });
});

describe('CSG: Union', () => {
  it('两球合并，中心在内部', () => {
    const a = sdfSphere({x:-1,y:0,z:0}, 0.5);
    const b = sdfSphere({x:1,y:0,z:0}, 0.5);
    const shape = csgUnion(a, b);
    // a 中心 (-1,0,0) 在 a 内，距离 = -0.5
    approx(shape({x:-1,y:0,z:0}), -0.5);
  });

  it('两球在分离点的外部', () => {
    const a = sdfSphere({x:-1,y:0,z:0}, 0.5);
    const b = sdfSphere({x:1,y:0,z:0}, 0.5);
    const shape = csgUnion(a, b);
    // (0,0,0): a=0.5, b=0.5, min=0.5
    approx(shape({x:0,y:0,z:0}), 0.5);
  });

  it('重叠区域取较小值', () => {
    const a = sdfSphere({x:0,y:0,z:0}, 1.0);
    const b = sdfSphere({x:0,y:0,z:0}, 2.0);
    const shape = csgUnion(a, b);
    // (1.5,0,0): a=0.5, b=-0.5 → min=-0.5 (在 b 内)
    approx(shape({x:1.5,y:0,z:0}), -0.5);
  });
});

describe('CSG: Intersect', () => {
  it('两球相交区域', () => {
    const a = sdfSphere({x:0,y:0,z:0}, 1.0);
    const b = sdfSphere({x:0,y:0,z:0}, 2.0);
    const shape = csgIntersect(a, b);
    // (0,0,0): a=-1, b=-2, max=-1 → 在 a 内
    approx(shape({x:0,y:0,z:0}), -1.0);
  });

  it('在 A 内但 B 外', () => {
    const a = sdfSphere({x:0,y:0,z:0}, 1.0);
    const b = sdfSphere({x:0,y:0,z:0}, 0.5);
    const shape = csgIntersect(a, b);
    // (0.75,0,0): a=-0.25, b=0.25 → max=0.25 (在 B 外)
    approx(shape({x:0.75,y:0,z:0}), 0.25);
  });
});

describe('CSG: Subtract', () => {
  it('大球挖小球：中心在挖空区域（外部）', () => {
    const big = sdfSphere({x:0,y:0,z:0}, 2.0);
    const small = sdfSphere({x:0,y:0,z:0}, 1.0);
    const shape = csgSubtract(big, small);
    // (0,0,0): big=-2, small=-1 → max(-2, 1) = 1 (外部)
    approx(shape({x:0,y:0,z:0}), 1.0);
  });

  it('大球挖小球：边缘在内部', () => {
    const big = sdfSphere({x:0,y:0,z:0}, 2.0);
    const small = sdfSphere({x:0,y:0,z:0}, 1.0);
    const shape = csgSubtract(big, small);
    // (1.5,0,0): big=-0.5, small=0.5 → max(-0.5, -0.5) = -0.5 (内部)
    approx(shape({x:1.5,y:0,z:0}), -0.5);
  });

  it('大球挖小球：外表面', () => {
    const big = sdfSphere({x:0,y:0,z:0}, 2.0);
    const small = sdfSphere({x:0,y:0,z:0}, 1.0);
    const shape = csgSubtract(big, small);
    // (2,0,0): big=0, small=1 → max(0,-1) = 0 (大球表面)
    approx(shape({x:2,y:0,z:0}), 0);
  });
});

describe('CSG: Smooth Union', () => {
  it('k=0 时接近锐角 union', () => {
    const a = sdfSphere({x:0,y:0,z:0}, 1.0);
    const b = sdfSphere({x:0,y:0,z:0}, 1.5);
    const shape = csgSmoothUnion(a, b, 0.01);
    // (0,0,0): a=-1, b=-1.5, smoothUnion≈-1.5
    approx(shape({x:0,y:0,z:0}), -1.5, 0.1);
  });

  it('k 大时过渡更平滑', () => {
    const a = sdfSphere({x:0,y:0,z:0}, 1.0);
    const b = sdfSphere({x:0,y:0,z:0}, 1.5);
    const sharp = csgSmoothUnion(a, b, 0.01);
    const smooth = csgSmoothUnion(a, b, 1.0);
    // 在 (0,0,0) 平滑版本的值应该比锐角版本更偏 b
    assert.ok(smooth({x:0,y:0,z:0}) < sharp({x:0,y:0,z:0}), 'smoothUnion k=1 < k=0.01');
  });
});

describe('CSG: UnionN (多对象合并)', () => {
  it('三个球体合并', () => {
    const s1 = sdfSphere({x:-2,y:0,z:0}, 0.5);
    const s2 = sdfSphere({x:0,y:0,z:0}, 0.5);
    const s3 = sdfSphere({x:2,y:0,z:0}, 0.5);
    const shape = csgUnionN([s1, s2, s3]);
    approx(shape({x:0,y:0,z:0}), -0.5);
    approx(shape({x:-2,y:0,z:0}), -0.5);
    approx(shape({x:2,y:0,z:0}), -0.5);
  });

  it('空数组返回全外部', () => {
    const shape = csgUnionN([]);
    approx(shape({x:0,y:0,z:0}), 1e9);
  });
});

describe('变换: Translate', () => {
  it('平移球体：球心位置变化', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const moved = sdfTranslate(sphere, {x:3,y:0,z:0});
    approx(moved({x:3,y:0,z:0}), -1.0);  // 新球心
    approx(moved({x:4,y:0,z:0}), 0);      // 新表面
    approx(moved({x:0,y:0,z:0}), 2.0);    // 原点距离 = 3+1=4?  no, 距离3-1=2... = 3 - 1 = 2
    // Actually: (0,0,0) relative to moved sphere center at (3,0,0): dist=3, 3-1=2
    approx(moved({x:0,y:0,z:0}), 2.0);
  });
});

describe('变换: RotateY', () => {
  it('旋转后 SDF 值不变（同一点相对于旋转后的物体）', () => {
    const box = sdfBox({x:0,y:0,z:0}, {x:1,y:1,z:1});
    const rotated = sdfRotateY(box, Math.PI / 2);
    // 旋转 90° 后，原来的 (1,0,0) 变成了 (0,0,1)
    // 所以查询 (0,0,1) 应该和查询 (1,0,0) 在未旋转物体上的值相同
    approx(rotated({x:0,y:0,z:1}), box({x:1,y:0,z:0}));
  });

  it('旋转 180°：点 (1,0,0) 等价于原始 (-1,0,0)', () => {
    const box = sdfBox({x:0,y:0,z:0}, {x:1,y:1,z:1});
    const rotated = sdfRotateY(box, Math.PI);
    approx(rotated({x:1,y:0,z:0}), box({x:-1,y:0,z:0}));
  });
});

describe('变换: Scale', () => {
  it('缩放球体半径', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const scaled = sdfScale(sphere, 2, 2, 2);
    approx(scaled({x:2,y:0,z:0}), 0);     // 表面
    approx(scaled({x:0,y:0,z:0}), -2.0);  // 内部距离 2
  });

  it('非均匀缩放：变成椭球', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const scaled = sdfScale(sphere, 2, 1, 0.5);
    approx(scaled({x:2,y:0,z:0}), 0);     // x 方向表面
    approx(scaled({x:0,y:1,z:0}), 0);     // y 方向表面
    approx(scaled({x:0,y:0,z:0.5}), 0);   // z 方向表面
  });
});

describe('变换: Mirror', () => {
  it('镜像 X 轴', () => {
    const box = sdfBox({x:1,y:0,z:0}, {x:0.5,y:0.5,z:0.5});
    const mirrored = sdfMirror(box, 'x');
    approx(mirrored({x:-1,y:0,z:0}), -0.5);
    // (1,0,0): q=(1.5,-0.5,-0.5), outside=1.5, inside=0 → 1.5
    approx(mirrored({x:1,y:0,z:0}), 1.5);
  });
});

describe('SDF Normal (数值梯度法线)', () => {
  it('球体表面法线指向外', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const n = sdfNormal(sphere, {x:1,y:0,z:0});
    approx(n.x, 1.0);
    approx(n.y, 0.0);
    approx(n.z, 0.0);
  });

  it('球体底部法线指向下', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const n = sdfNormal(sphere, {x:0,y:-1,z:0});
    approx(n.x, 0.0);
    approx(n.y, -1.0, 0.01);
    approx(n.z, 0.0);
  });

  it('盒体正面法线指向 X 正方向', () => {
    const box = sdfBox({x:0,y:0,z:0}, {x:1,y:1,z:1});
    const n = sdfNormal(box, {x:1,y:0,z:0});
    approx(n.x, 1.0);
    approx(n.y, 0.0, 0.01);
    approx(n.z, 0.0, 0.01);
  });
});

describe('SDF Sample (网格采样)', () => {
  it('采样返回正确大小数组', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const res = 8;
    const arr = sdfSample(sphere, res);
    assert.equal(arr.length, res * res * res);
    assert.equal(arr.length, 512);
  });

  it('采样中心点为负（在球内）', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const res = 8;
    const arr = sdfSample(sphere, res);
    // 中心索引: z=4, y=4, x=4 (0-indexed for res=8, center at 3.5)
    const centerIdx = 3 * res * res + 3 * res + 3;
    assert.ok(arr[centerIdx] < 0, 'Center should be inside sphere (negative)');
  });

  it('采样角点为正（在球外）', () => {
    const sphere = sdfSphere({x:0,y:0,z:0}, 1.0);
    const res = 8;
    const arr = sdfSample(sphere, res);
    // 角点索引: z=0, y=0, x=0
    assert.ok(arr[0] > 0, 'Corner should be outside sphere (positive)');
  });
});
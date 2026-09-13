/**
 * noise.js — Perlin 风格梯度噪声 + fBm
 *
 * 选择梯度噪声而非值噪声：网格点上恒为 0，无格子纹。
 * 选择经典 Perlin 而非 Simplex：实现出错概率低。
 * 完全 Node / 浏览器可移植。
 */

export function makeNoise2D(seed = 1337) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(256);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function gDot(hash, x, y) { const g = GRAD[hash & 7]; return g[0] * x + g[1] * y; }

  function noise2D(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
    const x1 = lerp(gDot(aa, xf, yf), gDot(ba, xf - 1, yf), u);
    const x2 = lerp(gDot(ab, xf, yf - 1), gDot(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.4142135623730951;
  }

  function fbm(x, y, { octaves = 6, persistence = 0.5, lacunarity = 2.0 } = {}) {
    let amp = 1, freq = 1, sum = 0, maxAmp = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / maxAmp;
  }

  return { noise2D, fbm };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { mulberry32 };
export default { makeNoise2D };

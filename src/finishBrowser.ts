import type { StudioState } from "./state";
import type { MaskLayer, Point } from "./finish";
const lin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const enc = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};
export function curveValue(c: Point[], x: number) {
  if (x < 0 || x > 1) return x;
  let i = c.findIndex((p, j) => j > 0 && x <= p.x) - 1;
  if (i < 0) i = c.length - 2;
  const a = c[i],
    b = c[i + 1],
    slope = (i: number) =>
      (c[i + 1].y - c[i].y) / Math.max(1e-6, c[i + 1].x - c[i].x),
    d = slope(i),
    tangent = (l: number, r: number) =>
      l * r <= 0 ? 0 : (2 * l * r) / (l + r),
    m0 = i === 0 ? d : tangent(slope(i - 1), d),
    m1 = i + 2 === c.length ? d : tangent(d, slope(i + 1)),
    h = b.x - a.x,
    t = (x - a.x) / h,
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a.y +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * b.y +
    (t3 - t2) * h * m1
  );
}
function blur(src: Float32Array, w: number, h: number, r: number) {
  r = clamp(Math.round(r), 1, 160);
  const tmp = new Float32Array(src.length),
    out = new Float32Array(src.length),
    div = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let k = 0; k < 4; k++) {
      let sum = src[y * w * 4 + k] * r;
      for (let x = 0; x <= r; x++)
        sum += src[(y * w + Math.min(w - 1, x)) * 4 + k];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + k] = sum / div;
        sum +=
          src[(y * w + Math.min(w - 1, x + r + 1)) * 4 + k] -
          src[(y * w + Math.max(0, x - r)) * 4 + k];
      }
    }
  for (let x = 0; x < w; x++)
    for (let k = 0; k < 4; k++) {
      let sum = tmp[x * 4 + k] * r;
      for (let y = 0; y <= r; y++)
        sum += tmp[(Math.min(h - 1, y) * w + x) * 4 + k];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + k] = sum / div;
        sum +=
          tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + k] -
          tmp[(Math.max(0, y - r) * w + x) * 4 + k];
      }
    }
  return out;
}
const luminance = (p: ArrayLike<number>, i = 0) =>
  p[i] * 0.2126 + p[i + 1] * 0.7152 + p[i + 2] * 0.0722;
export function maskValue(m: MaskLayer, x: number, y: number, p: number[]) {
  const r = m.rect,
    f = clamp(m.feather / 100, 0.001, 1),
    dx = (x - r.x - r.width / 2) / Math.max(0.0001, r.width / 2),
    dy = (y - r.y - r.height / 2) / Math.max(0.0001, r.height / 2);
  let a = 0;
  if (m.kind === "rectangle")
    a = smooth(0, f, Math.min(1 - Math.abs(dx), 1 - Math.abs(dy)));
  if (m.kind === "ellipse") a = smooth(0, f, 1 - Math.hypot(dx, dy));
  if (m.kind === "radial") a = clamp(1 - Math.hypot(dx, dy));
  if (m.kind === "linear") a = clamp((x - r.x) / Math.max(0.001, r.width));
  if (m.kind === "polygon" && m.points.length >= 3) {
    let inside = false,
      distance = Infinity;
    for (let j = 0; j < m.points.length; j++) {
      const a = m.points[j],
        b = m.points[(j + 1) % m.points.length],
        vx = b.x - a.x,
        vy = b.y - a.y;
      if (
        a.y > y !== b.y > y &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
      const t = clamp(
        ((x - a.x) * vx + (y - a.y) * vy) / Math.max(1e-9, vx * vx + vy * vy),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - a.x - t * vx, y - a.y - t * vy),
      );
    }
    a = inside ? smooth(0, Math.max(0.00001, m.feather / 2000), distance) : 0;
  }
  if (m.kind === "brush")
    for (let j = 0; j < m.points.length; j++) {
      const q = m.points[j];
      const v =
        1 -
        smooth(
          m.hardness / 100,
          1,
          Math.hypot(x - q.x, y - q.y) / clamp(m.radius, 0.001, 0.5),
        );
      a = m.strokeOps?.[j]
        ? a * (1 - (v * m.flow) / 100)
        : 1 - (1 - a) * (1 - (v * m.flow) / 100);
    }
  if (m.kind === "luminance") {
    const l = luminance(p);
    a =
      smooth(m.low - f * 0.1, m.low, l) *
      (1 - smooth(m.high, m.high + f * 0.1, l));
  }
  if (m.kind === "color")
    a =
      1 -
      smooth(
        m.high,
        m.high + f,
        Math.hypot(...p.slice(0, 3).map((v, k) => enc(v) - m.color[k])),
      );
  if (m.kind === "pass")
    throw Error("Pass masks require native render-pass access");
  return (m.invert ? 1 - a : a) * clamp(m.opacity / 100);
}
export function rasterMask(
  m: MaskLayer,
  original: Float32Array,
  w: number,
  h: number,
) {
  let alpha = new Float32Array(w * h);
  if (m.kind === "brush") {
    const radius = clamp(m.radius, 0.001, 0.5),
      rx = (radius * Math.min(w, h)) / w,
      ry = (radius * Math.min(w, h)) / h;
    for (let j = 0; j < m.points.length; j++) {
      const p = m.points[j];
      for (
        let y = Math.max(0, Math.floor((p.y - ry) * h));
        y < Math.min(h, Math.ceil((p.y + ry) * h));
        y++
      )
        for (
          let x = Math.max(0, Math.floor((p.x - rx) * w));
          x < Math.min(w, Math.ceil((p.x + rx) * w));
          x++
        ) {
          const d = Math.hypot((x / w - p.x) / rx, (y / h - p.y) / ry),
            v = ((1 - smooth(m.hardness / 100, 1, d)) * m.flow) / 100,
            i = y * w + x;
          alpha[i] = m.strokeOps?.[j]
            ? alpha[i] * (1 - v)
            : 1 - (1 - alpha[i]) * (1 - v);
        }
    }
    alpha = alpha.map((v) => ((m.invert ? 1 - v : v) * m.opacity) / 100);
  } else
    for (let i = 0; i < alpha.length; i++)
      alpha[i] = maskValue(
        m,
        (i % w) / w,
        Math.floor(i / w) / h,
        Array.from(original.slice(i * 4, i * 4 + 4)),
      );
  if (m.expand) {
    const r = Math.min(
        160,
        Math.max(1, Math.round((Math.abs(m.expand) * Math.max(w, h)) / 2000)),
      ),
      d = m.expand > 0;
    const tmp = new Float32Array(alpha.length),
      out = new Float32Array(alpha.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = d ? 0 : 1;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++)
          v = d ? Math.max(v, alpha[y * w + k]) : Math.min(v, alpha[y * w + k]);
        tmp[y * w + x] = v;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = d ? 0 : 1;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++)
          v = d ? Math.max(v, tmp[k * w + x]) : Math.min(v, tmp[k * w + x]);
        out[y * w + x] = v;
      }
    alpha = out;
  }
  if (m.blur) {
    const rgba = new Float32Array(w * h * 4);
    for (let i = 0; i < alpha.length; i++)
      rgba.set([alpha[i], alpha[i], alpha[i], 1], i * 4);
    const b = blur(
      rgba,
      w,
      h,
      Math.max(1, Math.round((m.blur * Math.max(w, h)) / 2000)),
    );
    alpha = alpha.map((_, i) => b[i * 4]);
  }
  return alpha;
}
export function overlayBrowser(input: ImageData, s: StudioState) {
  const w = input.width,
    h = input.height,
    px = new Float32Array(input.data.length);
  for (let i = 0; i < px.length; i++)
    px[i] = i % 4 === 3 ? input.data[i] / 255 : lin(input.data[i] / 255);
  const alpha = new Float32Array(w * h),
    rgba = new Uint8ClampedArray(w * h * 4);
  for (const m of s.finish.masks.filter((m) => m.enabled)) {
    const weights = rasterMask(m, px, w, h);
    for (let i = 0; i < alpha.length; i++) {
      const q = weights[i];
      alpha[i] =
        m.operation === "subtract"
          ? alpha[i] * (1 - q)
          : m.operation === "intersect"
            ? alpha[i] * q
            : alpha[i] + (1 - alpha[i]) * q;
    }
  }
  for (let i = 0; i < alpha.length; i++)
    rgba.set([237, 188, 115, Math.round(alpha[i] * 255)], i * 4);
  return transformImage(new ImageData(rgba, w, h), s);
}
const hueColor = (h: number) => {
  h = (((h % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  return [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ][Math.floor(h)];
};
export function finishBrowser(input: ImageData, s: StudioState) {
  if (s.neural.enabled)
    throw Error(
      "Neural rendering requires the Windows app and configured runtime.",
    );
  const a = s.finish,
    w = input.width,
    h = input.height;
  if (a.soloPass || a.dof || a.fog)
    throw Error("Render passes and depth operations require the Windows app.");
  if (a.masked && !a.masks.some((m) => m.enabled))
    throw Error("Mask scope requires an enabled mask");
  let px = new Float32Array(input.data.length);
  for (let i = 0; i < px.length; i += 4) {
    for (let k = 0; k < 3; k++) px[i + k] = lin(input.data[i + k] / 255);
    px[i + 3] = input.data[i + 3] / 255;
  }
  const original = px.slice();
  if (a.denoise || a.chromaDenoise) {
    const b = blur(px, w, h, 1);
    for (let i = 0; i < px.length; i += 4) {
      const l = luminance(px, i),
        lq = luminance(b, i),
        keep = 1 - Math.min(1, (Math.abs(l - lq) * a.preserveDetail) / 10);
      for (let k = 0; k < 3; k++)
        px[i + k] +=
          (((lq - l) * a.denoise) / 100) * keep +
          (((b[i + k] - lq - (px[i + k] - l)) * a.chromaDenoise) / 100) * keep;
    }
  }
  for (const [amount, r, threshold] of [
    [a.sharpen / 100, a.sharpenRadius, a.sharpenThreshold / 100],
    [a.texture / 100, 2, 0],
    [a.clarity / 100, 12, 0],
    [a.dehaze / 150, 48, 0],
  ])
    if (amount) {
      const b = blur(px, w, h, r);
      for (let i = 0; i < px.length; i += 4) {
        const diff = luminance(px, i) - luminance(b, i);
        if (Math.abs(diff) >= threshold)
          for (let k = 0; k < 3; k++) px[i + k] += diff * amount;
      }
    }
  const angle = (s.hue * Math.PI) / 180,
    c = Math.cos(angle),
    sn = Math.sin(angle);
  for (let i = 0; i < px.length; i += 4) {
    let l = Math.max(0, luminance(px, i));
    const sh = (1 - smooth(0, 0.6, l)) ** 2,
      hi = smooth(0.25, 1, l),
      ev =
        a.exposure +
        (a.shadows / 100) * sh +
        (a.highlights / 100) * hi +
        (a.whites / 100) * hi * hi;
    for (let k = 0; k < 3; k++) {
      let v = px[i + k] * 2 ** ev + (a.blacks / 500) * (1 - hi);
      v = (v - 0.18) * (1 + s.contrast / 100) + 0.18;
      v *= 2 ** (s.brightness / 50);
      if (s.gamma) v = Math.sign(v) * Math.abs(v) ** (2 ** (-s.gamma / 100));
      v = (v + a.lift / 200) * 2 ** (a.gain / 100);
      v *=
        2 **
        (k === 0
          ? a.temperature / 200 - a.tint / 400
          : k === 1
            ? a.tint / 200
            : -a.temperature / 200 - a.tint / 400);
      px[i + k] = v;
    }
    l = luminance(px, i);
    const spread =
        Math.max(px[i], px[i + 1], px[i + 2]) -
        Math.min(px[i], px[i + 1], px[i + 2]),
      sat = 1 + s.saturation / 100 + (s.vibrance / 100) * (1 - clamp(spread));
    for (let k = 0; k < 3; k++) px[i + k] = l + (px[i + k] - l) * sat;
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    px[i] =
      (0.299 + 0.701 * c + 0.168 * sn) * r +
      (0.587 - 0.587 * c + 0.33 * sn) * g +
      (0.114 - 0.114 * c - 0.497 * sn) * b;
    px[i + 1] =
      (0.299 - 0.299 * c - 0.328 * sn) * r +
      (0.587 + 0.413 * c + 0.035 * sn) * g +
      (0.114 - 0.114 * c + 0.292 * sn) * b;
    px[i + 2] =
      (0.299 - 0.299 * c + 1.25 * sn) * r +
      (0.587 - 0.587 * c - 1.05 * sn) * g +
      (0.114 + 0.886 * c - 0.203 * sn) * b;
    const t = clamp(l + a.gradeBalance / 200),
      weights = [(1 - t) ** 2, 2 * t * (1 - t), t * t];
    for (let j = 0; j < 3; j++) {
      const g = a.grade[j],
        col = hueColor(g[0]);
      for (let k = 0; k < 3; k++) {
        px[i + k] +=
          (((((col[k] - 0.5) * g[1]) / 100) * weights[j] * a.gradeStrength) /
            100) *
          0.2;
        px[i + k] *= 2 ** (((g[2] / 100) * weights[j] * a.gradeStrength) / 100);
      }
    }
    for (let k = 0; k < 3; k++)
      px[i + k] = lin(
        curveValue(a.curves[k + 1], curveValue(a.curves[0], enc(px[i + k]))),
      );
  }
  if (a.bloom) {
    const bright = px.slice();
    for (let i = 0; i < px.length; i += 4) {
      const l = luminance(px, i),
        v = clamp((l - a.bloomThreshold) / Math.max(0.0001, l));
      for (let k = 0; k < 3; k++) bright[i + k] *= v;
    }
    const b = blur(bright, w, h, a.bloomRadius);
    for (let i = 0; i < px.length; i += 4)
      for (let k = 0; k < 3; k++) px[i + k] += (b[i + k] * a.bloom) / 100;
  }
  const maskRasters = a.masks
    .filter((m) => m.enabled && (a.masked || m.exposure))
    .map((m) => ({ m, weights: rasterMask(m, original, w, h) }));
  for (let i = 0; i < px.length; i += 4) {
    const n = i / 4,
      x = (n % w) / w,
      y = Math.floor(n / w) / h,
      v =
        (smooth(
          a.vignetteMidpoint / 100,
          1,
          Math.hypot(x - 0.5, y - 0.5) * 1.4142,
        ) *
          a.vignette) /
        100,
      hash = (Math.imul(n, 747796405) + 2891336453) >>> 0,
      noise = (((hash ^ (hash >>> 16)) >>> 0) % 65536) / 65535 - 0.5;
    for (let k = 0; k < 3; k++)
      px[i + k] = px[i + k] * (1 - v) + (noise * a.grain) / 500;
    if (a.masked) {
      let alpha = 0;
      for (const { m, weights } of maskRasters) {
        const q = weights[n];
        alpha =
          m.operation === "subtract"
            ? alpha * (1 - q)
            : m.operation === "intersect"
              ? alpha * q
              : alpha + (1 - alpha) * q;
      }
      for (let k = 0; k < 3; k++)
        px[i + k] = original[i + k] * (1 - alpha) + px[i + k] * alpha;
    }
    let ev = 0,
      sat = 0;
    for (const { m, weights } of maskRasters) {
      const q = weights[n],
        l = luminance(original, i);
      if (m.dodgeMode === "saturation") sat += (m.exposure * q) / 3;
      else
        ev +=
          m.exposure *
          q *
          (m.dodgeMode === "shadows"
            ? 1 - smooth(0, 0.6, l)
            : m.dodgeMode === "highlights"
              ? smooth(0.25, 1, l)
              : 1);
    }
    const l = luminance(px, i);
    for (let k = 0; k < 3; k++)
      px[i + k] = (l + (px[i + k] - l) * Math.max(0, 1 + sat)) * 2 ** ev;
  }
  const rgba = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i++)
    rgba[i] = i % 4 === 3 ? input.data[i] : Math.round(clamp(enc(px[i])) * 255);
  return transformImage(new ImageData(rgba, w, h), s);
}
export function transformImage(input: ImageData, s: StudioState) {
  const a = s.finish,
    w = input.width,
    h = input.height;
  const r = a.crop,
    cx = Math.min(w - 1, Math.round(r.x * w)),
    cy = Math.min(h - 1, Math.round(r.y * h)),
    cw = Math.min(w - cx, Math.max(1, Math.round(r.width * w))),
    ch = Math.min(h - cy, Math.max(1, Math.round(r.height * h))),
    rot = ((Math.round(a.rotation / 90) % 4) + 4) % 4,
    ow = rot % 2 ? ch : cw,
    oh = rot % 2 ? cw : ch,
    out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const sx = cx + (a.flipX ? cw - 1 - x : x),
        sy = cy + (a.flipY ? ch - 1 - y : y),
        i = (sy * w + sx) * 4;
      let dx = x,
        dy = y;
      if (rot === 1) {
        dx = ch - 1 - y;
        dy = x;
      } else if (rot === 2) {
        dx = cw - 1 - x;
        dy = ch - 1 - y;
      } else if (rot === 3) {
        dx = y;
        dy = cw - 1 - x;
      }
      const j = (dy * ow + dx) * 4;
      for (let k = 0; k < 3; k++) out[j + k] = input.data[i + k];
      out[j + 3] = input.data[i + 3];
    }
  return new ImageData(out, ow, oh);
}

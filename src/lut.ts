export type LutSpace = "srgb" | "rec709" | "linear";
export type Lut = {
  size: number;
  dimensions: 1 | 3;
  min: number[];
  max: number[];
  data: Float32Array;
};
export const MAX_CUBE_BYTES = 16_000_000;
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
export function parseCube(text: string): Lut {
  if (text.length > MAX_CUBE_BYTES) throw Error("CUBE exceeds 16 MB");
  let size = 0,
    dimensions: 1 | 3 = 3,
    min = [0, 0, 0],
    max = [1, 1, 1];
  const values: number[] = [],
    headers = new Set<string>();
  const number = (token: string) => {
    const n = Number(token);
    if (!decimal.test(token) || !Number.isFinite(n) || Math.abs(n) > 1_000_000)
      throw Error("Invalid CUBE number");
    return n;
  };
  for (const [i, source] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    const line = source.split("#")[0].trim();
    if (!line) continue;
    const [key, ...args] = line.split(/\s+/);
    try {
      if (key === "TITLE") continue;
      if (decimal.test(key)) {
        if (!size || args.length !== 2)
          throw Error("Expected size followed by RGB rows");
        values.push(number(key), ...args.map(number));
        if (values.length > (dimensions === 3 ? size ** 3 : size) * 3)
          throw Error("Too many CUBE rows");
        continue;
      }
      if (values.length) throw Error("CUBE headers must precede data");
      if (headers.has(key)) throw Error("Duplicate CUBE header");
      headers.add(key);
      if (key === "LUT_3D_SIZE" || key === "LUT_1D_SIZE") {
        if (size || args.length !== 1)
          throw Error("Combined shaper/3D CUBEs are not supported");
        size = number(args[0]);
        dimensions = key === "LUT_3D_SIZE" ? 3 : 1;
        if (
          !Number.isInteger(size) ||
          size < 2 ||
          size > (dimensions === 3 ? 65 : 65536)
        )
          throw Error("Supported sizes: 3D 2–65; 1D 2–65536");
      } else if (key === "DOMAIN_MIN" || key === "DOMAIN_MAX") {
        if (
          args.length !== 3 ||
          headers.has("LUT_3D_INPUT_RANGE") ||
          headers.has("LUT_1D_INPUT_RANGE")
        )
          throw Error("Invalid or conflicting CUBE domain");
        if (key === "DOMAIN_MIN") min = args.map(number);
        else max = args.map(number);
      } else if (key === "LUT_3D_INPUT_RANGE" || key === "LUT_1D_INPUT_RANGE") {
        if (
          args.length !== 2 ||
          headers.has("DOMAIN_MIN") ||
          headers.has("DOMAIN_MAX") ||
          !size ||
          key !== `LUT_${dimensions}D_INPUT_RANGE`
        )
          throw Error("Invalid or conflicting CUBE input range");
        min = Array(3).fill(number(args[0]));
        max = Array(3).fill(number(args[1]));
      } else throw Error(`Unsupported CUBE directive: ${key}`);
    } catch (e) {
      throw Error(`Line ${i + 1}: ${(e as Error).message}`);
    }
  }
  if (!size || values.length !== (dimensions === 3 ? size ** 3 : size) * 3)
    throw Error("CUBE row count does not match its size");
  if (min.some((v, k) => v >= max[k]))
    throw Error("CUBE domain maximum must exceed minimum");
  return { size, dimensions, min, max, data: new Float32Array(values) };
}
export function sampleLut(lut: Lut, rgb: number[]): number[] {
  const { size: n, data } = lut;
  const p = rgb.map(
    (v, k) =>
      Math.max(0, Math.min(1, (v - lut.min[k]) / (lut.max[k] - lut.min[k]))) *
      (n - 1),
  );
  const lo = p.map((v) => Math.min(n - 2, Math.floor(v))),
    t = p.map((v, k) => v - lo[k]);
  if (lut.dimensions === 1)
    return p.map(
      (_, k) =>
        data[lo[k] * 3 + k] * (1 - t[k]) + data[(lo[k] + 1) * 3 + k] * t[k],
    );
  const out = [0, 0, 0];
  // CUBE order: red changes fastest, then green, then blue.
  for (let b = 0; b < 2; b++)
    for (let g = 0; g < 2; g++)
      for (let r = 0; r < 2; r++) {
        const w =
          (r ? t[0] : 1 - t[0]) * (g ? t[1] : 1 - t[1]) * (b ? t[2] : 1 - t[2]);
        const i = ((lo[2] + b) * n * n + (lo[1] + g) * n + lo[0] + r) * 3;
        for (let k = 0; k < 3; k++) out[k] += data[i + k] * w;
      }
  return out;
}
const encode = (x: number, space: LutSpace) =>
  space === "linear"
    ? x
    : space === "rec709"
      ? x < 0.018
        ? x * 4.5
        : 1.099 * x ** 0.45 - 0.099
      : x <= 0.0031308
        ? x * 12.92
        : 1.055 * x ** (1 / 2.4) - 0.055;
const decode = (x: number, space: LutSpace) =>
  space === "linear"
    ? x
    : space === "rec709"
      ? x < 0.081
        ? x / 4.5
        : ((x + 0.099) / 1.099) ** (1 / 0.45)
      : x <= 0.04045
        ? x / 12.92
        : ((x + 0.055) / 1.055) ** 2.4;
export function applyLut(
  lut: Lut,
  rgb: number[],
  strength: number,
  space: LutSpace,
  outside: "preserve" | "clamp",
): number[] {
  if (strength === 0) return rgb;
  const input = rgb.map((v) => encode(v, space));
  if (
    outside === "preserve" &&
    input.some((v, k) => v < lut.min[k] - 1e-7 || v > lut.max[k] + 1e-7)
  )
    return rgb;
  const mapped = sampleLut(lut, input);
  return rgb.map(
    (v, k) => v + ((decode(mapped[k], space) - v) * strength) / 100,
  );
}

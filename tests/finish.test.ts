import { describe, it, expect, vi } from "vitest";
import { defaults } from "../src/state";
import {
  finishDefaults,
  newMask,
  parseProject,
  blendPreset,
  exportDefaults,
} from "../src/finish";
import { finishBrowser, curveValue } from "../src/finishBrowser";
import fixture from "./fixtures/finish-defaults.json";
vi.stubGlobal(
  "ImageData",
  class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  },
);
const state = () => {
  const s = defaults();
  s.neural.enabled = false;
  return s;
};
const image = () =>
  new ImageData(
    new Uint8ClampedArray([
      50, 70, 90, 128, 80, 120, 160, 255, 100, 130, 180, 255, 170, 140, 80, 0,
    ]),
    2,
    2,
  );
describe("non-destructive finishing", () => {
  it("keeps frontend/native fixture in sync", () =>
    expect(state()).toEqual(fixture));
  it("preserves neutral pixels and original alpha", () => {
    const im = image(),
      original = im.data.slice(),
      out = finishBrowser(im, state());
    expect(im.data).toEqual(original);
    for (let i = 0; i < im.data.length; i++)
      expect(Math.abs(out.data[i] - im.data[i])).toBeLessThanOrEqual(1);
  });
  it("exposure and split-source processing do not mutate the source", () => {
    const s = state();
    s.finish.exposure = 1;
    const input = image(),
      before = input.data.slice(),
      p = finishBrowser(input, s);
    expect(p.data[0]).toBeGreaterThan(input.data[0]);
    expect(input.data).toEqual(before);
  });
  it("masks preserve pixels outside their coverage", () => {
    const s = state(),
      m = newMask("rectangle");
    m.rect = { x: 0.25, y: 0.25, width: 0.7, height: 0.7 };
    m.feather = 1;
    s.finish.masks = [m];
    s.finish.masked = true;
    s.finish.exposure = 1;
    const im = image(),
      out = finishBrowser(im, s);
    expect(out.data.slice(0, 4)).toEqual(im.data.slice(0, 4));
    expect(out.data[12]).toBeGreaterThan(im.data[12]);
  });
  it("crop and rotation use the same output pixel dimensions", () => {
    const s = state();
    s.finish.crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    s.finish.rotation = 90;
    const out = finishBrowser(image(), s);
    expect([out.width, out.height]).toEqual([2, 1]);
    expect(out.data[3]).toBe(0);
  });
  it("preset strength and partial application retain other groups", () => {
    const a = state(),
      b = state();
    a.saturation = 40;
    b.contrast = 40;
    b.saturation = -100;
    b.finish.bloom = 20;
    const p = blendPreset(a, b, 50, "tone");
    expect(p.contrast).toBe(20);
    expect(p.saturation).toBe(40);
    expect(p.finish.bloom).toBe(0);
  });
  it("roundtrips project history/masks/float options and rejects unknown schema", () => {
    const s = state();
    s.finish.masks = [newMask("ellipse")];
    const p = {
      version: 1,
      sourcePath: "D:/render.exr",
      inputSpace: "acescg",
      state: s,
      passes: [],
      snapshots: [{ id: "A", name: "Final", state: s }],
      history: [],
      presets: [],
      output: exportDefaults(),
    };
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(() => parseProject(JSON.stringify({ ...p, version: 99 }))).toThrow();
  });
  it("curve interpolation is monotonic and does not clamp HDR", () => {
    const c = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.15 },
      { x: 0.75, y: 0.85 },
      { x: 1, y: 1 },
    ];
    const values = Array.from({ length: 100 }, (_, i) =>
      curveValue(c, i / 100),
    );
    expect(values.every((v, i) => i === 0 || v >= values[i - 1])).toBe(true);
    expect(curveValue(c, 8)).toBe(8);
  });
  it("unavailable neural and depth processing fail clearly", () => {
    const s = state();
    s.neural.enabled = true;
    expect(() => finishBrowser(image(), s)).toThrow("Windows");
    s.neural.enabled = false;
    s.finish.dof = 10;
    expect(() => finishBrowser(image(), s)).toThrow("Windows");
  });
});

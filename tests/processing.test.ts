import { describe, it, expect, vi } from "vitest";
import { defaults as neuralDefaults } from "../src/state";
import { processPixels } from "../src/processing";
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
const defaults = () => {
  const s = neuralDefaults();
  s.neural.enabled = false;
  return s;
};
const fixture = () =>
  new ImageData(
    new Uint8ClampedArray([
      30, 70, 220, 128, 190, 80, 40, 255, 80, 160, 110, 0, 240, 200, 40, 255,
    ]),
    4,
    1,
  );
describe("explicit application color processing", () => {
  it("neutral preserves colors and alpha within rounding", () => {
    const src = fixture(),
      out = processPixels(src, defaults());
    for (let i = 0; i < src.data.length; i++)
      expect(Math.abs(src.data[i] - out.data[i])).toBeLessThanOrEqual(1);
    expect(out.data[3]).toBe(128);
    expect(out.data[11]).toBe(0);
  });
  it("brightness changes pixels without mutating source", () => {
    const src = fixture(),
      before = src.data.slice(),
      s = defaults();
    s.brightness = 30;
    const out = processPixels(src, s);
    expect(out.data[0]).toBeGreaterThan(src.data[0]);
    expect(src.data).toEqual(before);
  });
  it("extreme settings produce finite bounded bytes", () => {
    const s = defaults();
    s.contrast = 100;
    s.gamma = -100;
    s.saturation = 100;
    s.hue = 180;
    expect(
      Array.from(processPixels(fixture(), s).data).every(
        (x) => Number.isFinite(x) && x >= 0 && x <= 255,
      ),
    ).toBe(true);
  });
});

describe("no substitute neural behavior", () => {
  it("refuses neural processing in the browser", () => {
    expect(() => processPixels(fixture(), neuralDefaults())).toThrow(
      "requires the Windows app",
    );
  });
  it("neural sliders never become ordinary filters", () => {
    const s = defaults();
    const before = processPixels(fixture(), s);
    s.local.intensity = 2;
    s.local.tone = 2;
    s.local.structure = 2;
    expect(processPixels(fixture(), s).data).toEqual(before.data);
  });
});

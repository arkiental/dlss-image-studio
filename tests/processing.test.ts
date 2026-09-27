import { describe, it, expect, vi } from "vitest";
import { defaults } from "../src/state";
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
  it("local mask does not modify pixels outside its rectangle", () => {
    const src = new ImageData(
        new Uint8ClampedArray(20 * 20 * 4).fill(100),
        20,
        20,
      ),
      s = defaults();
    s.local.region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    s.local.tone = 0.7;
    const baseline = processPixels(src, defaults()),
      out = processPixels(src, s);
    expect(out.data[0]).toBe(baseline.data[0]);
    expect(out.data[(10 * 20 + 10) * 4]).toBeGreaterThan(
      baseline.data[(10 * 20 + 10) * 4],
    );
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

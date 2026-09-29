/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseCube, sampleLut, applyLut } from "../src/lut";
import { defaults } from "../src/state";
import { blendPreset, normalizeState, parseProject } from "../src/finish";
import manifest from "../public/luts/manifest.json";
import fixture from "./fixtures/lut-conformance.json";

describe("CUBE grading", () => {
  it("uses red-fastest ordering and interpolates all three axes", () => {
    const lut = parseCube(fixture.cube);
    fixture.samples.forEach(({ input, output }) =>
      sampleLut(lut, input).forEach((v, k) =>
        expect(v).toBeCloseTo(output[k], 6),
      ),
    );
  });
  it("supports 1D CUBEs, domains, CRLF, comments and exponents", () => {
    const lut = parseCube(
      '\uFEFFTITLE "Ramp"\r\nLUT_1D_SIZE 3\r\nDOMAIN_MIN -1 -1 -1\r\nDOMAIN_MAX 1 1 1\r\n0 0 0 #black\r\n2.5e-1 .5 .75\r\n1 1 1',
    );
    expect(sampleLut(lut, [-0.5, 0, 0.5])).toEqual([0.125, 0.5, 0.875]);
    expect(
      parseCube("LUT_1D_SIZE 2\nLUT_1D_INPUT_RANGE -1 2\n0 0 0\n1 1 1").max,
    ).toEqual([2, 2, 2]);
  });
  it.each([
    "LUT_3D_SIZE 1",
    "LUT_3D_SIZE 66",
    "LUT_3D_SIZE 2\n0 0 0",
    "LUT_1D_SIZE 2\n0 0 0\nNaN 1 1",
    "LUT_1D_SIZE 2\n0 0 0\n1 Infinity 1",
    "LUT_1D_SIZE 2\nLUT_3D_SIZE 2",
    "LUT_1D_SIZE 2\nDOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n0 0 0\n1 1 1",
  ])("rejects malformed/unsupported tables: %s", (text) =>
    expect(() => parseCube(text)).toThrow(),
  );
  it("blends in linear working light and preserves out-of-domain HDR by default", () => {
    const lut = parseCube(fixture.cube),
      input = [0.2, 0.4, 0.6];
    expect(applyLut(lut, input, 0, "linear", "clamp")).toEqual(input);
    const full = applyLut(lut, input, 100, "linear", "preserve"),
      half = applyLut(lut, input, 50, "linear", "preserve");
    half.forEach((v, k) => expect(v).toBeCloseTo((input[k] + full[k]) / 2, 6));
    for (const rgb of [
      [-0.2, 0.5, 0.5],
      [4, 0.5, 0.5],
    ])
      expect(applyLut(lut, rgb, 100, "srgb", "preserve")).toEqual(rgb);
    expect(
      applyLut(lut, [4, 0.5, 0.5], 100, "linear", "clamp")[0],
    ).toBeLessThan(1);
  });
  it("round trips identity through each supported color encoding", () => {
    const cube = "LUT_1D_SIZE 2\n0 0 0\n1 1 1",
      rgb = [0.001, 0.2, 0.8];
    for (const space of ["srgb", "rec709", "linear"] as const)
      applyLut(parseCube(cube), rgb, 100, space, "preserve").forEach((v, k) =>
        expect(v).toBeCloseTo(rgb[k], 6),
      );
  });
  it("keeps old projects compatible and includes LUTs in partial color presets", () => {
    const base = defaults(),
      preset = defaults();
    preset.finish.lutId = "a".repeat(64);
    preset.finish.lutEnabled = true;
    preset.finish.lutStrength = 80;
    const mixed = blendPreset(base, preset, 50, "color");
    expect(mixed.finish.lutId).toBe(preset.finish.lutId);
    expect(mixed.finish.lutStrength).toBe(40);
    expect(blendPreset(base, preset, 0).finish.lutId).toBe("");
    expect(blendPreset(base, preset, 100, "tone").finish.lutId).toBe("");
    const old = structuredClone(base);
    delete (old.finish as any).lutId;
    expect(normalizeState(old).finish.lutId).toBe("");
    expect(
      parseProject(
        JSON.stringify({
          version: 1,
          sourcePath: "render.png",
          state: mixed,
          luts: [],
        }),
      ).state.finish.lutId,
    ).toBe(preset.finish.lutId);
  });
  it("ships exactly 50 distinct, parseable tables with intact source hashes and licenses", () => {
    expect(manifest).toHaveLength(50);
    const dataHashes = new Set<string>();
    for (const item of manifest) {
      const bytes = gunzipSync(
        readFileSync(new URL(`../public/luts/${item.file}`, import.meta.url)),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.id);
      expect(["MIT", "CC0-1.0"]).toContain(item.license);
      expect(item.author).toBeTruthy();
      expect(item.url).toMatch(/^https:\/\//);
      const lut = parseCube(bytes.toString("utf8"));
      expect(lut.data.every(Number.isFinite)).toBe(true);
      dataHashes.add(
        createHash("sha256")
          .update(new Uint8Array(lut.data.buffer))
          .digest("hex"),
      );
    }
    expect(dataHashes.size).toBe(50);
  }, 60000);
});

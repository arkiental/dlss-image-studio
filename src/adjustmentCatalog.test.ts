import { describe, expect, it } from "vitest";
import {
  adjustmentCatalog,
  adjustmentLocation,
  findAdjustments,
} from "./adjustmentCatalog";

describe("adjustment discovery", () => {
  it("ranks an exact control ahead of related aliases", () => {
    expect(findAdjustments(" Exposure ")[0].label).toBe("Exposure");
    expect(findAdjustments("LUT strength")[0].control).toBe("LUT strength");
  });

  it("finds workflow terms without requiring the app's exact label", () => {
    expect(
      findAdjustments("white balance").map((entry) => entry.control),
    ).toContain("Temperature");
    expect(
      findAdjustments("noise reduction").map((entry) => entry.control),
    ).toContain("Luminance denoise");
    expect(
      findAdjustments("depth of field").map((entry) => entry.control),
    ).toContain("Depth blur");
    expect(findAdjustments("mirror horizontal")[0].control).toBe("Flip H");
  });

  it("disambiguates repeated control labels by group and tab", () => {
    const sharpening = findAdjustments("sharpen radius")[0];
    const bloom = findAdjustments("bloom radius")[0];
    expect(sharpening.control).toBe("Radius");
    expect(sharpening.group).toBe("Enhance");
    expect(sharpening.details).toBe("Advanced");
    expect(bloom.control).toBe("Radius");
    expect(adjustmentLocation(bloom)).toBe("Effects / Lens");
  });

  it("routes workspace results through the existing peer workspace", () => {
    expect(findAdjustments("object id")[0]).toMatchObject({
      tab: "Workspace",
      workspace: "Render Passes",
      control: "Display pass",
    });
    expect(findAdjustments("queue")[0].workspace).toBe("Batch");
    expect(adjustmentLocation(findAdjustments("queue")[0])).toBe(
      "Workspace / Batch",
    );
    expect(findAdjustments("preset library")[0].control).toBe("Search presets");
  });

  it("reveals neural resolution through its settings disclosure", () => {
    expect(findAdjustments("neural resolution")[0]).toMatchObject({
      tab: "Adjust",
      control: "Resolution",
      details: "Neural settings",
    });
  });

  it("does not invent a match for an empty or unknown query", () => {
    expect(findAdjustments("   ")).toEqual([]);
    expect(findAdjustments("banana spaceship")).toEqual([]);
    expect(new Set(adjustmentCatalog.map((entry) => entry.id)).size).toBe(
      adjustmentCatalog.length,
    );
  });
});

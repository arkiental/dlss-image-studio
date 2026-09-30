import { describe, expect, it } from "vitest";
import { defaults } from "./state";
import { newMask } from "./finish";
import { historyLabel } from "./historyLabels";

describe("history descriptions", () => {
  it("identifies a control and the final value of a gesture", () => {
    const before = defaults(),
      after = defaults();
    after.contrast = 12.5;
    expect(historyLabel(before, after)).toBe("Contrast 12.5");
    expect(historyLabel(undefined, before)).toBe("Original settings");
  });
  it("describes several changes without hiding the affected controls", () => {
    const before = defaults(),
      after = defaults();
    after.finish.exposure = 1;
    after.finish.temperature = 25;
    after.finish.vignette = 20;
    expect(historyLabel(before, after)).toContain("Exposure 1");
    expect(historyLabel(before, after)).toContain("Temperature 25");
    expect(historyLabel(before, after)).toContain("+1");
  });
  it("names added and removed masks", () => {
    const before = defaults(),
      after = defaults();
    const mask = newMask("rectangle");
    mask.name = "Car";
    after.finish.masks = [mask];
    expect(historyLabel(before, after)).toBe("Add mask: Car");
    expect(historyLabel(after, before)).toBe("Delete mask: Car");
  });
  it("excludes view-only settings from edit descriptions", () => {
    const before = defaults(),
      after = defaults();
    after.zoom.factor = 7;
    after.zoom.visible = !before.zoom.visible;
    after.contrast = 4;
    expect(historyLabel(before, after)).toBe("Contrast 4");
  });
});

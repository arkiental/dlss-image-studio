import { describe, expect, it } from "vitest";
import { uniqueVariantName } from "./variantNames";

describe("variant names", () => {
  it("uses the first unused numbered name after deletion", () => {
    expect(
      uniqueVariantName("", "Snapshot", [
        { name: "Snapshot 1" },
        { name: "Snapshot 3" },
      ]),
    ).toBe("Snapshot 2");
  });
  it("disambiguates repeated names regardless of casing or whitespace", () => {
    expect(
      uniqueVariantName(" Look A ", "Snapshot", [
        { name: "look a" },
        { name: "Look A (2)" },
      ]),
    ).toBe("Look A (3)");
  });
  it("advances an existing suffix without nesting it", () => {
    expect(
      uniqueVariantName("Look A (2)", "Snapshot", [
        { name: "Look A (2)" },
        { name: "Look A (3)" },
      ]),
    ).toBe("Look A (4)");
  });
  it("preserves an unused custom name", () => {
    expect(uniqueVariantName("Sunset", "Preset", [{ name: "Preset 1" }])).toBe(
      "Sunset",
    );
  });
});

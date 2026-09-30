import { describe, expect, it } from "vitest";
import {
  displayDeltaToSource,
  getInspectorSelection,
  moveInspectorSelection,
  resizeInspectorSelection,
  selectionFactorLimits,
} from "./inspectorGeometry";
import type {
  InspectorSelectionRect,
  SelectionHandle,
  SelectionSize,
} from "./inspectorGeometry";

const image = { width: 1200, height: 800 };
const center = { x: 0.5, y: 0.5 };
const handles: SelectionHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function expectInside(rect: InspectorSelectionRect, size: SelectionSize) {
  expect(rect.x).toBeGreaterThanOrEqual(-1e-8);
  expect(rect.y).toBeGreaterThanOrEqual(-1e-8);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1e-8);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1e-8);
  expect(rect.width / rect.height).toBeCloseTo(1.5);
  expect(rect.width * rect.factor).toBeCloseTo(300);
  expect(rect.height * rect.factor).toBeCloseTo(200);
}

describe("zoom inspector selection", () => {
  it("matches the 300 × 200 inspector sample and clamps all image edges", () => {
    const rect = getInspectorSelection(center, 2.5, image);
    expect(rect.width).toBe(120);
    expect(rect.height).toBe(80);
    for (const corner of [
      { x: -1, y: -1 },
      { x: 2, y: 2 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]) {
      expectInside(getInspectorSelection(corner, 2.5, image), image);
    }
  });

  it("fits portrait and tiny images without sampling outside the source", () => {
    for (const size of [
      { width: 90, height: 600 },
      { width: 600, height: 70 },
      { width: 12, height: 4 },
    ]) {
      const rect = getInspectorSelection({ x: 1, y: 1 }, 1, size);
      expectInside(rect, size);
      expect(rect.factor).toBe(selectionFactorLimits(size).min);
    }
  });

  it("preserves size and zoom when movement reaches the image bounds", () => {
    const initial = getInspectorSelection(center, 2.5, image);
    const moved = moveInspectorSelection(initial, { x: 9999, y: -9999 }, image);
    expect(moved.x + moved.width).toBe(image.width);
    expect(moved.y).toBe(0);
    expect(moved.factor).toBe(initial.factor);
    expectInside(moved, image);
  });

  it("resizes an edge around its opposite edge while keeping 3:2", () => {
    const initial = getInspectorSelection(center, 2.5, image);
    const grown = resizeInspectorSelection(
      initial,
      "e",
      { x: 60, y: 40 },
      image,
    );
    expect(grown.width).toBeCloseTo(180);
    expect(grown.x).toBeCloseTo(initial.x);
    expect(grown.y + grown.height / 2).toBeCloseTo(
      initial.y + initial.height / 2,
    );
    expectInside(grown, image);
    const taller = resizeInspectorSelection(
      initial,
      "n",
      { x: 60, y: -20 },
      image,
    );
    expect(taller.width).toBeCloseTo(150);
    expect(taller.y + taller.height).toBeCloseTo(initial.y + initial.height);
    expect(taller.x + taller.width / 2).toBeCloseTo(
      initial.x + initial.width / 2,
    );
  });

  it("projects corner movement onto the aspect ratio and fixes the opposite corner", () => {
    const initial = getInspectorSelection(center, 2.5, image);
    const grown = resizeInspectorSelection(
      initial,
      "nw",
      { x: -30, y: -20 },
      image,
    );
    expect(grown.width).toBeCloseTo(150);
    expect(grown.x + grown.width).toBeCloseTo(initial.x + initial.width);
    expect(grown.y + grown.height).toBeCloseTo(initial.y + initial.height);
    expectInside(grown, image);
  });

  it("uses both pointer axes when projecting a corner resize", () => {
    const initial = getInspectorSelection(center, 2.5, image);
    const horizontal = resizeInspectorSelection(
      initial,
      "se",
      { x: 30, y: 0 },
      image,
    );
    const vertical = resizeInspectorSelection(
      initial,
      "se",
      { x: 0, y: 20 },
      image,
    );
    expect(horizontal.width - initial.width).toBeCloseTo((30 * 9) / 13);
    expect(vertical.width - initial.width).toBeCloseTo((20 * 6) / 13);
    expect(horizontal.x).toBeCloseTo(initial.x);
    expect(horizontal.y).toBeCloseTo(initial.y);
  });

  it.each(handles)(
    "keeps %s resize bounded at every corner and zoom limit",
    (handle) => {
      for (const location of [center, { x: 0, y: 0 }, { x: 1, y: 1 }]) {
        const initial = getInspectorSelection(location, 2.5, image);
        for (const delta of [
          { x: 9999, y: 9999 },
          { x: -9999, y: -9999 },
          { x: 9999, y: -9999 },
        ]) {
          const resized = resizeInspectorSelection(
            initial,
            handle,
            delta,
            image,
          );
          expectInside(resized, image);
          expect(resized.factor).toBeGreaterThanOrEqual(1 - 1e-8);
          expect(resized.factor).toBeLessThanOrEqual(10 + 1e-8);
        }
      }
    },
  );

  it("maps the same pointer motion correctly at fit, 1×, and 2× display scales", () => {
    for (const scale of [0.5, 1, 2]) {
      expect(
        displayDeltaToSource({ x: 30 * scale, y: 20 * scale }, image, {
          width: image.width * scale,
          height: image.height * scale,
        }),
      ).toEqual({ x: 30, y: 20 });
    }
  });
});

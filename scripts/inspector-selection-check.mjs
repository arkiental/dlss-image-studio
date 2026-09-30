import { expect } from "@playwright/test";
import { resolve } from "node:path";

export async function checkInspectorSelection(page, evidenceDir) {
  const selection = page.getByTestId("inspector-selection");
  const handle = (direction) =>
    selection.locator(`[data-handle="${direction}"]`);
  const factor = page.getByRole("slider", {
    name: "Inspector zoom factor",
    exact: true,
  });
  const zoom = page.getByRole("checkbox", { name: "Show zoom inspector" });
  const measurements = [];
  await zoom.check();
  await expect(selection).toBeVisible();
  await expect(selection.locator("[data-handle]")).toHaveCount(8);
  const initialFactor = await factor.inputValue();
  const drag = async (target, dx, dy, cancel = false) => {
    const bounds = await target.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  await drag(page.locator(".zoom-header"), 1120, -80);

  const measure = async () => {
    const bounds = await selection.boundingBox();
    const image = await page.locator(".image-space").boundingBox();
    const source = await page
      .locator(".main-image")
      .evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
    return {
      ...bounds,
      image,
      source,
      scale: image.width / source.width,
      factor: Number(await factor.inputValue()),
    };
  };
  const assertSample = async (name) => {
    const value = await measure();
    expect(
      Math.abs(value.width / value.scale - 300 / value.factor),
    ).toBeLessThan(0.5);
    expect(
      Math.abs(value.height / value.scale - 200 / value.factor),
    ).toBeLessThan(0.5);
    expect(value.width / value.height).toBeCloseTo(1.5, 2);
    expect(value.x).toBeGreaterThanOrEqual(value.image.x - 0.5);
    expect(value.y).toBeGreaterThanOrEqual(value.image.y - 0.5);
    expect(value.x + value.width).toBeLessThanOrEqual(
      value.image.x + value.image.width + 0.5,
    );
    expect(value.y + value.height).toBeLessThanOrEqual(
      value.image.y + value.image.height + 0.5,
    );
    measurements.push({
      name,
      scale: value.scale,
      factor: value.factor,
      sourceWidth: value.width / value.scale,
      sourceHeight: value.height / value.scale,
    });
    return value;
  };
  const equalRect = (actual, expected) => {
    for (const key of ["x", "y", "width", "height"])
      expect(actual[key]).toBeCloseTo(expected[key], 1);
    expect(actual.factor).toBeCloseTo(expected.factor, 5);
  };

  await factor.fill("3");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  let before = await assertSample("Fit");
  await drag(selection, 24, 16);
  let after = await measure();
  expect(after.x - before.x).toBeCloseTo(24, 1);
  expect(after.y - before.y).toBeCloseTo(16, 1);
  expect(after.factor).toBeCloseTo(before.factor, 5);

  before = after;
  await selection.focus();
  await page.keyboard.press("ArrowRight");
  after = await measure();
  expect((after.x - before.x) / before.scale).toBeCloseTo(1, 1);
  before = after;
  await page.keyboard.press("Shift+ArrowDown");
  after = await measure();
  expect((after.y - before.y) / before.scale).toBeCloseTo(10, 1);

  before = after;
  await drag(handle("se"), 18, 12);
  after = await assertSample("Corner resize");
  expect(after.width).toBeGreaterThan(before.width + 10);
  expect(after.factor).toBeLessThan(before.factor);
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  before = after;
  await drag(handle("e"), 12, 0);
  after = await assertSample("Edge resize");
  expect(after.width).toBeGreaterThan(before.width + 8);
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y + after.height / 2).toBeCloseTo(
    before.y + before.height / 2,
    1,
  );
  before = after;
  await handle("e").focus();
  await page.keyboard.press("ArrowRight");
  after = await measure();
  expect((after.width - before.width) / before.scale).toBeCloseTo(1, 1);

  before = after;
  await drag(selection, 22, 14, true);
  equalRect(await measure(), before);
  await drag(handle("se"), -14, -10, true);
  equalRect(await measure(), before);
  await expect(selection).toHaveAttribute("data-dragging", "false");

  await factor.fill("3");
  before = await measure();
  await drag(
    selection,
    before.image.x + 1 - (before.x + before.width / 2),
    before.image.y + 1 - (before.y + before.height / 2),
  );
  after = await assertSample("Upper-left bounds");
  expect(after.x).toBeCloseTo(after.image.x, 1);
  expect(after.y).toBeCloseTo(after.image.y, 1);
  await drag(
    selection,
    after.image.x + after.image.width - 1 - (after.x + after.width / 2),
    after.image.y + after.image.height - 1 - (after.y + after.height / 2),
  );
  after = await assertSample("Lower-right bounds");
  expect(after.x + after.width).toBeCloseTo(
    after.image.x + after.image.width,
    1,
  );
  expect(after.y + after.height).toBeCloseTo(
    after.image.y + after.image.height,
    1,
  );
  await drag(handle("se"), 48, 32);
  await assertSample("Resize constrained at image boundary");
  before = await measure();
  await drag(
    selection,
    before.image.x + before.image.width / 2 - (before.x + before.width / 2),
    before.image.y + before.image.height / 2 - (before.y + before.height / 2),
  );

  for (const scale of [1, 2]) {
    await page
      .getByRole("slider", { name: "Image zoom", exact: true })
      .fill(String(scale));
    before = await assertSample(`${scale}x`);
    expect(before.scale).toBeCloseTo(scale, 3);
    await drag(selection, 18, 10);
    after = await measure();
    expect((after.x - before.x) / scale).toBeCloseTo(18 / scale, 1);
    expect((after.y - before.y) / scale).toBeCloseTo(10 / scale, 1);
  }

  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await factor.fill("1");
  before = await measure();
  await drag(
    selection,
    before.image.x + before.image.width / 2 - (before.x + before.width / 2),
    before.image.y + before.image.height / 2 - (before.y + before.height / 2),
  );
  await assertSample("Screenshot at 1x inspector factor");
  const inspectorCanvas = await page
    .locator(".zoom-panel canvas")
    .boundingBox();
  expect(inspectorCanvas.width / inspectorCanvas.height).toBeCloseTo(1.5, 2);
  await drag(page.locator(".zoom-header"), -1120, 80);
  await page.getByRole("tab", { name: "Workspace", exact: true }).click();
  await page.getByRole("tab", { name: "Passes", exact: true }).click();
  await expect(page.locator(".studio-status")).toContainText("Ready", {
    timeout: 30000,
  });
  const screenshot = resolve(evidenceDir, "corrected-selection.png");
  await page.screenshot({ path: screenshot });
  await factor.fill(initialFactor);
  await zoom.uncheck();
  await page.getByRole("tab", { name: "Adjust", exact: true }).click();
  return {
    measurements,
    screenshot,
    checks: [
      "Inspector selection has eight handles and samples 300/factor by 200/factor source pixels at 3:2 aspect correctly at Fit, 1x and 2x view scales",
      "Real pointer move, corner/edge resize and source bounds work; Escape restores canceled move/resize, arrow keys move one source pixel, Shift moves ten, and handle arrow keys resize",
    ],
  };
}

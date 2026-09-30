// Real browser workflows only. No native bridge or neural engine is loaded.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const studioUrl = new URL(process.env.STUDIO_URL || "http://127.0.0.1:1426");
studioUrl.searchParams.set("demo", "1");
const evidenceDir = resolve(process.env.EVIDENCE_DIR || "../evidence");
const prefix = process.env.EVIDENCE_PREFIX || "workflow-after";
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const report = {
  mode: "browser UI-only; neural engine unloaded",
  checks: [],
  errors: [],
  screenshots: [],
  measurements: {},
};
let page;

try {
  page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(studioUrl.href);
  await expect(page.locator(".main-image")).toBeVisible();
  const ready = () =>
    expect(page.locator(".studio-status")).toContainText("Preview ready", {
      timeout: 30000,
    });
  const capture = async (name) => {
    const path = resolve(evidenceDir, `${prefix}-${name}.png`);
    await page.screenshot({ path });
    report.screenshots.push(path);
  };
  const inspector = page.getByRole("tablist", {
    name: "Inspector sections",
    exact: true,
  });
  const tab = (name) => inspector.getByRole("tab", { name, exact: true });
  const workspace = async (name) => {
    await tab("Workspace").click();
    await page
      .getByRole("tablist", { name: "Workspace sections", exact: true })
      .getByRole("tab", { name, exact: true })
      .click();
  };
  const shelfTab = (name) =>
    page.locator(".shelf-tabs").getByRole("button", { name, exact: true });
  const contrast = page.getByRole("slider", { name: "Contrast", exact: true });
  const contrastValue = page.getByLabel("Contrast value", { exact: true });
  const snapshot = page
    .locator(".shelf-actions")
    .getByRole("button", { name: "Create snapshot", exact: true });
  const nameInput = page.getByLabel("Variant name", { exact: true });
  const cards = page.locator(".variant[data-snapshot-id]");
  const names = () =>
    cards.locator("button:first-child > span").allTextContents();
  const snapshotCard = (name) =>
    cards.filter({
      has: page.getByRole("button", {
        name: `Rename snapshot ${name}`,
        exact: true,
      }),
    });
  const captureSnapshot = async (name = "") => {
    await nameInput.fill(name);
    await ready();
    await expect(snapshot).toBeEnabled({ timeout: 30000 });
    await snapshot.click();
    await expect(nameInput).toHaveValue("");
  };
  const reset = async () => {
    await page.getByRole("button", { name: "Reset all", exact: true }).click();
    await ready();
  };
  const sameBox = (a, b) => {
    for (const key of ["x", "y", "width", "height"])
      expect(a[key]).toBeCloseTo(b[key], 1);
  };
  const canvasHash = (selector) =>
    page.locator(selector).evaluate(async (canvas) => {
      const bytes = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      return Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ).join(",");
    });

  await ready();
  report.nativeBridge = await page.evaluate(() =>
    Boolean(window.__TAURI_INTERNALS__),
  );
  expect(report.nativeBridge).toBe(false);
  const neural = page.getByRole("checkbox", {
    name: "Enable neural rendering",
  });
  await expect(neural).toBeDisabled();
  await expect(neural).not.toBeChecked();
  const sourceName = (
    await page.locator(".document-name").textContent()
  ).trim();
  expect(sourceName).toMatch(/sample.*\.(png|jpe?g)/i);
  report.sourceName = sourceName;
  await expect(page.locator(".document-state")).toHaveText("Preview ready");
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
  report.checks.push(
    "UI-only browser: no native bridge, neural engine disabled, imported filename and ready state visible",
  );

  // Reproduce the previously lost pending history entry before the 220ms debounce.
  await page.waitForTimeout(260);
  await contrast.fill("10");
  await page.keyboard.press("Control+z");
  await expect(contrast).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Control+Shift+z");
  await expect(contrast).toHaveValue("10");
  await ready();
  await page.waitForTimeout(260);
  await contrastValue.fill("25");
  await expect(contrast).toHaveValue("25");
  await expect(snapshot).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export to File", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".preview-state")).toHaveText("Editing preview");
  await page.waitForTimeout(300);
  await contrastValue.press("Escape");
  await expect(contrast).toHaveValue("10");
  await expect(contrastValue).not.toBeFocused();
  await ready();
  await page.waitForTimeout(260);
  await shelfTab("History").click();
  const historyLabels = await page
    .locator(".variant-strip > button span")
    .allTextContents();
  expect(historyLabels.some((label) => /Contrast 10/.test(label))).toBe(true);
  expect(historyLabels.some((label) => /Contrast 25/.test(label))).toBe(false);
  report.historyLabels = historyLabels;
  await page.keyboard.press("Control+z");
  await expect(contrast).toHaveValue("0");
  await page.keyboard.press("Control+Shift+z");
  await expect(contrast).toHaveValue("10");
  await ready();
  await page.locator(".variant-strip > button.active").click();
  await contrast.fill("11");
  await ready();
  await page.waitForTimeout(260);
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).check();
  const historyFactor = page.getByRole("slider", {
    name: "Inspector zoom factor",
    exact: true,
  });
  await historyFactor.fill("7");
  await page.getByRole("slider", { name: "Image zoom", exact: true }).fill("2");
  const historyView = await page.locator(".image-space").boundingBox();
  await page.keyboard.press("Control+z");
  await expect(contrast).toHaveValue("10");
  await expect(
    page.getByRole("checkbox", { name: "Show zoom inspector" }),
  ).toBeChecked();
  await expect(historyFactor).toHaveValue("7");
  sameBox(await page.locator(".image-space").boundingBox(), historyView);
  await page.keyboard.press("Control+Shift+z");
  await expect(contrast).toHaveValue("11");
  await expect(historyFactor).toHaveValue("7");
  sameBox(await page.locator(".image-space").boundingBox(), historyView);
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await ready();
  report.checks.push(
    "Immediate Undo retains a redoable edit; numeric Escape restores the focus checkpoint without canceled history; clicking the current history row still records the next edit; Undo/Redo preserve image zoom and inspector view",
  );

  await shelfTab("Snapshots").click();
  await reset();
  await captureSnapshot();
  await captureSnapshot();
  await captureSnapshot();
  await expect(cards).toHaveCount(3);
  await page
    .getByRole("button", { name: "Delete snapshot Snapshot 2", exact: true })
    .click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Undo delete", exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(
    snapshotCard("Snapshot 2").locator("button").first(),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete snapshot Snapshot 2", exact: true })
    .click();
  await captureSnapshot();
  const uniqueNames = await names();
  expect(new Set(uniqueNames).size).toBe(uniqueNames.length);
  expect(uniqueNames).toHaveLength(3);
  await page
    .getByRole("button", { name: "Rename snapshot Snapshot 1", exact: true })
    .click();
  const rename = page.getByRole("textbox", {
    name: "Rename snapshot Snapshot 1",
    exact: true,
  });
  await expect(rename).toBeFocused();
  await rename.fill("Canceled rename");
  await rename.press("Escape");
  expect(await names()).toContain("Snapshot 1");
  expect(await names()).not.toContain("Canceled rename");
  await page
    .getByRole("button", { name: "Rename snapshot Snapshot 1", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Rename snapshot Snapshot 1", exact: true })
    .fill("Workflow snapshot");
  await page
    .getByRole("textbox", { name: "Rename snapshot Snapshot 1", exact: true })
    .press("Enter");
  await expect(
    snapshotCard("Workflow snapshot").locator("button").first(),
  ).toBeFocused();
  await snapshotCard("Workflow snapshot").locator("button").first().click();
  await expect(
    snapshotCard("Workflow snapshot").locator("button").first(),
  ).toHaveAttribute("aria-pressed", "true");
  await contrast.fill("17");
  await expect(
    snapshotCard("Workflow snapshot").locator("button").first(),
  ).toHaveAttribute("aria-pressed", "false");
  await ready();
  await captureSnapshot("Workflow snapshot");
  expect(await names()).toContain("Workflow snapshot (2)");
  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await expect(contrast).toHaveValue("0");
  await page.keyboard.press("Control+z");
  await expect(contrast).toHaveValue("17");
  await page.keyboard.press("Control+Shift+z");
  await expect(contrast).toHaveValue("0");
  await ready();
  report.snapshotNames = await names();
  await capture("snapshots");
  report.checks.push(
    "Snapshot names remain unique after deletion and named collisions; rename Escape cancels, Enter commits, delete Undo restores focus, edit highlight tracks current state, and Reset round-trips through Undo/Redo",
  );

  await contrast.fill("32");
  await ready();
  await shelfTab("Presets").click();
  await nameInput.fill("Workflow look");
  await nameInput.press("Enter");
  await expect(nameInput).toHaveValue("");
  const savedPresets = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("studio-presets-v1") || "[]"),
    );
  await expect
    .poll(
      async () =>
        (await savedPresets()).find((preset) => preset.name === "Workflow look")
          ?.state.contrast,
    )
    .toBe(32);
  await contrast.fill("0");
  await ready();
  await workspace("Presets");
  const presetSearch = page.getByRole("searchbox", {
    name: "Search presets",
    exact: true,
  });
  await presetSearch.fill("Workflow look");
  await page
    .getByRole("button", { name: "Apply preset Workflow look", exact: true })
    .click();
  await tab("Adjust").click();
  await expect(contrast).toHaveValue("32");
  await ready();
  await expect(page.locator(".shelf-tabs .active")).toHaveText("Presets");
  await page.getByLabel("Preset strength", { exact: true }).fill("50");
  await page.getByLabel("Preset strength", { exact: true }).press("Enter");
  await page.getByLabel("Preset strength", { exact: true }).blur();
  await expect(contrast).toHaveValue("16");
  await ready();
  await page.getByLabel("Preset groups", { exact: true }).selectOption("color");
  await expect(contrast).toHaveValue("0");
  await ready();
  await page.getByLabel("Preset groups", { exact: true }).selectOption("all");
  await expect(contrast).toHaveValue("16");
  await ready();
  await workspace("Presets");
  await presetSearch.fill("Cinematic");
  await page
    .getByRole("button", { name: "Apply preset Cinematic", exact: true })
    .click();
  await expect(page.getByLabel("Preset strength", { exact: true })).toHaveValue(
    "50",
  );
  await expect(page.getByLabel("Preset groups", { exact: true })).toHaveValue(
    "all",
  );
  await ready();
  await expect(neural).not.toBeChecked();
  await presetSearch.fill("zzzz-no-such-preset");
  await expect(
    page
      .locator(".workspace-content")
      .getByRole("button", { name: /^Apply preset / }),
  ).toHaveCount(0);
  await presetSearch.fill("");
  await expect(page.locator(".preset-library-looks > button")).toHaveCount(13);
  await tab("Adjust").click();
  await contrast.fill("7");
  await ready();
  expect(
    (await savedPresets()).find((preset) => preset.name === "Workflow look")
      .state.contrast,
  ).toBe(32);
  await expect(page.locator(".document-name")).toHaveText(sourceName);
  await workspace("Presets");
  await capture("presets");
  report.checks.push(
    "Workspace searches and applies saved/built-in presets through the shared strength/group controls; saved state stays immutable, source identity stays unchanged, and browser neural rendering stays off",
  );

  const search = page.getByRole("searchbox", {
    name: "Search adjustments",
    exact: true,
  });
  await tab("Adjust").click();
  await contrast.focus();
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("Exposure");
  await search.press("Enter");
  await expect(tab("Refine")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("slider", { name: "Exposure", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Control+k");
  await search.fill("LUT");
  await search.press("Enter");
  await expect(page.getByLabel("LUT preset", { exact: true })).toBeFocused();
  await page.keyboard.press("Control+k");
  await search.fill("Masks");
  await search.press("Enter");
  await expect(tab("Workspace")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Add mask", { exact: true })).toBeFocused();
  await page.keyboard.press("Control+k");
  await search.fill("zzzz-no-such-adjustment");
  await expect(page.locator(".adjustment-search-count")).toHaveText(
    "No adjustments found",
  );
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.locator(".adjustment-search-results")).toHaveCount(0);
  await search.fill("LUT");
  const results = page.locator(".adjustment-search-result");
  await search.press("ArrowDown");
  await expect(results.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(results.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(results.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  await search.fill("exposure");
  await capture("search");
  await search.press("Escape");
  report.checks.push(
    "Ctrl+K finds Exposure/LUT/Masks, opens the correct section and focuses the control; search results support arrows/Home/End, no-results feedback, and Escape clearing with focus retained",
  );

  await tab("Adjust").click();
  await reset();
  const before = page.getByRole("button", { name: "Before", exact: true });
  const after = page.getByRole("button", { name: "After", exact: true });
  await before.click();
  await expect(before).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".preview-badge")).toHaveText(
    "Original preview · edits shown in After",
  );
  const originalHash = await canvasHash(".main-image");
  await contrastValue.fill("72");
  await expect(page.locator(".preview-state")).toHaveText("Editing preview");
  await contrastValue.press("Enter");
  await ready();
  expect(await canvasHash(".main-image")).toBe(originalHash);
  await expect(page.locator(".preview-badge")).toHaveText(
    "Original preview · edits shown in After",
  );
  await capture("before-mode");
  await after.click();
  await expect.poll(() => canvasHash(".main-image")).not.toBe(originalHash);
  await expect(after).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".before-image")).toHaveCount(0);
  await expect(page.locator(".preview-badge")).toHaveText("After");
  await page
    .getByLabel("Comparison layout", { exact: true })
    .selectOption("vertical");
  await expect(page.locator(".comparison-line.vertical")).toBeVisible();
  await page.getByLabel("Comparison layout", { exact: true }).selectOption("");
  await expect(page.locator(".comparison-line.vertical")).toBeVisible();
  await page
    .getByLabel("Comparison layout", { exact: true })
    .selectOption("horizontal");
  await expect(page.locator(".comparison-line.horizontal")).toBeVisible();
  await after.click();
  report.checks.push(
    "Explicit Before/After shows a useful original-preview message; edits update After pixels while Before stays unchanged, loading/ready states are visible, and the split placeholder preserves the current mode",
  );

  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const zoomPercent = page.getByRole("spinbutton", {
    name: "Zoom percentage",
    exact: true,
  });
  const initialView = await page.locator(".image-space").boundingBox();
  await zoomPercent.fill("");
  sameBox(await page.locator(".image-space").boundingBox(), initialView);
  await zoomPercent.press("Escape");
  sameBox(await page.locator(".image-space").boundingBox(), initialView);
  await zoomPercent.fill("200");
  expect(
    (await page.locator(".image-space").boundingBox()).width,
  ).toBeGreaterThan(initialView.width);
  await zoomPercent.press("Escape");
  sameBox(await page.locator(".image-space").boundingBox(), initialView);
  await page.getByLabel("Zoom presets", { exact: true }).selectOption("");
  sameBox(await page.locator(".image-space").boundingBox(), initialView);
  await page.getByRole("slider", { name: "Image zoom", exact: true }).fill("2");
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).check();
  const selection = page.getByTestId("inspector-selection");
  await expect(selection).toBeVisible();
  const factor = page.getByRole("slider", {
    name: "Inspector zoom factor",
    exact: true,
  });
  const initialFactor = await factor.inputValue();
  await selection.locator('[data-handle="se"]').focus();
  const initialPan = await page.locator(".image-space").boundingBox();
  await page.keyboard.down("Space");
  await expect(selection).toHaveClass(/disabled/);
  await expect(selection.locator('[data-handle="se"]')).toBeDisabled();
  await expect(page.locator(".viewport")).toHaveCSS("cursor", "grab");
  const viewport = await page.locator(".viewport").boundingBox();
  await page.mouse.move(
    viewport.x + viewport.width * 0.6,
    viewport.y + viewport.height * 0.6,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewport.x + viewport.width * 0.6 + 24,
    viewport.y + viewport.height * 0.6 + 18,
    { steps: 6 },
  );
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(selection).toBeVisible();
  const panned = await page.locator(".image-space").boundingBox();
  expect(panned.x - initialPan.x).toBeCloseTo(24, 0);
  expect(panned.y - initialPan.y).toBeCloseTo(18, 0);
  await expect(factor).toHaveValue(initialFactor);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
  report.checks.push(
    "Blank zoom drafts preserve the view; Escape restores valid zoom edits and fit/pan; neutral zoom preset preserves scale; Space from a resize handle pans without resizing",
  );

  // Reload into a clean editing session for final layout evidence.
  await page.reload();
  await expect(page.locator(".main-image")).toBeVisible();
  await ready();
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
  await shelfTab("Snapshots").click();
  await expect(cards).toHaveCount(0);
  await tab("Adjust").click();
  const neuralControls = page
    .locator(".neural-adjustments")
    .getByRole("button", { name: "Controls", exact: true });
  await expect(neuralControls).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#neural-controls")).toHaveCount(0);
  await neuralControls.click();
  await expect(
    page.getByRole("slider", { name: "Intensity", exact: true }),
  ).toBeDisabled();
  await neuralControls.click();
  for (const [width, height, name, baseline] of [
    [1536, 1024, "desktop", 515],
    [1080, 840, "compact", 339],
  ]) {
    await page.setViewportSize({ width, height });
    await shelfTab("Snapshots").click();
    await ready();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const bounds = await page.locator(".viewport").boundingBox();
    expect(bounds.height).toBeGreaterThan(baseline);
    report.measurements[name] = {
      viewportHeight: bounds.height,
      previousViewportHeight: baseline,
      gainedPixels: bounds.height - baseline,
    };
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
      ),
    ).toBe(false);
    await capture(name);
    await workspace("Presets");
    const searchBounds = await presetSearch.boundingBox();
    expect(searchBounds.x + searchBounds.width).toBeLessThanOrEqual(width);
    await tab("Adjust").click();
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  await workspace("Masks");
  await capture("workspace");
  await tab("Adjust").click();
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.focus();
  await settings.press("Space");
  const dialog = page.getByRole("dialog", { name: "Studio Settings" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await capture("settings");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  report.checks.push(
    "Off neural controls disclose safely; desktop and compact viewports gain useful image space without page overflow; compact preset search fits; Settings still traps and restores keyboard focus",
  );
  expect(report.errors).toEqual([]);
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  if (page) {
    const path = resolve(evidenceDir, `${prefix}-failure.png`);
    await page.screenshot({ path }).catch(() => {});
    report.screenshots.push(path);
  }
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(evidenceDir, `${prefix}-validation.json`),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}

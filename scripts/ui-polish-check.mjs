import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const studioUrl = new URL(process.env.STUDIO_URL || "http://127.0.0.1:1426");
studioUrl.searchParams.set("demo", "1");
const evidenceDir = resolve(process.env.EVIDENCE_DIR || "../evidence");
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const checks = [];
const errors = [];
const report = { mode: "browser UI-only", checks, errors, screenshots: [] };

try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(studioUrl.href);
  await expect(page.locator(".main-image")).toBeVisible();
  const ready = () =>
    expect(page.locator(".studio-status")).toContainText("Ready", {
      timeout: 30000,
    });
  await ready();
  expect(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))).toBe(
    false,
  );
  const neural = page.getByRole("checkbox", {
    name: "Enable neural rendering",
  });
  await expect(neural).toBeDisabled();
  await expect(neural).not.toBeChecked();
  checks.push(
    "Browser preview has no native bridge and neural rendering is disabled",
  );
  await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();

  const contrast = page.getByRole("slider", { name: "Contrast", exact: true });
  const contrastValue = page.getByLabel("Contrast value", { exact: true });
  await contrastValue.fill("-12");
  await contrastValue.press("Enter");
  await expect(contrast).toHaveValue("-12");
  await contrastValue.dblclick();
  await expect(contrast).toHaveValue("-12");
  await contrastValue.fill("101");
  await contrastValue.press("Enter");
  await expect(contrast).toHaveValue("100");
  await contrastValue.fill("");
  await contrastValue.press("Escape");
  await expect(contrastValue).toHaveValue("100");
  const contrastCard = page
    .locator(".classic-control")
    .filter({ has: contrast });
  await contrastCard.locator("label").dblclick();
  await expect(contrast).toHaveValue("0");
  await contrast.focus();
  await page.keyboard.press("ArrowRight");
  await expect(contrast).toHaveValue("1");
  await page.keyboard.press("Shift+ArrowRight");
  expect(Number(await contrast.inputValue())).toBeCloseTo(1.1, 4);
  await page.keyboard.press("Home");
  await expect(contrast).toHaveValue("-100");
  await page.keyboard.press("End");
  await expect(contrast).toHaveValue("100");
  await page.keyboard.press("Tab");
  await expect(contrast).not.toBeFocused();
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await contrastCard.click({ button: "right" });
  await expect(contrast).toHaveValue("0");
  checks.push(
    "Signed numeric edits, clamp, draft cancel, numeric text selection, double-click/context reset, arrow/fine/Home/End keys and normal Tab navigation",
  );

  await page.locator(".viewport").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".viewport")).not.toBeFocused();
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await page.locator(".viewport").focus();
  await page
    .locator(".viewport")
    .dispatchEvent("keydown", { key: "p", ctrlKey: true });
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await page.keyboard.press("p");
  await expect(page.locator(".studio")).toHaveClass(/presentation/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  checks.push(
    "Viewport Tab exits normally; Ctrl+P leaves presentation unchanged; P enters presentation and Escape restores the UI",
  );

  const snapshot = page.locator(".shelf-actions").getByRole("button", {
    name: "Create snapshot",
    exact: true,
  });
  const savePreset = page.locator(".shelf-actions").getByRole("button", {
    name: "Save preset",
    exact: true,
  });
  await expect(snapshot).toContainText(/snapshot/i);
  await expect(savePreset).toContainText(/preset/i);
  await page
    .getByLabel("Variant name", { exact: true })
    .fill("Review snapshot");
  await contrast.fill("12");
  await ready();
  await snapshot.click();
  await expect(page.locator(".variant-strip .variant")).toHaveCount(1);
  const savedSnapshot = page.locator(".variant-strip .variant").first();
  await expect(savedSnapshot).toContainText("Review snapshot");
  await contrast.fill("40");
  await ready();
  await savedSnapshot.locator("button").first().click();
  await expect(contrast).toHaveValue("12");
  await ready();
  const deleteSnapshot = savedSnapshot.getByRole("button", {
    name: /Delete.*Review snapshot/i,
  });
  await deleteSnapshot.click();
  await expect(page.locator(".variant-strip .variant")).toHaveCount(0);
  await snapshot.focus();
  await page.keyboard.press("Tab");
  await expect(savePreset).toBeFocused();
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await page.getByLabel("Variant name", { exact: true }).fill("Review preset");
  await savePreset.click();
  await expect(page.locator(".shelf-tabs .active")).toHaveText("Presets");
  await expect(
    page
      .locator(".variant-strip .variant")
      .filter({ hasText: "Review preset" }),
  ).toHaveCount(1);
  const persistedPresets = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("studio-presets-v1") || "[]"),
  );
  expect(
    persistedPresets.some((preset) => preset.name === "Review preset"),
  ).toBe(true);
  checks.push(
    "Visible snapshot/preset actions; named snapshot capture, restore and delete; preset feedback and local persistence",
  );

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.focus();
  await page.keyboard.press("Space");
  const dialog = page.getByRole("dialog", { name: "Studio Settings" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close settings" }),
  ).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await dialog.locator("select").focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await settings.click();
  await dialog.getByRole("button", { name: "Close settings" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  checks.push(
    "Space activates Settings; modal autofocus, trapped Tab navigation, Escape from select, close and focus return",
  );

  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await page
    .locator(".shelf-tabs")
    .getByRole("button", { name: "Snapshots", exact: true })
    .click();
  await page.getByLabel("Variant name", { exact: true }).fill("");
  await page
    .getByRole("heading", { name: "DLSS Image Studio", exact: true })
    .click();
  await ready();
  for (const [width, height, name] of [
    [1536, 1024, "desktop"],
    [1080, 840, "compact"],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".main-image")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    ).toBe(false);
    const titlebar = await page.locator(".titlebar").boundingBox();
    for (const action of await page.locator(".titlebar .title-action").all()) {
      const actionBounds = await action.boundingBox();
      const labelBounds = await action.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect();
        return { y: bounds.y, height: bounds.height };
      });
      expect(labelBounds.y).toBeGreaterThanOrEqual(actionBounds.y - 1);
      expect(labelBounds.y + labelBounds.height).toBeLessThanOrEqual(
        actionBounds.y + actionBounds.height + 1,
      );
      expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
        titlebar.y + titlebar.height + 1,
      );
    }
    const rail = await page.locator(".nav-rail").boundingBox();
    for (const action of await page.locator(".nav-rail button").all()) {
      const actionBounds = await action.boundingBox();
      expect(actionBounds.x).toBeGreaterThanOrEqual(rail.x - 1);
      expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
        rail.x + rail.width + 1,
      );
    }
    const inspector = await page.locator(".inspector-content").boundingBox();
    const cards = await page
      .locator(".classic-color-grid .classic-control")
      .all();
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      const bounds = await card.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(inspector.x - 1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        inspector.x + inspector.width + 1,
      );
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        inspector.y + inspector.height + 1,
      );
    }
    const neuralBounds = await page
      .locator(".neural-adjustments")
      .boundingBox();
    const shelfBounds = await page.locator(".variant-shelf").boundingBox();
    expect(shelfBounds.y).toBeGreaterThanOrEqual(
      neuralBounds.y + neuralBounds.height - 1,
    );
    for (const action of [snapshot, savePreset]) {
      expect(
        await action.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const target = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
          return Boolean(target && element.contains(target));
        }),
      ).toBe(true);
    }
    const screenshot = resolve(evidenceDir, `after-${name}.png`);
    await page.screenshot({ path: screenshot });
    report.screenshots.push(screenshot);
    checks.push(
      `${width} × ${height}: no page overflow, title labels/navigation contained, all six color controls fit, shelf below neural controls, actions unobstructed`,
    );
  }
  expect(errors).toEqual([]);
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(evidenceDir, "ui-polish-validation.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}

import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkInspectorSelection } from "./inspector-selection-check.mjs";

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
  await ready();
  await expect(snapshot).toBeEnabled({ timeout: 30000 });
  await expect(snapshot).toHaveAttribute("title", "Create snapshot");
  await expect(snapshot.locator("svg")).toBeVisible();
  await expect(snapshot).toHaveText("");
  const snapshotSize = await snapshot.boundingBox();
  expect(
    Math.abs(snapshotSize.width - snapshotSize.height),
  ).toBeLessThanOrEqual(1);
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
    "Square camera snapshot action has title and accessible label; named capture, restore and delete; visible preset action, feedback and local persistence",
  );

  const inspectorTabs = page.getByRole("tablist", {
    name: "Inspector sections",
    exact: true,
  });
  const workspacePeer = inspectorTabs.getByRole("tab", {
    name: "Workspace",
    exact: true,
  });
  const workspaceTabs = page.getByRole("tablist", {
    name: "Workspace sections",
    exact: true,
  });
  const panelNames = ["Masks", "Passes", "Presets", "Batch"];
  const workspaceTab = (name) =>
    workspaceTabs.getByRole("tab", { name, exact: true });
  await expect(inspectorTabs.getByRole("tab")).toHaveText([
    "Adjust",
    "Refine",
    "Effects",
    "Workspace",
    "Tools",
    "Export",
  ]);
  for (const method of ["click", "Enter", "Space"]) {
    await inspectorTabs
      .getByRole("tab", { name: "Adjust", exact: true })
      .click();
    await workspacePeer.focus();
    if (method === "click") await workspacePeer.click();
    else await workspacePeer.press(method);
    await expect(workspacePeer).toHaveAttribute("aria-selected", "true");
    await expect(workspaceTabs).toBeVisible();
    await expect(workspaceTabs.getByRole("tab")).toHaveText(panelNames);
    for (const name of panelNames)
      await expect(workspaceTab(name)).toBeVisible();
  }
  await workspacePeer.press("Tab");
  await expect(workspaceTab("Masks")).toBeFocused();
  for (const name of ["Passes", "Presets", "Batch", "Masks"]) {
    await page.keyboard.press("ArrowRight");
    await expect(workspaceTab(name)).toBeFocused();
    await expect(workspaceTab(name)).toHaveAttribute("aria-selected", "true");
  }
  await page.keyboard.press("ArrowLeft");
  await expect(workspaceTab("Batch")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(workspaceTab("Masks")).toBeFocused();
  await page.keyboard.press("End");
  await expect(workspaceTab("Batch")).toBeFocused();
  await workspacePeer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    inspectorTabs.getByRole("tab", { name: "Tools", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(workspacePeer).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    inspectorTabs.getByRole("tab", { name: "Adjust", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    inspectorTabs.getByRole("tab", { name: "Export", exact: true }),
  ).toBeFocused();
  await workspacePeer.click();
  checks.push(
    "Workspace is a peer inspector tab; four visible sub-tabs remain available, Enter/Space activate, native Tab enters the selected child, arrows wrap and activate, and Home/End work at both tab levels",
  );

  for (const name of panelNames) {
    await workspaceTab(name).click();
    await expect(workspaceTab(name)).toHaveAttribute("aria-selected", "true");
    const heading = {
      Masks: "Masks",
      Passes: "Render Passes",
      Presets: "Preset Library",
      Batch: "Batch",
    }[name];
    await expect(
      page
        .locator(".inspector-content")
        .getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    if (name === "Masks") {
      await page.getByLabel("Add mask").selectOption("ellipse");
      await page
        .getByRole("slider", { name: "Feather", exact: true })
        .fill("23");
      await expect(
        page.getByRole("slider", { name: "Feather", exact: true }),
      ).toHaveValue("23");
      await ready();
    } else if (name === "Passes") {
      await page.locator("#pass-name").selectOption("Depth");
      await expect(page.getByLabel("Display pass")).toHaveValue("");
      await expect(
        page.getByRole("button", { name: "Import pass", exact: true }),
      ).toBeDisabled();
    } else if (name === "Presets") {
      await expect(page.getByLabel("Preset name", { exact: true })).toHaveValue(
        "Review preset",
      );
      await page
        .getByLabel("Preset name", { exact: true })
        .fill("Review preset renamed");
      await expect(page.locator(".shelf-tabs .active")).toHaveText("Presets");
    } else {
      await expect(
        page.getByRole("button", { name: "Add renders", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Process all", exact: true }),
      ).toBeDisabled();
    }
  }
  await inspectorTabs.getByRole("tab", { name: "Adjust", exact: true }).click();
  checks.push(
    "All four Workspace sections activate the correct panel and selected state; mask edits, pass choices, preset rename and browser-safe batch controls work",
  );

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.focus();
  await page.keyboard.press("Space");
  const dialog = page.getByRole("dialog", { name: "Studio Settings" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close settings" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Close settings" }),
  ).not.toBeFocused();
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
    const inspectorTabBounds = await inspectorTabs.boundingBox();
    for (const action of await inspectorTabs.getByRole("tab").all()) {
      const bounds = await action.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(inspectorTabBounds.x - 1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        inspectorTabBounds.x + inspectorTabBounds.width + 1,
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
    await workspacePeer.click();
    await expect(workspaceTabs).toBeVisible();
    const subtabBounds = await workspaceTabs.boundingBox();
    expect(subtabBounds.x).toBeGreaterThanOrEqual(0);
    expect(subtabBounds.x + subtabBounds.width).toBeLessThanOrEqual(width);
    for (const item of await workspaceTabs.getByRole("tab").all()) {
      expect(
        await item.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const target = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
          return Boolean(target && element.contains(target));
        }),
      ).toBe(true);
    }
    await inspectorTabs
      .getByRole("tab", { name: "Adjust", exact: true })
      .click();
    await settings.click();
    await expect(dialog).toBeVisible();
    const settingsBounds = await dialog.boundingBox();
    expect(settingsBounds.x).toBeGreaterThanOrEqual(0);
    expect(settingsBounds.y).toBeGreaterThanOrEqual(0);
    expect(settingsBounds.x + settingsBounds.width).toBeLessThanOrEqual(width);
    expect(settingsBounds.y + settingsBounds.height).toBeLessThanOrEqual(
      height,
    );
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(settings).toBeFocused();
    await page
      .getByRole("heading", { name: "DLSS Image Studio", exact: true })
      .click();
    const screenshot = resolve(evidenceDir, `corrected-${name}.png`);
    await page.screenshot({ path: screenshot });
    report.screenshots.push(screenshot);
    checks.push(
      `${width} × ${height}: no page overflow, title labels/peer tabs/sub-tabs/Settings contained, all six color controls fit, shelf below neural controls, actions unobstructed`,
    );
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  await workspacePeer.click();
  await workspaceTab("Masks").click();
  const workspaceScreenshot = resolve(evidenceDir, "corrected-workspace.png");
  await page.screenshot({ path: workspaceScreenshot });
  report.screenshots.push(workspaceScreenshot);
  await inspectorTabs.getByRole("tab", { name: "Adjust", exact: true }).click();
  const selectionResult = await checkInspectorSelection(page, evidenceDir);
  checks.push(...selectionResult.checks);
  report.selection = selectionResult.measurements;
  report.screenshots.push(selectionResult.screenshot);
  await settings.click();
  await expect(dialog).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(1536);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(1024);
  const settingsScreenshot = resolve(evidenceDir, "corrected-settings.png");
  await page.screenshot({ path: settingsScreenshot });
  report.screenshots.push(settingsScreenshot);
  await page.keyboard.press("Escape");
  checks.push(
    "Workspace sub-tabs and Settings dialog stay within desktop bounds",
  );
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
    resolve(evidenceDir, "corrected-validation.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}

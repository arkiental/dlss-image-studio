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

  const panels = page.getByRole("button", {
    name: "Workspace panels",
    exact: true,
  });
  const panelMenu = page.getByRole("menu", { name: "Workspace panels" });
  const panelNames = ["Masks", "Passes", "Presets", "Batch"];
  const menuItem = (name) =>
    panelMenu.getByRole("menuitemradio", { name, exact: true });
  await expect(panels).toHaveText(/Panels/);
  await expect(panels).toHaveAttribute("aria-haspopup", "menu");
  for (const method of ["click", "Enter", "Space", "ArrowDown"]) {
    await panels.focus();
    if (method === "click") await panels.click();
    else await panels.press(method);
    await expect(panelMenu).toBeVisible();
    await expect(panels).toHaveAttribute("aria-expanded", "true");
    await expect(panelMenu.getByRole("menuitemradio")).toHaveCount(4);
    await expect(menuItem("Masks")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panelMenu).toHaveCount(0);
    await expect(panels).toBeFocused();
    await expect(panels).toHaveAttribute("aria-expanded", "false");
  }
  await panels.press("ArrowDown");
  for (const name of ["Passes", "Presets", "Batch", "Masks"]) {
    await page.keyboard.press("ArrowDown");
    await expect(menuItem(name)).toBeFocused();
  }
  await page.keyboard.press("ArrowUp");
  await expect(menuItem("Batch")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menuItem("Masks")).toBeFocused();
  await page.keyboard.press("End");
  await expect(menuItem("Batch")).toBeFocused();
  await page.keyboard.press("p");
  await expect(panelMenu).toBeVisible();
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await page.keyboard.press("Escape");
  await panels.click();
  await panels.click();
  await expect(panelMenu).toHaveCount(0);
  await expect(panels).toBeFocused();
  await panels.click();
  await contrastValue.click();
  await expect(panelMenu).toHaveCount(0);
  await expect(contrastValue).toBeFocused();
  await panels.click();
  await page.keyboard.press("Tab");
  await expect(panelMenu).toHaveCount(0);
  await expect(panels).not.toBeFocused();
  await expect(page.locator(".studio")).not.toHaveClass(/presentation/);
  await panels.click();
  await page.keyboard.press("Shift+Tab");
  await expect(panelMenu).toHaveCount(0);
  await expect(panels).toBeFocused();
  checks.push(
    "Panels menu opens by mouse/Enter/Space/ArrowDown; roving arrows wrap, Home/End, Escape returns focus, trigger toggles closed, global shortcuts stay idle, outside click retains target focus and Tab/Shift+Tab dismiss normally",
  );

  for (const [index, name] of panelNames.entries()) {
    await panels.click();
    await page.keyboard.press("Home");
    for (let step = 0; step < index; step++)
      await page.keyboard.press("ArrowDown");
    await expect(menuItem(name)).toBeFocused();
    if (name === "Presets") await menuItem(name).click();
    else await page.keyboard.press(name === "Passes" ? "Space" : "Enter");
    await expect(panelMenu).toHaveCount(0);
    await expect(panels).toBeFocused();
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
    await panels.click();
    await expect(menuItem(name)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
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
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  checks.push(
    "All four Panels selections activate the correct workspace and checked state; mask edits, pass choices, preset rename and browser-safe batch controls work",
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
    await panels.click();
    await expect(panelMenu).toBeVisible();
    const menuBounds = await panelMenu.boundingBox();
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(height);
    for (const item of await panelMenu.getByRole("menuitemradio").all()) {
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
    await page.keyboard.press("Escape");
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
    const screenshot = resolve(evidenceDir, `revision-${name}.png`);
    await page.screenshot({ path: screenshot });
    report.screenshots.push(screenshot);
    checks.push(
      `${width} × ${height}: no page overflow, title labels/navigation/menu/Settings contained, all six color controls fit, shelf below neural controls, actions unobstructed`,
    );
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  await panels.click();
  await expect(panelMenu).toBeVisible();
  const menuBounds = await panelMenu.boundingBox();
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(1536);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(1024);
  const menuScreenshot = resolve(evidenceDir, "revision-menu.png");
  await page.screenshot({ path: menuScreenshot });
  report.screenshots.push(menuScreenshot);
  await page.keyboard.press("Escape");
  await settings.click();
  await expect(dialog).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(1536);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(1024);
  const settingsScreenshot = resolve(evidenceDir, "revision-settings.png");
  await page.screenshot({ path: settingsScreenshot });
  report.screenshots.push(settingsScreenshot);
  await page.keyboard.press("Escape");
  checks.push(
    "Expanded Panels menu and Settings dialog stay within desktop bounds",
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
    resolve(evidenceDir, "revision-validation.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}

import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const studioUrl = new URL(process.env.STUDIO_URL || "http://127.0.0.1:1420");
studioUrl.searchParams.set("demo", "1");
const evidenceDir = resolve(process.env.EVIDENCE_DIR || "docs/screenshots");
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(studioUrl.href);
await expect(page.locator(".main-image")).toBeVisible();
await page.waitForFunction(() =>
  document.querySelector(".studio-status")?.textContent?.includes("Ready"),
);
await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
await page
  .getByRole("button", { name: "Create snapshot", exact: true })
  .first()
  .click();
await expect(page.locator(".classic-color-grid .classic-control")).toHaveCount(
  6,
);
const neuralBounds = await page.locator(".neural-adjustments").boundingBox();
const snapshotBounds = await page.locator(".variant-shelf").boundingBox();
if (snapshotBounds.y < neuralBounds.y + neuralBounds.height)
  throw Error("Snapshots no longer sit below neural adjustments");
await page.screenshot({
  path: resolve(evidenceDir, "studio-professional.png"),
});
await page.getByRole("button", { name: "Refine", exact: true }).click();
await page.getByRole("button", { name: "Tone", exact: true }).click();
await page.getByRole("slider", { name: "Exposure", exact: true }).fill("1");
await page.waitForFunction(() =>
  document.querySelector(".studio-status")?.textContent?.includes("Ready"),
);
await page.getByLabel("Before/After mode").selectOption("vertical");
await page.screenshot({ path: resolve(evidenceDir, "studio-comparison.png") });
await page.setViewportSize({ width: 1080, height: 840 });
await page.getByRole("button", { name: "Adjust", exact: true }).click();
const panelBounds = await page.locator(".inspector-content").boundingBox();
const lastCardBounds = await page
  .locator(".classic-color-grid .classic-control")
  .last()
  .boundingBox();
if (
  lastCardBounds.y + lastCardBounds.height >
  panelBounds.y + panelBounds.height
)
  throw Error("Compact layout clips the color slider cards");
await page.screenshot({ path: resolve(evidenceDir, "studio-compact.png") });
await page.setViewportSize({ width: 1536, height: 1024 });
await page.getByLabel("Before/After mode").selectOption("processed");
await page.getByRole("button", { name: "Masks", exact: true }).click();
await page.getByLabel("Add mask").selectOption("ellipse");
await page.getByRole("slider", { name: "Feather", exact: true }).fill("35");
await page.waitForFunction(() =>
  document.querySelector(".studio-status")?.textContent?.includes("Ready"),
);
await page.waitForTimeout(150);
await page.screenshot({ path: resolve(evidenceDir, "studio-masks.png") });
await page.getByRole("button", { name: "Effects", exact: true }).click();
await page.getByRole("slider", { name: "Vignette", exact: true }).fill("12");
await page
  .getByRole("button", { name: "Create snapshot", exact: true })
  .first()
  .click();
await expect(page.locator(".variant-strip .variant")).toHaveCount(2);
await page.getByRole("button", { name: "Export", exact: true }).first().click();
await expect(page.getByLabel("Output size")).toHaveValue("original");
await page.getByLabel("Output format").selectOption("exr");
await expect(page.getByLabel("Output bit depth")).toHaveValue("32");
await expect(page.getByLabel("Output color space")).toHaveValue("linear");
if (errors.length) throw Error(errors.join("\n"));
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Horizontal layout overflow");
console.log(
  JSON.stringify({
    errors,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  }),
);
await browser.close();

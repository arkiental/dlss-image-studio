import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1536, height: 1024 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:1420");
await page.waitForFunction(
  () => document.querySelector(".main-image")?.width > 1000,
);
await page.waitForTimeout(1500);
fs.mkdirSync("docs/screenshots", { recursive: true });
fs.mkdirSync("test-results", { recursive: true });
await page.screenshot({ path: "docs/screenshots/studio-1536.png" });
await page.getByRole("slider", { name: "Contrast", exact: true }).fill("35");
await page.waitForTimeout(500);
if (
  (await page
    .getByRole("spinbutton", { name: "Contrast value", exact: true })
    .inputValue()) !== "35"
)
  throw Error("Slider value failed");
await page.getByRole("button", { name: "Settings", exact: true }).click();
await page
  .getByRole("combobox", { name: "Color preset" })
  .selectOption("natural");
if (
  (await page
    .getByRole("spinbutton", { name: "Vibrance value", exact: true })
    .inputValue()) !== "14"
)
  throw Error("Preset failed");
await page
  .getByRole("combobox", { name: "Color preset" })
  .selectOption("neutral");
await page.getByRole("button", { name: "Close settings", exact: true }).click();
const settled = () =>
  page
    .getByRole("button", { name: "Export to File", exact: true })
    .waitFor({ state: "visible" })
    .then(() =>
      page.waitForFunction(
        () =>
          !document.querySelector(".export-buttons button:nth-child(2)")
            .disabled,
      ),
    );
const pixels = () =>
  page.locator(".main-image").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    return {
      corner: Array.from(d.slice(0, 4)),
      center: Array.from(
        d.slice(
          (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4,
          (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4 +
            4,
        ),
      ),
    };
  });
await settled();
if (
  !(await page
    .getByRole("slider", { name: "Local tone", exact: true })
    .isDisabled())
)
  throw Error("Browser neural controls must be disabled");
await page.getByRole("button", { name: "Settings", exact: true }).click();
if (
  !(await page
    .getByRole("checkbox", { name: "Enable neural rendering" })
    .isDisabled())
)
  throw Error("Browser must not pretend to support neural rendering");
await page.screenshot({ path: "docs/screenshots/settings.png" });
await page.getByRole("button", { name: "Close settings", exact: true }).click();
const region = page.getByRole("slider", { name: "Zoom inspection region" });
const before = await region.boundingBox();
await region.focus();
await page.keyboard.press("ArrowRight");
const after = await region.boundingBox();
if (!before || !after || after.x <= before.x)
  throw Error("Region transform failed");
await page.getByRole("button", { name: "Close zoom", exact: true }).click();
await page.keyboard.press("z");
if (!(await page.locator(".zoom-panel").isVisible()))
  throw Error("Zoom restore failed");
await page.screenshot({ path: "docs/screenshots/studio-tested.png" });
await page.getByRole("slider", { name: "Brightness", exact: true }).fill("20");
await settled();
const adjustedBeforeReload = await page
  .locator(".main-image")
  .evaluate((c) => c.toDataURL());
await page.locator('input[type="file"]').setInputFiles("public/sample-car.png");
await settled();
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Export to File", exact: true }).click();
const download = await downloadPromise;
await download.saveAs("test-results/browser-export.png");
if (
  (await page.locator(".main-image").evaluate((c) => c.toDataURL())) !==
  adjustedBeforeReload
)
  throw Error("Reload did not apply current adjustments");
const exported = fs
  .readFileSync("test-results/browser-export.png")
  .toString("base64");
const matches = await page.evaluate(async (b64) => {
  const blob = await (await fetch("data:image/png;base64," + b64)).blob();
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  c.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  return c.toDataURL() === document.querySelector(".main-image").toDataURL();
}, exported);
if (!matches) throw Error("Export pixels differ from adjusted preview");
await page.getByRole("button", { name: "Reset", exact: true }).click();
await settled();

if (download.suggestedFilename() !== "sample-car-neutral.png")
  throw Error("Export filename mismatch");
for (const scale of [1.25, 1.5, 2]) {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
    deviceScaleFactor: scale,
  });
  const dpiPage = await context.newPage();
  await dpiPage.goto("http://127.0.0.1:1420");
  await dpiPage.waitForFunction(
    () => document.querySelector(".main-image")?.width > 1000,
  );
  await dpiPage.waitForTimeout(500);
  const width = await dpiPage
    .locator(".right-panel")
    .evaluate((e) => e.getBoundingClientRect().width);
  if (width !== 457) throw Error(`DPI layout drift at ${scale}`);
  await dpiPage.screenshot({ path: `test-results/dpi-${scale}.png` });
  await context.close();
}
await page.setViewportSize({ width: 1080, height: 840 });
await page.waitForTimeout(500);
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Minimum window overflow");
const saturationBounds = await page
  .getByRole("slider", { name: "Saturation", exact: true })
  .boundingBox();
const exportBounds = await page.locator(".export").boundingBox();
if (
  !saturationBounds ||
  !exportBounds ||
  saturationBounds.y + saturationBounds.height > exportBounds.y
)
  throw Error("Control/export overlap");
await page.screenshot({ path: "docs/screenshots/studio-minimum.png" });
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log("UI functional checks passed");

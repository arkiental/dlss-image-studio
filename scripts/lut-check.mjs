import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
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
const page = await browser.newPage({
  viewport: { width: 1536, height: 1024 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(studioUrl.href);
const ready = async () => {
  await expect(page.getByText("Loading LUT�", { exact: true })).toHaveCount(0);
  // Hosted Windows runners use the CPU browser fallback, including after reload.
  await expect(page.locator(".studio-status")).toContainText("Preview ready", {
    timeout: 30000,
  });
};
await ready();
await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
const pixels = () =>
  page
    .locator(".main-image")
    .evaluate(async (c) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        ),
      ).join(","),
    );
const original = await pixels();
await page.getByRole("tab", { name: "Refine", exact: true }).click();
await page.getByRole("button", { name: "LUTs", exact: true }).click();
await expect(
  page.getByLabel("LUT preset").locator("optgroup option"),
).toHaveCount(50);
await page.getByLabel("LUT preset").selectOption({ label: "Amber Haze" });
await expect(page.getByLabel("Enable LUT"))
  .toBeChecked()
  .catch(async (e) => {
    console.log(await page.getByRole("alert").allTextContents());
    throw e;
  });
await ready();
const graded = await pixels();
if (graded === original) throw Error("LUT did not affect image");
await page.getByRole("slider", { name: "LUT strength", exact: true }).fill("0");
await ready();
expect(await pixels()).toEqual(original);
await page
  .getByRole("slider", { name: "LUT strength", exact: true })
  .fill("100");
await ready();
expect(await pixels()).toEqual(graded);
await page.getByLabel("Enable LUT").uncheck();
await ready();
expect(await pixels()).toEqual(original);
await page.getByLabel("Enable LUT").check();
await ready();
const fixture = JSON.parse(
  readFileSync("tests/fixtures/lut-conformance.json", "utf8"),
);
await page.getByLabel("Import CUBE LUT").setInputFiles({
  name: "Channel Grade.cube",
  mimeType: "text/plain",
  buffer: Buffer.from(fixture.cube),
});
await expect(
  page.getByLabel("LUT preset").locator("option:checked"),
).toHaveText("Channel Grade");
await ready();
const custom = await pixels();
await page.getByLabel("Import CUBE LUT").setInputFiles({
  name: "Broken.cube",
  mimeType: "text/plain",
  buffer: Buffer.from("LUT_3D_SIZE 2\n0 0 0"),
});
await expect(page.getByRole("alert")).toContainText("row count");
await expect(
  page.getByLabel("LUT preset").locator("option:checked"),
).toHaveText("Channel Grade");
expect(await pixels()).toEqual(custom);
await page.getByRole("button", { name: "Dismiss", exact: true }).click();
await page
  .getByRole("button", { name: "Create snapshot", exact: true })
  .first()
  .click();
await page.getByLabel("LUT preset").selectOption({ label: "Classic Film" });
await ready();
await page.locator(".variant-strip .variant>button").first().click();
await ready();
expect(await pixels()).toEqual(custom);
// PNG export must use exactly the processed browser frame, at the source dimensions.
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Export to File", exact: true }).click();
const file = await download;
const decoded = await page.evaluate(
  async (data) => {
    const im = new Image();
    im.src = data;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    c.getContext("2d").drawImage(im, 0, 0);
    return {
      width: c.width,
      height: c.height,
      hash: Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        ),
      ).join(","),
    };
  },
  "data:image/png;base64," + readFileSync(await file.path()).toString("base64"),
);
expect([decoded.width, decoded.height]).toEqual([1560, 1008]);
expect(decoded.hash).toEqual(custom);
await page.getByLabel("LUT preset").selectOption({ label: "Amber Haze" });
await ready();
await page
  .getByRole("slider", { name: "LUT strength", exact: true })
  .fill("65");
await ready();
await page.getByLabel("Comparison layout").selectOption("vertical");
await page.screenshot({ path: resolve(evidenceDir, "studio-luts.png") });
// Imported LUTs persist across application reloads. Embedded assets restore without the original file.
const portability = await page.evaluate(async () => {
  const library = await import("/src/lutLibrary.ts");
  const state = await import("/src/state.ts");
  const custom = (await library.importedLuts()).find(
    (v) => v.name === "Channel Grade",
  );
  const s = state.defaults();
  s.finish.lutId = custom.id;
  s.finish.lutEnabled = true;
  const assets = await library.collectLuts([s]);
  await new Promise((resolve, reject) => {
    const r = indexedDB.open("studio-luts-v1", 1);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(["assets", "catalog"], "readwrite");
      tx.objectStore("assets").delete(custom.id);
      tx.objectStore("catalog").delete(custom.id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = reject;
    };
    r.onerror = reject;
  });
  await library.restoreLuts(JSON.parse(JSON.stringify(assets)));
  return {
    count: assets.length,
    id: assets[0].id,
    restored: (await library.importedLuts()).some((v) => v.id === custom.id),
  };
});
expect(portability.count).toBe(1);
expect(portability.restored).toBe(true);
await page.reload();
await ready();
await page.getByRole("tab", { name: "Refine", exact: true }).click();
if (
  (await page
    .getByRole("button", { name: "LUTs", exact: true })
    .getAttribute("aria-expanded")) !== "true"
)
  await page.getByRole("button", { name: "LUTs", exact: true }).click();
await page.getByLabel("LUT preset").selectOption({ label: "Channel Grade" });
await ready();
expect(await pixels()).toEqual(custom);
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Passed LUT UI: 50 bundled looks, image changes, strength/bypass, custom import, malformed-file recovery, snapshots, exact PNG export pixels/dimensions, persistent library and portable assets.",
);
await browser.close();

// Synthetic Tauri transport tests exercise request ordering and desktop workflows.
// Pixel values are test markers, never evidence of neural image quality.
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const studioUrl = new URL(process.env.STUDIO_URL || "http://127.0.0.1:1420");
studioUrl.searchParams.set("demo", "1");
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.isTauri = true;
  window.requests = [];
  window.exports = [];
  window.saved = null;
  window.dialogPaths = [];
  let w = 1560,
    h = 1008,
    source = 0;
  const packed = (red, width = w, height = h) => {
    const b = new ArrayBuffer(8 + width * height * 4),
      v = new DataView(b);
    v.setUint32(0, width, true);
    v.setUint32(4, height, true);
    const p = new Uint8Array(b, 8);
    for (let i = 0; i < p.length; i += 4) {
      p[i] = red;
      p[i + 3] = 255;
    }
    return b;
  };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    transformCallback: () => 1,
    invoke: async (command, args, options) => {
      if (command === "capabilities")
        return {
          gpu: "SYNTHETIC TRANSPORT",
          runtime_ready: true,
          neural_rendering: "Synthetic transport",
        };
      if (command === "register_lut")
        return Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(args.text),
            ),
          ),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      if (command === "startup_file") return null;
      if (command === "recent_projects") return [];
      if (command === "plugin:dialog|open")
        return window.dialogPaths.shift() || null;
      if (command === "plugin:dialog|save") return "D:/tests/session.dlssproj";
      if (command === "write_project") {
        window.saved = JSON.parse(args.content);
        return;
      }
      if (command === "read_project") return JSON.stringify(window.saved);
      if (command === "load_source") {
        w = +options.headers["x-image-width"];
        h = +options.headers["x-image-height"];
        source = +options.headers["x-source-id"];
        return;
      }
      if (command === "open_render") {
        w = 1560;
        h = 1008;
        source = args.sourceId;
        return {
          width: w,
          height: h,
          bitDepth: window.sourceDepth || 8,
          neuralSupported: !window.sourceHdrRange,
          space: "srgb",
          hdr: false,
          passes: [],
          path: args.path,
          icc: false,
        };
      }
      if (command === "source_preview") return packed(45);
      if (command === "finish_preview") {
        window.requests.push(structuredClone(args));
        const tone = args.state.local.tone,
          captured = source;
        await new Promise((r) => setTimeout(r, tone === 1.2 ? 300 : 35));
        if (tone === 2) throw Error("Neural runtime unavailable (test)");
        if (captured !== source) throw Error("Superseded source");
        return packed(Math.round(tone * 100));
      }
      if (command === "export_finished" || command === "copy_finished") {
        window.exports.push(args);
        return;
      }
      if (command === "batch_render") {
        await new Promise((r) => setTimeout(r, 80));
        return;
      }
      if (command === "mask_overlay") return packed(0, 32, 32);
      return 1;
    },
  };
});
await page.goto(studioUrl.href);
const ready = () =>
  expect(page.locator(".studio-status")).toContainText("Ready");
await ready();
await expect(page.locator(".main-image")).toBeVisible();
const tone = page.getByRole("slider", { name: "Local tone", exact: true });
await tone.fill("1.2");
await page.waitForTimeout(130);
await tone.fill("1.5");
await ready();
await page.waitForTimeout(400);
const red = () =>
  page
    .locator(".main-image")
    .evaluate((c) => c.getContext("2d").getImageData(0, 0, 1, 1).data[0]);
if ((await red()) !== 150) throw Error("Stale frame replaced latest preview");
const zoom = await page
  .locator(".zoom-panel canvas")
  .evaluate(
    (c) =>
      c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data[0],
  );
if (zoom !== 150) throw Error("Inspector differs from processed result");
await page.getByRole("button", { name: "Natural", exact: true }).click();
await page.getByRole("slider", { name: "Resolution", exact: true }).fill("50");
await ready();
let latest = await page.evaluate(() => window.requests.at(-1));
if (
  latest.state.neural.style !== "Natural" ||
  latest.state.processingResolution !== 50
)
  throw Error("Neural mapping failed");
await tone.fill("2");
await expect(page.getByRole("alert")).toContainText(
  "Neural runtime unavailable",
);
await expect(page.locator(".classic-export button").nth(1)).toBeDisabled();
await page
  .getByRole("button", { name: "Reset neural adjustments", exact: true })
  .click();
await ready();
if ((await red()) !== 100) throw Error("Failed operation did not recover");
await page.getByRole("button", { name: "Dismiss", exact: true }).click();
for (const name of ["Local tone", "Resolution"]) {
  const slider = page.getByRole("slider", { name, exact: true }),
    b = await slider.boundingBox();
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2, { steps: 5 });
  await page.waitForTimeout(60);
  const a = +(await slider.inputValue());
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2, { steps: 8 });
  await page.waitForTimeout(60);
  const v = +(await slider.inputValue());
  await page.mouse.up();
  if (v <= a) throw Error(`${name} stopped during held drag`);
}
await ready();
await page.waitForTimeout(250);
const interactiveRequests = await page.evaluate(() => window.requests);
if (
  !interactiveRequests.some((r) => r.max === 640) ||
  interactiveRequests.at(-1).max !== 0
)
  throw Error(
    "Interactive preview did not refine to full resolution on release",
  );
await page.getByRole("button", { name: "Refine", exact: true }).click();
await page.getByRole("button", { name: "Tone", exact: true }).click();
const exposure = page.getByRole("slider", { name: "Exposure", exact: true });
await exposure.fill("1");
await ready();
await page.waitForTimeout(260);
await page.keyboard.press("Control+z");
await expect(exposure).toHaveValue("0");
await page.keyboard.press("Control+Shift+z");
await expect(exposure).toHaveValue("1");
await exposure.focus();
await page.keyboard.press("Shift+ArrowRight");
expect(+(await exposure.inputValue())).toBeCloseTo(1.005, 3);
await page
  .getByRole("heading", { name: "DLSS Image Studio", exact: true })
  .click();
await ready();
await page.waitForTimeout(130);
const count = await page.evaluate(() => window.requests.length);
await page.getByRole("slider", { name: "Image zoom", exact: true }).fill("3");
const enlarged = await page.locator(".image-space").boundingBox();
expect(enlarged.width).toBeCloseTo(4680, 0);
const vb = await page.locator(".viewport").boundingBox();
await page.mouse.move(vb.x + vb.width * 0.7, vb.y + vb.height * 0.6);
await page.mouse.down({ button: "middle" });
await page.mouse.move(vb.x + vb.width * 0.7 + 80, vb.y + vb.height * 0.6 + 40, {
  steps: 8,
});
await page.mouse.up({ button: "middle" });
const panned = await page.locator(".image-space").boundingBox();
if (panned.x < enlarged.x + 60) throw Error("Pan failed");
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.getByLabel("Before/After mode").selectOption("vertical");
await expect(page.locator(".before-image")).toBeVisible();
const line = await page.locator(".comparison-line").boundingBox();
await page.mouse.move(line.x + 2, line.y + 80);
await page.mouse.down();
await page.mouse.move(vb.x + vb.width * 0.7, line.y + 80, { steps: 6 });
await page.mouse.up();
await page.getByLabel("Before/After mode").selectOption("horizontal");
await expect(page.locator(".comparison-line.horizontal")).toBeVisible();
await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
await expect(page.locator(".zoom-panel")).toHaveCount(0);
await page.getByRole("checkbox", { name: "Show zoom inspector" }).check();
await page.getByRole("slider", { name: "Inspector zoom factor" }).fill("10");
await expect(page.locator(".zoom-header")).toContainText("10.0x");
const head = await page.locator(".zoom-header").boundingBox();
await page.mouse.move(head.x + 60, head.y + 15);
await page.mouse.down();
await page.mouse.move(1350, 450, { steps: 12 });
await page.mouse.up();
const detached = await page.locator(".zoom-panel").boundingBox();
if (detached.x + detached.width < vb.x + vb.width)
  throw Error("Inspector cannot leave viewport");
await page.waitForTimeout(150);
if ((await page.evaluate(() => window.requests.length)) !== count)
  throw Error("View-only changes invoked image processing");
await page.getByRole("checkbox", { name: "Show zoom inspector" }).uncheck();
// Source changes invalidate pending frames and exports.
await page.evaluate(() => window.dialogPaths.push("D:/renders/reloaded.png"));
await page.getByRole("button", { name: "Open Render", exact: true }).click();
await ready();
if (
  (await page
    .getByRole("button", { name: "Tone", exact: true })
    .getAttribute("aria-expanded")) !== "true"
)
  await page.getByRole("button", { name: "Tone", exact: true }).click();
await page.getByRole("slider", { name: "Exposure", exact: true }).fill("0.5");
await page.getByRole("button", { name: "LUTs", exact: true }).click();
await page.getByLabel("Import CUBE LUT").setInputFiles({
  name: "Project LUT.cube",
  mimeType: "text/plain",
  buffer: Buffer.from(
    JSON.parse(readFileSync("tests/fixtures/lut-conformance.json", "utf8"))
      .cube,
  ),
});
await expect(
  page.getByLabel("LUT preset").locator("option:checked"),
).toHaveText("Project LUT");

await ready();
await page.waitForTimeout(250);
await page
  .getByRole("button", { name: "Create snapshot", exact: true })
  .first()
  .click();
await page.getByRole("button", { name: "Save Project", exact: true }).click();
const saved = await page.evaluate(() => window.saved);
if (
  saved.sourcePath !== "D:/renders/reloaded.png" ||
  saved.state.finish.exposure !== 0.5 ||
  saved.snapshots.length !== 1 ||
  saved.luts.length !== 1 ||
  saved.state.finish.lutId !== saved.luts[0].id
)
  throw Error("Project save dropped session data");
await page.getByRole("slider", { name: "Exposure", exact: true }).fill("1.5");
await ready();
await page.getByRole("button", { name: "Tools", exact: true }).click();
if (
  (await page
    .getByRole("button", { name: "Project", exact: true })
    .getAttribute("aria-expanded")) !== "true"
)
  await page.getByRole("button", { name: "Project", exact: true }).click();
await page.evaluate(() => window.dialogPaths.push("D:/tests/session.dlssproj"));
await page.getByRole("button", { name: "Open Project", exact: true }).click();
await ready();
await page.getByRole("button", { name: "Refine", exact: true }).last().click();
if (
  (await page
    .getByRole("button", { name: "Tone", exact: true })
    .getAttribute("aria-expanded")) !== "true"
)
  await page.getByRole("button", { name: "Tone", exact: true }).click();
await expect(
  page.getByRole("slider", { name: "Exposure", exact: true }),
).toHaveValue("0.5");
await expect(
  page.getByLabel("LUT preset").locator("option:checked"),
).toHaveText("Project LUT");
const restoredRequest = await page.evaluate(() => window.requests.at(-1));
expect(restoredRequest.state.finish.lutId).toBe(saved.luts[0].id);
// Batch continues and retains queue after leaving its workspace.
await page.getByRole("button", { name: "Batch", exact: true }).click();
await page.evaluate(() => window.dialogPaths.push(["D:/a.png", "D:/b.png"]));
await page.getByRole("button", { name: "Add renders", exact: true }).click();
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.getByRole("button", { name: "Batch", exact: true }).click();
await expect(page.locator(".batch-list>div")).toHaveCount(2);
await page.evaluate(() => window.dialogPaths.push("D:/outputs"));
await page
  .getByRole("button", { name: "Choose output folder", exact: true })
  .click();
await page.getByRole("button", { name: "Process all", exact: true }).click();
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(250);
await page.getByRole("button", { name: "Batch", exact: true }).click();
await expect(page.getByText("2 / 2 complete")).toBeVisible();
await page.getByRole("button", { name: "Export", exact: true }).first().click();
await ready();
await page
  .getByRole("button", { name: "Copy to Clipboard", exact: true })
  .last()
  .click();
expect(await page.evaluate(() => window.exports.length)).toBe(1);
// High-bit-depth SDR sources must retain real neural controls on load/reload.
await page.evaluate(() => {
  window.sourceDepth = 16;
  window.dialogPaths.push("D:/renders/16-bit.png");
});
await page.getByRole("button", { name: "Open Render", exact: true }).click();
await ready();
await expect(
  page.getByRole("checkbox", { name: "Enable neural rendering" }),
).toBeEnabled();
await expect(
  page.getByRole("checkbox", { name: "Enable neural rendering" }),
).toBeChecked();
await page.getByRole("slider", { name: "Intensity", exact: true }).fill("1.7");
await ready();
expect(
  await page.evaluate(() => window.requests.at(-1).state.local.intensity),
).toBe(1.7);
await page.evaluate(() => {
  window.sourceHdrRange = true;
  window.dialogPaths.push("D:/renders/hdr.exr");
});
await page.getByRole("button", { name: "Open Render", exact: true }).click();
await ready();
await expect(page.getByText(/HDR source preserved/)).toHaveCount(0);
await expect(
  page.getByText("Neural input: tone-mapped SDR · 16-bit", { exact: true }),
).toBeVisible();
await expect(
  page.getByRole("checkbox", { name: "Enable neural rendering" }),
).toBeEnabled();
await expect(
  page.getByRole("checkbox", { name: "Enable neural rendering" }),
).toBeChecked();
expect(
  await page.evaluate(() => window.requests.at(-1).state.neural.toneMap),
).toBe(true);
await page.getByRole("button", { name: "Reset all", exact: true }).click();
await ready();
expect(
  await page.evaluate(() => window.requests.at(-1).state.neural.toneMap),
).toBe(true);
await page
  .getByRole("button", { name: "Use original HDR", exact: true })
  .click();
await ready();
expect(
  await page.evaluate(() => window.requests.at(-1).state.neural.enabled),
).toBe(false);
await expect(
  page.getByRole("checkbox", { name: "Enable neural rendering" }),
).toBeDisabled();
await page
  .getByRole("button", { name: "Tone-map for neural", exact: true })
  .click();
await ready();
expect(
  await page.evaluate(() => window.requests.at(-1).state.neural),
).toMatchObject({ enabled: true, toneMap: true });
// Importing SDR again clears the HDR working-copy mode.
await page.evaluate(() => {
  window.sourceHdrRange = false;
  window.dialogPaths.push("D:/renders/16-bit.png");
});
await page.getByRole("button", { name: "Open Render", exact: true }).click();
await ready();
expect(
  await page.evaluate(() => window.requests.at(-1).state.neural),
).toMatchObject({ enabled: true, toneMap: false });
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Passed synthetic transport: stale-frame rejection, matching inspector, mappings, errors/recovery, held sliders/fine keys, undo/redo, zoom/pan/split, floating inspector, view-only caching, source reload, project save/reopen, batch persistence and export readiness.",
);

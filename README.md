# DLSS Image Studio

A focused Windows render-finishing application: open a render, enhance, refine, compare, and export. Built with Tauri 2, React, TypeScript, Rust, and a D3D12 neural-provider bridge.

![Render-finishing workspace](docs/screenshots/studio-professional.png)

## Download and get started

**[Download Windows Setup or the portable ZIP](https://github.com/arkiental/dlss-image-studio/releases/latest)**

Setup installs Studio and WebView2. The app and 50 creative LUTs are included;
no developer tools are needed. **Neural enhancement requires a separately installed
Visual Enhancer v13.2 runtime. Its license does not allow us to bundle it without
written permission.** Conventional finishing works with Neural Adjustments off.

[Installation](docs/INSTALLATION.md) · [User guide](docs/USER_GUIDE.md) ·
[Troubleshooting](docs/TROUBLESHOOTING.md) · [Contributing](CONTRIBUTING.md) ·
[Changelog](CHANGELOG.md) · [Security](SECURITY.md)

Windows 11 x64 / D3D12. Neural verification used an RTX 4090; compatibility with
every RTX model is not established. Releases are currently unsigned.

## Version 0.2

- A compact, monochrome two-column studio: large viewport, icon-labeled slider cards, neural adjustments below the image, contextual advanced tabs, and snapshots/presets/history along the bottom.
- Wheel zoom, numerical zoom, Fit/Fill, pan, vertical/horizontal before-after splits, temporary original view, a floating 1–10× inspector, pixel grid, presentation mode and fullscreen.
- Existing **real neural rendering** and neural styles, intensity, tone, structure and evaluation resolution. Conventional processing stays separate.
- Scene-linear float finishing: exposure and tonal ranges, RGB/channel curves, white balance, three-way grading, denoise, sharpening, clarity, texture and broad local contrast.
- [LUT grading](docs/LUTS.md): 50 bundled MIT/CC0 creative looks, custom CUBE import, strength/bypass, HDR range handling, and portable project/preset assets. Open **Refine → LUTs**.
- Non-destructive shape, polygon, brush/eraser, gradient, color, luminance and data-pass masks; combine/subtract/intersect, feather, opacity, expand/contract, blur and editable dodge/burn.
- Flat multilayer EXR and individual data-pass import, pass inspection/remapping, depth-range selection, focus picking, depth-weighted blur and fog.
- Half/float EXR and 16-bit PNG/TIFF output. Tagged sRGB, Display P3, Rec.709 and linear exports; ACEScg EXR. Original dimensions remain the default.
- Project save/reopen, recoverable project backups, undo/redo, snapshots, preset libraries and a persistent-in-session batch queue.

This release implements the core finishing workspace, **not every item in the full professional-tools specification**. See the [implementation and limits matrix](docs/PROFESSIONAL_WORKSPACE.md).

## Neural runtime

Install the complete [Visual Enhancer v13.2 package](https://github.com/Merserk/dlss5-visual-enhancer/releases/tag/v13.2) separately, review its terms, and choose its folder in Studio Settings. No Neuroframe or NVIDIA runtime DLLs are bundled. See [integration details](DLSS_INTEGRATION.md).

Neural controls use the provider's supported 0–2 ranges, default 1. DLSS Detail 0–100 maps to intensity 0–2. Resolution controls evaluation size without forcing an output resize. Failed neural evaluation blocks export of the failed state; the app never substitutes an ordinary filter.

The provider accepts 8-bit and 16-bit display-referred RGBA. High-bit-depth SDR sources use a 16-bit sRGB neural transport and return directly to float finishing without the 8-bit color backend. Original float alpha and source data are retained. Fresh HDR/extended-gamut imports automatically use a 16-bit SDR working copy for neural evaluation. The input mode is shown below Neural Adjustments; highlights are compressed only in that copy. Saved projects retain their chosen input mode. **Use original HDR** returns to float editing with neural rendering off. The original source is never overwritten; neural output from the tone-mapped copy is SDR, not an unbounded HDR neural result.

## Quick use

1. Open or drop a render. EXR, PNG, TIFF, JPEG and WebP are supported.
2. Choose a style, refine Enhance/Tone/Color/Local, and compare with **B** or a split view.
3. Capture named snapshots. Open the Panels menu for Masks, Passes, Presets or Batch.
4. Export at original dimensions; use EXR to preserve HDR or 16-bit PNG/TIFF for an integer deliverable.

**Ctrl+O** open · **Ctrl+S** project · **Ctrl+Shift+S** Save As · **Ctrl+E** export · **Ctrl+Z / Ctrl+Shift+Z** undo/redo · **F** fit · **1** 100% · **B** before/after · hold **\** original · **Space+drag / middle drag** pan · **P** presentation · **F11** fullscreen · **M** masks · **Z** inspector. **Tab** moves keyboard focus between controls.

Sliders and numeric values support dragging, typing, keyboard arrows, Shift for fine movement, Ctrl/Cmd for finer movement, and double-click/right-click reset.

## Build and verification

See [BUILDING.md](BUILDING.md), the [professional-workspace verification](docs/PROFESSIONAL_VERIFICATION.md), and [earlier neural-runtime evidence](docs/NEURAL_VERIFICATION.md).

```powershell
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Browser development uses a separate worker for conventional finishing and UI checks. It cannot run the neural provider or native HDR/pass/project workflows. GitHub build success does not establish neural evaluation; that requires the separately installed runtime and physical compatible hardware.

Open-source dependency notices ship in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). Runtime components remain separately licensed. Independent application; not affiliated with NVIDIA or Merserk.

Studio's original code is [ISC licensed](LICENSE), matching its package metadata.
See [the release checklist](docs/RELEASING.md) for reproducible distribution.

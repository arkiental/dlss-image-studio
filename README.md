# DLSS Image Studio

A Windows desktop image editor built with Tauri 2, React, TypeScript, Rust, and a C++ D3D12 compute backend. The interface follows the supplied 1536 × 1024 reference.

**DLSS 5 Neural Rendering is not implemented or active in this release.** NVIDIA's public Streamline 2.14.1 package declares `kFeatureDLSS_NR`, but does not provide its plugin, parameter header, or integration guide. This application never labels its color processing as DLSS. See [the SDK investigation](DLSS_INTEGRATION.md).

![Studio](docs/screenshots/studio-1536.png)

## Features

- Frameless, draggable Windows title bar with working window controls.
- Ctrl+O, image drag-and-drop, and image paste through WebView2/browser clipboard events.
- Non-destructive global contrast, gamma, vibrance, brightness, saturation and hue adjustments.
- Cinematic, Neutral and Natural application presets.
- Draggable feathered local adjustment region; intensity, tone and local detail adjustment.
- Movable full-resolution zoom inspection, wheel magnification, and Z to hide/show.
- PNG, JPEG and TIFF exports at original dimensions, Windows image clipboard, and three-preset batch export.
- D3D12 adapter enumeration, NVIDIA preference, real compute shaders, fences and diagnostics.
- Optional signature-verified Streamline core initialization and `kFeatureDLSS_NR` support query.
- Native asynchronous processing with debounce and stale-request rejection.

## Build

Read [BUILDING.md](BUILDING.md) for prerequisites.

```powershell
npm ci
npm run tauri dev
```

```powershell
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/`; the portable executable is `src-tauri/target/release/dlss-image-studio.exe`.

## Structure

```text
.github/workflows/windows.yml  Windows tests, executable, MSI and NSIS builds
src/
  App.tsx                     UI and native command coordination
  state.ts                    Typed state, presets, geometry, naming
  style.css                   Reference-driven custom desktop styling
  processing.ts               Explicit browser-only CPU color preview
  worker.ts                   Browser preview worker
src-tauri/
  src/main.rs                 Validated commands, native serialization, export
  build.rs                    CMake/Rust linking
  capabilities/default.json   Narrow window/dialog permissions
  tauri.conf.json              Window, CSP and bundle configuration
native/dlss_backend/
  include/backend.h           Stable C ABI
  src/backend.cpp             DXGI, D3D12 and Streamline lifecycle
  src/color.hlsl              Application color/local compute shader
  tests/smoke.cpp             Real GPU identity/brightness/alpha/error test
third_party/streamline/        Official MIT-licensed integration headers
public/sample-car.png          Generated clean sample derived from the reference
scripts/visual-check.mjs       Browser interaction and screenshot verification
tests/state.test.ts            State, bounds, geometry, DPI and naming tests
docs/                         Screenshots, QA notes and asset provenance
```

## Behavior and limits

The resolution slider records a 1–100% neural processing request. Since NR is unavailable, it does not resample or otherwise change images. All current application adjustments and exports use source dimensions. The local rectangle is a feathered mask, never a crop. Tone and structure are application post-processing parameters, not NVIDIA parameters. Neutral defaults leave source pixels unchanged within 8-bit rounding; local structure is centered on the reference default of 0.80.

Input is decoded by WebView2 into sRGB, with browser EXIF orientation handling, then uploaded once per source. Shader math uses 32-bit floats, explicit sRGB transfer functions and alpha preservation. Final buffers/exports are 8-bit sRGB; HDR, 16-bit export, metadata round-tripping, and ICC-profile embedding are not implemented. JPEG drops alpha. Source limits are 64 megapixels and 16384 pixels per dimension; actual available GPU memory can impose lower limits.

Files are never overwritten. If an output already exists, select a new filename or folder. A failed batch may leave the presets completed before the error. Release binaries are unsigned by an application publisher; NVIDIA runtime signature verification is separate.

There is no telemetry, shell permission, network processing service, or automatic SDK download in the application. Logs are local at `%LOCALAPPDATA%/DLSS Image Studio/logs/studio.log`.

This is an independent application and is not affiliated with or endorsed by NVIDIA. DLSS and NVIDIA are their respective owner's trademarks.

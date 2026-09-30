# Building on Windows

## Prerequisites

- Windows 11 x64, Microsoft Edge WebView2 runtime.
- Node.js 22 LTS (or newer compatible release), npm.
- Rust stable MSVC x64; local verification used Rust 1.95.0. Use the lockfile rather than an older compiler with newly resolved dependencies.
- Visual Studio 2022 Build Tools, **Desktop development with C++** workload, MSVC v143, Windows 10/11 SDK, and C++ CMake tools for Windows.
- CMake 3.24 or later on PATH.
- D3D12-capable GPU to run the editor/native smoke test. NVIDIA adapters are preferred, but ordinary color adjustments do not require RTX hardware.

Run from a Developer PowerShell for VS 2022. A clean first build needs several GB for Rust dependencies and intermediates. Non-Debug native builds explicitly define `NDEBUG`: the Rust CMake integration can override the usual release compiler flags, otherwise accidentally enabling the D3D12 debug layer in release builds.

## Development

```powershell
npm ci
npm test
npm run tauri dev
```

Browser-only UI development: `npm run dev`. Browser processing is an explicitly separate worker implementation for UI testing; it is never described as native D3D12 or DLSS.

For an isolated UI review that does not initialize the native engine:

```powershell
npm run dev -- --host 127.0.0.1 --port 1426
```

In a second terminal, run the interaction and layout checks:

```powershell
$env:STUDIO_URL = 'http://127.0.0.1:1426'
node scripts/ui-polish-check.mjs
```

The check uses headless Edge and writes screenshots and a validation report to `../evidence` (`EVIDENCE_DIR` overrides the destination). Neural rendering stays disabled in this browser mode.

## Release executable and installers

```powershell
npm run tauri build
```

Outputs:

- `src-tauri/target/release/dlss-image-studio.exe`
- `src-tauri/target/release/bundle/nsis/DLSS Image Studio_0.2.1_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/DLSS Image Studio_0.2.1_x64_en-US.msi`

The Windows GitHub Actions workflow builds NSIS Setup and a portable ZIP with checksums. Pushing a version tag publishes the tested release assets. See docs/RELEASING.md. It does not run GPU tests on hosted runners without a suitable physical GPU. Download and run the native smoke test on the target machine.

## Native verification

```powershell
cmake -S native/dlss_backend -B native/build -A x64
cmake --build native/build --config Release
ctest --test-dir native/build -C Release --output-on-failure
cargo test --manifest-path src-tauri/Cargo.toml
```

The smoke test dispatches the actual D3D12 shader and checks neutral identity, brightness, alpha, and invalid-source rejection. An initialization failure is a failed test, not fake success.

## Optional Streamline core diagnostics

The application builds using the MIT-licensed NVIDIA headers included in `third_party/streamline/include`. No proprietary NVIDIA DLL is committed or bundled. See [DLSS_INTEGRATION.md](DLSS_INTEGRATION.md) before installing runtime files.

Obtain the official x64 package from [NVIDIA's Streamline 2.14.1 release](https://github.com/NVIDIA-RTX/Streamline/releases/tag/v2.14.1), review the included license, and place the signed production runtime under a `streamline` directory immediately beside the application executable. Core diagnostics use `sl.interposer.dll` and `sl.common.dll`. Do not copy development/debug DLLs into a shipping application.

No `PATH`, current-directory or user-configurable DLL search directory is used. The loader verifies NVIDIA's embedded signature and loads from that fixed executable-relative directory with Windows system-only dependency search. OTA/downloading flags are disabled. There is intentionally no `STREAMLINE_SDK_PATH` runtime override. Headers are pinned at build time. These optional core DLLs do not participate in the separately installed neural provider.

## Neural runtime verification

Install Visual Enhancer v13.2 separately and configure it as described in [DLSS_INTEGRATION.md](DLSS_INTEGRATION.md). The app's build and installer contain only our adapter, not the provider.

```powershell
$env:STUDIO_NEURAL_RUNTIME = 'D:\software\VisualEnhancer-v13.2'
cargo test --manifest-path src-tauri/Cargo.toml --release real_neural_pipeline -- --ignored --nocapture
```

This ignored-by-default test requires an actual compatible GPU. It validates NGX results, parameter effects, cache/export equality, mask behavior, reloads, odd dimensions and alpha. A provider or evaluation failure fails the test.

## Professional workspace checks

With Vite running at port 1420:

```powershell
node scripts/preview-race-check.mjs
node scripts/studio-check.mjs
cargo test --manifest-path src-tauri/Cargo.toml --release professional_pipeline_rtx -- --ignored --nocapture
```

The first script uses a synthetic transport for UI races and session workflows. The second uses real conventional browser processing for layout/mask checks. Only the final ignored test invokes the real provider on compatible local hardware. The normal Rust suite checks HDR precision, EXR multilayer/half/float decoding, tagged color round trips, masks and recoverable project writes.

`python scripts/third-party-notices.py` regenerates notices from the locked Cargo/npm packages and pinned license supplements. Installers include THIRD_PARTY_NOTICES.txt. The proprietary neural provider is always a separate installation.

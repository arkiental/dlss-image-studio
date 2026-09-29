# Building on Windows

## Prerequisites

- Windows 11 x64, Microsoft Edge WebView2 runtime.
- Node.js 22 LTS (or newer compatible release), npm.
- Rust stable MSVC x64; tested toolchain target is Rust 1.98.1. Use the lockfile rather than an older compiler with newly resolved dependencies.
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

## Release executable and installers

```powershell
npm run tauri build
```

Outputs:

- `src-tauri/target/release/dlss-image-studio.exe`
- `src-tauri/target/release/bundle/nsis/DLSS Image Studio_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/DLSS Image Studio_0.1.0_x64_en-US.msi`

The Windows GitHub Actions workflow runs the same commands and uploads all three artifacts. It does not run GPU tests on hosted runners without a suitable physical GPU. Download and run the native smoke test on the target machine.

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

No `PATH`, current-directory or user-configurable DLL search directory is used. The loader verifies NVIDIA's embedded signature and loads from that fixed executable-relative directory with Windows system-only dependency search. OTA/downloading flags are disabled. There is intentionally no `STREAMLINE_SDK_PATH` runtime override. Headers are pinned at build time; installing DLLs does not enable an NR evaluator absent from the source.

## This task's environment

The source workspace is `F:/Codex/dlss-image-studio` because C: had no free space. Rust was installed under `F:/Codex/rustup` and `F:/Codex/cargo`; development commands on this machine need:

```powershell
$env:RUSTUP_HOME = 'F:\Codex\rustup'
$env:CARGO_HOME = 'F:\Codex\cargo'
$env:PATH = "F:\Codex\cargo\bin;$env:PATH"
```

Windows declined the Visual Studio installer elevation, so initial release builds run on GitHub's Windows runner. A local Rust toolchain alone is not enough to compile the native module.

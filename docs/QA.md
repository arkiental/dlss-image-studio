# Release verification — 0.1.0

Verified source: `89f05765110eb170337bf2246d837f32a2b16b15`.

[Windows build](https://github.com/arkiental/dlss-image-studio/actions/runs/36355955329) passed: 15 frontend tests, four Rust tests, TypeScript/Vite compilation, native C++ compilation, release executable, MSI and NSIS packaging. The GPU smoke executable was built separately and ran successfully on the local NVIDIA GeForce RTX 3070, driver 591.86, both without Streamline and with signed Streamline core 2.14.1.0. It checks real D3D12 identity, brightness, alpha and invalid input handling.

Browser interaction checks covered presets, controls, reset, selection keyboard movement, zoom visibility, settings, image loading and PNG download. Layout checks covered 1536×1024, minimum 1080×840, and browser device scale factors 1, 1.25, 1.5 and 2. These are not native Windows per-monitor DPI tests.

Native desktop checks across the release candidate builds covered launch, preview, file export, full-resolution clipboard output, image paste, three-preset batch export and close. Exported images were 1560×1008; batch presets produced three distinct pixel outputs. The final executable initialized and processed its sample at 1560×1008 using the binary IPC path. Its log is in [native-final-log.txt](native-final-log.txt). A final screenshot attempt was obstructed by an unrelated Windows git.exe crash dialog; [native-initial.jpg](screenshots/native-initial.jpg) records the earlier inspected native build, not the final binary. Installer packages were built successfully but installer installation/uninstallation was not tested. Native drag/drop and per-monitor DPI transitions were not independently exercised.

The interface was compared with the supplied reference and its panel geometry corrected. It is not pixel-identical: the generated car, some icon shapes, fonts and surface treatments differ. Sample provenance is in [ASSETS.md](ASSETS.md).

## Outstanding requirement

There is **no proof that DLSS 5 executed**, because it did not execute. The official SDK archive lacked the NR plugin/API contract. Streamline's real feature query returned 31 (`eErrorFeatureMissing`), and the application reports that state. This is not a conclusion that the installed GPU is certified for NR. The resolution control records a value but has no processing effect while NR is unavailable. See [the integration investigation](../DLSS_INTEGRATION.md) for exact evidence and remaining integration work.

Other limits: 8-bit sRGB export, no HDR/metadata/ICC round-trip, unsigned application installers, no overwrite of existing files, and no proprietary NVIDIA runtime redistribution. Local release files are under `F:/Codex/builds/release-0.1.0`; source is under `F:/Codex/dlss-image-studio`.

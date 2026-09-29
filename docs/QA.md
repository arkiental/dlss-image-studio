> Historical verification below describes pre-neural releases. Current behavior and evidence: [Neural verification](NEURAL_VERIFICATION.md).

# Release verification — 0.1.0

Verified source: `89f05765110eb170337bf2246d837f32a2b16b15`.

[Windows build](https://github.com/arkiental/dlss-image-studio/actions/runs/36355955329) passed: 15 frontend tests, four Rust tests, TypeScript/Vite compilation, native C++ compilation, release executable, MSI and NSIS packaging. The GPU smoke executable was built separately and ran successfully on the local NVIDIA GeForce RTX 3070, driver 591.86, both without Streamline and with signed Streamline core 2.14.1.0. It checks real D3D12 identity, brightness, alpha and invalid input handling.

Browser interaction checks covered presets, controls, reset, selection keyboard movement, zoom visibility, settings, image loading and PNG download. Layout checks covered 1536×1024, minimum 1080×840, and browser device scale factors 1, 1.25, 1.5 and 2. These are not native Windows per-monitor DPI tests.

Native desktop checks across the release candidate builds covered launch, preview, file export, full-resolution clipboard output, image paste, three-preset batch export and close. Exported images were 1560×1008; batch presets produced three distinct pixel outputs. The final executable initialized and processed its sample at 1560×1008 using the binary IPC path. Its log is in [native-final-log.txt](native-final-log.txt). A final screenshot attempt was obstructed by an unrelated Windows git.exe crash dialog; [native-initial.jpg](screenshots/native-initial.jpg) records the earlier inspected native build, not the final binary. Installer packages were built successfully but installer installation/uninstallation was not tested. Native drag/drop and per-monitor DPI transitions were not independently exercised.

The interface was compared with the supplied reference and its panel geometry corrected. It is not pixel-identical: the generated car, some icon shapes, fonts and surface treatments differ. Sample provenance is in [ASSETS.md](ASSETS.md).

## Outstanding requirement

There is **no proof that DLSS 5 executed**, because it did not execute. The official SDK archive lacked the NR plugin/API contract. Streamline's real feature query returned 31 (`eErrorFeatureMissing`), and the application reports that state. This is not a conclusion that the installed GPU is certified for NR. The resolution control records a value but has no processing effect while NR is unavailable. See [the integration investigation](../DLSS_INTEGRATION.md) for exact evidence and remaining integration work.

Other limits: 8-bit sRGB export, no HDR/metadata/ICC round-trip, unsigned application installers, no overwrite of existing files, and no proprietary NVIDIA runtime redistribution. Local release files are under `F:/Codex/builds/release-0.1.0`; source is under `F:/Codex/dlss-image-studio`.

## Adjustment scope correction — 2026-09-29

The former Local Adjustments panel always masked tone and structure to the small dashed rectangle. The zoom enlarged that same edited patch, making the controls appear to affect the zoom alone. Image Adjustments now defaults to Whole image, with an explicit Selected area option. The dashed box remains a zoom inspection target in whole-image mode. Intensity is an effect multiplier, so it has no effect when tone and structure are neutral.

Both the browser worker and native D3D12 shader use the chosen scope. Whole-image processing includes the outermost pixels without feathering. Selected area retains the feathered mask. Moving or hiding the zoom never changes whole-image processing. Native commands validate the scope; legacy payloads without a scope preserve selected-area behavior.

Source upload completion now explicitly triggers processing, including slow native uploads. Export controls remain disabled until the latest settings and source have a completed preview. Generated Tauri schemas are ignored. Release native builds explicitly define NDEBUG to prevent the debug layer from blocking GPU initialization when Rust's CMake integration overrides release flags.

Local verification on RTX 4090 / driver 591.86:

- 19 frontend tests: neutral identity, alpha, global controls, selected-area isolation, whole-image edge coverage, intensity, structure, and zoom-region independence.
- 5 Rust tests: scope validation and legacy compatibility, parameter layout, ranges, naming, and PNG/JPEG/TIFF encoding with original dimensions and overwrite rejection.
- D3D12 smoke test: neutral, brightness, alpha, scope, zero intensity, structure, invalid input.
- Browser interaction suite: both scopes, presets, reset, settings, moving/hiding/restoring zoom, source reload with edits, PNG export matching preview pixels, 1080x840 minimum layout and 1x/1.25x/1.5x/2x browser DPI.

Native desktop verification confirmed whole-image tone updates the main canvas and zoom together; switching to Selected area limits the same edit to the dashed box. The native save dialog opened, but its filename field could not be reliably targeted by desktop automation, so the dialog was cancelled and a completed native save-dialog export was not verified in this pass. Browser PNG export matched preview pixels, and native PNG/JPEG/TIFF encoding tests passed. Existing DLSS availability and image-format limits above remain unchanged.

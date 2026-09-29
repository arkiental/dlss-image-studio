# Neural rendering verification — 2026-09-29

Hardware: NVIDIA GeForce RTX 4090; driver 591.86. Provider: official Visual Enhancer v13.2, installed separately. The adapter was built only after direct CLI and Python API invocations succeeded.

## Runtime evidence

[Captured diagnostics](neural-runtime-diagnostics.json): bridge ABI 6, one feature evaluation, NGX create/evaluate `0x00000001`, 1560×1008 neural dimensions, `rgba16f`, host/CUDA/D3D12 shared-memory path. The closed backend's internals were not reverse-engineered. A build or D3D12 dispatch alone is not counted as neural evidence.

[Control measurements](neural-control-changes.json) count changed RGB pixels against the default neural output on the sample. Intensity zero, tone zero, structure zero, all-maximum, Natural and Cinematic each differed. Before/default/maximum images were visually inspected. Full-image detail and appearance change; maximum settings can introduce halos. These are backend results, not a promise of improved quality for every image.

## Automated checks

- 16 frontend tests: defaults, geometry, presets, color math, alpha, and explicit refusal to approximate neural rendering in the browser.
- 8 standard Rust tests: missing-runtime errors, required positive NGX evidence, region compositing, validation, export names, PNG/JPEG/TIFF dimensions and overwrite rejection.
- Opt-in real-GPU Rust test: actual evaluation for all neural controls/styles; cache reuse; pixel-exact PNG/TIFF preview-export consistency; JPEG dimensions; selected-area isolation; source reload; 65×67 input padding/cropping and alpha; explicit bypass; concurrent queued-preview rejection and latest-result equality; stale source-ID rejection.
- Native D3D12 smoke: identity, brightness, alpha, invalid input and confirmation that reserved neural fields no longer perform color/detail substitutes.
- Browser UI suite: presets, color sliders, disabled neural controls, settings, zoom, reload, PNG download matching preview, 1080×840 minimum layout and browser DPI scales 1/1.25/1.5/2. Browser checks do not exercise neural evaluation.

## Native inspection and remaining checks

The installed executable started on RTX 4090, displayed NGX evaluation verified, and showed neural changes in the main image and matching zoom. Native sliders were changed and the settled result inspected. The user stopped Computer Use with Escape before clipboard/save-dialog checks completed; no further desktop automation was performed. File encoding and preview/export equality were verified through the native pipeline tests, not a completed save-dialog interaction. Native clipboard, runtime-folder dialog selection, and drag/drop have not been fully reverified end to end in this pass. Rapid queued changes are tested through the native commands; browser/native UI timing is not exhaustively covered. Source IDs additionally reject exports whose source changed while a dialog was open.

The pre-neural executable is retained locally as `verification/pre-neural-738daa2.exe`. No provider binaries or source are included in Git/build artifacts. Runtime setup and limits: [integration](../DLSS_INTEGRATION.md). GitHub hosted builds cannot evaluate the neural provider; their result is reported separately at delivery.

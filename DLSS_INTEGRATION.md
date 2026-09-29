# Neural runtime integration

Studio uses an independently authored, isolated-process client for a **separately installed Visual Enhancer v13.2**. No reference source, executable, model or DLL is redistributed. This replaces the earlier tone/brightness and structure/detail approximations.

## Setup and interface

Obtain the complete [official v13.2 release](https://github.com/Merserk/dlss5-visual-enhancer/releases/tag/v13.2), review its licenses, and keep the extracted package intact. In Studio Settings, select the folder containing `src`, `bin` and `VE_CLI.exe`.

The path is stored in `%LOCALAPPDATA%/DLSS Image Studio/neural-runtime.txt`; `STUDIO_NEURAL_RUNTIME` overrides it for testing. Selecting a runtime trusts its executable code. Studio does not download or modify it.

Our `neural_adapter.py` invokes the installed `src.neural_rendering.image.convert_image` through its embedded Python. This interface was tested successfully before integration. It is version-specific, not a stable SDK; other package versions are unsupported until verified.

| Studio | Provider option | Range/default |
|---|---|---|
| Neural style | nr_style | Default / Natural / Cinematic; Default |
| Intensity | nr_intensity | 0–2; 1 |
| Tone | local_tone_strength | 0–2; 1 |
| Structure | local_structure_strength | 0–2; 1 |

Values are forwarded directly. Tone and structure control the backend's local tone and structural reconstruction strengths. Its exact model mathematics are opaque; these are not Studio brightness/sharpening formulas. Intensity zero is passed to the provider, not interpreted as bypass. Use the enable switch to bypass.

One pass, original scale, automatic mask off, PNG output; other provider composition controls retain their defaults. Skin controls, multiple passes, temporal/video processing and neural upscaling are not exposed.

## Processing

Original RGBA → provider evaluation → optional feathered region composite → conventional D3D12 color adjustments → shared preview/zoom/export pixels. Region mode blends the full neural result with the source; it does not evaluate an isolated crop. The default covers the whole image; moving the zoom box does not change it.

The provider requires even dimensions of at least 64. Studio edge-pads, then crops without resampling and restores source alpha. Outputs retain original dimensions, 8-bit sRGB. A cache tied to source and neural controls supplies color processing, zoom and exports. Debouncing and obsolete queued-request checks limit rapid-change work. An in-flight provider process can finish before the latest request is served; each invocation has a 120-second timeout.

Missing components, unsuccessful diagnostics, unexpected dimensions and timeout are explicit errors. Export stays disabled for an incomplete preview. Color-only processing is available when the user disables neural rendering; browser development starts in clearly labeled color-only mode.

## Evidence

Verified 2026-09-29: RTX 4090, driver 591.86, official v13.2 ZIP SHA-256 `656850c8ab2f529415c271c58d1a23eaf9f971f860ea58290715db4a6b27117b`.

The bridge reports ABI 6, one feature evaluation, NGX create/evaluate result `0x00000001`, `rgba16f`, and `host_cuda_d3d12_shared`. Source inspection associates this path with feature 18. Studio requires a positive evaluation count and both success codes. This is runtime evidence, not an independent audit of closed binary internals. See [verification](docs/NEURAL_VERIFICATION.md).

## Distribution boundary

The package's Merserk Source License permits installation, execution, inspection and private modification, but prohibits redistribution/repackaging without written permission. Third-party notices separately govern NVIDIA and other dependencies. Studio publishes only original adapter/application changes; users obtain the complete runtime from its author and remain subject to its terms.

Do not commit or bundle the provider, its source, DLLs, models or interpreter. Existing MIT Streamline headers and optional core diagnostics are unrelated to this execution path. Large images may exceed GPU memory; AMD/browser neural rendering is unsupported. Cold process setup adds seconds of latency.

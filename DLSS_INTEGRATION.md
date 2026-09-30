# Neural runtime integration

Studio uses an independently authored, isolated-process client for a **separately installed Visual Enhancer v13.2**. No reference source, executable, model or DLL is redistributed. This replaces the earlier tone/brightness and structure/detail approximations.

## Setup and interface

### 16-bit input correction (2026-09-30)

The v13.2 `DLSSFrameSession.process` implementation accepts `uint8` **and**
`uint16` RGBA. The initial Studio adapter unnecessarily restricted it to 8-bit.
High-bit-depth SDR sources now use little-endian RGBA16 over the worker pipe,
with 16-bit output decoded directly to linear float finishing. The 8-bit D3D12
color path is bypassed for those sources. Source-format changes invalidate the
worker upload identity and neural cache. Alpha comes from the original float
source, including when neural processing evaluates a smaller resolution.

Neural eligibility is determined by actual RGB values in the linear-sRGB working
space, allowing 0.0001 boundary tolerance for ICC round-off. High-bit-depth SDR
PNG/TIFF and in-range float sources are eligible. True HDR/extended-gamut sources
use the explicit **Tone-map for neural** action; this interface clips its own output
to 0–1 and cannot honestly be described as an unbounded HDR neural pipeline.
Source and pass data remain immutable. Screen previews and clipboard are 8-bit,
but 16-bit file exports keep the neural output precision.

The opt-in working-copy conversion uses max-RGB Reinhard compression in linear
sRGB: positive RGB channels share the factor `1 / (1 + max(R,G,B,0))`; negative
values clip to zero in this copy. Original HDR samples and alpha remain untouched.
The choice is part of adjustment state, undo/history, snapshots and saved projects.
The worker upload identity also includes this choice, preventing reuse of an
unconverted source when switching modes. This is input preparation for the real
neural provider, not a substitute for its evaluation.

Obtain the complete [official v13.2 release](https://github.com/Merserk/dlss5-visual-enhancer/releases/tag/v13.2), review its licenses, and keep the extracted package intact. In Studio Settings, select the folder containing `src`, `bin` and `VE_CLI.exe`.

The path is stored in `%LOCALAPPDATA%/DLSS Image Studio/neural-runtime.txt`; `STUDIO_NEURAL_RUNTIME` overrides it for testing. Selecting a runtime trusts its executable code. Studio does not download or modify it.

Our original `neural_adapter.py` keeps the installed package's `DLSSFrameSession` alive in its embedded Python. JSON headers and raw RGBA pixel pipes replace per-frame process launches and PNG disk round-trips. The source pixels are uploaded to the worker only when the source changes. This interface was tested successfully before integration. It is version-specific, not a stable SDK; other package versions are unsupported until verified.

| Studio | Provider option | Range/default |
|---|---|---|
| Neural style | nr_style | Default / Natural / Cinematic; Default |
| Intensity | nr_intensity | 0–2; 1 |
| Tone | local_tone_strength | 0–2; 1 |
| Structure | local_structure_strength | 0–2; 1 |

Values are forwarded directly. Tone and structure control the backend's local tone and structural reconstruction strengths. Its exact model mathematics are opaque; these are not Studio brightness/sharpening formulas. Intensity zero is passed to the provider, not interpreted as bypass. Use the enable switch to bypass.

One pass, automatic mask off, raw RGBA output; other provider composition controls retain their defaults. Skin controls, multiple passes, temporal/video processing are not exposed. Resolution is an explicit image resize around neural evaluation, not neural super-resolution.

## Processing

Original RGBA → provider evaluation → optional feathered region composite → conventional D3D12 color adjustments → shared preview/zoom/export pixels. Region mode blends the full neural result with the source; it does not evaluate an isolated crop. The default covers the whole image; moving the zoom box does not change it.

The Resolution slider controls evaluation dimensions. Studio downsizes first, pads to even dimensions with a conservative 128-pixel minimum side, evaluates, crops the padding, and resizes back to the original dimensions. Alpha is restored from the source. At 100%, no image resampling occurs. Outputs retain original dimensions, 8-bit sRGB. A cache tied to source and neural controls supplies color processing, zoom and exports. A 16 ms debounce, obsolete-request rejection and ordered intermediate previews keep drags responsive. Exports require the latest completed request. The worker stays warm across neural style and parameter changes. Processing-size changes restart it because reusing a session across a resolution sweep caused a provider D3D12 device-removal error in testing. Each request has a 120-second timeout covering pipe I/O; errors kill the worker, never substitute pixels.

Missing components, unsuccessful diagnostics, unexpected dimensions and timeout are explicit errors. Export stays disabled for an incomplete preview. Color-only processing is available when the user disables neural rendering; browser development starts in clearly labeled color-only mode.

## Evidence

Verified 2026-09-29: RTX 4090, driver 591.86, official v13.2 ZIP SHA-256 `656850c8ab2f529415c271c58d1a23eaf9f971f860ea58290715db4a6b27117b`.

The bridge reports ABI 6, one feature evaluation, NGX create/evaluate result `0x00000001`, `rgba16f`, and `host_cuda_d3d12_shared`. Source inspection associates this path with feature 18. Studio requires a positive evaluation count and both success codes. The provider host path normalizes those code strings after its native call succeeds; they are not an independent raw-code capture from the DLL. Native call failure raises an error and cannot be accepted. This is runtime evidence, not an independent audit of closed binary internals. See [verification](docs/NEURAL_VERIFICATION.md).

## Distribution boundary

The package's Merserk Source License permits installation, execution, inspection and private modification, but prohibits redistribution/repackaging without written permission. Third-party notices separately govern NVIDIA and other dependencies. Studio publishes only original adapter/application changes; users obtain the complete runtime from its author and remain subject to its terms.

Do not commit or bundle the provider, its source, DLLs, models or interpreter. Existing MIT Streamline headers and optional core diagnostics are unrelated to this execution path. Large images may exceed GPU memory; AMD/browser neural rendering is unsupported. Cold process setup still adds approximately two seconds; warm frames avoid it. See [measured performance](docs/neural-performance.json).

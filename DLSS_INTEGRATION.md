# DLSS 5 integration investigation

Investigated on 2026-09-28 using official NVIDIA sources and the downloaded **Streamline SDK 2.14.1 x64** release.

## Evidence

1. [Streamline changelog](https://github.com/NVIDIA-RTX/Streamline/blob/v2.14.1/changelog.txt) announces `sl.dlss_nr` in 2.14.0.
2. [Actual header](https://github.com/NVIDIA-RTX/Streamline/blob/v2.14.1/include/sl_core_types.h#L253) declares `constexpr Feature kFeatureDLSS_NR = 1004;`. The application uses this declaration, not a guessed integer.
3. The official [release ZIP](https://github.com/NVIDIA-RTX/Streamline/releases/download/v2.14.1/streamline-sdk-v2.14.1.zip), SHA-256 `92c4d954631a1710da86ca3fa8d5034f2b9503838c95fc4ae977ae149319781b`, does **not** contain `sl.dlss_nr.dll`, an NR-specific header, or an NR integration guide. Its production `bin/x64` contains `sl.dlss.dll`, `sl.dlss_g.dll`, `sl.dlss_d.dll`, and unrelated plugins. Those are not Neural Rendering substitutes.
4. The official [sample source](https://github.com/NVIDIA-RTX/Streamline_Sample) was cloned and searched for `DLSS_NR`, `dlss_nr`, and `Neural Rendering`; no implementation was found in its `src` tree.
5. [NVIDIA's developer overview](https://developer.nvidia.com/blog/whats-new-for-game-developers-dlss-5-with-3d-guided-neural-rendering-nvidia-ace-updates-and-new-rtx-kit-capabilities/) discusses frame color, motion vectors and artistic controls, but does not supply the missing standalone-image API contract.

This establishes an **unavailable integration package**, not a proof that still-image processing is technically impossible. No official still-image path was found in the inspected SDK and sample. Claims that zero motion vectors or synthetic auxiliary buffers are valid cannot be established from these materials. No buffers are fabricated and no undocumented API is called.

## What is connected

```text
React state → asynchronous Tauri command → Rust backend mutex → stable C ABI
  → real DXGI adapter selection → D3D12 source texture
  → application color/local compute shader → GPU readback → preview/export

Optional signed Streamline core:
  verifyEmbeddedSignature → restricted LoadLibraryExW → slInit (before DXGI)
  → slIsFeatureSupported(kFeatureDLSS_NR, actual adapter LUID)
  → slSetD3DDevice → slShutdown
```

No NR evaluation call exists because the required input/options declarations and runtime are not available. No `DLSS 5 active` success state is emitted. The native backend always logs `Evaluation: NOT EXECUTED` for NR in this release. An initialized Streamline core is not proof of neural evaluation.

## Versions and requirements

Integration headers: **2.14.1**, obtained from the official release package. Runtime: optional and reported separately. NR runtime/model version: **not available**. Local hardware at investigation: **NVIDIA GeForce RTX 3070**, Windows driver **32.0.15.9186** (NVIDIA 591.86).

The product brief targets RTX 50-series for future NR validation. This release cannot certify a DLSS 5 GPU matrix, driver minimum, memory requirement or still-image support contract from the missing NR SDK. Do not infer support from GPU name alone. A future integration must query official support/requirements and record actual successful evaluation and model/runtime versions on supported hardware.

## Drop-in boundary for an authorized NR SDK

The native backend owns the source, device, command queue, descriptor heap, fence and readback. Extend it with the official NR header and signed plugin only after obtaining NVIDIA's documented contract. Required work remains:

- Identify all mandatory inputs, dimensions, color spaces, history/reset rules, model enums, masks and permitted still-image initialization.
- Implement resource tagging, constants and exact evaluation call from the supplied guide.
- Maintain separate source/processing/output dimensions for the 1–100% request.
- Reset neural temporal history between unrelated images; do not invent semantic guidance.
- Log support result, driver/runtime/model, evaluation result and GPU timing.
- Validate on supported hardware and compare exports to native SDK reference output.

The current public build should remain explicit that this work is outstanding.

## Application controls and color

`src/state.ts` is the preset configuration layer. Presets adjust only the six application controls. Local intensity scales a feathered rectangular tone/detail effect, local tone is an additive linear-light adjustment, and local structure adjusts neighboring-pixel detail around its neutral reference value 0.80. These are not mapped to undocumented NVIDIA parameters.

The native shader decodes sRGB to linear light, applies exposure/contrast/gamma, luma-relative saturation/vibrance and hue rotation, blends the local adjustment, and encodes once to sRGB. Shader intermediates are float32. Source/output textures are RGBA8 UNORM; HDR and higher-bit-depth output are future work. Alpha passes through unchanged except for JPEG export.

## Licenses and redistributables

Only the open integration headers used by this project are vendored under NVIDIA's MIT notice. The official package also contains NVIDIA RTX SDK and other component licenses. They are not interchangeable with the header license. Proprietary runtime files are excluded from Git and release bundles. Anyone distributing a runtime-integrated build must review the official package's applicable redistribution terms and production-binary signature requirements.

NVIDIA's [ProgrammingGuide.md](https://github.com/NVIDIA-RTX/Streamline/blob/v2.14.1/docs/ProgrammingGuide.md) describes initialization ordering and signed library loading. The provided `sl_security.h` validates both Windows trust and NVIDIA's custom embedded certificate. Development DLLs are deliberately rejected.

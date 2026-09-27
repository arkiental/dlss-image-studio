Windows desktop editor with a reference-driven Tauri/React interface and a real C++ D3D12 image-processing backend. Includes non-destructive color controls, local adjustments, zoom inspection, presets, full-resolution clipboard output and PNG/JPEG/TIFF export.

**DLSS 5 Neural Rendering is not active.** The inspected NVIDIA Streamline 2.14.1 package lacks its NR plugin and API contract. Optional signed Streamline core initialization and actual capability detection are implemented; no neural evaluation or substitute is claimed. The resolution slider has no image effect while NR is unavailable.

Assets: standalone Windows x64 executable, NSIS installer, MSI installer and SHA-256 checksums. Requires Windows 11 x64, WebView2 and a D3D12-capable GPU. Application binaries are unsigned. Proprietary NVIDIA runtime DLLs are not bundled.

Built from 89f05765110eb170337bf2246d837f32a2b16b15 by the successful Windows workflow. Validation: 15 frontend tests, four Rust tests, real GPU smoke tests on RTX 3070/driver 591.86, browser layout/interaction checks and native preview/export/clipboard checks. Installer installation and native per-monitor DPI transitions remain untested.

See README.md, BUILDING.md, DLSS_INTEGRATION.md and docs/QA.md on the main branch for structure, commands, SDK evidence and verification details.

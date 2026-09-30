# Troubleshooting

| Problem | What to check |
| --- | --- |
| App will not open / WebView2 missing | Use the Setup EXE, which includes WebView2 installation. Check Windows x64 and your GPU driver. |
| Runtime unavailable | Install the complete official Visual Enhancer v13.2 separately; select its extracted root in Settings. Studio downloads do not bundle it. |
| Finishing without the runtime | Turn off Neural Adjustments explicitly; tone, color, LUTs and exports do not need that provider. |
| Neural error / no change | Check Settings for evaluation status, enable neural processing, change intensity, and wait for Ready. Use Before/After. A successful build or installed DLL is not proof of evaluation. |
| HDR looks different | Neural input is a labeled tone-mapped SDR copy. Choose Use original HDR for uncompressed float editing with neural off. |
| Slow first preview | Provider startup is cold; later settings changes reuse it. Resolution changes restart it. Lower evaluation resolution if memory is tight. |
| Export disabled | Wait for the latest preview; resolve its error first. Failed neural output is never silently exported as a replacement filter. |
| Missing source on project reopen | Restore the source/pass files at their referenced paths. Projects do not embed the original render. |
| GPU/device removed | Close Studio and reopen, reduce evaluation resolution, and check driver stability. Preserve your project before changing settings. |

For a report, include Studio version, Windows version, GPU/driver, runtime version,
image format/dimensions/bit depth, reproducible steps and exact error text.
Use a small non-confidential test image when possible. Do not upload proprietary
renders, runtime DLLs, credentials or your entire user profile.

Runtime configuration lives at `%LOCALAPPDATA%\DLSS Image Studio\neural-runtime.txt`.
`STUDIO_NEURAL_RUNTIME` overrides it when set. A stale environment override can
make a new folder selection appear ineffective. There is no need to copy DLLs
into Windows system folders.

[Bug reports](https://github.com/arkiental/dlss-image-studio/issues/new/choose) ·
[Security reports](../SECURITY.md) · [Installation](INSTALLATION.md).

# Contributing

Thanks for helping make a focused render-finishing tool for artists.

## Discuss and report

Use [issues](https://github.com/arkiental/dlss-image-studio/issues/new/choose) for
reproducible bugs and focused feature proposals. Search existing reports first.
Explain the artist workflow and expected result. Keep unrelated features in
separate proposals. See [security reporting](SECURITY.md) for vulnerabilities.

## Develop

Follow [BUILDING.md](BUILDING.md), fork the repository, create a branch and install
locked dependencies with `npm ci`. Run `npm run dev` for the browser UI or
`npm run tauri dev` for native editing. Browser processing is conventional only;
native GPU/runtime behavior must be verified on compatible physical hardware.

Before opening a pull request:

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the relevant UI scripts with Vite on port 1420, and real GPU tests when changing
the neural/native path. Explain what you tested and what you could not verify.
Include inspected before/after screenshots for visual changes. Hosted CI cannot
certify neural execution. Avoid tests that merely repeat the implementation.

## Design and engineering boundaries

- Keep the image dominant, the original dark/gold styling, and controls compact.
- Preserve source precision, alpha, output dimensions and non-destructive state.
- Keep neural controls separate from conventional filters; never silently fall back.
- Reject stale asynchronous previews and keep preview, inspector and export consistent.
- Expose working features, with clear limits; do not add placeholder controls.
- Never commit renders without permission, personal configuration, credentials,
  generated build trees, runtime packages, model weights or proprietary DLLs.
- Contributions to Studio are under its ISC license. Third-party assets require
  compatible terms, provenance and retained notices. Do not copy source from the
  separately licensed provider into this repository.

Use clear commits and a PR description stating the problem, behavior change,
verification and remaining limitations. Maintainers review compatibility and
licensing as well as functionality. Be respectful and keep feedback about the work.

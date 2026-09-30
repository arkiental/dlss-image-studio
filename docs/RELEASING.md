# Release checklist

1. Review the diff and tracked history for secrets, private configuration and
   unlicensed assets. Never add provider packages, interpreters, models or DLLs.
2. Bump package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json
   together. Update CHANGELOG.md and write `docs/releases/vVERSION.md`.
3. Run frontend/native tests, relevant UI checks and a release build. Changes to
   the native/provider path also require real compatible-hardware checks.
4. Build on Windows x64: `npm run tauri build -- --bundles nsis`.
5. Run `powershell -File scripts/package-release.ps1`. It stages only an explicit
   allowlist: Studio EXE, guides, licenses, installer and checksums. Review outputs.
6. Test the setup and extracted ZIP. Check executable imports for a separate MSVC
   runtime requirement, verify signatures/checksums, and report any clean-machine
   or GPU configurations that have not been tested. Do not call an unsigned build signed.
7. Commit, push and wait for CI. Tag that commit `vVERSION` and push the tag.
   The Windows workflow tests/builds/packages, then publishes GitHub Release assets.
8. Verify public release URLs, asset hashes, documentation links and source tag.

The Setup EXE embeds Microsoft's offline WebView2 installer. It does not include
the neural provider. The portable ZIP requires WebView2 already installed. There
is no automatic-update endpoint or code-signing certificate configured.

## All-in-one neural distribution is blocked

Visual Enhancer v13.2's packaged `LICENSE.txt` is Merserk Source License 1.0.
Sections 5 and 6 forbid redistribution and bundling without written permission;
section 13 leaves NVIDIA and other components subject to their own terms. The
[upstream license](https://github.com/Merserk/dlss5-visual-enhancer/blob/main/LICENSE)
and installed version-specific license must both be reviewed when upgrading.

Before adding an all-in-one package, obtain permission covering redistribution
of the exact provider version and verify rights for every dependency. Retain
notices, record hashes, validate executable-relative runtime discovery, and test
on a clean supported machine. Do not treat public availability as permission.
Do not silently download or mirror the restricted package as a workaround.

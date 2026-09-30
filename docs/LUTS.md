# LUT color grading

Open **Refine → LUTs**. Choose one of the 50 included creative looks or import a
`.cube` file. Enable LUT bypasses/enables the grade; the strength
slider blends it from 0–100%. LUTs are conventional color grading, separate from
the neural enhancement controls. Snapshots, history, presets, batch settings and
projects retain the LUT selection and strength.

Imported tables are stored locally in IndexedDB. Project and preset-library
exports embed custom tables once, including those used by history or snapshots.
Built-in tables are identified by their immutable SHA-256 hash. Missing or invalid
tables produce an error instead of exporting an ungraded substitute.

## Pipeline and limits

- LUT evaluation follows neural enhancement and tone/color/curves, before lens
  effects and the existing finishing-mask blend. Preview and export use matching
  interpolation and transfer functions; alpha is unchanged.
- Supports standalone 3D CUBE tables (2–65 points per axis, trilinear interpolation)
  and 1D tables (2–65536 points, linear interpolation), domain declarations and
  input-range declarations. Combined shaper + 3D files and other formats are
  rejected. Maximum file size is 16 MB.
- Input/output encoding can be sRGB, Rec.709, or linear sRGB. This is a creative
  look workflow with the same input and output space, not a camera-log or gamut
  conversion system. Log LUTs require external conversion first.
- Striped Purple looks default to sRGB as an application assumption for the
  author's Photoshop-exported creative looks; the source does not specify a
  calibrated input transform. Classic Film specifies Rec.709 in its source.
- The float working pipeline is preserved. By default a pixel outside the LUT's
  declared input domain bypasses the LUT, retaining HDR/negative values. Explicit
  **Clamp to LUT** instead samples the boundary. Strength blends in linear light.
- Native decoded tables are cached up to 256 MB per app session; reaching the
  limit produces an error. Project/preset files support up to 48 MB of custom
  table text within a 64 MB document.

## Included library and redistribution

The 50 tables are original, losslessly gzipped CUBE files, not generated variants.
`public/luts/manifest.json` records each name, category, author, license, pinned
source URL, and SHA-256 of the uncompressed bytes. Copyright headers remain intact.

| Collection | Count | License | Pinned source |
| --- | ---: | --- | --- |
| Austin Barrett / Striped Purple | 49 | MIT, copyright 2020 Nixua | [color-grading-luts](https://github.com/stripedpurple/color-grading-luts/tree/9757e8b5147693cab49c3fd674bf23dbe28d6c8e) |
| Alex Jordan — Classic Film | 1 | CC0-1.0 | [OpenShot LUT attribution](https://github.com/OpenShot/openshot-qt/blob/b220618e3fbd7993e49232a3cc9aaa489b58a083/src/colors/AUTHORS.md) |

Original Classic Film listing: [FreshLUTs](https://freshluts.com/luts/31).
The CC0 designation is recorded in OpenShot's asset-specific AUTHORS document.
The MIT grant is in the Striped Purple repository LICENSE. Copies of both sources
and the CC0 legal text ship in `public/luts` and `THIRD_PARTY_NOTICES.txt`.

To restore the exact tables from pinned upstream sources, run
`python scripts/restore-luts.py`. It verifies every uncompressed checksum before
writing. `npm test` parses all 50 tables and verifies their hashes and uniqueness.

## Verification

Automated coverage includes shared TypeScript/Rust interpolation vectors, CUBE
validation, domains, 1D tables, strength, bypass, HDR and alpha preservation,
16-bit PNG/32-bit EXR roundtrips, and missing-table failures. `scripts/lut-check.mjs`
checks all 50 choices, actual browser grading, custom import, invalid import,
snapshot restore, persistent storage and pixel-identical PNG preview/export at
original dimensions. The transport test covers embedded custom LUT project
save/reopen. Neural/GPU checks require the external runtime and physical hardware.

On 2026-09-29, `cargo test --release --manifest-path src-tauri/Cargo.toml
lut_after_neural_rtx -- --ignored --nocapture` passed on the NVIDIA GeForce RTX
4090 (driver 591.86), with Visual Enhancer v13.2 installed separately. The provider
reported NGX create/evaluate `0x00000001`, one feature evaluation, 281.8 ms neural
evaluation, and 1560 × 1008 output. Amber Haze at 65% visibly changed the neural
result; exported PNG16 and preview had zero mean 8-bit channel-code difference.
Both before/after exports were visually inspected. The debug-profile GPU test
failed at D3D12 initialization; GPU verification uses the shipping release profile.

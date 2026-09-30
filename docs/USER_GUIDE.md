# User guide

## A one-minute finishing workflow

1. **Open Render** or drop an EXR, PNG, TIFF, JPEG or WebP image into the viewport.
2. With a configured neural runtime, choose **Cinematic**, **Neutral** or **Natural**.
   Otherwise turn off **Neural Adjustments** to work with conventional finishing.
3. Adjust intensity, tone and structure gently. Use the Resolution slider to trade
   evaluation detail for speed; it does not force the exported image to upscale.
4. Refine exposure, contrast and color. Open advanced groups only when needed.
5. Compare before/after and save a snapshot before exploring another look.
6. Export a 16-bit PNG/TIFF for a high-quality still, or JPEG/WebP for sharing.
   Original pixel dimensions are the default; check output settings before export.

## Inspect and compare

Use the mouse wheel or zoom slider to zoom. Fit shows the whole image; Fill fills
the viewport. Pan with middle mouse or Space + left drag. The floating detail
inspector examines the same completed processed image, can be moved outside the
image area, and supports 1–10× magnification. Tiny images use the minimum
magnification needed to keep the sampled area inside the image. Drag the selection
box to move it or drag a corner or edge handle to resize it. Arrow keys move the
focused box by one image pixel; focused handles resize it. Hold Shift for ten-pixel
steps. Escape cancels an active drag. Its toggle does not change processing.
Use the split-view controls for vertical or horizontal comparison; drag the divider.
The **Before** and **After** buttons explicitly select the original or edited image.
The preview label identifies the current view; edits made in Before appear in After.
Type a zoom percentage and press Enter to apply it, or Escape to restore the previous view.

`B` toggles before/after; hold `\` to temporarily inspect the original. `F` fits,
`1` selects 100%, `Z` toggles the inspector, `P` hides the UI and `F11` fullscreen.
`Tab` moves keyboard focus between controls; `Escape` exits presentation or closes Settings.

## Neural adjustments versus conventional tools

The neural style, intensity, local tone and local structure controls are forwarded
to the separately installed provider. Their supported range is 0–2, default 1.
Intensity zero is still a provider setting; use the enable switch to bypass neural
processing. Exact model behavior is owned by the provider. No identity/geometry
preservation guarantee is implied; inspect text, edges and fine details yourself.

Whole image is the default. Selected area blends a feathered region from the full
neural result. The inspection rectangle and editing region are separate concepts.
Conventional exposure, color, denoise, sharpening and LUT grading are separate
operations, not implementations of DLSS. Failed neural processing blocks export
of that failed state; it does not silently switch to conventional enhancement.

Drag sliders or type numeric values. Arrow keys adjust sliders; Shift and Ctrl
provide finer increments. Double-click or right-click supported controls to reset.
Press Enter or leave a numeric field to commit the edit; Escape restores its starting value.
Use **Find adjustment** or `Ctrl+K` to search controls and workspace actions. Arrow keys
select a result, Enter opens its section and focuses the control, and Escape clears search.
When neural rendering is off, its controls are folded away. **Controls** and
**Neural settings** keep those options available without taking space from the image.
Cold neural startup takes longer than subsequent cached/warm previews. A new
evaluation resolution may restart the provider. Wait for Ready before exporting.

## HDR and color

The original source is held separately from edits. Internal finishing uses 32-bit
scene-linear sRGB float. Embedded ICC profiles are read where supported; choose a
different input interpretation under Settings only when you know the source space.

HDR/extended-gamut imports automatically select a **tone-mapped 16-bit SDR working
copy** for neural evaluation. The mode is labeled under Neural Adjustments.
**Use original HDR** returns to original float editing and disables neural rendering.
The source file is never overwritten by this conversion. Neural output from the
working copy is SDR, even if written into an EXR container. Export original-HDR
edits to linear EXR when preserving the full dynamic range is required.

ACEScg EXR input/output is supported; ACES display transforms, Blender AgX/Filmic
and deep EXR are not included. Review [supported features and limits](PROFESSIONAL_WORKSPACE.md).

## LUTs, masks and passes

**Refine → LUTs** provides 50 included creative looks, strength and bypass. Import
additional `.cube` files you have permission to use. LUTs are display-oriented;
read [the LUT guide](LUTS.md) before applying them to HDR renders.

Open **Workspace > Masks** for shape, brush, gradient, color or luminance selections. Name masks,
adjust feather/opacity and use combine/subtract/intersect as needed. Mask edits are
non-destructive. **Workspace > Passes** imports individual passes and supported flat EXR
channels for inspection, selection and supported depth effects. Cryptomatte and
some advanced pass features are not implemented; no unsupported control is promised.

## Projects, variants and batch

`Ctrl+S` saves a Studio project; `Ctrl+Shift+S` saves as a new project. Projects
reference source and render-pass paths, so keep those files with your work when
moving computers. Custom LUT assets are embedded in projects/presets. Save
named snapshots in the bottom strip; history and `Ctrl+Z` / `Ctrl+Shift+Z` help
compare and undo changes. A project is not a replacement for a source-image backup.
History names the changed controls and their values. Snapshot names remain unique;
use the pencil to rename, Enter to commit, or Escape to cancel. Deleting a snapshot
offers an immediate Undo action. A snapshot remains selected only while the current
edits match it. **Workspace > Presets** searches both built-in looks and saved presets;
applying a result uses the bottom strip's strength and apply-part settings.

Use **Workspace > Batch** to add images, apply shared settings or per-image overrides, select an
output folder and process the queue. Check errors individually. The batch queue
persists while the app stays open; save important image edits as projects.

## Export

Quick actions provide clipboard, file and preset/variant output. Clipboard is an
8-bit display image. File export supports PNG, JPEG, WebP, TIFF and EXR with the
format-appropriate bit-depth controls. JPEG/WebP use 8-bit output; PNG/TIFF offer
16-bit and EXR offers half/float. Choose original size, percentage or exact size,
and a supported output color space. Do not overwrite your source file.

`Ctrl+O`: open · `Ctrl+E`: export · `M`: masks · `Ctrl+Z`: undo · `Ctrl+Shift+Z`: redo.
For problems, read [troubleshooting](TROUBLESHOOTING.md) or [report an issue](https://github.com/arkiental/dlss-image-studio/issues/new/choose).

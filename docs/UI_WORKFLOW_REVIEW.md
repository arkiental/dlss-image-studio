# Local UI workflow review — 2026-09-30

This pass extends the monochrome workspace on `ui/monochrome-polish`. It keeps the
peer Workspace section, compact square controls, slider icons and resizable detail
selection. No native application, neural provider or DLSS engine was initialized.

## Research and observed gaps

Adobe's [Develop module documentation](https://helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/develop-module-options.html)
describes named snapshots and a chronological history of editing states. Its
[masking documentation](https://helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/masking.html)
connects mask selection to visible overlay controls. These informed the emphasis
on identifiable editing states and instructions tied to the selected mask. The
compact disclosures and adjustment search are decisions for this app's existing
layout, rather than copied Lightroom features.

The live browser audit reproduced immediate Undo losing Redo, numeric Escape
keeping the typed edit, duplicate snapshot names after deletion and a restored
snapshot staying highlighted after further editing. It also found ambiguous
Before/After state, no visible source filename, hard-to-find controls and built-in
presets missing from the Workspace preset library. Inactive neural controls and
repeated export actions consumed image space.

## Resulting workflows

- Find adjustment / Ctrl+K opens the matching section and disclosure, then focuses
  the control. Search includes workspace actions and common terminology.
- Before and After have explicit controls. The filename and editing/processing/
  ready feedback identify the document and preview state.
- Numeric Escape cancels the current edit without adding canceled history. Pending
  Undo retains Redo; history names the controls and values. Undo preserves inspection
  zoom, including when selecting the current history row before editing again.
- Snapshots receive unique names, support inline rename and deletion Undo, and only
  remain highlighted while their edits match. The toolbar camera stays square.
- Workspace Presets searches built-in and saved looks and shares the existing
  strength/apply-part behavior. Mask instructions describe the selected mask kind;
  masks expose selection state and both ordering directions.
- Inactive neural controls use explicit disclosures. Quick export keeps all actions
  reachable with less height, giving the image more room at both tested window sizes.

## Verification boundary

`npm run build` and `npm test` validate the frontend. The browser checks in
`scripts/workflow-check.mjs`, `ui-polish-check.mjs`, `inspector-selection-check.mjs`,
`studio-check.mjs`, `preview-race-check.mjs` and `lut-check.mjs` cover actual editing,
focus, resizing, cancellation, export and pixel consistency. The preview-race script
uses a synthetic bridge; it does not invoke the real native engine.

The final build and all 67 unit tests pass. The focused workflow suite passes eight
groups without browser errors. Comparable empty-Snapshots layouts increase the
image viewport from about 515 to 632 pixels at 1536×1024, and from 339 to 409 pixels
at 1080×840. A populated preset strip takes its normal additional height.

Screenshots and machine-readable results are kept in the local task's evidence
directory. Native DLSS evaluation, desktop dialogs and Windows per-monitor DPI
testing remain for the user's main PC. No release, packaging or publication work
is part of this pass.

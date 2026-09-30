# Changelog

## 0.2.2 - 2026-09-30

- Refine the compact monochrome workspace with square controls, clearer Settings,
  Workspace sub-tabs and smaller export and empty-snapshot sections.
- Add adjustment search with Ctrl+K, explicit Before/After controls, source identity
  and preview-state feedback.
- Add eight resize handles and keyboard movement to the floating detail selection.
- Fix numeric Escape cancellation, pending-edit Undo/Redo, zoom entry and keyboard focus.
- Name history entries, keep snapshot names unique, and add snapshot rename and
  deletion Undo. Search built-in and saved presets from Workspace.
- Preserve the native backend and project format. Frontend and browser checks
  passed; this UI pass did not initialize DLSS or retest native desktop workflows.

## 0.2.1 — 2026-09-30

- Public distribution: Windows setup and portable ZIP, checksums, installation and
  user guides, contributor guidance, security reporting and release automation.
- Restore the original studio appearance while retaining expanded finishing tools.
- Include 50 licensed LUTs and CUBE import with strength, bypass and project assets.
- Support real 16-bit neural transport; HDR imports select a reversible, labeled
  SDR working copy while preserving original float data.
- Fix slider dragging, preview ordering, inspector consistency and source reloads.
- Statically link Studio's C/C++ runtime; Setup includes offline WebView2 installation.

The neural provider remains a separate installation because its license prohibits
bundling without permission. This release does not implement the entire proposed
professional feature list. See docs/PROFESSIONAL_WORKSPACE.md for actual support.

## 0.1.0

Initial editor preview. Superseded by the 0.2 finishing workspace.

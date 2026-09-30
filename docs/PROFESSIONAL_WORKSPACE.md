# Professional workspace — implementation and limits

Version 0.2 implements a working core for the requested render-finishing workflow. This matrix is an explicit scope record, not a claim that all 33 specification sections are complete.

| Area | Working in this build | Boundaries / outstanding work |
| --- | --- | --- |
| Workspace | Original two-column studio layout, large viewport, six color controls, neural adjustments below the image, Workspace peer tab with Masks/Passes/Presets/Batch sub-tabs, remembered collapsible groups, bottom presets/history/snapshots, empty state and recent projects | No arbitrary panel docking layout |
| Inspection | Wheel/slider/numeric zoom, 25/50/100/200%, Fit/Fill, pan, before/after toggle and hold, movable vertical/horizontal divider, labels, floating detail inspector, bounded 3:2 selection with eight resize handles and arrow-key movement/resizing, high-zoom grid, presentation and fullscreen | Inspector stays inside the app window; it can leave the image frame. Tiny images use a larger minimum inspector zoom to keep the sample inside the image |
| Neural enhancement | Verified external D3D12/NGX runtime, three styles, intensity/tone/structure, 1–100% evaluation size, cached output, explicit failure | Provider accepts display-referred RGBA8. It does not establish a guarantee against all neural changes to logos or geometry. Compare before/after. No claim about unreleased SDK documentation |
| Enhance | Separate luminance/chroma smoothing with edge protection, radius/threshold sharpening, high-frequency micro detail | No dedicated compression-artifact classifier or super-resolution output mode |
| Tone | Exposure, contrast, gamma, brightness, highlights/shadows/whites/blacks, auto exposure, editable master/R/G/B curves and curve presets | No separate automatic clipping-safe exposure mode |
| Color | Temperature/tint, vibrance/saturation/hue, native float neutral picking, auto WB, three hue/saturation/luminance wheels, strength/balance, lift/gain and existing gamma | Not a calibrated colorist control surface; preview is display-referred sRGB |
| Local | Provider intensity/tone/structure plus separate medium-frequency clarity, high-frequency texture, broad local contrast (Dehaze) | Provider control semantics remain those of the external engine, not renamed host filters |
| Masks | Rectangle, ellipse, polygon, brush/eraser, horizontal linear/radial gradients, color/luminance/pass ranges; names, duplication, enable, order, add/subtract/intersect, opacity, feather, inversion, expansion/contraction and blur | One combined mask stack limits the finishing result. Independent per-mask adjustment stacks and edge-aware matte refinement are not implemented. Linear gradient direction is horizontal; invert reverses it |
| Dodge/burn | Editable brush layers, exposure/highlights/shadows/saturation modes, strength, radius, hardness and flow | Stroke layers share a layer's current brush attributes; no per-stroke property inspector |
| Render passes | Flat EXR RGB/XYZ groups and scalar channels, individual matching-size passes, solo/remap/invert, pass-range and ID picking, use as mask | Cryptomatte manifest/hash decoding, deep EXR, cropped/offset data windows, normal-guided filtering, material reconstruction and pass compositing are not implemented. Unsupported data windows fail explicitly |
| Depth | Numeric depth remap, pass-based selections, focus picking, depth-weighted blur, depth fog | Blur is a post-process depth mix, not an optical bokeh/occlusion simulation. No bokeh shape/highlight/foreground-background controls |
| Lens | Threshold/radius bloom, vignette amount/midpoint, deterministic monochrome grain | Star/anamorphic glare, chromatic aberration, barrel/pincushion, dirt texture, grain size/response and expanded vignette controls remain unimplemented |
| Composition | Non-destructive crop, common aspect presets, quarter-turn rotation, horizontal/vertical flip, exact export dimensions | No arbitrary-angle straighten, perspective correction or drag crop handles |
| Scopes | Histogram, RGB histogram, waveform, RGB parade, Rec.709 Cb/Cr vectorscope, collapsible/resizable display, highlight/shadow display-clipping overlay | Scopes sample the display preview, not raw HDR; no out-of-gamut scope or freely dockable/floating scope window |
| Color management | Float scene-linear sRGB working space, sRGB/linear/P3/Rec.709/ACEScg input, embedded RGB ICC conversion, tagged integer outputs, linear sRGB/ACEScg EXR primaries | No OCIO configuration, ACES display transform, Blender AgX/Filmic emulation, arbitrary preserved output ICC or source metadata round-trip. Unknown EXR primaries require explicit input interpretation |
| HDR/formats | Flat half/float multilayer EXR, 16-bit PNG/TIFF, JPEG/WebP, unbounded float RGB between operations; alpha retained where supported | 64 MP and 16384 pixels/side; EXR channel import budget 512 MB. Output EXR is finished RGBA, not a copy of every input layer. NaN/Infinity channel values normalize to zero; signed/over-range finite values survive neutral processing |
| Presets | 13 built-in categories, user save/duplicate/rename/favorite/delete, library import/export, 0–100% strength, partial tone/color/lens/detail application | Small previews represent conventional grading; the neural provider evaluates when applying the preset. Presets retain source-specific masks/crop in stored state but applying a look leaves the current composition/masks intact |
| History/variants | Gesture-coalesced undo/redo, up to 100 history states, direct restoration, up to 64 named snapshots and all-variant export | No dedicated A/B/C/D keyboard banks; snapshots provide the named-variant workflow |
| Batch | Multiple files, drag-in queue, selection, current settings or per-item overrides, sync, folder/suffix/format/depth/size/color settings, progress/error status, stop after current, persistent neural worker | Queue persists while switching workspaces, not after restart. No per-item thumbnails, arbitrary rename token patterns or ETA. External pass file attachments are not automatically reused on different batch images |
| Export | Clipboard, file, all variants/presets; original/percent/exact dimensions, nearest/bicubic/Lanczos, PNG8/16, TIFF8/16, EXR half/float, JPEG quality, lossless WebP8, ICC profiles and EXR primaries | Files are never overwritten. Metadata is stripped. WebP quality is lossless only; clipboard is 8-bit sRGB. No DLSS/SR resize mode |
| Projects | Versioned .dlssproj, source/pass paths, explicit input interpretation, masks, adjustments, presets, snapshots, history/cursor and export configuration; Save/Save As/recent, previous-save backup | Media is referenced by absolute paths, not embedded. Pasted images must first be opened from a disk file to save a project. No autosave/relink UI |
| Performance | Async native work, persistent neural provider, byte-pipe transfers, latest-request rejection, cached neural frame for grading, reduced conventional preview during dragging, full-size refinement, background thumbnails | Conventional float finishing runs on CPU/Rayon. Neural setting changes still require real provider evaluation at the chosen Resolution; reduced preview is not a claim of 60 FPS neural processing |

## Control layout

Adjust keeps the original neural styles, Resolution slider and six color controls. Refine exposes Enhance, Tone, Color and Local groups; Effects, Tools and Export retain the expanded finishing workflows. Masks, Passes, Presets and Batch live in the compact sidebar navigation. Neural intensity/tone/structure stay directly beneath the viewport, and the snapshots/presets/history shelf remains at the bottom.

## Processing architecture

The source frame and imported passes are immutable, scene-linear RGBA float arrays on the Rust side. The source's precision is never replaced by the 8-bit preview. ICC conversion targets linear sRGB directly with extended-range output; analytic matrix/TRC profiles can also preserve signed and HDR float input. Bounded ICC LUTs with over-range input require explicit source interpretation rather than undefined extrapolation. React holds the editable parameter state and serializable history. A project stores that state and media references.

The processing order is explicit:

1. Decode and apply the selected/embedded input transform; leave data passes untransformed.
2. Optionally evaluate the verified external neural provider (8/16-bit SDR transport), caching by source/sample format/style/parameters/resolution. High-bit-depth input returns directly to float finishing; source values outside linear sRGB 0–1 require an explicit tone-mapped copy.
3. Denoise, sharpen and apply frequency-separated conventional detail.
4. Apply linear exposure/tone/color, grading and display-domain curves with unbounded endpoints.
5. Apply bloom, depth effects, vignette and grain.
6. Composite against the original using the mask stack; apply editable dodge/burn.
7. Crop/flip/rotate.
8. Convert a copy for display, or resize and encode an export with the chosen output transform and precision.

Mask overlays and finishing use the same native mask rasterizer. The inspector samples the processed image. The final settled preview and export call the same float processing function at full resolution. A generation key includes source identity, imported-pass revision and all processing settings; view-only zoom and pan never invoke image processing. Export is disabled until the matching preview succeeds.

There is no generic generative tool, repainting prompt, object replacement or substitute neural filter. External neural evaluation remains a black box whose successful invocation is established by provider diagnostics and output inspection, not by a GPU label or successful build.

## Extending unsupported systems

`Finish`, `MaskLayer`, `Project` and `ExportConfig` are the serializable contracts. Rust validates requests before processing. New operators should enter the explicit pipeline with native precision tests, an identity case, a mask/export consistency case, and UI error handling. Add a field with a migration/default; update the cross-language fixture. Do not expose an enabled control before its operator is implemented.

An OCIO display-transform service, a Cryptomatte manifest/hash resolver and an optical depth operator require dedicated interfaces/fixtures. They should not be approximated by renaming the current color matrix, numeric ID range or depth blur controls.

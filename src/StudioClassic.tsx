import {
  Activity,
  Aperture,
  Circle,
  CircleDot,
  Clipboard,
  Download,
  Droplet,
  Layers,
  Rainbow,
  RotateCcw,
  Sun,
  Triangle,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Control } from "./StudioControls";
import { useStudio } from "./useStudio";
import { newMask } from "./finish";

type Document = ReturnType<typeof useStudio>;

export function QuickLook({ d }: { d: Document }) {
  const s = d.state;
  const [optionsOpen, setOptionsOpen] = useState(s.neural.enabled);
  useEffect(() => {
    if (s.neural.enabled) setOptionsOpen(true);
  }, [s.neural.enabled]);
  const controls = [
    ["contrast", "Contrast", Sun],
    ["gamma", "Gamma", Activity],
    ["vibrance", "Vibrance", Aperture],
    ["brightness", "Brightness", Sun],
    ["saturation", "Saturation", Droplet],
    ["hue", "Hue", Rainbow],
  ] as const;
  return (
    <div className="quick-look">
      <details
        className="neural-options"
        open={optionsOpen}
        onToggle={(e) => setOptionsOpen(e.currentTarget.open)}
      >
        <summary>
          Neural settings <span>{s.neural.enabled ? "Enabled" : "Off"}</span>
        </summary>
        <div className="neural-styles">
          {(["Cinematic", "Default", "Natural"] as const).map((style) => (
            <button
              key={style}
              disabled={!s.neural.enabled}
              title="Neural rendering style"
              className={s.neural.style === style ? "active" : ""}
              onClick={() =>
                d.setState((p) => ({ ...p, neural: { ...p.neural, style } }))
              }
            >
              {style === "Default" ? "Neutral" : style}
            </button>
          ))}
        </div>
        <div className="classic-resolution">
          <Control
            card
            label="Resolution"
            value={s.processingResolution}
            min={1}
            max={100}
            reset={100}
            disabled={!s.neural.enabled}
            tip="Neural evaluation resolution (%). Export retains the original dimensions."
            onChange={(processingResolution) =>
              d.setState((p) => ({ ...p, processingResolution }))
            }
          />
          <div className="range-endpoints">
            <span>1%</span>
            <span>100%</span>
          </div>
        </div>
      </details>
      <div className="classic-color-grid">
        {controls.map(([key, label, Icon]) => (
          <div className={key === "hue" ? "hue-control" : ""} key={key}>
            <Control
              card
              label={label}
              icon={<Icon size={28} strokeWidth={1.6} />}
              value={s[key]}
              min={key === "hue" ? -180 : -100}
              max={key === "hue" ? 180 : 100}
              onChange={(value) => d.setState((p) => ({ ...p, [key]: value }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NeuralAdjustments({
  d,
  onMasks,
  setSelectedMask,
}: {
  d: Document;
  onMasks: () => void;
  setSelectedMask: (id: string) => void;
}) {
  const s = d.state;
  const [controlsOpen, setControlsOpen] = useState(s.neural.enabled);
  useEffect(() => {
    if (s.neural.enabled) setControlsOpen(true);
  }, [s.neural.enabled]);
  return (
    <section
      className={`neural-adjustments${s.neural.enabled ? "" : " neural-inactive"}`}
    >
      <header>
        <h2>Neural Adjustments</h2>
        <label
          className="neural-enable"
          title={
            !isTauri()
              ? "Neural rendering is available in the Windows app"
              : d.info?.neuralSupported === false
                ? "HDR/out-of-gamut source: use a tone-mapped sRGB copy. Original float data is preserved."
                : "Neural rendering supports 8-bit and 16-bit SDR input; the original is preserved"
          }
        >
          <input
            aria-label="Enable neural rendering"
            type="checkbox"
            checked={s.neural.enabled}
            disabled={
              !isTauri() ||
              (d.info?.neuralSupported === false && !s.neural.toneMap)
            }
            onChange={(e) =>
              d.setState((p) => ({
                ...p,
                neural: { ...p.neural, enabled: e.target.checked },
              }))
            }
          />
          Enable
        </label>
        <div className="scope-switch">
          <button
            className={!s.finish.masked ? "active" : ""}
            onClick={() =>
              d.setState((p) => ({
                ...p,
                local: { ...p.local, scope: "image" },
                finish: { ...p.finish, masked: false },
              }))
            }
          >
            Whole image
          </button>
          <button
            className={s.finish.masked ? "active" : ""}
            onClick={() => {
              const mask = s.finish.masks[0] || newMask("rectangle");
              d.setState((p) => ({
                ...p,
                finish: {
                  ...p.finish,
                  masked: true,
                  masks: p.finish.masks.length ? p.finish.masks : [mask],
                },
              }));
              setSelectedMask(mask.id);
              onMasks();
            }}
          >
            Selected area
          </button>
        </div>
        <button
          className="neural-controls-toggle"
          aria-expanded={controlsOpen}
          aria-controls="neural-controls"
          onClick={() => setControlsOpen((open) => !open)}
        >
          <ChevronDown size={14} /> Controls
        </button>
        <button
          className="neural-reset"
          title="Reset neural adjustments"
          aria-label="Reset neural adjustments"
          onClick={() =>
            d.setState((p) => ({
              ...p,
              local: { ...p.local, intensity: 1, tone: 1, structure: 1 },
            }))
          }
        >
          <RotateCcw size={19} />
          Reset
        </button>
      </header>
      {!s.neural.enabled && (
        <p className="neural-status">Neural rendering off</p>
      )}
      {(d.info?.neuralSupported === false || s.neural.toneMap) && (
        <div className="neural-input-mode">
          <span>
            {s.neural.toneMap
              ? "Neural input: tone-mapped SDR · 16-bit"
              : "HDR source · SDR input required"}
          </span>
          <button
            title="Create a non-destructive 16-bit sRGB neural input using Reinhard highlight compression. Negative values are clipped in this working copy. The original HDR image is unchanged. Neural output is SDR."
            onClick={() => {
              const toneMap = !s.neural.toneMap;
              d.setError("");
              d.setState((p) => ({
                ...p,
                neural: { ...p.neural, toneMap, enabled: toneMap },
              }));
            }}
          >
            {s.neural.toneMap ? "Use original HDR" : "Tone-map for neural"}
          </button>
        </div>
      )}
      {controlsOpen && (
        <div
          id="neural-controls"
          className="neural-control-grid neural-controls"
        >
          {(["intensity", "tone", "structure"] as const).map((key, i) => {
            const Icon = [CircleDot, Circle, Triangle][i];
            return (
              <Control
                key={key}
                card
                icon={<Icon size={28} strokeWidth={1.6} />}
                label={["Intensity", "Local tone", "Local structure"][i]}
                value={s.local[key]}
                min={0}
                max={2}
                step={0.01}
                reset={1}
                disabled={!s.neural.enabled}
                tip="Neural provider parameter. Default 1; range 0–2."
                onChange={(value) =>
                  d.setState((p) => ({
                    ...p,
                    local: { ...p.local, [key]: value },
                  }))
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function QuickExport({
  d,
  onSettings,
}: {
  d: Document;
  onSettings?: () => void;
}) {
  return (
    <section className="classic-export compact-export">
      <header>
        <h2>Export</h2>
        <button
          className="export-summary"
          aria-label="Output settings"
          title="Output settings"
          onClick={onSettings}
          disabled={!onSettings}
        >
          {d.output.format.toUpperCase()} · {d.output.bitDepth}-bit
        </button>
      </header>
      <div>
        <button
          className="export-clipboard"
          aria-label="Copy to Clipboard"
          title={
            !isTauri()
              ? "Clipboard output is available in the Windows app"
              : "Copy finished image to clipboard"
          }
          disabled={!d.ready || d.busy || !isTauri()}
          onClick={() => d.exportImage("clipboard")}
        >
          <Clipboard size={18} strokeWidth={1.6} />
        </button>
        <button
          className="export-file primary"
          title={
            d.editing
              ? "Finish the current edit to export"
              : !d.ready || d.busy
                ? "Wait for the preview to finish"
                : "Export finished image"
          }
          disabled={!d.ready || d.busy}
          onClick={() => d.exportImage("file")}
        >
          <Download size={18} strokeWidth={1.6} />
          <span>Export to File</span>
        </button>
        <button
          className="export-variants"
          aria-label="Export All Variants"
          disabled={!d.ready || d.busy || !isTauri()}
          onClick={() => d.exportImage("all")}
          title={
            !isTauri()
              ? "Variant export is available in the Windows app"
              : "Export snapshots, or all built-in presets when no snapshots exist"
          }
        >
          <Layers size={18} strokeWidth={1.6} />
        </button>
      </div>
    </section>
  );
}

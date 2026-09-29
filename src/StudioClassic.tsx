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
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { Control } from "./StudioControls";
import { useStudio } from "./useStudio";
import { newMask } from "./finish";

type Document = ReturnType<typeof useStudio>;

export function QuickLook({ d }: { d: Document }) {
  const s = d.state;
  const controls = [
    ["contrast", "Contrast", Sun, "#e3aa52"],
    ["gamma", "Gamma", Activity, "#73b0cb"],
    ["vibrance", "Vibrance", Aperture, "#50a34a"],
    ["brightness", "Brightness", Sun, "#d38c29"],
    ["saturation", "Saturation", Droplet, "#ef2c6e"],
    ["hue", "Hue", Rainbow, "#e3aa52"],
  ] as const;
  return (
    <div className="quick-look">
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
      <div className="classic-color-grid">
        {controls.map(([key, label, Icon, accent]) => (
          <div className={key === "hue" ? "hue-control" : ""} key={key}>
            <Control
              card
              label={label}
              icon={<Icon size={28} strokeWidth={1.6} />}
              accent={accent}
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
  return (
    <section className="neural-adjustments">
      <header>
        <h2>Neural Adjustments</h2>
        <label
          className="neural-enable"
          title={
            d.info?.hdr || (d.info?.bitDepth || 8) > 8
              ? "Neural runtime supports 8-bit SDR sources only"
              : "Enable the separately installed neural runtime"
          }
        >
          <input
            aria-label="Enable neural rendering"
            type="checkbox"
            checked={s.neural.enabled}
            disabled={
              !isTauri() || !!d.info?.hdr || (d.info?.bitDepth || 8) > 8
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
      <div className="neural-control-grid">
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
    </section>
  );
}

export function QuickExport({ d }: { d: Document }) {
  return (
    <section className="classic-export">
      <h2>Export</h2>
      <div>
        <button
          disabled={!d.ready || d.busy || !isTauri()}
          onClick={() => d.exportImage("clipboard")}
        >
          <Clipboard size={30} strokeWidth={1.6} />
          <span>
            Copy to
            <br />
            Clipboard
          </span>
        </button>
        <button
          disabled={!d.ready || d.busy}
          onClick={() => d.exportImage("file")}
        >
          <Download size={32} strokeWidth={1.6} />
          <span>Export to File</span>
        </button>
        <button
          disabled={!d.ready || d.busy || !isTauri()}
          onClick={() => d.exportImage("all")}
          title="Export snapshots, or all built-in presets when no snapshots exist"
        >
          <Layers size={32} strokeWidth={1.6} />
          <span>
            Export All
            <br />
            Variants
          </span>
        </button>
      </div>
    </section>
  );
}

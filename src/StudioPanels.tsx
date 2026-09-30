import { LutPanel } from "./LutPanel";
import { collectLuts, restoreLuts, prepareLut } from "./lutLibrary";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  X,
  Copy,
  Trash2,
  Star,
  Bookmark,
  Camera,
  RotateCcw,
  Download,
  Clipboard,
  SlidersHorizontal,
  History,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { QuickLook } from "./StudioClassic";
import { WorkspaceSection } from "./WorkspaceSection";
import { Control, Group, CurveEditor, ColorWheel } from "./StudioControls";
import { useStudio, imageUrl } from "./useStudio";
import { defaults, type StudioState } from "./state";
import { uniqueVariantName } from "./variantNames";
import {
  finishDefaults,
  newMask,
  blendPreset,
  normalizeState,
  editKey,
  type Finish,
  type MaskKind,
  type NamedState,
  type MaskLayer,
} from "./finish";
type Document = ReturnType<typeof useStudio>;
const builtin = (): NamedState[] =>
  [
    "Clean Render",
    "Neutral",
    "Cinematic",
    "Natural",
    "Moody",
    "Product Shot",
    "Architecture",
    "Game Asset",
    "High Contrast",
    "Soft Film",
    "Studio",
    "Exterior",
    "Interior",
  ].map((name, i) => {
    const s = defaults();
    if (name === "Cinematic") {
      s.neural.style = "Cinematic";
      s.contrast = 10;
      s.saturation = -6;
      s.finish.vignette = 10;
    } else if (name === "Natural") {
      s.neural.style = "Natural";
      s.vibrance = 8;
    } else if (name === "Moody") {
      s.finish.exposure = -0.25;
      s.contrast = 12;
      s.saturation = -12;
      s.finish.vignette = 18;
    } else if (name === "Product Shot") {
      s.finish.exposure = 0.15;
      s.finish.sharpen = 15;
    } else if (name === "Architecture") {
      s.finish.clarity = 12;
      s.finish.shadows = 12;
    } else if (name === "Game Asset") {
      s.finish.texture = 12;
      s.finish.sharpen = 10;
    } else if (name === "High Contrast") {
      s.contrast = 24;
      s.finish.blacks = -12;
    } else if (name === "Soft Film") {
      s.contrast = -8;
      s.finish.grain = 6;
      s.finish.highlights = -15;
    } else if (name === "Studio") {
      s.finish.shadows = 8;
      s.vibrance = 6;
    } else if (name === "Exterior") {
      s.finish.highlights = -18;
      s.finish.dehaze = 7;
    } else if (name === "Interior") {
      s.finish.shadows = 25;
      s.finish.temperature = 5;
    }
    return { id: "builtin-" + i, name, category: name, state: s };
  });
export function Variants({
  d,
  bottom,
  setBottom,
  presetRequest,
}: {
  d: Document;
  bottom: string;
  setBottom: (v: string) => void;
  presetRequest?: { id: string; token: number } | null;
}) {
  const [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [selectedSnapshot, setSelectedSnapshot] = useState(""),
    [strength, setStrength] = useState(100),
    [part, setPart] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [deletedSnapshot, setDeletedSnapshot] = useState<{
    item: NamedState;
    index: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const nameInput = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const captureButton = useRef<HTMLButtonElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const lastPresetToken = useRef(presetRequest?.token);
  const strengthStart = useRef<{ value: number; state: StudioState } | null>(
    null,
  );
  const currentKey = editKey(d.state);
  const matchingSnapshots = d.snapshots.filter(
    (item) => editKey(item.state) === currentKey,
  );
  const activeSnapshot =
    matchingSnapshots.find((item) => item.id === selectedSnapshot)?.id ||
    matchingSnapshots[0]?.id ||
    "";
  const canCapture =
    !!d.source && !!d.image && d.ready && !d.busy && !d.editing;
  const captureTitle = d.editing
    ? "Finish the current edit to create a snapshot"
    : !d.source
      ? "Open an image to create a snapshot"
      : !canCapture
        ? "Wait for the preview to finish"
        : "Create snapshot";
  const base = useRef<StudioState | null>(null);
  const presets = useMemo(
    () => [
      ...d.presets.filter((p) => p.favorite),
      ...builtin(),
      ...d.presets.filter((p) => !p.favorite),
    ],
    [d.presets],
  );
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    setName("");
    setSelected("");
    setSelectedSnapshot("");
    setRenaming(null);
    setDeletedSnapshot(null);
    setFeedback("");
    base.current = null;
  }, [d.source]);
  useEffect(() => {
    if (!d.source) return;
    const full = document.createElement("canvas");
    full.width = d.source.width;
    full.height = d.source.height;
    full.getContext("2d")!.putImageData(d.source, 0, 0);
    const small = document.createElement("canvas"),
      scale = 160 / Math.max(full.width, full.height);
    small.width = Math.max(1, Math.round(full.width * scale));
    small.height = Math.max(1, Math.round(full.height * scale));
    small.getContext("2d")!.drawImage(full, 0, 0, small.width, small.height);
    const worker = new Worker(
      new URL("./thumbnail.worker.ts", import.meta.url),
      { type: "module" },
    );
    setThumbs({});
    worker.onmessage = ({ data }) =>
      setThumbs((v) => ({ ...v, [data.id]: imageUrl(data.image) }));
    const image = small
      .getContext("2d")!
      .getImageData(0, 0, small.width, small.height);
    let active = true;
    void Promise.allSettled(
      presets.map(async (item) => ({
        id: item.id,
        lut: await prepareLut(item.state.finish),
      })),
    )
      .then((luts) => {
        const ready = luts.flatMap((v) =>
          v.status === "fulfilled" ? [v.value] : [],
        );
        if (active)
          worker.postMessage({
            image,
            items: presets.filter((v) => ready.some((r) => r.id === v.id)),
            luts: Object.fromEntries(ready.map((v) => [v.id, v.lut])),
          });
      })
      .catch(() => {});
    return () => {
      active = false;
      worker.terminate();
    };
  }, [d.source, presets]);
  const captureThumbnail = () => {
    if (!d.image || !d.ready) return undefined;
    const full = document.createElement("canvas");
    full.width = d.image.width;
    full.height = d.image.height;
    full.getContext("2d")!.putImageData(d.image, 0, 0);
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = Math.max(1, Math.round((160 * d.image.height) / d.image.width));
    c.getContext("2d")!.drawImage(full, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  };
  const apply = (id: string, n = strength, p = part) => {
    const preset = presets.find((v) => v.id === id);
    if (!preset) return;
    if (id !== selected || !base.current)
      base.current = structuredClone(d.state);
    setSelected(id);
    setSelectedSnapshot("");
    setDeletedSnapshot(null);
    d.setState(blendPreset(base.current, preset.state, n, p));
    setFeedback(
      `Applied ${preset.name} · ${n}% ${p === "all" ? "all adjustments" : p}`,
    );
  };
  useEffect(() => {
    if (presetRequest && presetRequest.token !== lastPresetToken.current) {
      lastPresetToken.current = presetRequest.token;
      apply(presetRequest.id);
    }
  }, [presetRequest]);
  useEffect(() => {
    if (renaming) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming?.id]);
  const focusSnapshot = (id: string) => {
    requestAnimationFrame(() =>
      strip.current
        ?.querySelector<HTMLButtonElement>(
          `[data-snapshot-id="${id}"] > button`,
        )
        ?.focus(),
    );
  };
  const capture = () => {
    if (!canCapture) return;
    const id = crypto.randomUUID();
    const snapshotName = uniqueVariantName(name, "Snapshot", d.snapshots);
    const thumbnail = captureThumbnail();
    d.setSnapshots((v) =>
      [
        ...v,
        {
          id,
          name: snapshotName,
          thumbnail,
          state: structuredClone(d.state),
        },
      ].slice(-64),
    );
    setSelectedSnapshot(id);
    setName("");
    setDeletedSnapshot(null);
    setFeedback(`Created ${snapshotName}`);
    setBottom("Snapshots");
    focusSnapshot(id);
  };
  const savePreset = () => {
    const id = crypto.randomUUID();
    const presetName = uniqueVariantName(name, "Preset", d.presets);
    d.setPresets((v) => [
      ...v,
      {
        id,
        name: presetName,
        category: "User",
        state: structuredClone(d.state),
      },
    ]);
    setName("");
    setDeletedSnapshot(null);
    setFeedback(`Saved ${presetName}`);
    nameInput.current?.focus();
    setBottom("Presets");
  };
  const finishRename = (commit: boolean) => {
    if (!renaming) return;
    const id = renaming.id;
    if (commit) {
      const nextName = uniqueVariantName(
        renaming.name,
        "Snapshot",
        d.snapshots.filter((item) => item.id !== id),
      );
      d.setSnapshots((items) =>
        items.map((item) =>
          item.id === id ? { ...item, name: nextName } : item,
        ),
      );
      setFeedback(`Renamed to ${nextName}`);
      setDeletedSnapshot(null);
    }
    setRenaming(null);
    focusSnapshot(id);
  };
  return (
    <section
      className={`variant-shelf${bottom === "Snapshots" && !d.snapshots.length ? " shelf-empty" : ""}`}
    >
      <div className="shelf-toolbar">
        <div className="shelf-tabs">
          {["Presets", "Snapshots", "History"].map((n) => (
            <button
              className={bottom === n ? "active" : ""}
              aria-pressed={bottom === n}
              key={n}
              onClick={() => setBottom(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="shelf-actions">
          <input
            ref={nameInput}
            aria-label="Variant name"
            placeholder="Snapshot / preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (bottom === "Presets") savePreset();
                else capture();
              }
            }}
          />
          <button
            ref={captureButton}
            className="snapshot-action"
            title={captureTitle}
            aria-label="Create snapshot"
            disabled={!canCapture}
            onClick={capture}
          >
            <Camera size={17} />
          </button>
          <button
            title="Save preset"
            aria-label="Save preset"
            onClick={savePreset}
          >
            <Bookmark size={17} />
            <span>Save preset</span>
          </button>
          <button
            title="Reset all"
            aria-label="Reset all"
            onClick={() => {
              const s = defaults();
              s.neural.enabled = d.state.neural.enabled;
              s.neural.toneMap = d.state.neural.toneMap;
              s.zoom = d.state.zoom;
              setSelected("");
              setSelectedSnapshot("");
              base.current = null;
              setDeletedSnapshot(null);
              setFeedback("Reset adjustments");
              d.setState(s);
            }}
          >
            <RotateCcw size={17} />
            <span>Reset</span>
          </button>
        </div>
      </div>
      {(feedback || deletedSnapshot) && (
        <div className="shelf-feedback" role="status" aria-live="polite">
          <span>
            {deletedSnapshot
              ? `Deleted ${deletedSnapshot.item.name}`
              : feedback}
          </span>
          {deletedSnapshot && (
            <button
              type="button"
              onClick={() => {
                const { item, index } = deletedSnapshot;
                d.setSnapshots((items) => {
                  if (items.some((snapshot) => snapshot.id === item.id))
                    return items;
                  const next = items.slice();
                  next.splice(Math.min(index, next.length), 0, item);
                  return next.slice(-64);
                });
                setDeletedSnapshot(null);
                setFeedback(`Restored ${item.name}`);
                setSelectedSnapshot(item.id);
                focusSnapshot(item.id);
              }}
            >
              Undo delete
            </button>
          )}
        </div>
      )}
      {bottom === "Presets" && selected && (
        <div className="preset-strength">
          <label>
            Strength
            <input
              aria-label="Preset strength"
              type="number"
              min={0}
              max={100}
              value={strength}
              onFocus={() => {
                strengthStart.current = {
                  value: strength,
                  state: structuredClone(d.state),
                };
              }}
              onChange={(e) => {
                const value = e.target.valueAsNumber;
                if (!Number.isFinite(value)) return;
                const n = Math.max(0, Math.min(100, value));
                setStrength(n);
                apply(selected, n);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  const start = strengthStart.current;
                  if (start) {
                    setStrength(start.value);
                    d.setState(structuredClone(start.state));
                    setFeedback("Canceled preset strength edit");
                  }
                  event.currentTarget.blur();
                }
              }}
            />
            %
          </label>
          <select
            aria-label="Preset groups"
            value={part}
            onChange={(e) => {
              setPart(e.target.value);
              apply(selected, strength, e.target.value);
            }}
          >
            {["all", "tone", "color", "lens", "detail"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      <div className="variant-strip" ref={strip}>
        {bottom === "History"
          ? d.history.map((h, i) => (
              <button
                key={h.id}
                className={d.cursor === i ? "active" : ""}
                aria-pressed={d.cursor === i}
                onClick={() => d.restore(i)}
              >
                <History size={16} />
                <span>{h.name}</span>
              </button>
            ))
          : (bottom === "Presets" ? presets : d.snapshots).map((v) => (
              <div
                className={`variant ${(bottom === "Presets" ? selected : activeSnapshot) === v.id ? "active" : ""}`}
                key={v.id}
                data-snapshot-id={bottom === "Snapshots" ? v.id : undefined}
              >
                <button
                  aria-pressed={
                    (bottom === "Presets" ? selected : activeSnapshot) === v.id
                  }
                  title={
                    bottom === "Presets"
                      ? `Apply ${v.name}`
                      : `Restore ${v.name}`
                  }
                  onClick={() => {
                    if (bottom === "Presets") apply(v.id);
                    else {
                      setSelectedSnapshot(v.id);
                      setSelected("");
                      base.current = null;
                      setDeletedSnapshot(null);
                      setFeedback(`Restored ${v.name}`);
                      d.setState(structuredClone(v.state));
                    }
                  }}
                >
                  {(v.thumbnail || thumbs[v.id]) && (
                    <img
                      src={v.thumbnail || thumbs[v.id]}
                      alt={
                        bottom === "Presets"
                          ? "Grading preview"
                          : "Captured snapshot"
                      }
                      title={
                        bottom === "Presets"
                          ? "Grading preview. Neural rendering evaluates when applied."
                          : v.name
                      }
                    />
                  )}
                  <span
                    hidden={bottom === "Snapshots" && renaming?.id === v.id}
                  >
                    {v.name}
                  </span>
                </button>
                {bottom === "Snapshots" && (
                  <>
                    {renaming?.id === v.id && (
                      <input
                        ref={renameInput}
                        className="variant-name-input"
                        aria-label={`Rename snapshot ${v.name}`}
                        value={renaming.name}
                        maxLength={64}
                        onChange={(event) =>
                          setRenaming({ id: v.id, name: event.target.value })
                        }
                        onBlur={() => finishRename(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            finishRename(event.key === "Enter");
                          }
                        }}
                      />
                    )}
                    <button
                      className="variant-rename"
                      title={`Rename ${v.name}`}
                      aria-label={`Rename snapshot ${v.name}`}
                      onClick={() => setRenaming({ id: v.id, name: v.name })}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="variant-delete"
                      title={`Delete ${v.name}`}
                      aria-label={`Delete snapshot ${v.name}`}
                      onClick={() => {
                        const index = d.snapshots.findIndex(
                          (item) => item.id === v.id,
                        );
                        const nextFocus =
                          d.snapshots[index + 1] || d.snapshots[index - 1];
                        setRenaming(null);
                        setDeletedSnapshot({ item: v, index });
                        d.setSnapshots((q) => q.filter((p) => p.id !== v.id));
                        if (selectedSnapshot === v.id) setSelectedSnapshot("");
                        if (nextFocus) focusSnapshot(nextFocus.id);
                        else
                          requestAnimationFrame(() =>
                            captureButton.current?.focus(),
                          );
                      }}
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
        {bottom === "Snapshots" && !d.snapshots.length && (
          <button
            className="add-variant shelf-empty-action"
            title={captureTitle}
            disabled={!canCapture}
            onClick={capture}
          >
            <Plus />
            Create snapshot
          </button>
        )}
      </div>
    </section>
  );
}
type PanelProps = {
  d: Document;
  workspace: string;
  setWorkspace: (v: string) => void;
  tab: string;
  selectedMask: string;
  setSelectedMask: (v: string) => void;
  maskOverlay: boolean;
  setMaskOverlay: (v: boolean) => void;
  overlayOpacity: number;
  setOverlayOpacity: (v: number) => void;
  setPicker: (v: "white" | "color" | "focus" | "id" | null) => void;
  erase: boolean;
  setErase: (v: boolean) => void;
  onPresetSelect?: (id: string) => void;
};

export function Panels(props: PanelProps) {
  if (props.tab !== "Workspace")
    return <PanelContent {...props} workspace="Adjust" />;
  const workspace = ["Masks", "Render Passes", "Presets", "Batch"].includes(
    props.workspace,
  )
    ? props.workspace
    : "Masks";
  return (
    <WorkspaceSection workspace={workspace} onSelect={props.setWorkspace}>
      <PanelContent {...props} workspace={workspace} />
    </WorkspaceSection>
  );
}

function PanelContent({
  d,
  workspace,
  setWorkspace,
  tab,
  selectedMask,
  setSelectedMask,
  maskOverlay,
  setMaskOverlay,
  overlayOpacity,
  setOverlayOpacity,
  setPicker,
  erase,
  setErase,
  onPresetSelect,
}: PanelProps) {
  const s = d.state,
    a = s.finish;
  const patch = (v: Partial<Finish>) =>
    d.setState((p) => ({ ...p, finish: { ...p.finish, ...v } }));
  const mask = a.masks.find((m) => m.id === selectedMask);
  const updateMask = (v: Partial<MaskLayer>) =>
    patch({
      masks: a.masks.map((m) => (m.id === selectedMask ? { ...m, ...v } : m)),
    });
  const control = (
    key: keyof Finish,
    label: string,
    min = -100,
    max = 100,
    step = 1,
    tip?: string,
  ) => (
    <Control
      key={key}
      label={label}
      value={a[key] as number}
      min={min}
      max={max}
      step={step}
      reset={finishDefaults()[key] as number}
      onChange={(v) => patch({ [key]: v })}
      tip={tip}
    />
  );
  const colorControl = (
    key:
      "contrast" | "gamma" | "brightness" | "saturation" | "vibrance" | "hue",
  ) => (
    <Control
      key={key}
      label={key[0].toUpperCase() + key.slice(1)}
      value={s[key]}
      min={key === "hue" ? -180 : -100}
      max={key === "hue" ? 180 : 100}
      onChange={(v) => d.setState((s) => ({ ...s, [key]: v }))}
    />
  );
  if (workspace === "Batch") return <BatchPanel d={d} />;
  if (workspace === "Presets")
    return <PresetPanel d={d} onSelect={onPresetSelect} />;
  if (workspace === "Render Passes")
    return (
      <>
        <h2>Render Passes</h2>
        <p className="muted">
          Data passes keep their numeric values. Dimensions must match Beauty.
        </p>
        <label>
          Pass name
          <select id="pass-name">
            {[
              "Albedo",
              "Normal",
              "Depth",
              "AO",
              "Roughness",
              "Metallic",
              "Emission",
              "Shadow",
              "Diffuse",
              "Specular",
              "Object ID",
              "Material ID",
            ].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          disabled={!isTauri()}
          onClick={() =>
            d.addPass(
              (document.getElementById("pass-name") as HTMLSelectElement).value,
            )
          }
        >
          Import pass
        </button>
        <label>
          Solo
          <select
            aria-label="Display pass"
            value={a.soloPass}
            onChange={(e) => patch({ soloPass: e.target.value })}
          >
            <option value="">Beauty</option>
            {d.info?.passes.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {a.soloPass && (
          <>
            <Control
              label="Remap low"
              value={a.passLow}
              min={-100}
              max={100}
              step={0.01}
              onChange={(v) => patch({ passLow: v })}
            />
            <Control
              label="Remap high"
              value={a.passHigh}
              min={-100}
              max={100}
              step={0.01}
              reset={1}
              onChange={(v) => patch({ passHigh: v })}
            />
            <label>
              <input
                type="checkbox"
                checked={a.passInvert}
                onChange={(e) => patch({ passInvert: e.target.checked })}
              />
              Invert display
            </label>
            <button
              onClick={() => {
                const m = newMask("pass");
                m.pass = a.soloPass;
                m.name = a.soloPass;
                patch({ masks: [...a.masks, m], soloPass: "", masked: true });
                setSelectedMask(m.id);
                setWorkspace("Masks");
              }}
            >
              Use as mask
            </button>
          </>
        )}
        <p className="muted">
          Flat EXR layers/channels appear here. Cryptomatte manifests, deep EXR
          and pass reconstruction are not supported in this build.
        </p>
      </>
    );
  if (workspace === "Masks")
    return (
      <>
        <div className="panel-heading">
          <h2>Masks</h2>
          <select
            aria-label="Add mask"
            value=""
            onChange={(e) => {
              const m = newMask(e.target.value as MaskKind);
              m.name = uniqueVariantName(m.name, "Mask", a.masks);
              patch({ masks: [...a.masks, m], masked: true });
              setSelectedMask(m.id);
            }}
          >
            <option value="">+ Add mask</option>
            {[
              "rectangle",
              "ellipse",
              "brush",
              "polygon",
              "linear",
              "radial",
              "luminance",
              "color",
              "pass",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={a.masked}
            onChange={(e) => patch({ masked: e.target.checked })}
          />
          Limit adjustments to mask stack
        </label>
        <div className="mask-list">
          {a.masks.map((m, i) => (
            <div className={selectedMask === m.id ? "active" : ""} key={m.id}>
              <input
                type="checkbox"
                aria-label={`Enable ${m.name}`}
                checked={m.enabled}
                onChange={(e) =>
                  patch({
                    masks: a.masks.map((v) =>
                      v.id === m.id ? { ...v, enabled: e.target.checked } : v,
                    ),
                  })
                }
              />
              <button
                aria-pressed={selectedMask === m.id}
                onClick={() => setSelectedMask(m.id)}
              >
                {m.name}
              </button>
              <button
                title="Move mask up"
                aria-label={`Move ${m.name} up`}
                disabled={i === 0}
                onClick={() => {
                  const arr = a.masks.slice();
                  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                  patch({ masks: arr });
                }}
              >
                <ArrowUp size={13} />
              </button>
              <button
                title="Move mask down"
                aria-label={`Move ${m.name} down`}
                disabled={i === a.masks.length - 1}
                onClick={() => {
                  const arr = a.masks.slice();
                  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                  patch({ masks: arr });
                }}
              >
                <ArrowDown size={13} />
              </button>
            </div>
          ))}
        </div>
        {!a.masks.length && (
          <p className="mask-empty">
            Choose a mask type with Add mask, then refine its coverage.
          </p>
        )}
        {mask && (
          <>
            <input
              aria-label="Mask name"
              value={mask.name}
              onChange={(e) => updateMask({ name: e.target.value })}
            />
            <p className="mask-mode" role="status">
              <strong>
                {mask.kind === "brush"
                  ? erase
                    ? "Eraser"
                    : "Brush"
                  : `${mask.kind[0].toUpperCase()}${mask.kind.slice(1)} mask`}
              </strong>
              <span>
                {
                  (
                    {
                      rectangle:
                        "Drag between two corners on the image. Space-drag pans.",
                      ellipse:
                        "Drag across the oval on the image. Space-drag pans.",
                      brush: erase
                        ? "Drag to erase strokes. Space-drag pans."
                        : "Drag to paint. Alt-drag erases; Space-drag pans.",
                      polygon:
                        "Click each vertex on the image. The polygon closes automatically.",
                      linear:
                        "Drag to place the gradient on the image. Space-drag pans.",
                      radial:
                        "Drag to place the radial area on the image. Space-drag pans.",
                      luminance:
                        "Set Range low and Range high to select brightness.",
                      color:
                        "Pick color, then click the image. Refine with Color tolerance.",
                      pass: "Choose a pass, then set its range or pick an ID / depth value.",
                    } satisfies Record<MaskKind, string>
                  )[mask.kind]
                }
              </span>
            </p>
            <div className="inline-actions">
              <button
                onClick={() => {
                  const m = {
                    ...structuredClone(mask),
                    id: crypto.randomUUID(),
                    name: uniqueVariantName(
                      mask.name + " copy",
                      "Mask",
                      a.masks,
                    ),
                  };
                  patch({ masks: [...a.masks, m] });
                  setSelectedMask(m.id);
                }}
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  const index = a.masks.findIndex(
                    (item) => item.id === mask.id,
                  );
                  const next = a.masks[index + 1] || a.masks[index - 1];
                  patch({ masks: a.masks.filter((m) => m.id !== mask.id) });
                  setSelectedMask(next?.id || "");
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
            <label>
              Combine
              <select
                value={mask.operation}
                onChange={(e) =>
                  updateMask({
                    operation: e.target.value as MaskLayer["operation"],
                  })
                }
              >
                {["add", "subtract", "intersect"].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={mask.invert}
                onChange={(e) => updateMask({ invert: e.target.checked })}
              />
              Invert
            </label>
            {["opacity", "feather"].map((k) => (
              <Control
                key={k}
                label={k[0].toUpperCase() + k.slice(1)}
                value={mask[k as "opacity"]}
                min={0}
                max={100}
                onChange={(v) => updateMask({ [k]: v })}
              />
            ))}
            {mask.kind === "polygon" && (
              <>
                <button onClick={() => updateMask({ points: [] })}>
                  Clear polygon
                </button>
              </>
            )}
            <details>
              <summary>Refine mask</summary>
              <Control
                label="Expand / Contract"
                value={mask.expand || 0}
                min={-100}
                max={100}
                onChange={(v) => updateMask({ expand: v })}
              />
              <Control
                label="Mask blur"
                value={mask.blur || 0}
                min={0}
                max={100}
                onChange={(v) => updateMask({ blur: v })}
              />
            </details>
            {mask.kind === "brush" && (
              <>
                <div className="scope-switch">
                  <button
                    className={!erase ? "active" : ""}
                    aria-pressed={!erase}
                    onClick={() => setErase(false)}
                  >
                    Brush
                  </button>
                  <button
                    className={erase ? "active" : ""}
                    aria-pressed={erase}
                    onClick={() => setErase(true)}
                  >
                    Eraser
                  </button>
                </div>
                <label>
                  Dodge / Burn mode
                  <select
                    value={mask.dodgeMode || "exposure"}
                    onChange={(e) =>
                      updateMask({
                        dodgeMode: e.target.value as MaskLayer["dodgeMode"],
                      })
                    }
                  >
                    {["exposure", "highlights", "shadows", "saturation"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </label>
                <Control
                  label="Radius"
                  value={mask.radius}
                  min={0.002}
                  max={0.25}
                  step={0.001}
                  onChange={(v) => updateMask({ radius: v })}
                />
                <Control
                  label="Hardness"
                  value={mask.hardness}
                  min={0}
                  max={99}
                  onChange={(v) => updateMask({ hardness: v })}
                />
                <Control
                  label="Flow"
                  value={mask.flow}
                  min={1}
                  max={100}
                  onChange={(v) => updateMask({ flow: v })}
                />
                <Control
                  label="Dodge / Burn EV"
                  value={mask.exposure}
                  min={-3}
                  max={3}
                  step={0.05}
                  onChange={(v) => updateMask({ exposure: v })}
                />
                <button
                  onClick={() => updateMask({ points: [], strokeOps: [] })}
                >
                  Clear strokes
                </button>
              </>
            )}
            {["luminance", "pass", "color"].includes(mask.kind) && (
              <>
                {mask.kind !== "color" && (
                  <Control
                    label="Range low"
                    value={mask.low}
                    min={mask.kind === "pass" ? -1000000 : 0}
                    max={mask.kind === "pass" ? 1000000 : 10}
                    step={0.01}
                    onChange={(v) => updateMask({ low: v })}
                  />
                )}
                <Control
                  label={
                    mask.kind === "color" ? "Color tolerance" : "Range high"
                  }
                  value={mask.high}
                  min={mask.kind === "pass" ? -1000000 : 0}
                  max={
                    mask.kind === "pass"
                      ? 1000000
                      : mask.kind === "color"
                        ? 1.75
                        : 10
                  }
                  step={0.01}
                  onChange={(v) => updateMask({ high: v })}
                />
                {mask.kind === "color" && (
                  <button onClick={() => setPicker("color")}>Pick color</button>
                )}
                {mask.kind === "pass" && (
                  <select
                    aria-label="Mask pass"
                    value={mask.pass}
                    onChange={(e) => updateMask({ pass: e.target.value })}
                  >
                    <option value="">Choose pass</option>
                    {d.info?.passes.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                )}
              </>
            )}
            {mask.kind === "pass" && (
              <button disabled={!mask.pass} onClick={() => setPicker("id")}>
                Pick ID / depth value
              </button>
            )}
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={maskOverlay}
            onChange={(e) => setMaskOverlay(e.target.checked)}
          />
          Show mask overlay
        </label>
        <Control
          label="Overlay opacity"
          value={overlayOpacity * 100}
          min={0}
          max={100}
          onChange={(v) => setOverlayOpacity(v / 100)}
        />
      </>
    );
  if (tab === "Adjust") return <QuickLook d={d} />;
  if (tab === "Refine")
    return (
      <>
        <LutPanel d={d} />
        <Group
          name="Enhance"
          initial
          onReset={() =>
            d.setState((s) => ({
              ...s,
              local: { ...s.local, intensity: 1 },
              finish: {
                ...s.finish,
                denoise: 0,
                chromaDenoise: 0,
                sharpen: 0,
                texture: 0,
              },
            }))
          }
        >
          <Control
            label="DLSS Detail"
            value={s.local.intensity * 50}
            min={0}
            max={100}
            reset={50}
            disabled={!s.neural.enabled}
            onChange={(v) =>
              d.setState((s) => ({
                ...s,
                local: { ...s.local, intensity: v / 50 },
              }))
            }
            tip="Maps 0–100 to runtime intensity 0–2. Compare output to preserve your render identity."
          />
          {control(
            "denoise",
            "Luminance denoise",
            0,
            100,
            1,
            "Smooths luminance noise while protecting strong edges.",
          )}
          {control("sharpen", "Sharpen", 0, 100)}
          <details>
            <summary>Advanced</summary>
            {control("chromaDenoise", "Chroma denoise", 0, 100)}
            {control("preserveDetail", "Preserve detail", 0, 100)}
            {control("sharpenRadius", "Radius", 0.5, 8, 0.1)}
            {control("sharpenThreshold", "Threshold", 0, 20, 0.1)}
            {control(
              "texture",
              "Micro detail",
              -100,
              100,
              1,
              "Deterministic high-frequency contrast; does not generate content.",
            )}
          </details>
        </Group>
        <Group
          name="Tone"
          onReset={() =>
            d.setState((s) => ({
              ...s,
              contrast: 0,
              gamma: 0,
              brightness: 0,
              finish: {
                ...s.finish,
                exposure: 0,
                highlights: 0,
                shadows: 0,
                whites: 0,
                blacks: 0,
                curves: finishDefaults().curves,
              },
            }))
          }
        >
          <button onClick={() => d.autoAdjust("exposure")}>
            Auto Exposure
          </button>
          {control("exposure", "Exposure", -6, 6, 0.05)}
          {colorControl("contrast")}
          {colorControl("gamma")}
          {colorControl("brightness")}
          {control("highlights", "Highlights")}
          {control("shadows", "Shadows")}
          {control("whites", "Whites")}
          {control("blacks", "Blacks")}
          <details>
            <summary>Curves</summary>
            <CurveEditor
              curves={a.curves}
              onChange={(curves) => patch({ curves })}
            />
          </details>
        </Group>
        <Group
          name="Color"
          onReset={() =>
            d.setState((s) => ({
              ...s,
              saturation: 0,
              vibrance: 0,
              hue: 0,
              finish: {
                ...s.finish,
                temperature: 0,
                tint: 0,
                grade: finishDefaults().grade,
              },
            }))
          }
        >
          <div className="inline-actions">
            <button onClick={() => d.autoAdjust("white")}>Auto WB</button>
            <button onClick={() => setPicker("white")}>Pick neutral</button>
          </div>
          {control("temperature", "Temperature")}
          {control("tint", "Tint")}
          {colorControl("vibrance")}
          {colorControl("saturation")}
          {colorControl("hue")}
          <details>
            <summary>Color grading</summary>
            <div className="color-wheels">
              {["Shadows", "Midtones", "Highlights"].map((name, i) => (
                <ColorWheel
                  key={name}
                  name={name}
                  value={a.grade[i]}
                  onChange={(v) =>
                    patch({ grade: a.grade.map((x, j) => (i === j ? v : x)) })
                  }
                />
              ))}
            </div>
            {control("gradeBalance", "Balance")}
            {control("gradeStrength", "Grade strength", 0, 100)}
            {control("lift", "Lift")}
            {control("gain", "Gain")}
          </details>
        </Group>
        <Group
          name="Local"
          initial
          onReset={() =>
            d.setState((s) => ({
              ...s,
              local: { ...defaults().local, region: s.local.region },
              finish: { ...s.finish, clarity: 0, texture: 0, dehaze: 0 },
            }))
          }
        >
          {control(
            "clarity",
            "Clarity",
            -100,
            100,
            1,
            "Medium-frequency local contrast.",
          )}
          {control(
            "texture",
            "Texture",
            -100,
            100,
            1,
            "Fine surface detail without generating content.",
          )}
          {control(
            "dehaze",
            "Dehaze",
            -100,
            100,
            1,
            "Broad local contrast for atmospheric flattening; use subtly.",
          )}
        </Group>
      </>
    );
  if (tab === "Effects")
    return (
      <>
        <Group
          name="Lens"
          initial
          onReset={() => patch({ bloom: 0, vignette: 0, grain: 0 })}
        >
          {control("bloom", "Bloom", 0, 100)}
          {control("bloomThreshold", "Threshold", 0, 8, 0.05)}
          {control("bloomRadius", "Radius", 1, 80)}
          {control("vignette", "Vignette", 0, 100)}
          {control("vignetteMidpoint", "Midpoint", 0, 100)}
          {control("grain", "Film grain", 0, 100)}
        </Group>
        <Group name="Depth" initial>
          <label>
            Depth pass
            <select
              aria-label="Depth pass"
              value={a.depthPass}
              onChange={(e) => patch({ depthPass: e.target.value })}
            >
              <option value="">Choose depth</option>
              {d.info?.passes.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {control("passLow", "Depth near", -100, 100, 0.01)}
          {control("passHigh", "Depth far", -100, 100, 0.01)}
          {control("focus", "Focus distance", 0, 1, 0.01)}
          <button disabled={!a.depthPass} onClick={() => setPicker("focus")}>
            Pick focus
          </button>
          {control("dof", "Depth blur", 0, 40)}
          {control("fog", "Depth fog", 0, 100)}
          <small>Depth-weighted blur, not an optical bokeh simulation.</small>
        </Group>
      </>
    );
  if (tab === "Tools")
    return (
      <>
        <Group
          name="Crop / Transform"
          initial
          onReset={() =>
            patch({
              crop: finishDefaults().crop,
              rotation: 0,
              flipX: false,
              flipY: false,
            })
          }
        >
          <label>
            Aspect
            <select
              aria-label="Crop aspect"
              defaultValue="Free"
              onChange={(e) => {
                if (
                  e.target.value === "Original" ||
                  e.target.value === "Free"
                ) {
                  patch({ crop: finishDefaults().crop });
                  return;
                }
                const [w, h] = e.target.value.split(":").map(Number),
                  ratio = w / h,
                  sourceRatio = d.info!.width / d.info!.height;
                const width = Math.min(1, ratio / sourceRatio),
                  height = Math.min(1, sourceRatio / ratio);
                patch({
                  crop: {
                    x: (1 - width) / 2,
                    y: (1 - height) / 2,
                    width,
                    height,
                  },
                });
              }}
            >
              {[
                "Free",
                "Original",
                "16:9",
                "16:10",
                "4:3",
                "3:2",
                "1:1",
                "4:5",
                "9:16",
              ].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {(["x", "y", "width", "height"] as const).map((k) => (
            <Control
              key={k}
              label={`Crop ${k}`}
              value={a.crop[k] * 100}
              min={k === "width" || k === "height" ? 1 : 0}
              max={100}
              step={0.1}
              reset={k === "width" || k === "height" ? 100 : 0}
              onChange={(v) => {
                let c = { ...a.crop, [k]: v / 100 };
                c.width = Math.min(c.width, 1 - c.x);
                c.height = Math.min(c.height, 1 - c.y);
                if (c.width > 0 && c.height > 0) patch({ crop: c });
              }}
            />
          ))}
          <div className="inline-actions">
            <button
              onClick={() => patch({ rotation: (a.rotation + 90) % 360 })}
            >
              Rotate 90°
            </button>
            <button onClick={() => patch({ flipX: !a.flipX })}>Flip H</button>
            <button onClick={() => patch({ flipY: !a.flipY })}>Flip V</button>
          </div>
        </Group>
        <Group name="Project" initial>
          <button
            disabled={!isTauri() || !d.info?.path}
            title={
              !isTauri()
                ? "Project files are available in the desktop app"
                : !d.info?.path
                  ? "Open an image from disk to save a project"
                  : "Save project"
            }
            onClick={() => d.saveProject()}
          >
            Save Project
          </button>
          <button
            disabled={!isTauri() || !d.info?.path}
            title={
              !isTauri()
                ? "Project files are available in the desktop app"
                : !d.info?.path
                  ? "Open an image from disk to save a project"
                  : "Save project as"
            }
            onClick={() => d.saveProject(true)}
          >
            Save As
          </button>
          <button
            disabled={!isTauri()}
            title={
              !isTauri()
                ? "Project files are available in the desktop app"
                : "Open project"
            }
            onClick={() => d.openProject()}
          >
            Open Project
          </button>
          <small>{d.projectPath || "Unsaved session"}</small>
        </Group>
      </>
    );
  return <OutputPanel d={d} />;
}
function OutputPanel({ d }: { d: Document }) {
  return (
    <>
      <Group name="Output" initial>
        <label>
          Format
          <select
            aria-label="Output format"
            value={d.output.format}
            onChange={(e) => {
              const f = e.target.value as typeof d.output.format;
              d.setOutput((o) => ({
                ...o,
                format: f,
                bitDepth:
                  f === "exr" ? 32 : f === "jpg" || f === "webp" ? 8 : 16,
                space: f === "exr" ? "linear" : "srgb",
              }));
            }}
          >
            {["png", "jpg", "webp", "tiff", "exr"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Bit depth
          <select
            aria-label="Output bit depth"
            value={d.output.bitDepth}
            onChange={(e) =>
              d.setOutput((o) => ({
                ...o,
                bitDepth: +e.target.value as 8 | 16 | 32,
              }))
            }
          >
            {(d.output.format === "exr"
              ? [16, 32]
              : ["jpg", "webp"].includes(d.output.format)
                ? [8]
                : [8, 16]
            ).map((n) => (
              <option key={n} value={n}>
                {n}
                {d.output.format === "exr" ? " float" : " bit"}
              </option>
            ))}
          </select>
        </label>
        {d.output.format === "jpg" && (
          <Control
            label="JPEG quality"
            value={d.output.quality}
            min={1}
            max={100}
            reset={92}
            onChange={(v) => d.setOutput((o) => ({ ...o, quality: v }))}
          />
        )}
        <label>
          Resolution
          <select
            aria-label="Output size"
            value={d.output.resize}
            onChange={(e) =>
              d.setOutput((o) => ({
                ...o,
                resize: e.target.value as typeof o.resize,
              }))
            }
          >
            <option value="original">Original / cropped dimensions</option>
            <option value="percent">Percentage</option>
            <option value="exact">Exact dimensions</option>
          </select>
        </label>
        {d.output.resize === "percent" && (
          <Control
            label="Output scale"
            value={d.output.scale}
            min={1}
            max={200}
            reset={100}
            onChange={(v) => d.setOutput((o) => ({ ...o, scale: v }))}
          />
        )}{" "}
        {d.output.resize === "exact" && (
          <div className="inline-actions">
            <input
              type="number"
              aria-label="Output width"
              value={d.output.width}
              onChange={(e) =>
                d.setOutput((o) => ({ ...o, width: +e.target.value }))
              }
            />
            <span>×</span>
            <input
              type="number"
              aria-label="Output height"
              value={d.output.height}
              onChange={(e) =>
                d.setOutput((o) => ({ ...o, height: +e.target.value }))
              }
            />
          </div>
        )}
        <label>
          Resize filter
          <select
            value={d.output.filter}
            onChange={(e) =>
              d.setOutput((o) => ({
                ...o,
                filter: e.target.value as typeof o.filter,
              }))
            }
          >
            {["lanczos", "bicubic", "nearest"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Output transfer
          <select
            aria-label="Output color space"
            value={d.output.space}

            onChange={(e) =>
              d.setOutput((o) => ({
                ...o,
                space: e.target.value as typeof o.space,
              }))
            }
          >
            {d.output.format !== "exr" && (
              <>
                <option value="srgb">sRGB</option>
                <option value="p3">Display P3</option>
                <option value="rec709">Rec.709</option>
              </>
            )}
            <option value="linear">Linear sRGB</option>
            {d.output.format === "exr" && (
              <option value="acescg">ACEScg</option>
            )}
          </select>
        </label>
        <label>
          Filename suffix
          <input
            value={d.output.suffix}
            onChange={(e) =>
              d.setOutput((o) => ({
                ...o,
                suffix: e.target.value.replace(/[<>:"/\\|?*]/g, "_"),
              }))
            }
          />
        </label>
        <small>
          Metadata stripped. Integer exports include an ICC profile; EXR records
          its primaries. WebP is lossless. Clipboard is 8-bit sRGB.
        </small>
      </Group>
      <button
        className="primary export-main"
        disabled={!d.ready || d.busy}
        onClick={() => d.exportImage("file")}
      >
        <Download size={18} />
        Export to File
      </button>
      <div className="inline-actions">
        <button
          disabled={!d.ready || d.busy}
          onClick={() => d.exportImage("clipboard")}
        >
          <Clipboard size={17} />
          Copy to Clipboard
        </button>
        <button
          disabled={!d.ready || d.busy}
          onClick={() => d.exportImage("all")}
        >
          Export All Variants
        </button>
      </div>
    </>
  );
}
function PresetPanel({
  d,
  onSelect,
}: {
  d: Document;
  onSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const matches = (preset: NamedState) =>
    `${preset.name} ${preset.category || ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const looks = builtin().filter(matches);
  const saved = d.presets.filter(matches);
  const select = (preset: NamedState) => {
    if (!onSelect) return;
    onSelect(preset.id);
    setSelectedName(preset.name);
  };
  async function load() {
    try {
      const path = await open({
        filters: [{ name: "Studio presets", extensions: ["dlsspresets"] }],
      });
      if (path) {
        const data = JSON.parse(await invoke<string>("read_presets", { path }));
        const raw = Array.isArray(data) ? data : data.presets;
        if (!Array.isArray(data)) await restoreLuts(data.luts);
        if (!Array.isArray(raw) || raw.length > 100)
          throw Error("Invalid preset library");
        d.setPresets((v) => [
          ...v,
          ...raw.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
            state: normalizeState(p.state),
          })),
        ]);
      }
    } catch (e) {
      d.setError(String(e));
    }
  }
  async function write() {
    try {
      const path = await save({
        defaultPath: "studio.dlsspresets",
        filters: [{ name: "Studio presets", extensions: ["dlsspresets"] }],
      });
      if (path)
        await invoke("write_presets", {
          path,
          content: JSON.stringify({
            version: 1,
            presets: d.presets,
            luts: await collectLuts(d.presets.map((v) => v.state)),
          }),
        });
    } catch (e) {
      d.setError(String(e));
    }
  }
  return (
    <>
      <h2>Preset Library</h2>
      <label className="preset-search">
        Search presets
        <input
          type="search"
          aria-label="Search presets"
          placeholder="Name or category"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {selectedName && (
        <p className="preset-library-status" role="status">
          {selectedName} selected. Strength and groups are in the Presets strip.
        </p>
      )}
      {!!looks.length && (
        <>
          <h3>Built-in looks</h3>
          <div className="preset-library-looks">
            {looks.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="preset-library-look"
                aria-label={`Apply preset ${preset.name}`}
                disabled={!d.source || !onSelect}
                onClick={() => select(preset)}
              >
                <span>{preset.name}</span>
                <span>Apply</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3>Saved presets</h3>
      <div className="inline-actions">
        <button disabled={!isTauri()} onClick={load}>
          Import
        </button>
        <button disabled={!isTauri()} onClick={write}>
          Export user presets
        </button>
      </div>
      {saved.map((p) => (
        <div className="preset-row" key={p.id}>
          <button
            title={p.favorite ? "Remove favorite" : "Favorite preset"}
            aria-label={`Favorite preset ${p.name}`}
            aria-pressed={!!p.favorite}
            onClick={() =>
              d.setPresets((v) =>
                v.map((x) =>
                  x.id === p.id ? { ...x, favorite: !x.favorite } : x,
                ),
              )
            }
          >
            <Star size={14} fill={p.favorite ? "currentColor" : "none"} />
          </button>
          <input
            key={p.name}
            aria-label="Preset name"
            defaultValue={p.name}
            maxLength={64}
            onBlur={(event) => {
              const name = uniqueVariantName(
                event.target.value,
                "Preset",
                d.presets.filter((item) => item.id !== p.id),
              );
              if (name !== p.name)
                d.setPresets((items) =>
                  items.map((item) =>
                    item.id === p.id ? { ...item, name } : item,
                  ),
                );
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.value = p.name;
                event.currentTarget.blur();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className="preset-apply"
            aria-label={`Apply preset ${p.name}`}
            disabled={!d.source || !onSelect}
            onClick={() => select(p)}
          >
            Apply
          </button>
          <button
            title="Duplicate preset"
            aria-label={`Duplicate preset ${p.name}`}
            onClick={() =>
              d.setPresets((v) => [
                ...v,
                {
                  ...structuredClone(p),
                  id: crypto.randomUUID(),
                  name: uniqueVariantName(p.name + " copy", "Preset", v),
                },
              ])
            }
          >
            <Copy size={13} />
          </button>
          <button
            title="Delete preset"
            aria-label={`Delete preset ${p.name}`}
            onClick={() => d.setPresets((v) => v.filter((x) => x.id !== p.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {!saved.length && (!query.trim() || looks.length > 0) && (
        <p className="muted">
          {query.trim()
            ? "No saved presets match."
            : "Save current adjustments with Save preset in the strip."}
        </p>
      )}
      {!looks.length && !saved.length && query.trim() && (
        <p className="muted" role="status">
          No presets match “{query}”.
        </p>
      )}
    </>
  );
}
function BatchPanel({ d }: { d: Document }) {
  const queue = d.batchQueue,
    busy = d.batchBusy;
  return (
    <>
      <h2>Batch</h2>
      <p className="muted">
        Uses current adjustments and Output settings. Originals are never
        overwritten.
      </p>
      <div className="inline-actions">
        <button disabled={busy || !isTauri()} onClick={() => d.addBatch()}>
          Add renders
        </button>
        <button
          disabled={busy || !queue.length}
          onClick={() =>
            d.setBatchQueue((q) =>
              q.map((v) => ({ ...v, state: structuredClone(d.state) })),
            )
          }
        >
          Sync settings
        </button>
      </div>
      <div className="batch-list">
        {queue.map((q) => (
          <div key={q.id}>
            <input
              type="checkbox"
              checked={q.selected}
              aria-label={`Select ${q.path.split(/[\\/]/).pop()}`}
              onChange={(e) =>
                d.setBatchQueue((v) =>
                  v.map((x) =>
                    x.id === q.id ? { ...x, selected: e.target.checked } : x,
                  ),
                )
              }
            />
            <span title={q.path}>
              {q.path.split(/[\\/]/).pop()}
              <small>
                {q.status}
                {q.state ? " · Custom settings" : ""}
              </small>
            </span>
            <button
              title="Use current settings for this image"
              disabled={busy}
              onClick={() =>
                d.setBatchQueue((v) =>
                  v.map((x) =>
                    x.id === q.id
                      ? { ...x, state: structuredClone(d.state) }
                      : x,
                  ),
                )
              }
            >
              <SlidersHorizontal size={14} />
            </button>
            <button
              title="Remove from queue"
              disabled={busy}
              onClick={() =>
                d.setBatchQueue((v) => v.filter((x) => x.id !== q.id))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          try {
            const p = await open({ directory: true });
            if (p) d.setBatchFolder(p);
          } catch (e) {
            d.setError(String(e));
          }
        }}
      >
        Choose output folder
      </button>
      <small>{d.batchFolder || "No output folder selected"}</small>
      <div className="inline-actions">
        <button
          disabled={busy || !d.batchFolder || !queue.some((q) => q.selected)}
          onClick={() => d.processBatch(true)}
        >
          Process selected
        </button>
        <button
          className="primary"
          disabled={busy || !d.batchFolder || !queue.length}
          onClick={() => d.processBatch()}
        >
          Process all
        </button>
        {busy && <button onClick={d.stopBatch}>Stop after current</button>}
      </div>
      <small>
        {queue.filter((q) => q.status === "Done").length} / {queue.length}{" "}
        complete
      </small>
    </>
  );
}
export function SettingsPanel({
  d,
  close,
}: {
  d: Document;
  close: () => void;
}) {
  const [space, setSpace] = useState("auto");
  const dialog = useRef<HTMLElement>(null);
  const shortcuts: [string, string[]][] = [
    ["Open render", ["Ctrl", "O"]],
    ["Save project", ["Ctrl", "S"]],
    ["Save project as", ["Ctrl", "Shift", "S"]],
    ["Export", ["Ctrl", "E"]],
    ["Undo", ["Ctrl", "Z"]],
    ["Redo", ["Ctrl", "Shift", "Z"]],
    ["Fit image", ["F"]],
    ["100% zoom", ["1"]],
    ["Before / after", ["B"]],
    ["Presentation", ["P"]],
    ["Masks panel", ["M"]],
    ["Zoom inspector", ["Z"]],
    ["Full screen", ["F11"]],
    ["Close dialog / presentation", ["Esc"]],
  ];
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={dialog}
        className="settings-dialog"
        role="dialog"
        aria-label="Studio Settings"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
          }
          if (e.key !== "Tab") return;
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first) {
            e.preventDefault();
            e.currentTarget.focus();
          } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
          e.stopPropagation();
        }}
      >
        <div className="panel-heading settings-header">
          <h2>Studio Settings</h2>
          <button
            aria-label="Close settings"
            title="Close settings · Esc"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <section
          className="settings-section"
          aria-labelledby="settings-runtime"
        >
          <h3 id="settings-runtime">Runtime</h3>
          <dl className="settings-facts">
            <dt>GPU</dt>
            <dd>{d.cap?.gpu || "Browser preview"}</dd>
            <dt>Neural runtime</dt>
            <dd>{d.cap?.neural_rendering || "Available in the Windows app"}</dd>
          </dl>
          <p className="settings-help">
            Visual Enhancer v13.2 is installed separately. Neural rendering
            accepts 8-bit and 16-bit SDR; HDR uses a reversible SDR copy and
            preserves the original float data.
          </p>
          <div className="settings-actions">
            <button
              disabled={!isTauri()}
              onClick={async () => {
                try {
                  const folder = await open({ directory: true });
                  if (folder) {
                    await invoke("configure_neural_runtime", { folder });
                    d.setError(
                      "Runtime configured. Change a neural setting to evaluate.",
                    );
                  }
                } catch (e) {
                  d.setError(String(e));
                }
              }}
            >
              Choose runtime folder
            </button>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="settings-color">
          <h3 id="settings-color">Color management</h3>
          <label className="settings-control">
            <span>Input interpretation</span>
            <select
              aria-label="Input interpretation"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
            >
              {[
                ["auto", "Embedded ICC / format default"],
                ["srgb", "sRGB"],
                ["linear", "Linear sRGB"],
                ["p3", "Display P3"],
                ["rec709", "Rec.709"],
                ["acescg", "ACEScg"],
              ].map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-actions">
            <button
              disabled={!d.info?.path}
              onClick={() => d.reloadSpace(space)}
            >
              Reload with this interpretation
            </button>
          </div>
          <p className="settings-help">
            Working space: linear sRGB, 32-bit float. EXR defaults to linear
            sRGB; select ACEScg for ACEScg sources. Preview clips for display;
            linear EXR exports retain HDR. ACES, AgX and Filmic display
            transforms are not bundled.
          </p>
        </section>
        <section
          className="settings-section"
          aria-labelledby="settings-keyboard"
        >
          <h3 id="settings-keyboard">Keyboard shortcuts</h3>
          <div className="settings-shortcuts">
            {shortcuts.map(([action, keys]) => (
              <div className="settings-shortcut" key={action}>
                <span>{action}</span>
                <span className="shortcut-keys">
                  {keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </span>
              </div>
            ))}
            <div className="settings-shortcut">
              <span>Peek original</span>
              <span className="shortcut-keys">
                Hold <kbd>\</kbd>
              </span>
            </div>
            <div className="settings-shortcut">
              <span>Pan image</span>
              <span className="shortcut-keys">
                <kbd>Space</kbd> + drag
              </span>
            </div>
          </div>
          <p className="settings-help">
            Middle-drag also pans. Focus the image view to use image shortcuts.
          </p>
        </section>
      </section>
    </div>
  );
}

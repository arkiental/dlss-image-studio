import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  Settings,
  Minus,
  Square,
  X,
  Sun,
  Activity,
  Aperture,
  Droplet,
  Rainbow,
  CircleDot,
  Circle,
  Triangle,
  RotateCcw,
  Clipboard,
  Download,
  Layers,
} from "lucide-react";
import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  defaults,
  presets,
  clamp,
  imageFit,
  moveRegion,
  exportName,
  type StudioState,
  type Style,
  type Adjustments,
} from "./state";
type Capability = {
  gpu: string;
  gpu_family?: string;
  driver: string;
  vram_mb: number;
  d3d12: boolean;
  streamline: string;
  neural_rendering: string;
  detail: string;
  runtime_ready: boolean;
  runtime_path: string;
  neural_diagnostics?: {
    round_trip_ms?: number;
    evaluation_ms?: number;
    feature_evaluations?: number;
    ngx?: { create_result?: string; evaluate_result?: string };
  };
};
const icons = {
  contrast: Sun,
  gamma: Activity,
  vibrance: Aperture,
  brightness: Sun,
  saturation: Droplet,
  hue: Rainbow,
};
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  icon: Icon,
  accent = "gold",
  local = false,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  icon: typeof Sun;
  accent?: string;
  local?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`control ${local ? "local-control" : ""} ${accent}`}>
      <div className="control-label">
        <Icon size={29} strokeWidth={1.6} />
        <label>{label}</label>
        <input
          aria-label={`${label} value`}
          disabled={disabled}
          type="number"
          min={min}
          max={max}
          step={step}
          value={local ? value.toFixed(2) : value}
          onChange={(e) => onChange(clamp(+e.target.value, min, max))}
        />
      </div>
      <div className="slider-wrap">
        <input
          aria-label={label}
          disabled={disabled}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={
            {
              "--fill": `${((value - min) / (max - min)) * 100}%`,
            } as CSSProperties
          }
          onChange={(e) => onChange(+e.target.value)}
        />
        <div className="ticks" />
      </div>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<StudioState>(() => {
      const s = defaults();
      if (!isTauri()) s.neural.enabled = false;
      return s;
    }),
    [url, setUrl] = useState("/sample-car.png"),
    [dimensions, setDimensions] = useState({ w: 1560, h: 1008 }),
    [size, setSize] = useState({ w: 1000, h: 660 }),
    [settings, setSettings] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [sourceRevision, setSourceRevision] = useState(0),
    [completedPreview, setCompletedPreview] = useState({ key: "", url: "" }),
    [cap, setCap] = useState<Capability | null>(null),
    [stem, setStem] = useState("image");
  const canvas = useRef<HTMLCanvasElement>(null),
    zoomCanvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    source = useRef<HTMLCanvasElement | null>(null),
    full = useRef<HTMLCanvasElement | null>(null),
    worker = useRef<Worker | null>(null),
    version = useRef(0),
    displayedVersion = useRef(0),
    sourceReady = useRef(false),
    sourceGeneration = useRef(0),
    input = useRef<HTMLInputElement>(null),
    stateRef = useRef(state);
  stateRef.current = state;
  const fit = imageFit(dimensions.w, dimensions.h, size.w, size.h),
    region = state.local.region;
  const notify = (s: string) => setMessage(s);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (isTauri())
      invoke<Capability>("capabilities")
        .then(setCap)
        .catch((e) => notify(String(e)));
  }, []);
  useEffect(() => {
    const generation = ++sourceGeneration.current;
    ++version.current;
    sourceReady.current = false;
    source.current = null;
    setBusy(true);
    const image = new Image();
    image.onload = async () => {
      if (generation !== sourceGeneration.current) return;
      const c = document.createElement("canvas");
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      if (
        c.width * c.height > 64_000_000 ||
        c.width > 16384 ||
        c.height > 16384
      ) {
        notify("Image exceeds the 64 megapixel or 16384-pixel side limit.");
        setBusy(false);
        return;
      }
      c.getContext("2d")!.drawImage(image, 0, 0);
      const pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      draw(pixels);
      setDimensions({ w: c.width, h: c.height });
      try {
        if (isTauri())
          await invoke("load_source", pixels.data.buffer, {
            headers: {
              "x-image-width": String(c.width),
              "x-image-height": String(c.height),
              "x-source-id": String(generation),
            },
          });
        if (generation !== sourceGeneration.current) return;
        source.current = c;
        sourceReady.current = true;
        setSourceRevision((v) => v + 1);
        setDimensions({ w: c.width, h: c.height });
      } catch (error) {
        if (generation !== sourceGeneration.current) return;
        notify(String(error));
        setBusy(false);
      }
    };
    image.onerror = () => {
      if (generation !== sourceGeneration.current) return;
      notify("Unable to decode this image. Try PNG, JPEG or WebP.");
      setBusy(false);
    };
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url]);
  const draw = (image: ImageData) => {
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(image, 0, 0);
    full.current = c;
    const display = canvas.current;
    if (display) {
      display.width = c.width;
      display.height = c.height;
      display.getContext("2d")!.drawImage(c, 0, 0);
    }
    drawZoom();
  };
  function drawZoom() {
    const c = zoomCanvas.current,
      src = full.current;
    if (!c || !src) return;
    const s = stateRef.current,
      r = s.local.region,
      ctx = c.getContext("2d")!;
    c.width = 600;
    c.height = 420;
    const sw = (src.width * r.width * 2.5) / s.zoom.factor,
      sh = (sw * 420) / 600;
    ctx.clearRect(0, 0, 600, 420);
    ctx.drawImage(
      src,
      (r.x + r.width / 2) * src.width - sw / 2,
      (r.y + r.height / 2) * src.height - sh / 2,
      sw,
      sh,
      0,
      0,
      600,
      420,
    );
  }
  useEffect(() => {
    worker.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current.onmessage = ({ data }) => {
      if (data.id === version.current) {
        draw(data.image);
        setCompletedPreview({ key: data.key, url: data.sourceUrl });
        setBusy(false);
      }
    };
    return () => worker.current?.terminate();
  }, []);
  const processingKey = JSON.stringify({
    ...state,
    zoom: undefined,
    local: {
      ...state.local,
      region: state.local.scope === "region" ? state.local.region : undefined,
    },
  });
  const previewReady =
    !busy &&
    completedPreview.key === processingKey &&
    completedPreview.url === url;
  useEffect(() => {
    const id = ++version.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      if (!source.current || !sourceReady.current) return;
      setBusy(true);
      setCompletedPreview({ key: "", url: "" });
      try {
        if (isTauri()) {
          const requestSource = sourceGeneration.current;
          const width = source.current.width,
            height = source.current.height;
          const bytes = await invoke<ArrayBuffer>("process_image", {
            state,
            sourceId: requestSource,
          });
          if (
            requestSource !== sourceGeneration.current ||
            id < displayedVersion.current
          )
            return;
          displayedVersion.current = id;
          draw(new ImageData(new Uint8ClampedArray(bytes), width, height));
          if (id !== version.current) return; // Show warm intermediate frames; only the latest can be exported.
          setCompletedPreview({ key: processingKey, url });
          setBusy(false);
          void invoke<Capability>("capabilities")
            .then(setCap)
            .catch((e) => notify(String(e)));
        } else {
          if (state.neural.enabled)
            throw new Error("Neural rendering requires the Windows app.");
          const c = source.current;
          worker.current?.postMessage({
            id,
            key: processingKey,
            sourceUrl: url,
            state,
            image: c.getContext("2d")!.getImageData(0, 0, c.width, c.height),
          });
        }
      } catch (e) {
        if (id === version.current) {
          if (String(e) !== "Superseded preview") notify(String(e));
          setBusy(false);
        }
      }
    }, 16);
    return () => clearTimeout(timer);
  }, [processingKey, sourceRevision]);
  useEffect(drawZoom, [state.zoom, region, fit.width]);
  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      notify("Choose an image file.");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl((old) => {
      if (old.startsWith("blob:")) URL.revokeObjectURL(old);
      return next;
    });
    setStem(file.name.replace(/\.[^.]+$/, ""));
  };
  async function openImage() {
    if (isTauri()) {
      const path = await open({
        multiple: false,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
        ],
      });
      if (path) {
        setStem(
          path
            .split(/[\\/]/)
            .pop()!
            .replace(/\.[^.]+$/, ""),
        );
        setUrl(convertFileSrc(path));
      }
    } else input.current?.click();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openImage();
      }
      if (
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement)
      )
        setState((s) => ({
          ...s,
          zoom: { ...s.zoom, visible: !s.zoom.visible },
        }));
      if (e.key === "Escape") setSettings(false);
    };
    const paste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (f) loadFile(f);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("paste", paste);
    let unlisten: undefined | (() => void);
    if (isTauri())
      getCurrentWindow()
        .onDragDropEvent((e) => {
          if (e.payload.type === "drop") {
            const path = e.payload.paths[0];
            if (path) setUrl(convertFileSrc(path));
          }
        })
        .then((f) => (unlisten = f));
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("paste", paste);
      unlisten?.();
    };
  }, []);
  function drag(e: PointerEvent, kind: "region" | "zoom") {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX,
      startY = e.clientY,
      initial = state;
    const move = (ev: globalThis.PointerEvent) => {
      if (kind === "region")
        setState((s) => ({
          ...s,
          local: {
            ...s.local,
            region: moveRegion(
              initial.local.region,
              ev.clientX - startX,
              ev.clientY - startY,
              fit.width,
              fit.height,
            ),
          },
        }));
      else
        setState((s) => ({
          ...s,
          zoom: {
            ...s.zoom,
            position: {
              x: clamp(
                initial.zoom.position.x + ev.clientX - startX,
                0,
                Math.max(0, fit.width - 306),
              ),
              y: clamp(
                initial.zoom.position.y + ev.clientY - startY,
                0,
                Math.max(0, fit.height - 255),
              ),
            },
          },
        }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }
  async function exportImage(kind: "file" | "clipboard" | "all") {
    const sourceId = sourceGeneration.current;
    if (!sourceReady.current || !previewReady) {
      notify("Wait for the current image adjustments to finish processing.");
      return;
    }
    setBusy(true);
    try {
      if (isTauri()) {
        if (kind === "clipboard") {
          await invoke("copy_image", { state, sourceId });
          notify("Full-resolution image copied to clipboard.");
        } else if (kind === "all") {
          const folder = await open({ directory: true });
          if (folder) {
            const paths = await invoke<string[]>("export_presets", {
              folder,
              stem,
              state,
              sourceId,
            });
            notify(`Exported ${paths.length} full-resolution presets.`);
          }
        } else {
          const path = await save({
            defaultPath: exportName(stem, state.style),
            filters: [
              { name: "PNG", extensions: ["png"] },
              { name: "JPEG", extensions: ["jpg", "jpeg"] },
              { name: "TIFF", extensions: ["tiff", "tif"] },
            ],
          });
          if (path) {
            await invoke("export_image", { path, state, sourceId });
            notify("Full-resolution image exported.");
          }
        }
      } else {
        if (kind === "all") {
          notify("Batch export is available in the Windows application.");
          return;
        }
        const c = full.current;
        if (!c) return;
        const blob = await new Promise<Blob>((resolve, reject) =>
          c.toBlob((b) => (b ? resolve(b) : reject(Error("Encoding failed")))),
        );
        if (kind === "clipboard")
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = exportName(stem, state.style);
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  const windowAction = (action: "minimize" | "toggleMaximize" | "close") => {
    if (isTauri())
      getCurrentWindow()
        [action]()
        .catch((e) => notify(String(e)));
  };
  const change = (key: keyof Adjustments, value: number) =>
    setState((s) => ({ ...s, [key]: value }));
  return (
    <main>
      <header className="titlebar">
        <div
          className="drag-title"
          data-tauri-drag-region
          onDoubleClick={() => windowAction("toggleMaximize")}
        >
          <h1 data-tauri-drag-region>DLSS Image Studio</h1>
          <span data-tauri-drag-region>ENHANCE. REFINE. EXPORT.</span>
        </div>
        <button
          className="settings-button"
          aria-label="Settings"
          onClick={() => setSettings(true)}
        >
          <Settings size={21} />
        </button>
        <button aria-label="Minimize" onClick={() => windowAction("minimize")}>
          <Minus />
        </button>
        <button
          aria-label="Maximize"
          onClick={() => windowAction("toggleMaximize")}
        >
          <Square size={17} />
        </button>
        <button aria-label="Close" onClick={() => windowAction("close")}>
          <X />
        </button>
      </header>
      <div className="workspace">
        <div className="left-column">
          <section
            className="image-panel"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="viewport" ref={viewport}>
              <div
                className="image-space"
                style={{
                  left: fit.x,
                  top: fit.y,
                  width: fit.width,
                  height: fit.height,
                }}
              >
                <canvas ref={canvas} className="main-image" />
                <svg className="guides" width="100%" height="100%">
                  {state.zoom.visible && (
                    <>
                      <line
                        x1={state.zoom.position.x}
                        y1={state.zoom.position.y + 254}
                        x2={region.x * fit.width}
                        y2={region.y * fit.height}
                      />
                      <line
                        x1={state.zoom.position.x + 306}
                        y1={state.zoom.position.y + 254}
                        x2={(region.x + region.width) * fit.width}
                        y2={region.y * fit.height}
                      />
                    </>
                  )}
                </svg>
                <div
                  aria-label={
                    state.local.scope === "region"
                      ? "Local adjustment region"
                      : "Zoom inspection region"
                  }
                  role="slider"
                  tabIndex={0}
                  aria-valuetext={`${Math.round(region.x * 100)}, ${Math.round(region.y * 100)}`}
                  onKeyDown={(e) => {
                    const delta = {
                      ArrowLeft: [-5, 0],
                      ArrowRight: [5, 0],
                      ArrowUp: [0, -5],
                      ArrowDown: [0, 5],
                    }[e.key];
                    if (delta) {
                      e.preventDefault();
                      setState((s) => ({
                        ...s,
                        local: {
                          ...s.local,
                          region: moveRegion(
                            s.local.region,
                            delta[0],
                            delta[1],
                            fit.width,
                            fit.height,
                          ),
                        },
                      }));
                    }
                  }}
                  className="selection"
                  onPointerDown={(e) => drag(e, "region")}
                  style={{
                    left: region.x * 100 + "%",
                    top: region.y * 100 + "%",
                    width: region.width * 100 + "%",
                    height: region.height * 100 + "%",
                  }}
                />
                {state.zoom.visible && (
                  <div
                    className="zoom-panel"
                    style={{
                      left: state.zoom.position.x,
                      top: state.zoom.position.y,
                    }}
                    onWheel={(e) =>
                      setState((s) => ({
                        ...s,
                        zoom: {
                          ...s.zoom,
                          factor: clamp(s.zoom.factor - e.deltaY * 0.002, 1, 8),
                        },
                      }))
                    }
                  >
                    <div
                      className="zoom-header"
                      onPointerDown={(e) => drag(e, "zoom")}
                    >
                      Zoom {state.zoom.factor.toFixed(1)}x
                      <button
                        aria-label="Close zoom"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            zoom: { ...s.zoom, visible: false },
                          }))
                        }
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <canvas ref={zoomCanvas} />
                  </div>
                )}
              </div>
            </div>
          </section>
          <section className="local-panel">
            <div className="section-heading">
              <h2>Neural Adjustments</h2>
              <div
                className="scope-switch"
                role="group"
                aria-label="Adjustment area"
              >
                {(["image", "region"] as const).map((scope) => (
                  <button
                    key={scope}
                    aria-pressed={state.local.scope === scope}
                    onClick={() =>
                      setState((s) => ({ ...s, local: { ...s.local, scope } }))
                    }
                  >
                    {scope === "image" ? "Whole image" : "Selected area"}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    style: "neutral",
                    neural: { ...s.neural, style: "Default" },
                    local: {
                      ...defaults().local,
                      scope: s.local.scope,
                      region: s.local.region,
                    },
                  }))
                }
              >
                <RotateCcw size={21} />
                Reset
              </button>
            </div>
            <p className="adjustment-hint" role="status">
              {!isTauri()
                ? "Browser preview · neural rendering requires the Windows app"
                : !state.neural.enabled
                  ? "Neural rendering off · enable in Settings"
                  : busy
                    ? "Processing…"
                    : previewReady
                      ? `NGX verified · ${Math.round(cap?.neural_diagnostics?.round_trip_ms ?? 0)} ms`
                      : "Neural result unavailable · check Settings"}
              {" · "}
              {state.local.scope === "image"
                ? "Whole image; dashed box inspects zoom"
                : "Neural effect limited to the selected area"}
            </p>
            <div className="local-controls">
              {(["intensity", "tone", "structure"] as const).map((key, i) => (
                <Slider
                  key={key}
                  label={["Intensity", "Local tone", "Local structure"][i]}
                  value={state.local[key]}
                  min={0}
                  max={2}
                  disabled={!state.neural.enabled}
                  step={0.01}
                  local
                  icon={[CircleDot, Circle, Triangle][i]}
                  onChange={(v) =>
                    setState((s) => ({ ...s, local: { ...s.local, [key]: v } }))
                  }
                />
              ))}
            </div>
          </section>
        </div>
        <aside className="right-panel">
          <div className="look">
            <h2>Adjust Look</h2>
            <section className="style-section">
              <h3>Style</h3>
              <div className="styles">
                {(["Cinematic", "Default", "Natural"] as const).map((style) => (
                  <button
                    key={style}
                    className={state.neural.style === style ? "selected" : ""}
                    disabled={!state.neural.enabled}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        style:
                          style === "Default"
                            ? "neutral"
                            : (style.toLowerCase() as Style),
                        neural: { ...s.neural, style },
                      }))
                    }
                  >
                    {style === "Default" ? "Neutral" : style}
                  </button>
                ))}
              </div>
            </section>
            <section className="resolution">
              <h3 title="Neural evaluation resolution. Exports retain the original image dimensions.">
                Resolution
              </h3>
              <div className="resolution-row">
                <div className="slider-wrap">
                  <input
                    disabled={!state.neural.enabled}
                    aria-label="Resolution"
                    type="range"
                    min="1"
                    max="100"
                    value={state.processingResolution}
                    style={
                      {
                        "--fill": state.processingResolution + "%",
                      } as CSSProperties
                    }
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        processingResolution: +e.target.value,
                      }))
                    }
                  />
                  <div className="ticks" />
                </div>
                <span>
                  <input
                    disabled={!state.neural.enabled}
                    aria-label="Resolution value"
                    type="number"
                    min="1"
                    max="100"
                    value={state.processingResolution}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        processingResolution: clamp(+e.target.value, 1, 100),
                      }))
                    }
                  />
                  %
                </span>
              </div>
              <div className="range-labels">
                <span>1%</span>
                <span>100%</span>
              </div>
            </section>
            <div className="global-controls">
              {(Object.keys(icons) as (keyof Adjustments)[]).map((key) => (
                <Slider
                  key={key}
                  label={key[0].toUpperCase() + key.slice(1)}
                  value={state[key]}
                  min={key === "hue" ? -180 : -100}
                  max={key === "hue" ? 180 : 100}
                  icon={icons[key]}
                  accent={key}
                  onChange={(v) => change(key, v)}
                />
              ))}
            </div>
          </div>
          <section className="export">
            <h2>Export</h2>
            <div className="export-buttons">
              <button
                disabled={!previewReady}
                onClick={() => exportImage("clipboard")}
              >
                <Clipboard />
                Copy to
                <br />
                Clipboard
              </button>
              <button
                disabled={!previewReady}
                onClick={() => exportImage("file")}
              >
                <Download />
                Export to File
              </button>
              <button
                disabled={!previewReady}
                onClick={() => exportImage("all")}
              >
                <Layers />
                Export All
                <br />
                Presets
              </button>
            </div>
          </section>
        </aside>
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0]);
        }}
      />
      {busy && (
        <div className="busy" role="status">
          Processing…
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
          <button aria-label="Dismiss" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <h2 id="settings-title">Studio Settings</h2>
              <button
                aria-label="Close settings"
                autoFocus
                onClick={() => setSettings(false)}
              >
                <X />
              </button>
            </div>
            <dl>
              <dt>GPU</dt>
              <dd>
                {cap?.gpu ?? (isTauri() ? "Detecting…" : "Browser preview")}
              </dd>
              {cap?.gpu_family && (
                <>
                  <dt>GPU family</dt>
                  <dd>{cap.gpu_family}</dd>
                </>
              )}
              <dt>Driver</dt>
              <dd>{cap?.driver ?? "Not available in browser"}</dd>
              <dt>GPU memory</dt>
              <dd>{cap ? `${cap.vram_mb} MB` : "—"}</dd>
              <dt>Processing backend</dt>
              <dd>
                {cap?.d3d12
                  ? "Native D3D12 compute"
                  : isTauri()
                    ? "Native backend unavailable"
                    : "Browser worker · application color processing"}
              </dd>

              <dt>DLSS 5 Neural Rendering</dt>
              <dd>{cap?.neural_rendering ?? "Unavailable"}</dd>
            </dl>
            <p className="notice">
              {cap?.detail ??
                "Browser mode supports conventional color adjustments only. Use the Windows application with a separately installed Visual Enhancer v13.2 runtime for neural rendering."}
            </p>
            <label className="settings-toggle">
              <input
                type="checkbox"
                aria-label="Enable neural rendering"
                checked={state.neural.enabled}
                disabled={!isTauri()}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    neural: { ...s.neural, enabled: e.target.checked },
                  }))
                }
              />{" "}
              Enable neural rendering
            </label>
            <label className="settings-toggle">
              Color preset{" "}
              <select
                aria-label="Color preset"
                defaultValue="neutral"
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    ...presets[e.target.value as Style],
                  }))
                }
              >
                {["neutral", "cinematic", "natural"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <p>Runtime: {cap?.runtime_path || "Not configured"}</p>
            <button
              disabled={!isTauri()}
              onClick={async () => {
                try {
                  const folder = await open({
                    directory: true,
                    title: "Select extracted Visual Enhancer v13.2 folder",
                  });
                  if (folder) {
                    await invoke("configure_neural_runtime", { folder });
                    setCap(await invoke<Capability>("capabilities"));
                    setSourceRevision((v) => v + 1);
                    notify("Runtime configured. Rendering the current image.");
                  }
                } catch (e) {
                  notify(String(e));
                }
              }}
            >
              Select neural runtime folder
            </button>
            {cap?.neural_diagnostics?.ngx && (
              <p>
                Last evaluation: {cap.neural_diagnostics.feature_evaluations}{" "}
                frame(s); NGX create {cap.neural_diagnostics.ngx.create_result},
                evaluate {cap.neural_diagnostics.ngx.evaluate_result}.
              </p>
            )}
            <p>
              Ctrl+O opens an image. Paste or drop an image to load it. Drag the
              dashed box to inspect another area. Choose Selected area to limit
              tone and structure to that box, or Whole image to edit everywhere.
              Neural settings run through the installed provider. Color sliders
              apply afterward. Drag the zoom header, scroll to magnify, or press
              Z to restore the zoom panel.
            </p>
            <p>
              Exports retain source dimensions. Inputs are decoded as sRGB;
              output is 8-bit sRGB. Resolution sets the neural evaluation size.
              Lower values trade detail for speed; output is resized to source
              dimensions.
            </p>
            <small>
              DLSS Image Studio 0.1.0 · Independent application, not affiliated
              with NVIDIA.
            </small>
          </section>
        </div>
      )}
    </main>
  );
}

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
}) {
  return (
    <div className={`control ${local ? "local-control" : ""} ${accent}`}>
      <div className="control-label">
        <Icon size={29} strokeWidth={1.6} />
        <label>{label}</label>
        <input
          aria-label={`${label} value`}
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
  const [state, setState] = useState<StudioState>(defaults),
    [url, setUrl] = useState("/sample-car.png"),
    [dimensions, setDimensions] = useState({ w: 1560, h: 1008 }),
    [size, setSize] = useState({ w: 1000, h: 660 }),
    [settings, setSettings] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [cap, setCap] = useState<Capability | null>(null),
    [stem, setStem] = useState("image");
  const canvas = useRef<HTMLCanvasElement>(null),
    zoomCanvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    source = useRef<HTMLCanvasElement | null>(null),
    full = useRef<HTMLCanvasElement | null>(null),
    worker = useRef<Worker | null>(null),
    version = useRef(0),
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
    setBusy(true);
    const image = new Image();
    image.onload = async () => {
      const c = document.createElement("canvas");
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      if (c.width * c.height > 64_000_000) {
        notify("Image exceeds the 64 megapixel memory limit.");
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
        setDimensions({ w: c.width, h: c.height });
      } catch (error) {
        notify(String(error));
        setBusy(false);
      }
    };
    image.onerror = () => {
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
        setBusy(false);
      }
    };
    return () => worker.current?.terminate();
  }, []);
  const processingKey = JSON.stringify({ ...state, zoom: undefined });
  useEffect(() => {
    const id = ++version.current;
    const timer = setTimeout(async () => {
      if (!source.current || !sourceReady.current) return;
      setBusy(true);
      try {
        if (isTauri()) {
          const bytes = await invoke<ArrayBuffer>("process_image", { state });
          if (id !== version.current) return;
          draw(
            new ImageData(
              new Uint8ClampedArray(bytes),
              source.current.width,
              source.current.height,
            ),
          );
          setBusy(false);
        } else {
          const c = source.current;
          worker.current?.postMessage({
            id,
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
    }, 65);
    return () => clearTimeout(timer);
  }, [processingKey, dimensions]);
  useEffect(drawZoom, [state.zoom, fit.width]);
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
    if (!sourceReady.current) {
      notify("The source image is not ready for processing.");
      return;
    }
    setBusy(true);
    try {
      if (isTauri()) {
        if (kind === "clipboard") {
          await invoke("copy_image", { state });
          notify("Full-resolution image copied to clipboard.");
        } else if (kind === "all") {
          const folder = await open({ directory: true });
          if (folder) {
            const paths = await invoke<string[]>("export_presets", {
              folder,
              stem,
              state,
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
            await invoke("export_image", { path, state });
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
                  aria-label="Local adjustment region"
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
              <h2>Local Adjustments</h2>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    local: { ...defaults().local, region: s.local.region },
                  }))
                }
              >
                <RotateCcw size={21} />
                Reset
              </button>
            </div>
            <div className="local-controls">
              {(["intensity", "tone", "structure"] as const).map((key, i) => (
                <Slider
                  key={key}
                  label={["Intensity", "Local tone", "Local structure"][i]}
                  value={state.local[key]}
                  min={key === "tone" ? -1 : 0}
                  max={key === "intensity" ? 2.6 : key === "tone" ? 1 : 1.6}
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
                {(["cinematic", "neutral", "natural"] as Style[]).map(
                  (style) => (
                    <button
                      className={state.style === style ? "selected" : ""}
                      key={style}
                      onClick={() =>
                        setState((s) => ({ ...s, ...presets[style], style }))
                      }
                    >
                      {style[0].toUpperCase() + style.slice(1)}
                    </button>
                  ),
                )}
              </div>
            </section>
            <section className="resolution">
              <h3>Resolution</h3>
              <div className="resolution-row">
                <div className="slider-wrap">
                  <input
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
              <button disabled={busy} onClick={() => exportImage("clipboard")}>
                <Clipboard />
                Copy to
                <br />
                Clipboard
              </button>
              <button disabled={busy} onClick={() => exportImage("file")}>
                <Download />
                Export to File
              </button>
              <button disabled={busy} onClick={() => exportImage("all")}>
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
              <dt>Streamline</dt>
              <dd>{cap?.streamline ?? "Not loaded"}</dd>
              <dt>DLSS 5 Neural Rendering</dt>
              <dd>{cap?.neural_rendering ?? "Unavailable"}</dd>
            </dl>
            <p className="notice">
              {cap?.detail ??
                "The official Streamline 2.14.1 public package does not contain a Neural Rendering header or plugin. This build performs application color adjustments only. DLSS 5 has not executed."}
            </p>
            <p>
              Ctrl+O opens an image. Paste or drop an image to load it. Drag the
              dashed region to adjust locally. Drag the zoom header, scroll to
              magnify, or press Z to restore the zoom panel.
            </p>
            <p>
              Exports retain source dimensions. Inputs are decoded as sRGB;
              output is 8-bit sRGB. The resolution control is reserved for the
              unavailable neural path and does not resize exports.
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

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Brush,
  Layers,
  Bookmark,
  Images,
  Settings,
  Minus,
  Square,
  X,
  Search,
  Scan,
  Eye,
  Undo2,
  Redo2,
  FolderOpen,
  Save,
  BarChart3,
  RotateCcw,
  Maximize2,
  Aperture,
} from "lucide-react";
import { NeuralAdjustments, QuickExport } from "./StudioClassic";
import { RangeInput } from "./RangeInput";
import { Scopes } from "./Scopes";
import { Panels, SettingsPanel, Variants } from "./StudioPanels";
import { useStudio, unpack } from "./useStudio";
import { defaults, clamp } from "./state";
import type { Finish, MaskLayer } from "./finish";
import "./studio.css";
import "./classic.css";
const titles = ["Masks", "Render Passes", "Presets", "Batch"];
const navIcons = [Brush, Layers, Bookmark, Images];
export default function Studio() {
  const d = useStudio(),
    s = d.state,
    a = s.finish;
  const [workspace, setWorkspace] = useState("Adjust"),
    [tab, setTab] = useState("Adjust"),
    [bottom, setBottom] = useState("Snapshots"),
    [settings, setSettings] = useState(false),
    [compare, setCompare] = useState("processed"),
    [holdOriginal, setHoldOriginal] = useState(false),
    [split, setSplit] = useState(0.5),
    [hidden, setHidden] = useState(false),
    [scopeMode, setScopeMode] = useState("Histogram"),
    [scopes, setScopes] = useState(false),
    [clipping, setClipping] = useState("none"),
    [pixelGrid, setPixelGrid] = useState(false),
    [selectedMask, setSelectedMask] = useState(""),
    [maskOverlay, setMaskOverlay] = useState(true),
    [overlayOpacity, setOverlayOpacity] = useState(0.25),
    [space, setSpace] = useState(false),
    [picker, setPicker] = useState<"white" | "color" | "focus" | "id" | null>(
      null,
    ),
    [view, setView] = useState({ scale: 1, x: 0, y: 0 }),
    [size, setSize] = useState({ w: 900, h: 640 });
  const viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    zoomCanvas = useRef<HTMLCanvasElement>(null),
    gesture = useRef<any>(null),
    fitMode = useRef(true),
    beforeCanvas = useRef<HTMLCanvasElement>(null),
    clipCanvas = useRef<HTMLCanvasElement>(null),
    maskCanvas = useRef<HTMLCanvasElement>(null);
  const [erase, setErase] = useState(false);
  const patch = (v: Partial<Finish>) =>
    d.setState((p) => ({ ...p, finish: { ...p.finish, ...v } }));
  const mask = a.masks.find((m) => m.id === selectedMask);
  const updateMask = (v: Partial<MaskLayer>) =>
    patch({
      masks: a.masks.map((m) => (m.id === selectedMask ? { ...m, ...v } : m)),
    });
  const dimensions = useMemo(() => {
    if (!d.info) return { w: 1, h: 1 };
    const w = Math.max(1, Math.round(d.info.width * a.crop.width)),
      h = Math.max(1, Math.round(d.info.height * a.crop.height));
    return Math.round(a.rotation / 90) % 2 ? { w: h, h: w } : { w, h };
  }, [d.info, a.crop, a.rotation]);
  const fit = Math.min(size.w / dimensions.w, size.h / dimensions.h);
  const box = {
    x: (size.w - dimensions.w * view.scale) / 2 + view.x,
    y: (size.h - dimensions.h * view.scale) / 2 + view.y,
    w: dimensions.w * view.scale,
    h: dimensions.h * view.scale,
  };
  const bounds = (v: typeof view) => ({
    ...v,
    x: clamp(
      v.x,
      -Math.max(0, (dimensions.w * v.scale - size.w) / 2),
      Math.max(0, (dimensions.w * v.scale - size.w) / 2),
    ),
    y: clamp(
      v.y,
      -Math.max(0, (dimensions.h * v.scale - size.h) / 2),
      Math.max(0, (dimensions.h * v.scale - size.h) / 2),
    ),
  });
  const zoom = (z: number, p = { x: size.w / 2, y: size.h / 2 }) => {
    z = clamp(z, 0.01, 16);
    const r = z / view.scale;
    fitMode.current = false;
    setView(
      bounds({
        scale: z,
        x: (p.x - size.w / 2) * (1 - r) + view.x * r,
        y: (p.y - size.h / 2) * (1 - r) + view.y * r,
      }),
    );
  };
  const fitImage = () => {
    fitMode.current = true;
    setView({ scale: fit, x: 0, y: 0 });
  };
  const [inspectorPoint, setInspectorPoint] = useState({ x: 0.5, y: 0.5 });
  const original = useMemo(() => {
    if (!d.source) return null;
    const src = document.createElement("canvas");
    src.width = d.source.width;
    src.height = d.source.height;
    src.getContext("2d")!.putImageData(d.source, 0, 0);
    const crop = a.crop;
    const w = Math.max(1, Math.round(src.width * crop.width)),
      h = Math.max(1, Math.round(src.height * crop.height)),
      odd = Math.round(a.rotation / 90) % 2 !== 0;
    const c = document.createElement("canvas");
    c.width = odd ? h : w;
    c.height = odd ? w : h;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((a.rotation * Math.PI) / 180);
    ctx.scale(a.flipX ? -1 : 1, a.flipY ? -1 : 1);
    ctx.drawImage(
      src,
      crop.x * src.width,
      crop.y * src.height,
      w,
      h,
      -w / 2,
      -h / 2,
      w,
      h,
    );
    return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
  }, [d.source, a.crop, a.rotation, a.flipX, a.flipY]);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    if (viewport.current) ro.observe(viewport.current);
    return () => ro.disconnect();
  }, [!!d.source, hidden]);
  useEffect(() => {
    fitMode.current = true;
    setInspectorPoint({ x: 0.5, y: 0.5 });
  }, [d.source]);
  useEffect(() => {
    if (fitMode.current) setView({ scale: fit, x: 0, y: 0 });
    else setView((v) => bounds(v));
  }, [size, dimensions]);
  useEffect(() => {
    const data = holdOriginal || compare === "original" ? original : d.image;
    for (const [c, p] of [
      [canvas.current, data],
      [beforeCanvas.current, original],
    ] as const) {
      if (c && p) {
        c.width = p.width;
        c.height = p.height;
        c.getContext("2d")!.putImageData(p, 0, 0);
      }
    }
  }, [d.image, original, compare, holdOriginal, hidden]);
  useEffect(() => {
    const c = zoomCanvas.current,
      p = holdOriginal || compare === "original" ? original : d.image;
    if (!c || !p) return;
    const src = document.createElement("canvas");
    src.width = p.width;
    src.height = p.height;
    src.getContext("2d")!.putImageData(p, 0, 0);
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = !pixelGrid;
    const w = 300 / s.zoom.factor,
      h = 200 / s.zoom.factor;
    ctx.clearRect(0, 0, 600, 400);
    ctx.drawImage(
      src,
      inspectorPoint.x * p.width - w / 2,
      inspectorPoint.y * p.height - h / 2,
      w,
      h,
      0,
      0,
      600,
      400,
    );
    if (pixelGrid && s.zoom.factor >= 4) {
      ctx.strokeStyle = "#ffffff35";
      const step = s.zoom.factor * 2;
      for (let x = 0; x < 600; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 400);
        ctx.stroke();
      }
      for (let y = 0; y < 400; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(600, y);
        ctx.stroke();
      }
    }
  }, [
    d.image,
    original,
    inspectorPoint,
    s.zoom.visible,
    s.zoom.factor,
    pixelGrid,
    compare,
    holdOriginal,
    hidden,
  ]);
  useEffect(() => {
    const c = clipCanvas.current,
      p = d.image;
    if (!c || !p) return;
    c.width = p.width;
    c.height = p.height;
    const out = new ImageData(p.width, p.height);
    if (clipping !== "none")
      for (let i = 0; i < p.data.length; i += 4) {
        const hi = Math.max(p.data[i], p.data[i + 1], p.data[i + 2]) >= 254,
          lo = Math.max(p.data[i], p.data[i + 1], p.data[i + 2]) <= 1;
        if (clipping === "high" && hi) {
          out.data[i] = 255;
          out.data[i + 3] = 170;
        }
        if (clipping === "low" && lo) {
          out.data[i + 1] = 200;
          out.data[i + 2] = 255;
          out.data[i + 3] = 170;
        }
      }
    c.getContext("2d")!.putImageData(out, 0, 0);
  }, [d.image, clipping]);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("demo"))
      fetch("/sample-car.png")
        .then((r) => r.blob())
        .then((b) =>
          d.loadFile(new File([b], "sample-car.png", { type: "image/png" })),
        );
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    getCurrentWindow()
      .onDragDropEvent((e) => {
        if (e.payload.type === "drop") {
          const p = e.payload.paths[0];
          if (e.payload.paths.length > 1) {
            void d.addBatch(e.payload.paths);
            setWorkspace("Batch");
            if (!d.source && p) void d.loadNative(p);
          } else if (p && /\.dlssproj$/i.test(p)) void d.openProject(p);
          else if (p) void d.loadNative(p);
        }
      })
      .then((f) => (stop = f));
    return () => stop?.();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest(
        "input:not([type=range]):not([type=checkbox]),textarea,select,[contenteditable]",
      );
      if (
        (e.ctrlKey || e.metaKey) &&
        ["o", "s", "e", "z"].includes(e.key.toLowerCase())
      ) {
        if (typing && e.key.toLowerCase() === "z") return;
        e.preventDefault();
        if (e.key.toLowerCase() === "o") void d.openRender();
        if (e.key.toLowerCase() === "s") void d.saveProject(e.shiftKey);
        if (e.key.toLowerCase() === "e") void d.exportImage();
        if (e.key.toLowerCase() === "z") e.shiftKey ? d.redo() : d.undo();
        return;
      }
      if (typing) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === "\\") setHoldOriginal(true);
      if (e.key.toLowerCase() === "b")
        setCompare((c) => (c === "original" ? "processed" : "original"));
      if (e.key.toLowerCase() === "f") fitImage();
      if (e.key === "1") zoom(1);
      if (e.key === "Tab") {
        e.preventDefault();
        setHidden((v) => !v);
      }
      if (e.key.toLowerCase() === "m") setWorkspace("Masks");
      if (e.key.toLowerCase() === "z")
        d.setState((v) => ({
          ...v,
          zoom: { ...v.zoom, visible: !v.zoom.visible },
        }));
      if (e.key === "F11") {
        e.preventDefault();
        if (isTauri())
          void getCurrentWindow()
            .isFullscreen()
            .then((v) => getCurrentWindow().setFullscreen(!v));
        else if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
      if (e.key === "Escape") {
        setHidden(false);
        setSettings(false);
        setPicker(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setSpace(false);
      if (e.key === "\\") setHoldOriginal(false);
    };
    const blur = () => {
      setSpace(false);
      setHoldOriginal(false);
      gesture.current = null;
    };
    const paste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || [])[0];
      if (file) void d.loadFile(file);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("paste", paste);
    };
  }, [
    d.state,
    d.history,
    d.cursor,
    d.image,
    d.ready,
    d.output,
    fit,
    view,
    dimensions,
  ]);
  useEffect(() => {
    if (workspace !== "Masks" || !maskOverlay || !d.source) return;
    let active = true,
      worker: Worker | undefined;
    const draw = (image: ImageData) => {
      if (!active || !maskCanvas.current) return;
      const c = maskCanvas.current;
      c.width = image.width;
      c.height = image.height;
      c.getContext("2d")!.putImageData(image, 0, 0);
    };
    const timer = setTimeout(() => {
      if (isTauri())
        void invoke<ArrayBuffer>("mask_overlay", {
          state: s,
          sourceId: d.sourceId.current,
        })
          .then((v) => draw(unpack(v)))
          .catch(() => {
            if (active && maskCanvas.current)
              maskCanvas.current
                .getContext("2d")!
                .clearRect(
                  0,
                  0,
                  maskCanvas.current.width,
                  maskCanvas.current.height,
                );
          });
      else {
        worker = new Worker(new URL("./mask.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = ({ data }) => {
          if (data.image) draw(data.image);
        };
        worker.postMessage({ image: d.source, state: s });
      }
    }, 60);
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [
    workspace,
    maskOverlay,
    d.source,
    JSON.stringify(a.masks),
    a.crop,
    a.flipX,
    a.flipY,
    a.rotation,
  ]);
  function position(e: React.PointerEvent) {
    const r = viewport.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left - box.x) / box.w),
      y: clamp((e.clientY - r.top - box.y) / box.h),
    };
  }
  function appendStroke(
    p: { x: number; y: number },
    erasePoint: boolean,
    previous?: { x: number; y: number },
  ) {
    const id = selectedMask;
    d.setState((state) => ({
      ...state,
      finish: {
        ...state.finish,
        masks: state.finish.masks.map((m) => {
          if (m.id !== id) return m;
          const count = previous
            ? Math.min(
                512,
                Math.max(
                  1,
                  Math.ceil(
                    Math.hypot(p.x - previous.x, p.y - previous.y) /
                      Math.max(0.0005, m.radius * 0.25),
                  ),
                ),
              )
            : 1;
          const points = Array.from({ length: count }, (_, i) =>
            previous
              ? {
                  x: previous.x + ((p.x - previous.x) * (i + 1)) / count,
                  y: previous.y + ((p.y - previous.y) * (i + 1)) / count,
                }
              : p,
          );
          return {
            ...m,
            points: [...m.points, ...points].slice(-10000),
            strokeOps: [
              ...(m.strokeOps || []),
              ...points.map(() => erasePoint),
            ].slice(-10000),
          };
        }),
      },
    }));
  }
  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!d.image || ![0, 1].includes(e.button)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let p = position(e);
    const displayPoint = p;
    let x = p.x,
      y = p.y;
    const rotation = Math.round(a.rotation / 90) % 4;
    if (rotation === 1) {
      x = p.y;
      y = 1 - p.x;
    } else if (rotation === 2) {
      x = 1 - p.x;
      y = 1 - p.y;
    } else if (rotation === 3) {
      x = 1 - p.y;
      y = p.x;
    }
    if (a.flipX) x = 1 - x;
    if (a.flipY) y = 1 - y;
    const sourcePoint = {
      x: a.crop.x + x * a.crop.width,
      y: a.crop.y + y * a.crop.height,
    };
    if (picker) {
      p = sourcePoint;
    }
    if (picker) {
      const mode = picker,
        pass =
          mode === "focus"
            ? a.depthPass
            : mode === "id"
              ? mask?.pass || ""
              : "";
      setPicker(null);
      void d
        .pick(p.x, p.y, pass)
        .then(([red, green, blue]) => {
          const r = Math.max(0.00001, red),
            g = Math.max(0.00001, green),
            b = Math.max(0.00001, blue);
          if (mode === "white")
            patch({
              temperature: clamp(Math.log2(b / r) * 100, -100, 100),
              tint: clamp(
                (Math.log2(Math.sqrt(r * b) / g) * 400) / 3,
                -100,
                100,
              ),
            });
          if (mode === "color")
            updateMask({
              color: [red, green, blue].map((v) =>
                v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
              ),
            });
          if (mode === "focus")
            patch({
              focus: clamp(
                (red - a.passLow) / Math.max(0.000001, a.passHigh - a.passLow),
              ),
            });
          if (mode === "id")
            updateMask({
              low: red - 0.000001,
              high: red + 0.000001,
              feather: 0,
            });
        })
        .catch((e) => d.setError(String(e)));
      return;
    }
    if (workspace === "Masks" && mask && !space && e.button === 0) {
      p = sourcePoint;
      d.setInteractionDragging(true);
      gesture.current = { kind: "mask", start: p, last: p };
      if (mask.kind === "brush") appendStroke(p, erase || e.altKey);
      if (mask.kind === "polygon")
        updateMask({ points: [...mask.points, p].slice(-1000) });
      return;
    }
    gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, view };
    setInspectorPoint(displayPoint);
  }
  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = position(e);
    if (g.kind === "mask") {
      const x = p.x,
        y = p.y,
        r = Math.round(a.rotation / 90) % 4;
      if (r === 1) {
        p.x = y;
        p.y = 1 - x;
      } else if (r === 2) {
        p.x = 1 - x;
        p.y = 1 - y;
      } else if (r === 3) {
        p.x = 1 - y;
        p.y = x;
      }
      if (a.flipX) p.x = 1 - p.x;
      if (a.flipY) p.y = 1 - p.y;
      p.x = a.crop.x + p.x * a.crop.width;
      p.y = a.crop.y + p.y * a.crop.height;
    }
    if (g.kind === "pan")
      setView(
        bounds({
          ...g.view,
          x: g.view.x + e.clientX - g.x,
          y: g.view.y + e.clientY - g.y,
        }),
      );
    if (g.kind === "mask" && mask) {
      if (mask.kind === "brush") {
        appendStroke(p, erase || e.altKey, g.last);
        g.last = p;
      } else if (mask.kind !== "polygon")
        updateMask({
          rect: {
            x: Math.min(p.x, g.start.x),
            y: Math.min(p.y, g.start.y),
            width: Math.max(0.001, Math.abs(p.x - g.start.x)),
            height: Math.max(0.001, Math.abs(p.y - g.start.y)),
          },
        });
    }
  }
  function inspectorDrag(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, p: s.zoom.position };
    const move = (ev: PointerEvent) =>
      d.setState((v) => ({
        ...v,
        zoom: {
          ...v.zoom,
          position: {
            x: clamp(start.p.x + ev.clientX - start.x, 8, innerWidth - 320),
            y: clamp(start.p.y + ev.clientY - start.y, 58, innerHeight - 260),
          },
        },
      }));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
  const windowAction = (name: "minimize" | "toggleMaximize" | "close") => {
    if (isTauri()) void getCurrentWindow()[name]();
  };
  return (
    <main className={`studio ${hidden ? "presentation" : ""}`}>
      <header className="titlebar">
        <div
          className="drag-title"
          data-tauri-drag-region
          onDoubleClick={() => windowAction("toggleMaximize")}
        >
          <h1 data-tauri-drag-region>DLSS Image Studio</h1>
        </div>
        <button
          title="Open render · Ctrl+O"
          aria-label="Open Render"
          onClick={() => d.openRender()}
        >
          <FolderOpen size={19} />
        </button>
        <button
          title="Save project · Ctrl+S"
          aria-label="Save Project"
          onClick={() => d.saveProject()}
          disabled={!d.source}
        >
          <Save size={18} />
        </button>
        <button
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettings(true)}
        >
          <Settings size={18} />
        </button>
        <button aria-label="Minimize" onClick={() => windowAction("minimize")}>
          <Minus size={18} />
        </button>
        <button
          aria-label="Maximize"
          onClick={() => windowAction("toggleMaximize")}
        >
          <Square size={15} />
        </button>
        <button aria-label="Close" onClick={() => windowAction("close")}>
          <X size={19} />
        </button>
      </header>
      {!d.source ? (
        <section
          className="empty-state"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0])
              void d.loadFile(e.dataTransfer.files[0]);
          }}
        >
          <Aperture size={44} />
          <h2>Drop a Render Here</h2>
          <p>EXR, PNG, TIFF, JPEG, WebP</p>
          <div className="inline-actions">
            <button className="primary" onClick={() => d.openRender()}>
              Open Render
            </button>
            <button onClick={() => d.openProject()}>Open Project</button>
          </div>
          {d.recent.length > 0 && (
            <div className="recent-projects">
              <h3>Recent Projects</h3>
              {d.recent.map((p) => (
                <button key={p} onClick={() => d.openProject(p)}>
                  {p.split(/[\\/]/).pop()}
                </button>
              ))}
            </div>
          )}
          <button
            className="text-button"
            onClick={() =>
              fetch("/sample-car.png")
                .then((r) => r.blob())
                .then((b) =>
                  d.loadFile(
                    new File([b], "sample-car.png", { type: "image/png" }),
                  ),
                )
            }
          >
            Explore sample render
          </button>
        </section>
      ) : (
        <div className="pro-workspace">
          <div className="center-workspace">
            <section className="view-panel">
              <div className="pro-view-toolbar">
                <span className="view-label">Zoom</span>
                <Search size={17} />
                <div className="slider-wrap">
                  <RangeInput
                    label="Image zoom"
                    min={0.01}
                    max={4}
                    step={0.01}
                    value={Math.min(4, view.scale)}
                    onValue={(v) => zoom(v)}
                    style={
                      {
                        "--fill": `${(view.scale / 4) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </div>
                <input
                  className="zoom-percent"
                  aria-label="Zoom percentage"
                  type="number"
                  min={1}
                  max={1600}
                  value={Math.round(view.scale * 100)}
                  onChange={(e) => zoom(+e.target.value / 100)}
                />
                <span>%</span>
                <select
                  aria-label="Zoom presets"
                  value=""
                  onChange={(e) => zoom(+e.target.value)}
                >
                  <option value="">▾</option>
                  {[0.25, 0.5, 1, 2].map((v) => (
                    <option key={v} value={v}>
                      {v * 100}%
                    </option>
                  ))}
                </select>
                <button title="Fit · F" onClick={fitImage}>
                  <Scan size={16} />
                  Fit
                </button>
                <button
                  title="Fill viewport"
                  onClick={() =>
                    zoom(Math.max(size.w / dimensions.w, size.h / dimensions.h))
                  }
                >
                  Fill
                </button>
                <span className="view-divider" />
                <select
                  aria-label="Before/After mode"
                  title="B toggles original; hold backslash to peek"
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  <option value="processed">After</option>
                  <option value="original">Before</option>
                  <option value="vertical">Split ↔</option>
                  <option value="horizontal">Split ↕</option>
                </select>
                <button
                  title="Hide UI · Tab"
                  aria-label="Presentation mode"
                  onClick={() => setHidden((v) => !v)}
                >
                  <Maximize2 size={17} />
                </button>
              </div>
              <div
                className="viewport"
                ref={viewport}
                onWheel={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  zoom(view.scale * Math.exp(-e.deltaY * 0.0015), {
                    x: e.clientX - r.left,
                    y: e.clientY - r.top,
                  });
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={(e) => {
                  gesture.current = null;
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={() => (gesture.current = null)}
                style={{
                  cursor: picker
                    ? "crosshair"
                    : space
                      ? "grab"
                      : workspace === "Masks"
                        ? "crosshair"
                        : "default",
                }}
              >
                <div
                  className="image-space"
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.w,
                    height: box.h,
                  }}
                >
                  <canvas className="main-image" ref={canvas} />
                  {(compare === "vertical" || compare === "horizontal") &&
                    !holdOriginal && (
                      <canvas
                        className="before-image"
                        ref={beforeCanvas}
                        style={{
                          clipPath:
                            compare === "vertical"
                              ? `inset(0 ${100 - split * 100}% 0 0)`
                              : `inset(0 0 ${100 - split * 100}% 0)`,
                        }}
                      />
                    )}
                  <canvas className="clip-overlay" ref={clipCanvas} />
                  {workspace === "Masks" && maskOverlay && (
                    <canvas
                      ref={maskCanvas}
                      className="clip-overlay"
                      style={{ opacity: overlayOpacity }}
                    />
                  )}
                  {s.zoom.visible && (
                    <div
                      className="inspection-reticle"
                      style={{
                        left: `${inspectorPoint.x * 100}%`,
                        top: `${inspectorPoint.y * 100}%`,
                      }}
                    />
                  )}
                </div>
                {(compare === "vertical" || compare === "horizontal") &&
                  !holdOriginal && (
                    <>
                      <div
                        className={`comparison-line ${compare}`}
                        style={
                          compare === "vertical"
                            ? { left: box.x + box.w * split }
                            : { top: box.y + box.h * split }
                        }
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            const p = position(e);
                            setSplit(compare === "vertical" ? p.x : p.y);
                          }
                        }}
                        onPointerUp={(e) =>
                          e.currentTarget.releasePointerCapture(e.pointerId)
                        }
                      >
                        <span>↔</span>
                      </div>
                      <span className="comparison-label before">Original</span>
                      <span className="comparison-label after">Processed</span>
                    </>
                  )}
                {(compare === "original" || holdOriginal) && (
                  <span className="comparison-label before">Original</span>
                )}
                {hidden && (
                  <button
                    className="exit-presentation"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setHidden(false)}
                  >
                    Show UI · Tab
                  </button>
                )}
              </div>
              <div className="detail-toolbar">
                <span className="view-label">Detail</span>
                <Eye size={16} />
                <label className="inspector-switch">
                  <input
                    type="checkbox"
                    aria-label="Show zoom inspector"
                    checked={s.zoom.visible}
                    onChange={(e) =>
                      d.setState((v) => ({
                        ...v,
                        zoom: { ...v.zoom, visible: e.target.checked },
                      }))
                    }
                  />
                  <span />
                </label>
                {s.zoom.visible && (
                  <>
                    <div className="slider-wrap">
                      <RangeInput
                        label="Inspector zoom factor"
                        min={1}
                        max={10}
                        step={0.1}
                        value={s.zoom.factor}
                        onValue={(v) =>
                          d.setState((p) => ({
                            ...p,
                            zoom: { ...p.zoom, factor: v },
                          }))
                        }
                        style={
                          {
                            "--fill": `${((s.zoom.factor - 1) / 9) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <output>{s.zoom.factor.toFixed(1)}×</output>
                    <select
                      aria-label="Inspector presets"
                      value=""
                      onChange={(e) =>
                        d.setState((p) => ({
                          ...p,
                          zoom: { ...p.zoom, factor: +e.target.value },
                        }))
                      }
                    >
                      <option value="">Presets</option>
                      {[1.5, 2, 2.5, 4].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <label>
                      <input
                        type="checkbox"
                        checked={pixelGrid}
                        onChange={(e) => setPixelGrid(e.target.checked)}
                      />
                      Pixel grid
                    </label>
                  </>
                )}
                <button
                  className={scopes ? "active" : ""}
                  title="Scopes"
                  onClick={() => setScopes((v) => !v)}
                >
                  <BarChart3 size={16} />
                </button>
              </div>
              {scopes && (
                <div className="scope-dock">
                  <select
                    aria-label="Scope"
                    value={scopeMode}
                    onChange={(e) => setScopeMode(e.target.value)}
                  >
                    {[
                      "Histogram",
                      "RGB Histogram",
                      "Waveform",
                      "RGB Parade",
                      "Vectorscope",
                    ].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Clipping overlay"
                    value={clipping}
                    onChange={(e) => setClipping(e.target.value)}
                  >
                    <option value="none">Clipping off</option>
                    <option value="high">Highlights</option>
                    <option value="low">Shadows</option>
                  </select>
                  <Scopes image={d.image} mode={scopeMode} />
                </div>
              )}
            </section>
            <NeuralAdjustments
              d={d}
              onMasks={() => setWorkspace("Masks")}
              setSelectedMask={setSelectedMask}
            />
            <Variants d={d} bottom={bottom} setBottom={setBottom} />
          </div>
          <aside className="pro-inspector">
            <nav className="nav-rail">
              {titles.map((name, i) => {
                const Icon = navIcons[i];
                return (
                  <button
                    key={name}
                    className={workspace === name ? "active" : ""}
                    title={name}
                    onClick={() => {
                      setWorkspace(name);
                      if (name === "Presets") setBottom("Presets");
                    }}
                  >
                    <Icon size={21} />
                    <span>{name === "Render Passes" ? "Passes" : name}</span>
                  </button>
                );
              })}
              <div className="rail-spacer" />
              <button
                title="Undo · Ctrl+Z"
                disabled={d.cursor < 0}
                onClick={d.undo}
              >
                <Undo2 size={19} />
              </button>
              <button
                title="Redo · Ctrl+Shift+Z"
                disabled={d.cursor >= d.history.length - 1}
                onClick={d.redo}
              >
                <Redo2 size={19} />
              </button>
            </nav>

            <div className="inspector-tabs">
              {["Adjust", "Refine", "Effects", "Tools", "Export"].map((n) => (
                <button
                  key={n}
                  className={
                    workspace === "Adjust" && tab === n ? "active" : ""
                  }
                  onClick={() => {
                    setTab(n);
                    setWorkspace("Adjust");
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="inspector-content">
              <Panels
                d={d}
                workspace={workspace}
                setWorkspace={setWorkspace}
                tab={tab}
                selectedMask={selectedMask}
                setSelectedMask={setSelectedMask}
                maskOverlay={maskOverlay}
                setMaskOverlay={setMaskOverlay}
                overlayOpacity={overlayOpacity}
                setOverlayOpacity={setOverlayOpacity}
                setPicker={setPicker}
                erase={erase}
                setErase={setErase}
              />
            </div>
            <QuickExport d={d} />
          </aside>
        </div>
      )}
      <footer className="studio-status">
        <span className={d.busy ? "working" : "ready"}>●</span>
        <span>
          {d.busy
            ? "Processing Preview…"
            : d.source
              ? d.ready
                ? "Ready"
                : "Preview unavailable"
              : "Ready"}
        </span>
        {d.info && (
          <>
            <span>
              {dimensions.w} × {dimensions.h}
            </span>
            <span>RGBA · {d.info.bitDepth}-bit source</span>
            <span>Linear sRGB · 32-bit working</span>
            <span>
              Output: {d.output.space} {d.output.bitDepth}-bit
            </span>
          </>
        )}
        <span className="status-gpu">
          {isTauri()
            ? s.neural.enabled
              ? "Neural GPU + float CPU"
              : "Float CPU"
            : "Browser preview"}
        </span>
      </footer>
      <input
        id="render-file"
        type="file"
        hidden
        accept=".exr,.png,.tif,.tiff,.jpg,.jpeg,.webp"
        onChange={(e) => {
          if (e.target.files?.[0]) d.loadFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {d.source &&
        s.zoom.visible &&
        !hidden &&
        createPortal(
          <div
            className="zoom-panel"
            style={{
              left: clamp(s.zoom.position.x, 8, innerWidth - 320),
              top: clamp(s.zoom.position.y, 58, innerHeight - 260),
            }}
            onWheel={(e) =>
              d.setState((v) => ({
                ...v,
                zoom: {
                  ...v.zoom,
                  factor: clamp(v.zoom.factor - e.deltaY * 0.002, 1, 10),
                },
              }))
            }
          >
            <div className="zoom-header" onPointerDown={inspectorDrag}>
              Zoom {s.zoom.factor.toFixed(1)}x
              <button
                aria-label="Close zoom"
                onClick={() =>
                  d.setState((v) => ({
                    ...v,
                    zoom: { ...v.zoom, visible: false },
                  }))
                }
              >
                <X size={17} />
              </button>
            </div>
            <canvas ref={zoomCanvas} />
          </div>,
          document.body,
        )}
      {d.error && (
        <div className="toast" role="alert">
          <span>{d.error}</span>
          <button aria-label="Dismiss" onClick={() => d.setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {settings && <SettingsPanel d={d} close={() => setSettings(false)} />}
    </main>
  );
}

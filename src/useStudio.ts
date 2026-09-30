import { prepareLut, collectLuts, restoreLuts } from "./lutLibrary";
import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { defaults, type StudioState } from "./state";
import {
  editKey,
  exportDefaults,
  normalizeState,
  parseProject,
  type NamedState,
  type Project,
  type ExportConfig,
} from "./finish";
export type SourceInfo = {
  width: number;
  height: number;
  bitDepth: number;
  space: string;
  hdr: boolean;
  neuralSupported?: boolean;
  passes: string[];
  path: string;
  icc: boolean;
};
export type BatchItem = {
  id: string;
  path: string;
  status: string;
  selected: boolean;
  state?: StudioState;
  thumbnail?: string;
};
export function unpack(bytes: ArrayBuffer) {
  const v = new DataView(bytes);
  const w = v.getUint32(0, true),
    h = v.getUint32(4, true);
  if (bytes.byteLength !== 8 + w * h * 4)
    throw Error("Invalid preview payload");
  return new ImageData(new Uint8ClampedArray(bytes.slice(8)), w, h);
}
export function imageUrl(p: ImageData) {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  c.getContext("2d")!.putImageData(p, 0, 0);
  return c.toDataURL();
}
const initial = () => {
  const s = defaults();
  if (!isTauri()) s.neural.enabled = false;
  return s;
};
export function useStudio() {
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [batchFolder, setBatchFolder] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const batchCancel = useRef(false);
  const [state, setState] = useState(initial),
    [source, setSource] = useState<ImageData | null>(null),
    [image, setImage] = useState<ImageData | null>(null),
    [info, setInfo] = useState<SourceInfo | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(""),
    [cap, setCap] = useState<any>(null),
    [history, setHistory] = useState<NamedState[]>([]),
    [cursor, setCursor] = useState(-1),
    [snapshots, setSnapshots] = useState<NamedState[]>([]),
    [presets, setPresets] = useState<NamedState[]>(() => {
      try {
        return JSON.parse(
          localStorage.getItem("studio-presets-v1") || "[]",
        ).map((p: NamedState) => ({ ...p, state: normalizeState(p.state) }));
      } catch {
        return [];
      }
    }),
    [output, setOutput] = useState<ExportConfig>(() => ({
      ...exportDefaults(),
      bitDepth: isTauri() ? 16 : 8,
    })),
    [projectPath, setProjectPath] = useState(""),
    [passes, setPasses] = useState<{ name: string; path: string }[]>([]),
    [recent, setRecent] = useState<string[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("studio-recent-v1") || "[]");
      } catch {
        return [];
      }
    }),
    [dragging, setDragging] = useState(false);
  const sourceId = useRef(0),
    version = useRef(0),
    worker = useRef<Worker | null>(null),
    current = useRef(state),
    historyRef = useRef(history),
    cursorRef = useRef(cursor),
    skipHistory = useRef(false),
    lastHistoryKey = useRef("");
  current.current = state;
  historyRef.current = history;
  cursorRef.current = cursor;
  const [passRevision, setPassRevision] = useState(0);
  const key = editKey(state);
  const renderKey = `${sourceId.current}:${passRevision}:${key}`;
  useEffect(() => {
    localStorage.setItem("studio-presets-v1", JSON.stringify(presets));
  }, [presets]);
  useEffect(() => {
    if (isTauri()) {
      invoke<string[]>("recent_projects")
        .then(setRecent)
        .catch(() => {});
      invoke<string | null>("startup_file")
        .then((path) => {
          if (path) {
            if (/\.dlssproj$/i.test(path)) void openProject(path);
            else void loadNative(path);
          }
        })
        .catch((e) => setError(String(e)));
    }
    if (isTauri())
      invoke("capabilities")
        .then(setCap)
        .catch((e) => setError(String(e)));
    worker.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current.onmessage = ({ data }) => {
      if (data.id !== version.current) return;
      if (data.error) {
        setError(data.error);
        setBusy(false);
        return;
      }
      setImage(data.image);
      setReady(data.key);
      setBusy(false);
    };
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          ".neural-adjustments input[type=range],.neural-adjustments input[type=number],.pro-inspector input[type=range],.pro-inspector input[type=number],.color-wheel,.curve-editor,.preset-strength input",
        )
      )
        setDragging(true);
    };
    const up = () => setDragging(false);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  useEffect(() => {
    if (!source) return;
    if (skipHistory.current) {
      skipHistory.current = false;
      lastHistoryKey.current = key;
      return;
    }
    if (key === lastHistoryKey.current || dragging) return;
    const timer = setTimeout(() => {
      const entry = {
        id: crypto.randomUUID(),
        name: historyRef.current.length
          ? "Adjustment " + (historyRef.current.length + 1)
          : "Original settings",
        state: structuredClone(current.current),
      };
      const next = [
        ...historyRef.current.slice(0, cursorRef.current + 1),
        entry,
      ].slice(-100);
      lastHistoryKey.current = key;
      setHistory(next);
      setCursor(next.length - 1);
    }, 220);
    return () => clearTimeout(timer);
  }, [key, source, dragging]);
  useEffect(() => {
    if (!source) return;
    const id = ++version.current,
      sid = sourceId.current;
    setBusy(true);
    setReady("");
    const timer = setTimeout(
      async () => {
        try {
          const snapshot = current.current;
          const lut = await prepareLut(snapshot.finish);
          if (id !== version.current || sid !== sourceId.current) return;
          if (isTauri()) {
            const bytes = await invoke<ArrayBuffer>("finish_preview", {
              state: snapshot,
              sourceId: sid,
              max: dragging ? 640 : 0,
            });
            if (id !== version.current || sid !== sourceId.current) return;
            setImage(unpack(bytes));
            setReady(renderKey);
            setBusy(false);
          } else
            worker.current?.postMessage({
              id,
              key: renderKey,
              image: source,
              state: snapshot,
              lut,
            });
        } catch (e) {
          if (id !== version.current) return;
          if (String(e) !== "Superseded preview") setError(String(e));
          setBusy(false);
        }
      },
      dragging ? 30 : 100,
    );
    return () => clearTimeout(timer);
  }, [renderKey, source, dragging]);
  function restore(i: number) {
    const entry = historyRef.current[i];
    if (!entry) return;
    skipHistory.current = true;
    setCursor(i);
    setState(structuredClone(entry.state));
  }
  function undo() {
    if (
      editKey(current.current) !== lastHistoryKey.current &&
      cursorRef.current >= 0
    ) {
      skipHistory.current = true;
      setState(structuredClone(historyRef.current[cursorRef.current].state));
    } else restore(cursorRef.current - 1);
  }
  function resetDocument() {
    setHistory([]);
    setCursor(-1);
    setSnapshots([]);
    setPasses([]);
    setProjectPath("");
    lastHistoryKey.current = "";
  }
  async function loadNative(path: string, space = "auto", keep = false) {
    const id = ++sourceId.current;
    ++version.current;
    setBusy(true);
    setError("");
    setReady("");
    try {
      const meta = await invoke<SourceInfo>("open_render", {
        path,
        sourceId: id,
        space,
      });
      const bytes = await invoke<ArrayBuffer>("source_preview", {
        sourceId: id,
      });
      if (id !== sourceId.current) return;
      const p = unpack(bytes);
      setSource(p);
      setImage(p);
      setInfo(meta);
      if (!keep) {
        resetDocument();
        const s = initial();
        // HDR imports use a labeled SDR neural working copy; the float source
        // remains immutable. Reopened projects retain their saved input mode.
        s.neural.toneMap = meta.neuralSupported === false;
        setState(s);
      }
    } catch (e) {
      if (id === sourceId.current) {
        setError(String(e));
        setBusy(false);
      }
      return false;
    }
    return true;
  }
  async function loadFile(file: File) {
    if (isTauri() && /\.(exr|tiff?)$/i.test(file.name)) {
      setError("Use Open Render for native EXR/TIFF decoding.");
      return;
    }
    const id = ++sourceId.current;
    ++version.current;
    setBusy(true);
    setReady("");
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 64e6)
        throw Error("Image exceeds 64 MP");
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const p = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      if (isTauri())
        await invoke("load_source", p.data.buffer, {
          headers: {
            "x-image-width": String(p.width),
            "x-image-height": String(p.height),
            "x-source-id": String(id),
          },
        });
      if (id !== sourceId.current) return;
      resetDocument();
      setState(initial());
      setSource(p);
      setImage(p);
      setInfo({
        width: p.width,
        height: p.height,
        bitDepth: 8,
        space: "srgb",
        hdr: false,
        passes: [],
        path: "",
        icc: false,
      });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  async function openRender() {
    if (!isTauri()) {
      document.querySelector<HTMLInputElement>("#render-file")?.click();
      return;
    }
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Renders",
          extensions: ["exr", "png", "tif", "tiff", "jpg", "jpeg", "webp"],
        },
      ],
    });
    if (path) await loadNative(path);
  }
  function remember(path: string) {
    setRecent((old) => {
      const next = [path, ...old.filter((p) => p !== path)].slice(0, 8);
      localStorage.setItem("studio-recent-v1", JSON.stringify(next));
      return next;
    });
  }
  async function saveProject(as = false) {
    try {
      if (!info?.path)
        throw Error(
          "Open a render from disk before saving a project. Pasted/browser images have no source path.",
        );
      let path = as ? "" : projectPath;
      if (!path)
        path =
          (await save({
            defaultPath: info.path.replace(/\.[^.]+$/, ".dlssproj"),
            filters: [{ name: "Studio Project", extensions: ["dlssproj"] }],
          })) || "";
      if (!path) return;
      const luts = await collectLuts([
        current.current,
        ...snapshots.map((v) => v.state),
        ...historyRef.current.map((v) => v.state),
        ...presets.map((v) => v.state),
      ]);
      const p: Project = {
        luts,
        version: 1,
        sourcePath: info.path,
        inputSpace: info.space === "ICC to linear sRGB" ? "auto" : info.space,
        state: current.current,
        passes,
        snapshots,
        history: historyRef.current,
        historyCursor: cursorRef.current,
        presets,
        output,
      };
      await invoke("write_project", { path, content: JSON.stringify(p) });
      setProjectPath(path);
      remember(path);
    } catch (e) {
      setError(String(e));
    }
  }
  async function openProject(path?: string) {
    try {
      if (!isTauri())
        throw Error("Project files use native file access in the Windows app.");
      path =
        path ||
        (await open({
          filters: [{ name: "Studio Project", extensions: ["dlssproj"] }],
        })) ||
        undefined;
      if (!path) return;
      const p = parseProject(await invoke<string>("read_project", { path }));
      await restoreLuts(p.luts);
      if (!(await loadNative(p.sourcePath, p.inputSpace || "auto", true)))
        return;
      for (const pass of p.passes)
        await invoke("import_pass", { ...pass, sourceId: sourceId.current });
      skipHistory.current = true;
      lastHistoryKey.current = editKey(p.state);
      setState(p.state);
      setSnapshots(p.snapshots);
      setHistory(p.history);
      setCursor(
        Math.max(
          -1,
          Math.min(
            p.history.length - 1,
            p.historyCursor ?? p.history.length - 1,
          ),
        ),
      );
      setOutput(p.output);
      setPasses(p.passes);
      setPassRevision((v) => v + 1);
      setPresets(p.presets);
      setProjectPath(path);
      remember(path);
      setInfo((i) =>
        i
          ? {
              ...i,
              passes: [
                ...new Set([...i.passes, ...p.passes.map((v) => v.name)]),
              ],
            }
          : i,
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function addPass(name: string) {
    try {
      const path = await open({
        filters: [
          { name: "Render pass", extensions: ["exr", "png", "tif", "tiff"] },
        ],
      });
      if (!path) return;
      const names = await invoke<string[]>("import_pass", {
        path,
        name,
        sourceId: sourceId.current,
      });
      setPassRevision((v) => v + 1);
      setPasses((a) => [...a.filter((p) => p.name !== name), { path, name }]);
      setInfo((i) => (i ? { ...i, passes: names } : i));
    } catch (e) {
      setError(String(e));
    }
  }
  async function pick(x: number, y: number, pass = ""): Promise<number[]> {
    if (isTauri())
      return invoke<number[]>("sample_source", {
        sourceId: sourceId.current,
        x,
        y,
        pass,
      });
    if (pass || !source)
      throw Error("Render-pass sampling requires the Windows app.");
    const i =
      (Math.min(source.height - 1, Math.floor(y * source.height)) *
        source.width +
        Math.min(source.width - 1, Math.floor(x * source.width))) *
      4;
    return Array.from(source.data.slice(i, i + 4), (v, k) =>
      k === 3
        ? v / 255
        : v / 255 <= 0.04045
          ? v / 3294.6
          : ((v / 255 + 0.055) / 1.055) ** 2.4,
    );
  }
  async function addBatch(paths?: string[]) {
    try {
      const selected =
        paths ||
        (await open({
          multiple: true,
          filters: [
            {
              name: "Renders",
              extensions: ["exr", "png", "tif", "tiff", "jpg", "jpeg", "webp"],
            },
          ],
        })) ||
        [];
      setBatchQueue((q) => [
        ...q,
        ...selected.map((path) => ({
          id: crypto.randomUUID(),
          path,
          status: "Queued",
          selected: true,
        })),
      ]);
    } catch (e) {
      setError(String(e));
    }
  }
  async function processBatch(selected = false) {
    if (!batchFolder || batchBusy) return;
    batchCancel.current = false;
    setBatchBusy(true);
    const base = structuredClone(current.current),
      config = structuredClone(output);
    for (const item of batchQueue) {
      if (batchCancel.current) break;
      if (selected && !item.selected) continue;
      setBatchQueue((q) =>
        q.map((v) => (v.id === item.id ? { ...v, status: "Processing" } : v)),
      );
      try {
        const stem = item.path
          .split(/[\\/]/)
          .pop()!
          .replace(/\.[^.]+$/, "");
        await prepareLut((item.state || base).finish);
        await invoke("batch_render", {
          path: item.path,
          destination: `${batchFolder}/${stem}${config.suffix}.${config.format}`,
          state: item.state || base,
          output: config,
        });
        setBatchQueue((q) =>
          q.map((v) => (v.id === item.id ? { ...v, status: "Done" } : v)),
        );
      } catch (e) {
        setBatchQueue((q) =>
          q.map((v) => (v.id === item.id ? { ...v, status: String(e) } : v)),
        );
      }
    }
    setBatchBusy(false);
  }
  async function autoAdjust(kind: string) {
    try {
      if (isTauri()) {
        const values = await invoke<Record<string, number>>("auto_adjust", {
          kind,
          sourceId: sourceId.current,
        });
        setState((s) => ({ ...s, finish: { ...s.finish, ...values } }));
      } else if (source) {
        let r = 0,
          g = 0,
          b = 0;
        for (let i = 0; i < source.data.length; i += 4) {
          r += source.data[i];
          g += source.data[i + 1];
          b += source.data[i + 2];
        }
        setState((s) => ({
          ...s,
          finish: {
            ...s.finish,
            ...(kind === "exposure"
              ? {
                  exposure: Math.max(
                    -6,
                    Math.min(
                      6,
                      Math.log2(
                        118 / ((r + g + b) / (source.data.length / 4) / 3),
                      ),
                    ),
                  ),
                }
              : {
                  temperature: Math.max(
                    -100,
                    Math.min(100, Math.log2((b + 1) / (r + 1)) * 100),
                  ),
                  tint: Math.max(
                    -100,
                    Math.min(100, Math.log2((r + b + 2) / (2 * g + 2)) * 100),
                  ),
                }),
          },
        }));
      }
    } catch (e) {
      setError(String(e));
    }
  }
  async function exportImage(kind: "file" | "clipboard" | "all" = "file") {
    if (!image || busy || ready !== renderKey) return;
    setBusy(true);
    try {
      if (!isTauri()) {
        if (
          output.format !== "png" ||
          output.bitDepth !== 8 ||
          kind === "all" ||
          output.space !== "srgb" ||
          output.resize !== "original"
        )
          throw Error(
            "Native high-bit-depth and variant export requires the Windows app.",
          );
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        c.getContext("2d")!.putImageData(image, 0, 0);
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!)));
        if (kind === "clipboard")
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "render_enhanced.png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        return;
      }
      await prepareLut(current.current.finish);
      if (kind === "clipboard") {
        await invoke("copy_finished", {
          state: current.current,
          sourceId: sourceId.current,
        });
        return;
      }
      const stem =
        info?.path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, "") || "render";
      if (kind === "all") {
        const folder = await open({ directory: true });
        if (!folder) return;
        const variants = snapshots.length
          ? snapshots
          : ["Default", "Cinematic", "Natural"].map((name) => ({
              name,
              state: {
                ...current.current,
                neural: { ...current.current.neural, style: name as "Default" },
              },
            }));
        for (const item of variants) {
          await prepareLut(item.state.finish);
          const name = item.name.replace(/[<>:"/\\|?*]/g, "_");
          const path = `${folder}/${stem}_${name}.${output.format}`;
          await invoke("export_finished", {
            path,
            state: item.state,
            sourceId: sourceId.current,
            output,
          });
        }
      } else {
        const path = await save({
          defaultPath: `${stem}${output.suffix}.${output.format}`,
          filters: [
            { name: output.format.toUpperCase(), extensions: [output.format] },
          ],
        });
        if (path)
          await invoke("export_finished", {
            path,
            state: current.current,
            sourceId: sourceId.current,
            output,
          });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    setInteractionDragging: setDragging,
    batchQueue,
    setBatchQueue,
    batchFolder,
    setBatchFolder,
    batchBusy,
    addBatch,
    processBatch,
    stopBatch: () => {
      batchCancel.current = true;
    },
    pick,
    state,
    setState,
    source,
    image,
    info,
    setInfo,
    busy,
    error,
    setError,
    ready: ready === renderKey && !dragging,
    cap,
    history,
    cursor,
    restore,
    undo,
    redo: () => restore(cursorRef.current + 1),
    snapshots,
    setSnapshots,
    presets,
    setPresets,
    output,
    setOutput,
    projectPath,
    recent,
    loadNative,
    loadFile,
    openRender,
    saveProject,
    openProject,
    addPass,
    reloadSpace: async (space: string) => {
      if (!info?.path) return;
      const imported = passes.slice();
      if (!(await loadNative(info.path, space, true))) return;
      try {
        for (const pass of imported)
          await invoke("import_pass", { ...pass, sourceId: sourceId.current });
        setInfo((v) =>
          v
            ? {
                ...v,
                passes: [
                  ...new Set([...v.passes, ...imported.map((p) => p.name)]),
                ],
              }
            : v,
        );
        setPassRevision((v) => v + 1);
      } catch (e) {
        setError(String(e));
      }
    },
    autoAdjust,
    exportImage,
    sourceId,
  };
}

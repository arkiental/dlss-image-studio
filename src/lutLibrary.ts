import { invoke, isTauri } from "@tauri-apps/api/core";
import manifest from "../public/luts/manifest.json";
import { MAX_CUBE_BYTES, parseCube, type Lut, type LutSpace } from "./lut";
import type { Finish } from "./finish";
import type { StudioState } from "./state";
export type LutAsset = {
  id: string;
  name: string;
  space: LutSpace;
  text: string;
};
export type LutEntry = {
  id: string;
  name: string;
  category: string;
  author: string;
  license: string;
  space: LutSpace;
  file?: string;
  url?: string;
};
export const bundledLuts = manifest as LutEntry[];
const bundles = new Map(bundledLuts.map((v) => [v.id, v]));
const cache = new Map<string, Promise<{ asset: LutAsset; lut: Lut }>>();
const registered = new Set<string>();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("studio-luts-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("assets", { keyPath: "id" });
      request.result.createObjectStore("catalog", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error("Cannot open the LUT library"));
  }));
}
async function read<T>(store: string, id?: string): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readonly");
    const req = id
      ? tx.objectStore(store).get(id)
      : tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error("Cannot read the LUT library"));
  });
}
export async function importedLuts() {
  return read<LutEntry[]>("catalog");
}
export async function lutDigest(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
async function persist(asset: LutAsset) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["assets", "catalog"], "readwrite");
    tx.objectStore("assets").put(asset);
    tx.objectStore("catalog").put({
      id: asset.id,
      name: asset.name,
      space: asset.space,
      category: "Imported",
      author: "Your LUT",
      license: "User supplied",
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(Error("LUT library storage is full or unavailable"));
    tx.onabort = () => reject(Error("Could not save the imported LUT"));
  });
}
export function loadLut(id: string) {
  const existing = cache.get(id);
  if (existing) {
    cache.delete(id);
    cache.set(id, existing);
    return existing;
  }
  const task = (async () => {
    const builtin = bundles.get(id);
    let asset: LutAsset;
    if (builtin) {
      const response = await fetch(`/luts/${builtin.file}`);
      if (!response.ok || !response.body)
        throw Error(`Bundled LUT is unavailable: ${builtin.name}`);
      // HTTP hosts may transparently decode .gz; Tauri's asset protocol does not.
      const payload = new Uint8Array(await response.arrayBuffer());
      const bytes =
        payload[0] === 0x1f && payload[1] === 0x8b
          ? await new Response(
              new Blob([payload])
                .stream()
                .pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer()
          : payload.buffer;
      asset = {
        id,
        name: builtin.name,
        space: builtin.space,
        text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          bytes,
        ),
      };
    } else {
      asset = await read<LutAsset>("assets", id);
      if (!asset)
        throw Error(
          "Selected LUT is missing. Import it again or disable LUT grading.",
        );
    }
    if ((await lutDigest(asset.text)) !== id)
      throw Error("LUT checksum does not match the saved look");
    return { asset, lut: parseCube(asset.text) };
  })();
  cache.set(id, task);
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
  task.catch(() => {
    if (cache.get(id) === task) cache.delete(id);
  });
  return task;
}
export async function prepareLut(f: Finish): Promise<Lut | undefined> {
  if (!f.lutId || !f.lutEnabled || f.lutStrength === 0) return;
  const loaded = await loadLut(f.lutId);
  if (isTauri() && !registered.has(f.lutId)) {
    const id = await invoke<string>("register_lut", {
      text: loaded.asset.text,
    });
    if (id !== f.lutId) throw Error("Native LUT checksum mismatch");
    registered.add(id);
  }
  return loaded.lut;
}
export async function importLutFile(file: File): Promise<LutAsset> {
  if (!file.name.toLowerCase().endsWith(".cube"))
    throw Error("Import a .cube LUT file");
  if (file.size > MAX_CUBE_BYTES) throw Error("CUBE exceeds 16 MB");
  const text = await file.text();
  parseCube(text);
  const asset = {
    id: await lutDigest(text),
    name: file.name.replace(/\.cube$/i, ""),
    space: "srgb" as const,
    text,
  };
  await persist(asset);
  cache.delete(asset.id);
  return asset;
}
export async function collectLuts(states: StudioState[]): Promise<LutAsset[]> {
  const ids = new Set(
    states.map((s) => s.finish.lutId).filter((id) => id && !bundles.has(id)),
  );
  const assets: LutAsset[] = [];
  for (const id of ids) assets.push((await loadLut(id)).asset);
  if (assets.reduce((n, v) => n + v.text.length, 0) > 48_000_000)
    throw Error(
      "Embedded custom LUTs exceed 48 MB. Save fewer LUT variants per project.",
    );
  return assets;
}
export async function restoreLuts(assets: LutAsset[] = []) {
  if (
    !Array.isArray(assets) ||
    assets.length > 128 ||
    assets.reduce((n, v) => n + (v.text?.length || 0), 0) > 48_000_000
  )
    throw Error("Invalid embedded LUT library");
  // Validate everything before changing the local library.
  for (const asset of assets) {
    if (
      typeof asset.text !== "string" ||
      typeof asset.name !== "string" ||
      asset.name.length > 256 ||
      !["srgb", "rec709", "linear"].includes(asset.space) ||
      (await lutDigest(asset.text)) !== asset.id
    )
      throw Error("Invalid embedded LUT");
    parseCube(asset.text);
  }
  for (const asset of assets)
    if (!bundles.has(asset.id)) {
      await persist(asset);
      cache.delete(asset.id);
    }
}

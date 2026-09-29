import { curveValue } from "./finishBrowser";
import type { StudioState, Rect } from "./state";
export type Point = { x: number; y: number };
export type MaskKind =
  | "rectangle"
  | "ellipse"
  | "linear"
  | "radial"
  | "brush"
  | "polygon"
  | "luminance"
  | "color"
  | "pass";
export interface MaskLayer {
  id: string;
  name: string;
  kind: MaskKind;
  enabled: boolean;
  invert: boolean;
  operation: "add" | "subtract" | "intersect";
  opacity: number;
  feather: number;
  radius: number;
  hardness: number;
  flow: number;
  rect: Rect;
  points: Point[];
  low: number;
  high: number;
  color: number[];
  pass: string;
  exposure: number;
  strokeOps: boolean[];
  expand: number;
  blur: number;
  dodgeMode: "exposure" | "highlights" | "shadows" | "saturation";
}
export interface Finish {
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  denoise: number;
  chromaDenoise: number;
  preserveDetail: number;
  sharpen: number;
  sharpenRadius: number;
  sharpenThreshold: number;
  clarity: number;
  texture: number;
  dehaze: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  vignette: number;
  vignetteMidpoint: number;
  grain: number;
  grade: number[][];
  gradeStrength: number;
  gradeBalance: number;
  lift: number;
  gain: number;
  curves: Point[][];
  crop: Rect;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  masks: MaskLayer[];
  masked: boolean;
  depthPass: string;
  focus: number;
  dof: number;
  fog: number;
  soloPass: string;
  passLow: number;
  passHigh: number;
  passInvert: boolean;
}
export const finishDefaults = (): Finish => ({
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  denoise: 0,
  chromaDenoise: 0,
  preserveDetail: 80,
  sharpen: 0,
  sharpenRadius: 1,
  sharpenThreshold: 2,
  clarity: 0,
  texture: 0,
  dehaze: 0,
  bloom: 0,
  bloomThreshold: 1,
  bloomRadius: 12,
  vignette: 0,
  vignetteMidpoint: 50,
  grain: 0,
  grade: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  gradeStrength: 100,
  gradeBalance: 0,
  lift: 0,
  gain: 0,
  curves: Array.from({ length: 4 }, () => [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]),
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipX: false,
  flipY: false,
  masks: [],
  masked: false,
  depthPass: "",
  focus: 0.5,
  dof: 0,
  fog: 0,
  soloPass: "",
  passLow: 0,
  passHigh: 1,
  passInvert: false,
});
export const newMask = (kind: MaskKind): MaskLayer => ({
  id: crypto.randomUUID(),
  name: kind[0].toUpperCase() + kind.slice(1),
  kind,
  enabled: true,
  invert: false,
  operation: "add",
  opacity: 100,
  feather: 10,
  radius: 0.04,
  hardness: 60,
  flow: 100,
  rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  points: [],
  low: 0.25,
  high: 0.75,
  color: [0.5, 0.5, 0.5],
  pass: "",
  exposure: 0,
  strokeOps: [],
  expand: 0,
  blur: 0,
  dodgeMode: "exposure",
});
export type ExportConfig = {
  format: "png" | "jpg" | "webp" | "tiff" | "exr";
  bitDepth: 8 | 16 | 32;
  quality: number;
  scale: number;
  width: number;
  height: number;
  resize: "original" | "percent" | "exact";
  filter: "lanczos" | "bicubic" | "nearest";
  space: "srgb" | "linear" | "p3" | "rec709" | "acescg";
  suffix: string;
};
export const exportDefaults = (): ExportConfig => ({
  format: "png",
  bitDepth: 16,
  quality: 92,
  scale: 100,
  width: 1920,
  height: 1080,
  resize: "original",
  filter: "lanczos",
  space: "srgb",
  suffix: "_enhanced",
});
export interface NamedState {
  id: string;
  name: string;
  state: StudioState;
  favorite?: boolean;
  category?: string;
  thumbnail?: string;
}
export interface Project {
  version: 1;
  sourcePath: string;
  inputSpace?: string;
  state: StudioState;
  passes: { name: string; path: string }[];
  snapshots: NamedState[];
  history: NamedState[];
  historyCursor?: number;
  presets: NamedState[];
  output: ExportConfig;
}
export function normalizeState(value: unknown): StudioState {
  if (!value || typeof value !== "object")
    throw Error("Invalid adjustment state");
  const s = structuredClone(value) as StudioState;
  if (!s.local || !s.neural || !s.zoom)
    throw Error("Missing adjustment groups");
  s.finish = { ...finishDefaults(), ...s.finish };
  s.finish.masks = (s.finish.masks || []).map((m) => ({
    ...m,
    strokeOps: m.strokeOps || [],
    expand: m.expand || 0,
    blur: m.blur || 0,
    dodgeMode: m.dodgeMode || "exposure",
  }));
  for (const k of [
    "contrast",
    "gamma",
    "brightness",
    "vibrance",
    "saturation",
    "hue",
    "processingResolution",
  ] as const)
    if (!Number.isFinite(s[k])) throw Error("Invalid numeric adjustment");
  if (s.finish.masks.length > 64 || s.finish.curves.some((c) => c.length > 32))
    throw Error("Project has too many control points or masks");
  return s;
}
export function parseProject(text: string): Project {
  const p = JSON.parse(text) as Project;
  if (p.version !== 1 || typeof p.sourcePath !== "string" || !p.sourcePath)
    throw Error("Unsupported or incomplete Studio project");
  p.state = normalizeState(p.state);
  p.snapshots = (p.snapshots || [])
    .slice(0, 64)
    .map((x) => ({ ...x, state: normalizeState(x.state) }));
  p.history = (p.history || [])
    .slice(-100)
    .map((x) => ({ ...x, state: normalizeState(x.state) }));
  p.presets = (p.presets || [])
    .slice(0, 100)
    .map((x) => ({ ...x, state: normalizeState(x.state) }));
  p.passes = p.passes || [];
  p.output = { ...exportDefaults(), ...p.output };
  return p;
}
export function editKey(s: StudioState) {
  return JSON.stringify({
    ...s,
    zoom: undefined,
    local: {
      ...s.local,
      region: s.local.scope === "region" ? s.local.region : undefined,
    },
  });
}
export function blendPreset(
  base: StudioState,
  preset: StudioState,
  strength: number,
  part = "all",
): StudioState {
  const t = Math.max(0, Math.min(1, strength / 100)),
    s = structuredClone(base);
  const mix = (a: number, b: number) => a + (b - a) * t;
  if (part === "all" || part === "tone")
    for (const k of ["contrast", "gamma", "brightness"] as const)
      s[k] = mix(base[k], preset[k]);
  if (part === "all" || part === "color")
    for (const k of ["vibrance", "saturation", "hue"] as const)
      s[k] = mix(base[k], preset[k]);
  const sets: Record<string, string[]> = {
    tone: ["exposure", "highlights", "shadows", "whites", "blacks"],
    color: [
      "temperature",
      "tint",
      "gradeStrength",
      "gradeBalance",
      "lift",
      "gain",
    ],
    lens: [
      "bloom",
      "bloomThreshold",
      "bloomRadius",
      "vignette",
      "vignetteMidpoint",
      "grain",
    ],
    detail: [
      "denoise",
      "chromaDenoise",
      "preserveDetail",
      "sharpen",
      "sharpenRadius",
      "sharpenThreshold",
      "clarity",
      "texture",
      "dehaze",
    ],
  };
  for (const [group, keys] of Object.entries(sets))
    if (part === "all" || part === group)
      for (const key of keys) {
        const k = key as keyof Finish;
        (s.finish as any)[k] = mix(
          (base.finish as any)[k],
          (preset.finish as any)[k],
        );
      }
  if (part === "all" || part === "tone") {
    s.finish.curves =
      t === 1
        ? structuredClone(preset.finish.curves)
        : t === 0
          ? structuredClone(base.finish.curves)
          : base.finish.curves.map((c, channel) =>
              Array.from({ length: 17 }, (_, i) => ({
                x: i / 16,
                y: mix(
                  curveValue(c, i / 16),
                  curveValue(preset.finish.curves[channel], i / 16),
                ),
              })),
            );
  }
  if (part === "all" || part === "color")
    s.finish.grade = base.finish.grade.map((g, i) =>
      g.map((v, k) =>
        k === 0
          ? (v +
              (((preset.finish.grade[i][k] - v + 540) % 360) - 180) * t +
              360) %
            360
          : mix(v, preset.finish.grade[i][k]),
      ),
    );
  if (part === "all" || part === "detail") {
    for (const k of ["intensity", "tone", "structure"] as const)
      s.local[k] = mix(base.local[k], preset.local[k]);
    if (t > 0) s.neural.style = preset.neural.style;
  }
  return s;
}

import { finishDefaults, type Finish } from "./finish";
export type Style = "cinematic" | "neutral" | "natural";
export type Rect = { x: number; y: number; width: number; height: number };
export type Adjustments = {
  contrast: number;
  gamma: number;
  vibrance: number;
  brightness: number;
  saturation: number;
  hue: number;
};
export interface StudioState extends Adjustments {
  finish: Finish;
  style: Style;
  neural: {
    enabled: boolean;
    style: "Default" | "Natural" | "Cinematic";
    toneMap?: boolean;
  };
  processingResolution: number;
  local: {
    scope: "image" | "region";
    intensity: number;
    tone: number;
    structure: number;
    region: Rect;
  };
  zoom: {
    visible: boolean;
    factor: number;
    position: { x: number; y: number };
  };
}
export const defaults = (): StudioState => ({
  finish: finishDefaults(),
  style: "neutral",
  neural: { enabled: true, style: "Default" },
  processingResolution: 100,
  contrast: 0,
  gamma: 0,
  vibrance: 0,
  brightness: 0,
  saturation: 0,
  hue: 0,
  local: {
    scope: "image",
    intensity: 1,
    tone: 1,
    structure: 1,
    region: { x: 0.08, y: 0.51, width: 0.14, height: 0.28 },
  },
  zoom: { visible: true, factor: 2.5, position: { x: 48, y: 150 } },
});
export const presets: Record<Style, Adjustments> = {
  neutral: {
    contrast: 0,
    gamma: 0,
    vibrance: 0,
    brightness: 0,
    saturation: 0,
    hue: 0,
  },
  cinematic: {
    contrast: 16,
    gamma: -5,
    vibrance: 8,
    brightness: -3,
    saturation: -8,
    hue: -3,
  },
  natural: {
    contrast: 4,
    gamma: 2,
    vibrance: 14,
    brightness: 2,
    saturation: 3,
    hue: 0,
  },
};
export const clamp = (n: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
export function imageFit(iw: number, ih: number, vw: number, vh: number) {
  const scale = Math.min(vw / iw, vh / ih);
  return {
    x: (vw - iw * scale) / 2,
    y: (vh - ih * scale) / 2,
    width: iw * scale,
    height: ih * scale,
    scale,
  };
}
export function moveRegion(
  region: Rect,
  dx: number,
  dy: number,
  w: number,
  h: number,
): Rect {
  return {
    ...region,
    x: clamp(region.x + dx / w, 0, 1 - region.width),
    y: clamp(region.y + dy / h, 0, 1 - region.height),
  };
}
export function exportName(stem: string, style: Style, extension = "png") {
  return `${stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "image"}-${style}.${extension}`;
}

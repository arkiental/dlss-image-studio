import { editKey } from "./finish";
import type { StudioState } from "./state";

const labels: Record<string, string> = {
  processingResolution: "Neural resolution",
  toneMap: "Neural input",
  enabled: "Neural rendering",
  style: "Neural style",
  intensity: "Intensity",
  tone: "Local tone",
  structure: "Local structure",
  masked: "Mask scope",
  soloPass: "Display pass",
  lutName: "LUT",
  lutId: "LUT",
  lutEnabled: "LUT bypass",
  lutStrength: "LUT strength",
  denoiseLuma: "Luminance denoise",
  denoiseChroma: "Color denoise",
  sharpen: "Sharpening",
  clarity: "Clarity",
  dof: "Depth blur",
  fog: "Depth fog",
  crop: "Crop",
  curves: "Tone curve",
  wheels: "Color wheels",
};
const title = (key: string) =>
  labels[key] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const valueLabel = (value: unknown) =>
  typeof value === "number"
    ? String(Number(value.toFixed(3)))
    : typeof value === "boolean"
      ? value
        ? "on"
        : "off"
      : typeof value === "string"
        ? value
        : "";

export function historyLabel(
  previous: StudioState | undefined,
  next: StudioState,
) {
  if (!previous) return "Original settings";
  const before = JSON.parse(editKey(previous)),
    after = JSON.parse(editKey(next));
  const changes: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (equal(before[key], value)) continue;
    if (key === "finish" || key === "local" || key === "neural") {
      for (const [field, current] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (equal(before[key]?.[field], current)) continue;
        if (field === "masks") {
          const oldMasks = previous.finish.masks,
            newMasks = next.finish.masks;
          const added = newMasks.find(
            (mask) => !oldMasks.some((old) => old.id === mask.id),
          );
          const removed = oldMasks.find(
            (mask) => !newMasks.some((item) => item.id === mask.id),
          );
          changes.push(
            added
              ? `Add mask: ${added.name}`
              : removed
                ? `Delete mask: ${removed.name}`
                : "Edit mask",
          );
        } else if (field === "lutId") {
          changes.push("LUT changed");
        } else {
          const display = valueLabel(current);
          changes.push(`${title(field)}${display ? ` ${display}` : ""}`);
        }
      }
    } else {
      const display = valueLabel(value);
      changes.push(`${title(key)}${display ? ` ${display}` : ""}`);
    }
  }
  return (
    changes.slice(0, 2).join(" · ") +
      (changes.length > 2 ? ` +${changes.length - 2}` : "") || "Adjustment"
  );
}

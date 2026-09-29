import type { StudioState } from "./state";
// Conventional color processing only. Neural rendering is never approximated here.
export function processPixels(input: ImageData, state: StudioState): ImageData {
  if (state.neural.enabled)
    throw new Error(
      "Neural rendering requires the Windows app and configured runtime.",
    );
  const out = new ImageData(
      new Uint8ClampedArray(input.data),
      input.width,
      input.height,
    ),
    d = out.data,
    src = input.data;
  const linear = (x: number) =>
    x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const srgb = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const angle = (state.hue * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (let y = 0; y < input.height; y++)
    for (let x = 0; x < input.width; x++) {
      const i = (y * input.width + x) * 4;
      let rgb = [
        linear(src[i] / 255),
        linear(src[i + 1] / 255),
        linear(src[i + 2] / 255),
      ];
      rgb = rgb.map((v) =>
        Math.pow(
          Math.max(0, (v - 0.18) * (1 + state.contrast / 100) + 0.18) *
            Math.pow(2, state.brightness / 50),
          Math.pow(2, -state.gamma / 100),
        ),
      );
      const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722,
        spread = Math.max(...rgb) - Math.min(...rgb),
        sat =
          1 +
          state.saturation / 100 +
          (state.vibrance / 100) * (1 - Math.min(1, spread));
      rgb = rgb.map((v) => l + (v - l) * sat);
      const [a, b, e] = rgb;
      rgb = [
        (0.299 + 0.701 * c + 0.168 * s) * a +
          (0.587 - 0.587 * c + 0.33 * s) * b +
          (0.114 - 0.114 * c - 0.497 * s) * e,
        (0.299 - 0.299 * c - 0.328 * s) * a +
          (0.587 + 0.413 * c + 0.035 * s) * b +
          (0.114 - 0.114 * c + 0.292 * s) * e,
        (0.299 - 0.299 * c + 1.25 * s) * a +
          (0.587 - 0.587 * c - 1.05 * s) * b +
          (0.114 + 0.886 * c - 0.203 * s) * e,
      ];
      for (let k = 0; k < 3; k++)
        d[i + k] = Math.round(
          Math.max(0, Math.min(1, srgb(Math.max(0, rgb[k])))) * 255,
        );
    }
  return out;
}

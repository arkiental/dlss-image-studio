import { useEffect, useRef } from "react";
export function Scopes({
  image,
  mode,
}: {
  image: ImageData | null;
  mode: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !image) return;
    const c = ref.current,
      ctx = c.getContext("2d")!;
    c.width = 320;
    c.height = 130;
    ctx.fillStyle = "#101210";
    ctx.fillRect(0, 0, 320, 130);
    const hist = Array.from({ length: 4 }, () => new Float32Array(256));
    const step = Math.max(1, Math.ceil((image.width * image.height) / 180000));
    if (mode === "Histogram" || mode === "RGB Histogram") {
      for (let n = 0; n < image.width * image.height; n += step) {
        const i = n * 4;
        if (image.data[i + 3] === 0) continue;
        for (let k = 0; k < 3; k++) hist[k][image.data[i + k]]++;
        hist[3][
          Math.round(
            0.2126 * image.data[i] +
              0.7152 * image.data[i + 1] +
              0.0722 * image.data[i + 2],
          )
        ]++;
      }
      const max = Math.max(1, ...hist.flatMap((h) => Array.from(h)));
      for (const k of mode === "Histogram" ? [3] : [0, 1, 2]) {
        ctx.strokeStyle = ["#d88978", "#98b48b", "#80a1c1", "#edbc73"][k];
        ctx.beginPath();
        for (let x = 0; x < 256; x++) {
          const y = 125 - (Math.log1p(hist[k][x]) / Math.log1p(max)) * 116;
          x ? ctx.lineTo((x / 255) * 320, y) : ctx.moveTo(0, y);
        }
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = 0.13;
      for (let n = 0; n < image.width * image.height; n += step) {
        const i = n * 4,
          r = image.data[i] / 255,
          g = image.data[i + 1] / 255,
          b = image.data[i + 2] / 255,
          x = (n % image.width) / image.width;
        if (image.data[i + 3] === 0) continue;
        if (mode === "Vectorscope") {
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b,
            cb = (b - l) / (2 * (1 - 0.0722)),
            cr = (r - l) / (2 * (1 - 0.2126));
          ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
          ctx.fillRect(160 + cr * 230, 65 - cb * 116, 1, 1);
        } else
          for (let k = 0; k < (mode === "RGB Parade" ? 3 : 1); k++) {
            ctx.fillStyle =
              mode === "RGB Parade"
                ? ["#dc8476", "#92bd8e", "#8db5dd"][k]
                : "#edbc73";
            ctx.fillRect(
              mode === "RGB Parade" ? (x + k) * 106 : x * 320,
              125 -
                (mode === "RGB Parade"
                  ? [r, g, b][k]
                  : 0.2126 * r + 0.7152 * g + 0.0722 * b) *
                  120,
              1,
              1,
            );
          }
      }
      ctx.globalAlpha = 1;
    }
    if (mode === "Vectorscope") {
      ctx.strokeStyle = "#45443d";
      ctx.beginPath();
      ctx.ellipse(160, 65, 115, 58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#aaa99e";
      ctx.font = "10px sans-serif";
      for (const [label, r, g, b] of [
        ["R", 1, 0, 0],
        ["Y", 1, 1, 0],
        ["G", 0, 1, 0],
        ["C", 0, 1, 1],
        ["B", 0, 0, 1],
        ["M", 1, 0, 1],
      ] as [string, number, number, number][]) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b,
          cb = (b - l) / (2 * (1 - 0.0722)),
          cr = (r - l) / (2 * (1 - 0.2126));
        ctx.fillText(label, 160 + cr * 230 * 0.75, 65 - cb * 116 * 0.75);
      }
    }
    ctx.strokeStyle = "#45443d";
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(320, i * 32);
      ctx.stroke();
    }
  }, [image, mode]);
  return <canvas ref={ref} className="scopes-canvas" aria-label={mode} />;
}

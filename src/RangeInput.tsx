import { useRef, type CSSProperties, type PointerEvent } from "react";
import { clamp } from "./state";

// Explicit capture keeps mouse/touch drags working while async previews update
// the controlled value, including in the desktop WebView.
export function RangeInput({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  style,
  onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  style?: CSSProperties;
  onValue: (value: number) => void;
}) {
  const start = useRef({ x: 0, value });
  function update(e: PointerEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fine = e.ctrlKey || e.metaKey ? 100 : e.shiftKey ? 10 : 1;
    if (fine > 1) {
      onValue(
        clamp(
          Number(
            (
              start.current.value +
              (((e.clientX - start.current.x) / Math.max(1, rect.width - 21)) *
                (max - min)) /
                fine
            ).toFixed(6),
          ),
          min,
          max,
        ),
      );
      return;
    }
    const ratio = clamp(
      (e.clientX - rect.left - 10.5) / Math.max(1, rect.width - 21),
    );
    onValue(
      clamp(
        Number(
          (min + Math.round((ratio * (max - min)) / step) * step).toFixed(6),
        ),
        min,
        max,
      ),
    );
  }
  return (
    <input
      aria-label={label}
      type="range"
      value={value}
      min={min}
      max={max}
      step="any"
      disabled={disabled}
      style={style}
      onChange={(e) => onValue(+e.target.value)}
      onKeyDown={(e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        {
          e.preventDefault();
          const direction =
            e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
          onValue(
            clamp(
              Number(
                (
                  value +
                  (direction * step) /
                    (e.ctrlKey || e.metaKey ? 100 : e.shiftKey ? 10 : 1)
                ).toFixed(6),
              ),
              min,
              max,
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
        e.preventDefault();
        e.stopPropagation();
        start.current = { x: e.clientX, value };
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          update(e);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
}

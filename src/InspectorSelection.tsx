import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  displayDeltaToSource,
  getInspectorSelection,
  moveInspectorSelection,
  resizeInspectorSelection,
} from "./inspectorGeometry";
import type {
  InspectorSelectionRect,
  SelectionCenter,
  SelectionHandle,
  SelectionSize,
} from "./inspectorGeometry";

const handles: { handle: SelectionHandle; label: string }[] = [
  { handle: "nw", label: "top left" },
  { handle: "n", label: "top" },
  { handle: "ne", label: "top right" },
  { handle: "e", label: "right" },
  { handle: "se", label: "bottom right" },
  { handle: "s", label: "bottom" },
  { handle: "sw", label: "bottom left" },
  { handle: "w", label: "left" },
];

type Props = {
  imageSize: SelectionSize;
  displaySize: SelectionSize;
  center: SelectionCenter;
  factor: number;
  onChange: (center: SelectionCenter, factor: number) => void;
  disabled?: boolean;
};

type Gesture = {
  pointerId: number;
  client: { x: number; y: number };
  selection: InspectorSelectionRect;
  handle?: SelectionHandle;
};

export function InspectorSelection({
  imageSize,
  displaySize,
  center,
  factor,
  onChange,
  disabled = false,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const selection = getInspectorSelection(center, factor, imageSize);
  const change = (next: InspectorSelectionRect) =>
    onChange(next.center, next.factor);

  function endGesture(restore = false) {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (active && restore) change(active.selection);
    if (active && element.current?.hasPointerCapture(active.pointerId)) {
      element.current.releasePointerCapture(active.pointerId);
    }
  }

  useEffect(() => {
    if (disabled) endGesture(true);
  }, [disabled]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handleElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-handle]",
    );
    const handle = handleElement?.dataset.handle as SelectionHandle | undefined;
    if (handleElement) handleElement.focus();
    else event.currentTarget.focus();
    gesture.current = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      selection,
      handle,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = displayDeltaToSource(
      {
        x: event.clientX - active.client.x,
        y: event.clientY - active.client.y,
      },
      imageSize,
      displaySize,
    );
    change(
      active.handle
        ? resizeInspectorSelection(
            active.selection,
            active.handle,
            delta,
            imageSize,
          )
        : moveInspectorSelection(active.selection, delta, imageSize),
    );
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape" && gesture.current) {
      event.preventDefault();
      event.stopPropagation();
      endGesture(true);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta = {
      x:
        event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0,
      y: event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
    };
    if (!delta.x && !delta.y) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-handle]",
    )?.dataset.handle as SelectionHandle | undefined;
    change(
      handle
        ? resizeInspectorSelection(selection, handle, delta, imageSize)
        : moveInspectorSelection(selection, delta, imageSize),
    );
  }

  return (
    <div
      ref={element}
      className={`inspector-selection${disabled ? " disabled" : ""}`}
      data-testid="inspector-selection"
      data-dragging={dragging}
      role="region"
      aria-label="Zoom selection"
      aria-description="Drag to move. Use arrow keys to move one image pixel, or Shift and arrow keys to move ten. Drag a handle or use its arrow keys to resize."
      tabIndex={disabled ? -1 : 0}
      style={{
        left: `${(selection.x / imageSize.width) * 100}%`,
        top: `${(selection.y / imageSize.height) * 100}%`,
        width: `${(selection.width / imageSize.width) * 100}%`,
        height: `${(selection.height / imageSize.height) * 100}%`,
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={(event) => {
        if (!gesture.current || gesture.current.pointerId !== event.pointerId)
          return;
        event.stopPropagation();
        endGesture();
      }}
      onPointerCancel={(event) => {
        if (!gesture.current || gesture.current.pointerId !== event.pointerId)
          return;
        event.stopPropagation();
        endGesture(true);
      }}
      onLostPointerCapture={() => {
        gesture.current = null;
        setDragging(false);
      }}
      onKeyDown={keyDown}
    >
      {handles.map(({ handle, label }) => (
        <button
          key={handle}
          type="button"
          className="inspector-selection-handle"
          data-handle={handle}
          aria-label={`Resize zoom selection ${label}`}
          title={`Resize ${label} · arrow keys, Shift for 10 pixels`}
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
        />
      ))}
    </div>
  );
}

export type SelectionSize = { width: number; height: number };
export type SelectionCenter = { x: number; y: number };
export type SelectionHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type InspectorSelectionRect = SelectionSize & {
  x: number;
  y: number;
  center: SelectionCenter;
  factor: number;
};

const ASPECT = 3 / 2;
const SAMPLE_WIDTH = 300;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function selectionFactorLimits(imageSize: SelectionSize) {
  const min = Math.max(
    1,
    SAMPLE_WIDTH / imageSize.width,
    200 / imageSize.height,
  );
  return { min, max: Math.max(10, min) };
}

export function getInspectorSelection(
  center: SelectionCenter,
  factor: number,
  imageSize: SelectionSize,
): InspectorSelectionRect {
  const limits = selectionFactorLimits(imageSize);
  const nextFactor = clamp(factor, limits.min, limits.max);
  const width = SAMPLE_WIDTH / nextFactor;
  const height = width / ASPECT;
  const x = clamp(
    center.x * imageSize.width - width / 2,
    0,
    imageSize.width - width,
  );
  const y = clamp(
    center.y * imageSize.height - height / 2,
    0,
    imageSize.height - height,
  );
  return {
    x,
    y,
    width,
    height,
    center: {
      x: (x + width / 2) / imageSize.width,
      y: (y + height / 2) / imageSize.height,
    },
    factor: nextFactor,
  };
}

export function moveInspectorSelection(
  selection: InspectorSelectionRect,
  delta: { x: number; y: number },
  imageSize: SelectionSize,
) {
  return getInspectorSelection(
    {
      x: selection.center.x + delta.x / imageSize.width,
      y: selection.center.y + delta.y / imageSize.height,
    },
    selection.factor,
    imageSize,
  );
}

export function resizeInspectorSelection(
  selection: InspectorSelectionRect,
  handle: SelectionHandle,
  delta: { x: number; y: number },
  imageSize: SelectionSize,
): InspectorSelectionRect {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const horizontal = east || west;
  const vertical = north || south;
  const anchorX = east
    ? selection.x
    : west
      ? selection.x + selection.width
      : selection.x + selection.width / 2;
  const anchorY = south
    ? selection.y
    : north
      ? selection.y + selection.height
      : selection.y + selection.height / 2;
  const proposedWidth =
    selection.width + (east ? delta.x : west ? -delta.x : 0);
  const proposedHeight =
    selection.height + (south ? delta.y : north ? -delta.y : 0);
  const width =
    horizontal && vertical
      ? (proposedWidth + proposedHeight / ASPECT) / (1 + 1 / (ASPECT * ASPECT))
      : horizontal
        ? proposedWidth
        : proposedHeight * ASPECT;
  const availableWidth = horizontal
    ? east
      ? imageSize.width - anchorX
      : anchorX
    : 2 * Math.min(anchorX, imageSize.width - anchorX);
  const availableHeight = vertical
    ? south
      ? imageSize.height - anchorY
      : anchorY
    : 2 * Math.min(anchorY, imageSize.height - anchorY);
  const limits = selectionFactorLimits(imageSize);
  const maxWidth = Math.min(
    SAMPLE_WIDTH / limits.min,
    availableWidth,
    availableHeight * ASPECT,
  );
  const nextWidth = clamp(
    width,
    Math.min(SAMPLE_WIDTH / limits.max, maxWidth),
    maxWidth,
  );
  const nextHeight = nextWidth / ASPECT;
  const x = east
    ? anchorX
    : west
      ? anchorX - nextWidth
      : anchorX - nextWidth / 2;
  const y = south
    ? anchorY
    : north
      ? anchorY - nextHeight
      : anchorY - nextHeight / 2;
  return getInspectorSelection(
    {
      x: (x + nextWidth / 2) / imageSize.width,
      y: (y + nextHeight / 2) / imageSize.height,
    },
    SAMPLE_WIDTH / nextWidth,
    imageSize,
  );
}

export function displayDeltaToSource(
  delta: { x: number; y: number },
  imageSize: SelectionSize,
  displaySize: SelectionSize,
) {
  return {
    x: (delta.x * imageSize.width) / displaySize.width,
    y: (delta.y * imageSize.height) / displaySize.height,
  };
}

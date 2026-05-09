import { LAYOUTS } from "./constants.js";
import { clamp } from "./utils.js";

export function presetFor(layout) {
  return LAYOUTS[layout] || LAYOUTS.horizontal;
}

export function fitScale(layout, container, zoom) {
  const preset = presetFor(layout);
  const width = Math.max(1, container.clientWidth - 84);
  const height = Math.max(1, container.clientHeight - 84);
  const fit = Math.min(width / preset.width, height / preset.height, 1);
  return zoom === 0 ? fit : zoom;
}

export function rectFromOverlay(overlay) {
  return {
    x: overlay.x,
    y: overlay.y,
    width: overlay.width,
    height: overlay.height,
  };
}

export function applyRect(overlay, rect) {
  overlay.x = Math.round(rect.x);
  overlay.y = Math.round(rect.y);
  overlay.width = Math.round(rect.width);
  overlay.height = Math.round(rect.height);
}

export function clampRect(rect, layout, minSize = 20) {
  const preset = presetFor(layout);
  const width = clamp(rect.width, minSize, preset.width);
  const height = clamp(rect.height, minSize, preset.height);
  const x = clamp(rect.x, 0, preset.width - width);
  const y = clamp(rect.y, 0, preset.height - height);
  return { x, y, width, height };
}

export function resizeRect(startRect, dir, dx, dy, options) {
  const minSize = options.minSize || 20;
  const aspect = startRect.width / Math.max(1, startRect.height);
  const fromCenter = options.fromCenter === true || options.altKey === true;
  const proportional = options.shiftKey === true;
  if (fromCenter) {
    const centerX = startRect.x + startRect.width / 2;
    const centerY = startRect.y + startRect.height / 2;
    let width = startRect.width;
    let height = startRect.height;

    if (dir.includes("e")) width += dx * 2;
    if (dir.includes("w")) width -= dx * 2;
    if (dir.includes("s")) height += dy * 2;
    if (dir.includes("n")) height -= dy * 2;

    width = Math.max(minSize, width);
    height = Math.max(minSize, height);

    if (proportional) {
      const scaled = proportionalSize(startRect, dir, width, height, minSize);
      width = scaled.width;
      height = scaled.height;
    }

    return clampRect({
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    }, options.layout, minSize);
  }

  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (dir.includes("e")) right = startRect.x + startRect.width + dx;
  if (dir.includes("w")) left = startRect.x + dx;
  if (dir.includes("s")) bottom = startRect.y + startRect.height + dy;
  if (dir.includes("n")) top = startRect.y + dy;

  let width = Math.max(minSize, right - left);
  let height = Math.max(minSize, bottom - top);

  if (proportional) {
    const scaled = proportionalSize(startRect, dir, width, height, minSize);
    width = scaled.width;
    height = scaled.height;
    left = proportionalX(startRect, dir, width);
    top = proportionalY(startRect, dir, height);
  }

  return clampRect({ x: left, y: top, width, height }, options.layout, minSize);
}

function proportionalSize(startRect, dir, width, height, minSize) {
  const scaleX = width / Math.max(1, startRect.width);
  const scaleY = height / Math.max(1, startRect.height);
  let scale;

  if (dir.length === 2) {
    scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  } else if (dir.includes("e") || dir.includes("w")) {
    scale = scaleX;
  } else {
    scale = scaleY;
  }

  scale = Math.max(scale, minSize / Math.max(1, startRect.width), minSize / Math.max(1, startRect.height));
  return {
    width: startRect.width * scale,
    height: startRect.height * scale,
  };
}

function proportionalX(startRect, dir, width) {
  if (dir.includes("w")) return startRect.x + startRect.width - width;
  if (dir.includes("e")) return startRect.x;
  return startRect.x + (startRect.width - width) / 2;
}

function proportionalY(startRect, dir, height) {
  if (dir.includes("n")) return startRect.y + startRect.height - height;
  if (dir.includes("s")) return startRect.y;
  return startRect.y + (startRect.height - height) / 2;
}

export function snapRect(rect, overlays, movingId, layout, gridSize) {
  const preset = presetFor(layout);
  const threshold = 8;
  const targetsX = [
    { value: 0, kind: "stage" },
    { value: preset.width / 2, kind: "stage" },
    { value: preset.width, kind: "stage" },
  ];
  const targetsY = [
    { value: 0, kind: "stage" },
    { value: preset.height / 2, kind: "stage" },
    { value: preset.height, kind: "stage" },
  ];

  for (let value = gridSize; value < preset.width; value += gridSize) {
    targetsX.push({ value, kind: "grid" });
  }
  for (let value = gridSize; value < preset.height; value += gridSize) {
    targetsY.push({ value, kind: "grid" });
  }

  overlays
    .filter((overlay) => overlay.id !== movingId && overlay.visible !== false)
    .forEach((overlay) => {
      targetsX.push(
        { value: overlay.x, kind: "overlay" },
        { value: overlay.x + overlay.width / 2, kind: "overlay" },
        { value: overlay.x + overlay.width, kind: "overlay" },
      );
      targetsY.push(
        { value: overlay.y, kind: "overlay" },
        { value: overlay.y + overlay.height / 2, kind: "overlay" },
        { value: overlay.y + overlay.height, kind: "overlay" },
      );
    });

  const snapped = { ...rect };
  const xPoints = [
    { value: snapped.x, offset: 0 },
    { value: snapped.x + snapped.width / 2, offset: snapped.width / 2 },
    { value: snapped.x + snapped.width, offset: snapped.width },
  ];
  const yPoints = [
    { value: snapped.y, offset: 0 },
    { value: snapped.y + snapped.height / 2, offset: snapped.height / 2 },
    { value: snapped.y + snapped.height, offset: snapped.height },
  ];

  const xSnap = closestSnap(xPoints, targetsX, threshold);
  const ySnap = closestSnap(yPoints, targetsY, threshold);
  const guides = [];

  if (xSnap) {
    snapped.x = xSnap.value - xSnap.offset;
    guides.push({ axis: "x", value: xSnap.value, kind: xSnap.kind });
  }

  if (ySnap) {
    snapped.y = ySnap.value - ySnap.offset;
    guides.push({ axis: "y", value: ySnap.value, kind: ySnap.kind });
  }

  return { rect: clampRect(snapped, layout), guides };
}

function closestSnap(points, targets, threshold) {
  let best = null;
  for (const point of points) {
    for (const target of targets) {
      const distance = Math.abs(point.value - target.value);
      if (distance > threshold) continue;
      if (!best || distance < best.distance || (distance === best.distance && target.kind !== "grid")) {
        best = {
          distance,
          value: target.value,
          offset: point.offset,
          kind: target.kind,
        };
      }
    }
  }
  return best;
}

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
  const proportional = options.shiftKey && (dir.length === 2 || dir === "e" || dir === "w" || dir === "n" || dir === "s");
  if (fromCenter) {
    const centerX = startRect.x + startRect.width / 2;
    const centerY = startRect.y + startRect.height / 2;
    let halfWidth = startRect.width / 2;
    let halfHeight = startRect.height / 2;

    if (dir.includes("e")) halfWidth += dx;
    if (dir.includes("w")) halfWidth -= dx;
    if (dir.includes("s")) halfHeight += dy;
    if (dir.includes("n")) halfHeight -= dy;

    halfWidth = Math.max(minSize / 2, halfWidth);
    halfHeight = Math.max(minSize / 2, halfHeight);

    if (proportional) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        halfHeight = halfWidth / aspect;
      } else {
        halfWidth = halfHeight * aspect;
      }
    }

    return clampRect({
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
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
    if (Math.abs(dx) >= Math.abs(dy)) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }

    if (fromCenter) {
      left = startRect.x + startRect.width / 2 - width / 2;
      top = startRect.y + startRect.height / 2 - height / 2;
    } else {
      if (dir.includes("w")) left = startRect.x + startRect.width - width;
      if (!dir.includes("w")) left = startRect.x;
      if (dir.includes("n")) top = startRect.y + startRect.height - height;
      if (!dir.includes("n")) top = startRect.y;
    }
  }

  return clampRect({ x: left, y: top, width, height }, options.layout, minSize);
}

export function cropFromHandle(startCrop, dir, dx, dy) {
  const maxCrop = 9999;
  const crop = { ...startCrop };
  if (dir.includes("w")) crop.left = clamp(startCrop.left + dx, 0, maxCrop);
  if (dir.includes("e")) crop.right = clamp(startCrop.right - dx, 0, maxCrop);
  if (dir.includes("n")) crop.top = clamp(startCrop.top + dy, 0, maxCrop);
  if (dir.includes("s")) crop.bottom = clamp(startCrop.bottom - dy, 0, maxCrop);
  return {
    top: Math.round(crop.top),
    right: Math.round(crop.right),
    bottom: Math.round(crop.bottom),
    left: Math.round(crop.left),
  };
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

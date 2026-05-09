import { niceType } from "./utils.js";

const HASH_CACHE_LIMIT = 160;
const hashCache = new Map();

export function createOverlayNode(overlay, options = {}) {
  const node = document.createElement("div");
  node.className = [
    "overlay-node",
    overlay.visible === false ? "hidden" : "",
    !options.runtime && overlay.locked ? "locked" : "",
    !options.runtime && options.selected ? "selected" : "",
  ].filter(Boolean).join(" ");
  node.dataset.id = overlay.id;

  const viewport = document.createElement("div");
  viewport.className = "overlay-viewport";
  viewport.appendChild(createMediaScaler(overlay, options));

  if (options.runtime) {
    node.appendChild(viewport);
  } else {
    const label = document.createElement("div");
    label.className = "overlay-label";
    label.textContent = `${overlay.name || "Overlay"} | ${Math.round(overlay.x)},${Math.round(overlay.y)} | ${Math.round(overlay.width)}x${Math.round(overlay.height)}`;
    if (hasCrop(overlay)) {
      const badge = document.createElement("span");
      badge.className = "crop-badge";
      badge.textContent = "crop";
      label.appendChild(badge);
    }

    node.append(viewport, label);
  }
  syncOverlayNode(node, overlay, options);
  return node;
}

export function syncOverlayNode(node, overlay, options = {}) {
  node.dataset.id = overlay.id;
  node.dataset.mediaKey = mediaSignature(overlay, options);
  if (!options.runtime) node.classList.toggle("selected", options.selected === true);
  applyOverlayStyle(node, overlay, options);
  if (!options.runtime) updateOverlayLabel(node, overlay);
  syncMediaElement(node, overlay);
}

export function mediaSignature(overlay, options = {}) {
  const mode = options.performanceMode && !options.runtime ? "placeholder" : "media";
  const source = sourceBox(overlay);
  const crop = overlay.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const structure = canUseDirectRuntimeMedia(overlay, options, source, crop) ? "direct" : "scaler";
  return `${mode}|${structure}|${overlay.type || "iframe"}|${hashString(overlay.src || "")}`;
}

export function createMediaScaler(overlay, options = {}) {
  if (options.performanceMode && !options.runtime) {
    const placeholder = document.createElement("div");
    placeholder.className = "overlay-placeholder";
    placeholder.textContent = `${overlay.name || "Overlay"} - ${niceType(overlay.type)}`;
    return placeholder;
  }

  const source = sourceBox(overlay);
  const crop = overlay.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const visibleWidth = Math.max(1, source.width - crop.left - crop.right);
  const visibleHeight = Math.max(1, source.height - crop.top - crop.bottom);
  const scaleX = overlay.width / visibleWidth;
  const scaleY = overlay.height / visibleHeight;

  if (canUseDirectRuntimeMedia(overlay, options, source, crop)) {
    const direct = createMediaElement(overlay);
    Object.assign(direct.style, {
      inset: "0",
      width: "100%",
      height: "100%",
    });
    return direct;
  }

  const scaler = document.createElement("div");
  scaler.className = "overlay-scaler";
  scaler.style.width = `${visibleWidth}px`;
  scaler.style.height = `${visibleHeight}px`;
  applyScaleTransform(scaler, scaleX, scaleY);

  const element = createMediaElement(overlay);
  Object.assign(element.style, {
    left: `${-crop.left}px`,
    top: `${-crop.top}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
  });
  scaler.appendChild(element);
  return scaler;
}

export function createMediaElement(overlay) {
  if (overlay.type === "image") {
    const image = document.createElement("img");
    image.src = overlay.src || "";
    image.alt = overlay.name || "Overlay";
    image.decoding = "async";
    image.loading = "eager";
    image.draggable = false;
    image.className = `overlay-media ${overlay.fit || "fill"}`;
    return image;
  }

  const element = document.createElement("iframe");
  element.src = overlay.src || "about:blank";
  element.referrerPolicy = "no-referrer";
  element.allow = "autoplay; fullscreen";
  element.loading = "eager";
  element.scrolling = "no";

  element.className = `overlay-media ${overlay.fit || "fill"}`;
  return element;
}

export function applyOverlayStyle(node, overlay, options = {}) {
  setStyleValue(node.style, "left", `${Math.round(overlay.x)}px`);
  setStyleValue(node.style, "top", `${Math.round(overlay.y)}px`);
  setStyleValue(node.style, "width", `${Math.round(overlay.width)}px`);
  setStyleValue(node.style, "height", `${Math.round(overlay.height)}px`);
  setStyleValue(node.style, "zIndex", String(overlay.z || 0));
  setStyleValue(node.style, "opacity", String(overlay.opacity ?? 1));
  setStyleValue(node.style, "transform", Number(overlay.rotation || 0) ? `rotate(${Number(overlay.rotation || 0)}deg)` : "");
  setStyleValue(node.style, "borderRadius", `${Math.max(0, Number(overlay.radius || 0))}px`);
  setStyleValue(node.style, "borderWidth", overlay.borderWidth ? `${Math.max(0, Number(overlay.borderWidth || 0))}px` : "");
  setStyleValue(node.style, "borderColor", overlay.borderWidth ? (overlay.borderColor || "rgba(255, 255, 255, 0.28)") : "");
  setStyleValue(node.style, "boxShadow", "");
  const viewport = overlayViewport(node);
  if (viewport) setStyleValue(viewport.style, "filter", "");
  node.classList.toggle("hidden", overlay.visible === false);
  if (!options.runtime) node.classList.toggle("locked", overlay.locked === true);
  applyMediaTransform(node, overlay);
}

export function applyMediaTransform(node, overlay) {
  const scaler = overlayScaler(node);
  const media = scaler?.firstElementChild;
  if (!scaler || !media) return;

  const source = sourceBox(overlay);
  const crop = overlay.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const visibleWidth = Math.max(1, source.width - crop.left - crop.right);
  const visibleHeight = Math.max(1, source.height - crop.top - crop.bottom);
  const scaleX = overlay.width / visibleWidth;
  const scaleY = overlay.height / visibleHeight;

  setStyleValue(scaler.style, "width", `${visibleWidth}px`);
  setStyleValue(scaler.style, "height", `${visibleHeight}px`);
  applyScaleTransform(scaler, scaleX, scaleY);
  setStyleValue(media.style, "left", `${-crop.left}px`);
  setStyleValue(media.style, "top", `${-crop.top}px`);
  setStyleValue(media.style, "width", `${source.width}px`);
  setStyleValue(media.style, "height", `${source.height}px`);
}

export function addResizeHandles(node) {
  ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((dir) => {
    const handle = document.createElement("div");
    handle.className = `handle ${dir}`;
    handle.dataset.handle = dir;
    node.appendChild(handle);
  });
}

export function hasCrop(overlay) {
  const crop = overlay.crop || {};
  return Boolean(crop.top || crop.right || crop.bottom || crop.left);
}

function updateOverlayLabel(node, overlay) {
  const label = node.querySelector(".overlay-label");
  if (!label) return;

  label.textContent = `${overlay.name || "Overlay"} | ${Math.round(overlay.x)},${Math.round(overlay.y)} | ${Math.round(overlay.width)}x${Math.round(overlay.height)}`;

  if (hasCrop(overlay)) {
    const badge = document.createElement("span");
    badge.className = "crop-badge";
    badge.textContent = "crop";
    label.appendChild(badge);
  }
}

function syncMediaElement(node, overlay) {
  const media = overlayMedia(node);
  if (!media) return;

  media.className = `overlay-media ${overlay.fit || "fill"}`;
  if (media.tagName === "IMG") media.alt = overlay.name || "Overlay";
}

function canUseDirectRuntimeMedia(overlay, options, source, crop) {
  if (!options.runtime || hasCrop({ crop })) return false;
  if (overlay.type === "image") return true;
  return Math.round(source.width) === Math.round(Number(overlay.width || 0))
    && Math.round(source.height) === Math.round(Number(overlay.height || 0));
}

function overlayViewport(node) {
  const child = node.firstElementChild;
  return child?.classList?.contains("overlay-viewport") ? child : null;
}

function overlayScaler(node) {
  const child = overlayViewport(node)?.firstElementChild;
  return child?.classList?.contains("overlay-scaler") ? child : null;
}

function overlayMedia(node) {
  const child = overlayViewport(node)?.firstElementChild;
  if (!child) return null;
  return child.classList?.contains("overlay-media") ? child : child.firstElementChild;
}

function applyScaleTransform(element, scaleX, scaleY) {
  const isIdentity = Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001;
  setStyleValue(element.style, "transform", isIdentity ? "" : `scale(${scaleX}, ${scaleY})`);
}

function setStyleValue(style, property, value) {
  if (style[property] !== value) style[property] = value;
}

function hashString(value) {
  const cached = hashCache.get(value);
  if (cached) return cached;

  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const result = `${value.length}:${hash >>> 0}`;
  hashCache.set(value, result);
  if (hashCache.size > HASH_CACHE_LIMIT) {
    hashCache.delete(hashCache.keys().next().value);
  }
  return result;
}

function sourceBox(overlay) {
  return {
    width: Math.max(1, Number(overlay.sourceWidth || overlay.width || 1)),
    height: Math.max(1, Number(overlay.sourceHeight || overlay.height || 1)),
  };
}

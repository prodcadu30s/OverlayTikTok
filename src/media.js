import { niceType } from "./utils.js";

export function createOverlayNode(overlay, options = {}) {
  const node = document.createElement("div");
  node.className = [
    "overlay-node",
    overlay.visible === false ? "hidden" : "",
    overlay.locked ? "locked" : "",
    options.selected ? "selected" : "",
  ].filter(Boolean).join(" ");
  node.dataset.id = overlay.id;
  applyOverlayStyle(node, overlay);

  const viewport = document.createElement("div");
  viewport.className = "overlay-viewport";
  viewport.appendChild(createMediaScaler(overlay, options));

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
  applyOverlayStyle(node, overlay);
  return node;
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

  const scaler = document.createElement("div");
  scaler.className = "overlay-scaler";
  scaler.style.width = `${visibleWidth}px`;
  scaler.style.height = `${visibleHeight}px`;
  scaler.style.transform = `scale(${scaleX}, ${scaleY})`;

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
  let element;

  if (overlay.type === "image" || overlay.type === "gif") {
    element = document.createElement("img");
    element.decoding = "async";
    element.loading = "eager";
    setMediaSource(element, overlay);
    element.alt = overlay.name || "Overlay";
  } else if (overlay.type === "video" || overlay.type === "webm") {
    element = document.createElement("video");
    setMediaSource(element, overlay);
    element.autoplay = overlay.autoplay !== false;
    element.loop = overlay.loop !== false;
    element.muted = overlay.muted !== false;
    element.playsInline = true;
    element.controls = false;
  } else {
    element = document.createElement("iframe");
    element.src = overlay.src || "about:blank";
    element.referrerPolicy = "no-referrer";
    element.allow = "autoplay; clipboard-read; clipboard-write; fullscreen";
    element.loading = "eager";
  }

  element.className = `overlay-media ${overlay.fit || "fill"}`;
  return element;
}

export function applyOverlayStyle(node, overlay) {
  node.style.left = `${Math.round(overlay.x)}px`;
  node.style.top = `${Math.round(overlay.y)}px`;
  node.style.width = `${Math.round(overlay.width)}px`;
  node.style.height = `${Math.round(overlay.height)}px`;
  node.style.zIndex = String(overlay.z || 0);
  node.style.opacity = String(overlay.opacity ?? 1);
  node.style.transform = `rotate(${Number(overlay.rotation || 0)}deg)`;
  node.style.borderRadius = `${Math.max(0, Number(overlay.radius || 0))}px`;
  node.style.borderWidth = overlay.borderWidth ? `${Math.max(0, Number(overlay.borderWidth || 0))}px` : "";
  node.style.borderColor = overlay.borderWidth ? (overlay.borderColor || "rgba(255, 255, 255, 0.28)") : "";
  node.style.boxShadow = overlay.shadow ? "0 14px 34px rgba(0, 0, 0, 0.45)" : "";
  const viewport = node.querySelector(".overlay-viewport");
  if (viewport) viewport.style.filter = filterValue(overlay.filter);
  node.classList.toggle("hidden", overlay.visible === false);
  node.classList.toggle("locked", overlay.locked === true);
  applyMediaTransform(node, overlay);
}

export function applyMediaTransform(node, overlay) {
  const scaler = node.querySelector(".overlay-scaler");
  const media = node.querySelector(".overlay-media");
  if (!scaler || !media) return;

  const source = sourceBox(overlay);
  const crop = overlay.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const visibleWidth = Math.max(1, source.width - crop.left - crop.right);
  const visibleHeight = Math.max(1, source.height - crop.top - crop.bottom);
  const scaleX = overlay.width / visibleWidth;
  const scaleY = overlay.height / visibleHeight;

  scaler.style.width = `${visibleWidth}px`;
  scaler.style.height = `${visibleHeight}px`;
  scaler.style.transform = `scale(${scaleX}, ${scaleY})`;
  media.style.left = `${-crop.left}px`;
  media.style.top = `${-crop.top}px`;
  media.style.width = `${source.width}px`;
  media.style.height = `${source.height}px`;
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

function sourceBox(overlay) {
  return {
    width: Math.max(1, Number(overlay.sourceWidth || overlay.width || 1)),
    height: Math.max(1, Number(overlay.sourceHeight || overlay.height || 1)),
  };
}

function filterValue(filter) {
  const filters = {
    grayscale: "grayscale(1)",
    sepia: "sepia(1)",
    blur: "blur(3px)",
    contrast: "contrast(1.35)",
  };
  return filters[filter] || "";
}

function setMediaSource(element, overlay) {
  if (!String(overlay.src || "").startsWith("omdb://")) {
    element.src = overlay.src || "";
    return;
  }

  element.dataset.pendingSrc = overlay.src;
  resolveStoredMedia(overlay.src).then((url) => {
    if (url && element.dataset.pendingSrc === overlay.src) element.src = url;
  });
}

function resolveStoredMedia(source) {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve("");
      return;
    }

    const request = indexedDB.open("overlay_manager_media", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };
    request.onerror = () => resolve("");
    request.onsuccess = () => {
      const db = request.result;
      const id = source.replace("omdb://", "");
      const tx = db.transaction("files", "readonly");
      const get = tx.objectStore("files").get(id);
      get.onerror = () => resolve("");
      get.onsuccess = () => {
        const record = get.result;
        if (!record?.blob) {
          resolve("");
          return;
        }
        resolve(URL.createObjectURL(record.blob));
      };
    };
  });
}

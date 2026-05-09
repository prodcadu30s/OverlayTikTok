import { STORAGE_KEY } from "./constants.js";
import { presetFor } from "./geometry.js";
import { createOverlayNode, mediaSignature, syncOverlayNode } from "./media.js";
import { loadProject, normalizeOverlay, normalizeState } from "./state.js";

const stage = document.querySelector("#runtimeStage");
const layout = document.body.dataset.layout === "vertical" ? "vertical" : "horizontal";
const params = new URLSearchParams(location.search);
let embeddedState = null;
let state = null;
let lastStorageSnapshot = "";
let liveStorage = params.get("live") === "1";
let runtimeLoadFailed = false;
let lastRuntimeSizeKey = "";
let resizeFrame = 0;

function activeScene() {
  if (!state) return null;
  return state.scenes.find((scene) => scene.id === state.currentSceneId) || state.scenes[0];
}

function overlaysForRuntime() {
  const scene = activeScene();
  const preset = presetFor(layout);
  return [...(scene?.overlays?.[layout] || [])]
    .filter((overlay) => isRenderableOverlay(overlay, preset))
    .sort((a, b) => a.z - b.z);
}

function isRenderableOverlay(overlay, preset) {
  if (!overlay || overlay.visible === false || Number(overlay.opacity ?? 1) <= 0) return false;
  const width = Number(overlay.width || 0);
  const height = Number(overlay.height || 0);
  if (width <= 0 || height <= 0) return false;
  const x = Number(overlay.x || 0);
  const y = Number(overlay.y || 0);
  return x < preset.width && y < preset.height && x + width > 0 && y + height > 0;
}

function applyRuntimeSize() {
  if (!stage) return;
  const preset = presetFor(layout);
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  let scale = Math.min(viewportWidth / preset.width, viewportHeight / preset.height);
  if (Math.abs(scale - 1) < 0.01) scale = 1;
  const scaledWidth = Math.round(preset.width * scale);
  const scaledHeight = Math.round(preset.height * scale);
  const sizeKey = `${viewportWidth}x${viewportHeight}|${scale}`;
  if (sizeKey === lastRuntimeSizeKey) return;
  lastRuntimeSizeKey = sizeKey;

  stage.style.width = `${preset.width}px`;
  stage.style.height = `${preset.height}px`;
  stage.style.left = `${Math.round((viewportWidth - scaledWidth) / 2)}px`;
  stage.style.top = `${Math.round((viewportHeight - scaledHeight) / 2)}px`;
  stage.style.transform = scale === 1 ? "none" : `scale(${scale})`;
}

function render() {
  applyRuntimeSize();
  const existingNodes = new Map(
    Array.from(stage.querySelectorAll(".overlay-node")).map((node) => [node.dataset.id, node]),
  );
  const activeIds = new Set();
  const fragment = document.createDocumentFragment();

  overlaysForRuntime().forEach((overlay) => {
    const options = { runtime: true, selected: false, performanceMode: false };
    const mediaKey = mediaSignature(overlay, options);
    let node = existingNodes.get(overlay.id);

    if (node && node.dataset.mediaKey !== mediaKey) {
      const replacement = createOverlayNode(overlay, options);
      node.replaceWith(replacement);
      node = replacement;
    } else if (!node) {
      node = createOverlayNode(overlay, options);
      fragment.appendChild(node);
    } else {
      syncOverlayNode(node, overlay, options);
    }

    activeIds.add(overlay.id);
  });

  if (fragment.childNodes.length) stage.appendChild(fragment);

  existingNodes.forEach((node, id) => {
    if (!activeIds.has(id)) node.remove();
  });
}

function reloadAndRender() {
  if (!liveStorage) return;
  const snapshot = localStorage.getItem(STORAGE_KEY) || "";
  if (snapshot === lastStorageSnapshot) return;
  lastStorageSnapshot = snapshot;
  state = normalizeRuntimeState(loadProject());
  render();
}

async function loadEmbeddedProject() {
  const match = location.hash.match(/(?:^#|&)project=([^&]+)/);
  if (!match) return null;

  try {
    return JSON.parse(await decodeRuntimePayload(decodeURIComponent(match[1])));
  } catch (error) {
    console.error("Embedded runtime project failed", error);
    runtimeLoadFailed = true;
    showRuntimeError("Nao consegui abrir esse runtime. Copie o link novamente no editor atualizado.");
    return null;
  }
}

async function decodeRuntimePayload(payload) {
  if (payload.startsWith("gz.")) {
    const bytes = base64UrlToBytes(payload.slice(3));
    if (!("DecompressionStream" in window)) throw new Error("DecompressionStream indisponivel");
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }

  if (payload.startsWith("json.")) {
    return new TextDecoder().decode(base64UrlToBytes(payload.slice(5)));
  }

  return new TextDecoder().decode(base64UrlToBytes(payload));
}

function showRuntimeError(message) {
  if (!stage) return;
  stage.innerHTML = "";
  const errorBox = document.createElement("div");
  errorBox.className = "runtime-error";
  errorBox.textContent = message;
  stage.appendChild(errorBox);
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function scheduleRuntimeSize() {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    applyRuntimeSize();
  });
}

window.addEventListener("resize", scheduleRuntimeSize, { passive: true });

async function boot() {
  embeddedState = await loadEmbeddedProject();
  if (runtimeLoadFailed) {
    applyRuntimeSize();
    return;
  }

  if (embeddedState) {
    state = normalizeRuntimeState(embeddedState);
    liveStorage = false;
  } else {
    state = normalizeRuntimeState(loadProject());
    lastStorageSnapshot = liveStorage ? localStorage.getItem(STORAGE_KEY) || "" : "";
  }

  if (liveStorage) {
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) reloadAndRender();
    });
    window.setInterval(reloadAndRender, 5000);
  }
  render();
}

boot();

function normalizeRuntimeState(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.scenes)) {
    return normalizeState(input);
  }

  const runtimeLayout = input.layout === "vertical" || input.layout === "portrait" ? "vertical" : "horizontal";
  const scenes = input.scenes.map((scene, index) => normalizeRuntimeScene(scene, index)).filter(Boolean);
  if (!scenes.length) return normalizeState(input);

  const currentSceneId = scenes.some((scene) => scene.id === input.currentSceneId)
    ? input.currentSceneId
    : scenes[0].id;

  return {
    version: input.version,
    layout: runtimeLayout,
    currentSceneId,
    scenes,
  };
}

function normalizeRuntimeScene(scene, index) {
  if (!scene || typeof scene !== "object") return null;
  const horizontal = Array.isArray(scene.overlays?.horizontal) ? scene.overlays.horizontal : [];
  const vertical = Array.isArray(scene.overlays?.vertical) ? scene.overlays.vertical : [];

  return {
    id: String(scene.id || `scene-${index + 1}`),
    name: String(scene.name || `Scene ${index + 1}`),
    overlays: {
      horizontal: horizontal.map(normalizeOverlay).filter(Boolean),
      vertical: vertical.map(normalizeOverlay).filter(Boolean),
    },
  };
}

import { STORAGE_KEY } from "./constants.js";
import { presetFor } from "./geometry.js";
import { createOverlayNode, mediaSignature, syncOverlayNode } from "./media.js";
import { loadProject, normalizeState } from "./state.js";

const stage = document.querySelector("#runtimeStage");
const layout = document.body.dataset.layout === "vertical" ? "vertical" : "horizontal";
const params = new URLSearchParams(location.search);
let embeddedState = null;
let state = normalizeState(loadProject());
let lastStorageSnapshot = localStorage.getItem(STORAGE_KEY) || "";
let liveStorage = params.get("live") === "1";
let runtimeLoadFailed = false;

function activeScene() {
  return state.scenes.find((scene) => scene.id === state.currentSceneId) || state.scenes[0];
}

function overlaysForRuntime() {
  const scene = activeScene();
  return [...(scene?.overlays?.[layout] || [])]
    .filter((overlay) => overlay.visible !== false)
    .sort((a, b) => a.z - b.z);
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
      stage.appendChild(node);
    } else {
      syncOverlayNode(node, overlay, options);
    }

    activeIds.add(overlay.id);
  });

  existingNodes.forEach((node, id) => {
    if (!activeIds.has(id)) node.remove();
  });
}

function reloadAndRender() {
  if (!liveStorage) return;
  const snapshot = localStorage.getItem(STORAGE_KEY) || "";
  if (snapshot === lastStorageSnapshot) return;
  lastStorageSnapshot = snapshot;
  state = normalizeState(loadProject());
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

window.addEventListener("resize", applyRuntimeSize);

async function boot() {
  embeddedState = await loadEmbeddedProject();
  if (runtimeLoadFailed) {
    applyRuntimeSize();
    return;
  }

  if (embeddedState) {
    state = normalizeState(embeddedState);
    liveStorage = false;
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

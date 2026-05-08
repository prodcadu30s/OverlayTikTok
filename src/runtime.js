import { STORAGE_KEY } from "./constants.js";
import { presetFor } from "./geometry.js";
import { createOverlayNode } from "./media.js";
import { loadProject, normalizeState } from "./state.js";

const stage = document.querySelector("#runtimeStage");
const layout = document.body.dataset.layout === "vertical" ? "vertical" : "horizontal";
const embeddedState = await loadEmbeddedProject();
let state = normalizeState(embeddedState || loadProject());
let lastStorageSnapshot = localStorage.getItem(STORAGE_KEY) || "";
const liveStorage = !embeddedState;

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
  const preset = presetFor(layout);
  const scale = Math.min(window.innerWidth / preset.width, window.innerHeight / preset.height);
  stage.style.width = `${preset.width}px`;
  stage.style.height = `${preset.height}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function render() {
  applyRuntimeSize();
  stage.innerHTML = "";
  overlaysForRuntime().forEach((overlay) => {
    const node = createOverlayNode(overlay, { runtime: true, selected: false, performanceMode: false });
    stage.appendChild(node);
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
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) reloadAndRender();
});

if (liveStorage) window.setInterval(reloadAndRender, 1000);
render();

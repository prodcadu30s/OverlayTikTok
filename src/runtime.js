import { STORAGE_KEY } from "./constants.js";
import { presetFor } from "./geometry.js";
import { createOverlayNode } from "./media.js";
import { loadProject, normalizeState } from "./state.js";

const stage = document.querySelector("#runtimeStage");
const layout = document.body.dataset.layout === "vertical" ? "vertical" : "horizontal";
let state = normalizeState(loadProject());
let lastStorageSnapshot = localStorage.getItem(STORAGE_KEY) || "";

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
  const snapshot = localStorage.getItem(STORAGE_KEY) || "";
  if (snapshot === lastStorageSnapshot) return;
  lastStorageSnapshot = snapshot;
  state = normalizeState(loadProject());
  render();
}

window.addEventListener("resize", applyRuntimeSize);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) reloadAndRender();
});

window.setInterval(reloadAndRender, 1000);
render();

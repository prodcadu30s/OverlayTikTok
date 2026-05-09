import { LAYOUTS, LAYOUT_TEMPLATES, MAX_SOURCE_SIZE } from "./constants.js";
import {
  applyRect,
  clampRect,
  fitScale,
  presetFor,
  rectFromOverlay,
  resizeRect,
  snapRect,
} from "./geometry.js";
import { addResizeHandles, applyMediaTransform, createOverlayNode, mediaSignature, syncOverlayNode } from "./media.js";
import { loadProject, normalizeOverlay, normalizeState, saveProject } from "./state.js";
import {
  clamp,
  clone,
  downloadJson,
  isTypingTarget,
  niceType,
  readTextFile,
  rootUrl,
  slugify,
  toInt,
  toNumber,
  uid,
  uniqueId,
} from "./utils.js";

const RUNTIME_BUILD = "20260509-preview-bg";
const PREVIEW_STORAGE_KEY = "overlay_preview_backgrounds_v1";
const MIN_CROP_SCALE = 0.05;
const query = new URLSearchParams(window.location.search);
if (query.get("runtime") === "1") {
  const layout = query.get("layout") === "vertical" || query.get("layout") === "portrait" ? "vertical" : "horizontal";
  window.location.replace(new URL(`runtime/${layout}/`, rootUrl()).href);
}

const els = {
  leftDock: document.querySelector("#leftDock"),
  rightDock: document.querySelector("#rightDock"),
  workspace: document.querySelector("#workspace"),
  stageWrap: document.querySelector("#stageWrap"),
  stage: document.querySelector("#stage"),
  stagePreview: document.querySelector("#stagePreview"),
  gridLayer: document.querySelector("#gridLayer"),
  stageObjects: document.querySelector("#stageObjects"),
  guidesLayer: document.querySelector("#guidesLayer"),
  canvasInfo: document.querySelector("#canvasInfo"),
  interactionInfo: document.querySelector("#interactionInfo"),
  sceneLabel: document.querySelector("#sceneLabel"),
  status: document.querySelector("#status"),
  layoutHorizontal: document.querySelector("#layoutHorizontal"),
  layoutVertical: document.querySelector("#layoutVertical"),
  undoBtn: document.querySelector("#undoBtn"),
  redoBtn: document.querySelector("#redoBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomFitBtn: document.querySelector("#zoomFitBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomLabel: document.querySelector("#zoomLabel"),
  copyRuntimeBtn: document.querySelector("#copyRuntimeBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importInput: document.querySelector("#importInput"),
  previewImageInput: document.querySelector("#previewImageInput"),
};

let state = normalizeState(loadProject());
let previewImages = loadPreviewImages();
let selectedId = null;
let currentScale = 1;
let interaction = null;
let saveTimer = null;
let liveFieldEditing = false;
let dragLayerId = null;
let layerFilter = "";
const undoStack = [];
const redoStack = [];

const ICONS = {
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M5 15V7a2 2 0 0 1 2-2h8"></path></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>`,
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18"></path><path d="M10.7 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-3.2 4.2"></path><path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.8 0 3.3-.4 4.7-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>`,
  unlock: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.5-2"></path></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 15 6-6 6 6"></path></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"></path></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`,
  upload: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>`,
  undo: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-2"></path></svg>`,
  redo: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 14 5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h2"></path></svg>`,
  zoomIn: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path><path d="M8 11h6"></path></svg>`,
  fit: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`,
  alignLeft: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4v16"></path><path d="M8 7h10"></path><path d="M8 17h7"></path></svg>`,
  alignCenter: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v16"></path><path d="M7 7h10"></path><path d="M9 17h6"></path></svg>`,
  alignRight: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4v16"></path><path d="M6 7h10"></path><path d="M9 17h7"></path></svg>`,
  alignTop: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16"></path><path d="M7 8v10"></path><path d="M17 8v7"></path></svg>`,
  alignMiddle: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h16"></path><path d="M7 7v10"></path><path d="M17 9v6"></path></svg>`,
  alignBottom: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h16"></path><path d="M7 6v10"></path><path d="M17 9v7"></path></svg>`,
};

function activeScene() {
  return state.scenes.find((scene) => scene.id === state.currentSceneId) || state.scenes[0];
}

function currentOverlays() {
  const scene = activeScene();
  if (!scene.overlays[state.layout]) scene.overlays[state.layout] = [];
  return scene.overlays[state.layout];
}

function selectedOverlay() {
  return currentOverlays().find((overlay) => overlay.id === selectedId) || null;
}

function setStatus(text) {
  els.status.textContent = text;
  if (text && text !== "Pronto" && !text.startsWith("Auto")) showToast(text);
}

function showToast(text) {
  let stack = document.querySelector("#toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  stack.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 180);
  }, 1800);
}

function scheduleSave(label = "Auto save") {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persist(label), 160);
}

function persist(label = "Salvo") {
  const result = saveProject(state);
  setStatus(result.ok ? label : "Erro ao salvar");
}

function pushHistory() {
  undoStack.push(clone(state));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function mutate(change, label = "Alterado") {
  pushHistory();
  change();
  scheduleSave(label);
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(clone(state));
  state = normalizeState(undoStack.pop());
  selectedId = null;
  persist("Undo");
  renderAll();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(clone(state));
  state = normalizeState(redoStack.pop());
  selectedId = null;
  persist("Redo");
  renderAll();
}

function updateHistoryButtons() {
  els.undoBtn.disabled = undoStack.length === 0;
  els.redoBtn.disabled = redoStack.length === 0;
}

function initTopbarIcons() {
  setButtonIcon(els.undoBtn, "undo", "Undo");
  setButtonIcon(els.redoBtn, "redo", "Redo");
  setButtonIcon(els.zoomOutBtn, "zoomOut", "Zoom out");
  setButtonIcon(els.zoomFitBtn, "fit", "Fit");
  setButtonIcon(els.zoomInBtn, "zoomIn", "Zoom in");
}

function setButtonIcon(button, icon, label) {
  button.classList.add("icon-only");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICONS[icon] || label;
}

function renderAll() {
  renderTopbar();
  applyStageSize();
  renderStage();
  renderDocks();
  updateHistoryButtons();
}

function renderTopbar() {
  const scene = activeScene();
  const preset = presetFor(state.layout);
  els.sceneLabel.textContent = scene?.name || "Scene";
  els.canvasInfo.textContent = `${preset.width}x${preset.height} | ${scene?.name || "Scene"}`;
  els.layoutHorizontal.classList.toggle("active", state.layout === "horizontal");
  els.layoutVertical.classList.toggle("active", state.layout === "vertical");
}

function applyStageSize() {
  const preset = presetFor(state.layout);
  currentScale = fitScale(state.layout, els.workspace, state.editor.zoom);
  els.stage.style.width = `${preset.width}px`;
  els.stage.style.height = `${preset.height}px`;
  els.stageWrap.style.width = `${preset.width}px`;
  els.stageWrap.style.height = `${preset.height}px`;
  els.stageWrap.style.transform = `scale(${currentScale})`;
  els.gridLayer.style.setProperty("--grid-size", `${state.editor.gridSize}px`);
  els.gridLayer.classList.toggle("hidden", !state.editor.showGrid || state.editor.performanceMode);
  els.zoomLabel.textContent = state.editor.zoom === 0 ? `${Math.round(currentScale * 100)}% Fit` : `${Math.round(state.editor.zoom * 100)}%`;
  applyStagePreview();
}

function renderDocks() {
  els.leftDock.innerHTML = "";
  els.rightDock.innerHTML = "";
  for (const key of ["scenes", "layers", "inspector", "properties"]) {
    const panel = createPanel(key);
    const dock = state.editor.panels[key].dock === "left" ? els.leftDock : els.rightDock;
    dock.appendChild(panel);
  }
}

function createPanel(key) {
  const config = state.editor.panels[key];
  const panel = document.createElement("section");
  panel.className = `dock-panel ${config.open ? "" : "collapsed"}`.trim();
  panel.dataset.panel = key;

  const header = document.createElement("div");
  header.className = "panel-header";

  const title = document.createElement("button");
  title.type = "button";
  title.className = "panel-title";
  title.textContent = config.title;
  title.addEventListener("click", () => togglePanel(key));

  const dockBtn = document.createElement("button");
  dockBtn.type = "button";
  dockBtn.className = "panel-action";
  dockBtn.title = config.dock === "left" ? "Dock right" : "Dock left";
  dockBtn.textContent = config.dock === "left" ? "R" : "L";
  dockBtn.addEventListener("click", () => dockPanel(key));

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "panel-action";
  collapseBtn.title = config.open ? "Collapse" : "Expand";
  collapseBtn.textContent = config.open ? "-" : "+";
  collapseBtn.addEventListener("click", () => togglePanel(key));

  const content = document.createElement("div");
  content.className = "panel-content";
  renderPanelContent(key, content);

  header.append(title, dockBtn, collapseBtn);
  panel.append(header, content);
  return panel;
}

function togglePanel(key) {
  state.editor.panels[key].open = !state.editor.panels[key].open;
  scheduleSave("Layout salvo");
  renderDocks();
}

function dockPanel(key) {
  state.editor.panels[key].dock = state.editor.panels[key].dock === "left" ? "right" : "left";
  scheduleSave("Dock salvo");
  renderDocks();
}

function renderPanelContent(key, content) {
  if (key === "scenes") renderScenesPanel(content);
  if (key === "layers") renderLayersPanel(content);
  if (key === "inspector") renderInspectorPanel(content);
  if (key === "properties") renderPropertiesPanel(content);
}

function renderScenesPanel(content) {
  const list = document.createElement("div");
  list.className = "scene-list";

  state.scenes.forEach((scene) => {
    const row = document.createElement("div");
    row.className = `scene-row ${scene.id === state.currentSceneId ? "active" : ""}`.trim();
    row.addEventListener("click", () => switchScene(scene.id));

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = scene.name;
    const subtitle = document.createElement("div");
    subtitle.className = "row-subtitle";
    subtitle.textContent = `${scene.overlays.horizontal.length} H | ${scene.overlays.vertical.length} V`;
    info.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const copy = miniIconButton("copy", "Duplicar cena", (event) => {
      event.stopPropagation();
      duplicateScene(scene.id);
    });

    const remove = miniIconButton("x", "Excluir cena", (event) => {
      event.stopPropagation();
      deleteScene(scene.id);
    }, "danger");
    remove.disabled = state.scenes.length <= 1;

    actions.append(copy, remove);
    row.append(info, actions);
    list.appendChild(row);
  });

  const buttons = document.createElement("div");
  buttons.className = "button-row";
  buttons.append(
    actionButton("Nova", () => addScene()),
    actionButton("Renomear", () => renameActiveScene()),
    actionButton("Excluir", () => deleteScene(state.currentSceneId), "danger"),
  );

  content.append(list, buttons);
}

function renderLayersPanel(content) {
  const name = textInput("Nome da layer");
  const src = textInput("URL ou caminho");
  const grid = document.createElement("div");
  grid.className = "form-grid";
  grid.append(fieldWrap("Nome", name));

  const addButtons = document.createElement("div");
  addButtons.className = "button-row";
  addButtons.append(
    actionButton("Adicionar iframe", () => addOverlayFromForm({ name, src }), "primary"),
  );

  const template = selectInput([["", "Templates"], ...LAYOUT_TEMPLATES.map((item) => [item.id, item.name])], "");
  template.addEventListener("change", () => {
    if (template.value) applyTemplate(template.value);
  });

  const filter = textInput("Filtrar layers", layerFilter);
  filter.addEventListener("input", () => {
    layerFilter = filter.value;
    updateLayerFilterVisibility();
  });

  const overlays = [...currentOverlays()].sort((a, b) => b.z - a.z);
  const list = document.createElement("div");
  list.className = "layer-list";

  if (!overlays.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Cena sem overlays";
    list.appendChild(empty);
  }

  overlays.forEach((overlay) => {
    const row = document.createElement("div");
    row.className = `layer-row ${overlay.id === selectedId ? "active" : ""}`.trim();
    row.dataset.search = [overlay.name, overlay.type, overlay.group].join(" ").toLowerCase();
    row.hidden = Boolean(layerFilter.trim()) && !row.dataset.search.includes(layerFilter.trim().toLowerCase());
    row.draggable = true;
    row.dataset.layerId = overlay.id;
    row.addEventListener("click", () => selectOverlay(overlay.id));
    row.addEventListener("dblclick", (event) => {
      if (!event.target.closest?.("button")) renameOverlayInline(overlay.id);
    });
    row.addEventListener("dragstart", (event) => onLayerDragStart(event, overlay.id));
    row.addEventListener("dragover", (event) => onLayerDragOver(event, overlay.id));
    row.addEventListener("dragleave", onLayerDragLeave);
    row.addEventListener("drop", (event) => onLayerDrop(event, overlay.id));
    row.addEventListener("dragend", onLayerDragEnd);

    const thumb = createLayerThumbnail(overlay);

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = overlay.name;
    const subtitle = document.createElement("div");
    subtitle.className = "row-subtitle";
    subtitle.textContent = `${niceType(overlay.type)} | ${Math.round(overlay.x)},${Math.round(overlay.y)} | ${Math.round(overlay.width)}x${Math.round(overlay.height)}${overlay.group ? ` | ${overlay.group}` : ""}`;
    info.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(
      miniIconButton("copy", "Copiar para outro layout", (event) => layerAction(event, () => copyLayerToOtherLayout(overlay.id))),
      miniIconButton(
        overlay.visible ? "eye" : "eyeOff",
        overlay.visible ? "Ocultar overlay" : "Mostrar overlay",
        (event) => layerAction(event, () => toggleVisible(overlay.id)),
      ),
      miniIconButton(
        overlay.locked ? "lock" : "unlock",
        overlay.locked ? "Destravar overlay" : "Travar overlay",
        (event) => layerAction(event, () => toggleLock(overlay.id)),
      ),
      miniIconButton("chevronUp", "Subir uma layer", (event) => layerAction(event, () => moveLayer(overlay.id, 1))),
      miniIconButton("chevronDown", "Descer uma layer", (event) => layerAction(event, () => moveLayer(overlay.id, -1))),
      miniIconButton("x", "Excluir overlay", (event) => layerAction(event, () => deleteOverlay(overlay.id)), "danger"),
    );

    row.append(thumb, info, actions);
    list.appendChild(row);
  });

  const layerButtons = document.createElement("div");
  layerButtons.className = "button-row";
  layerButtons.append(
    actionButton("Duplicar", () => duplicateSelected()),
    actionButton("Excluir", () => deleteSelected(), "danger"),
  );
  content.append(grid, fieldWrap("Source", src), addButtons, fieldWrap("Template", template), fieldWrap("Filtro", filter), list, layerButtons);
}

function updateLayerFilterVisibility() {
  const needle = layerFilter.trim().toLowerCase();
  document.querySelectorAll(".layer-row").forEach((row) => {
    row.hidden = Boolean(needle) && !String(row.dataset.search || "").includes(needle);
  });
}

function layerAction(event, fn) {
  event.stopPropagation();
  fn();
}

function createLayerThumbnail(overlay) {
  const thumb = document.createElement("div");
  thumb.className = `layer-thumb ${overlay.visible === false ? "muted" : ""}`.trim();
  thumb.textContent = "IFR";
  return thumb;
}

function renameOverlayInline(overlayId) {
  const overlay = currentOverlays().find((item) => item.id === overlayId);
  if (!overlay) return;
  const name = prompt("Nome da layer:", overlay.name);
  if (!name) return;
  mutate(() => {
    overlay.name = name.trim() || overlay.name;
  }, "Layer renomeada");
}

function copyLayerToOtherLayout(overlayId) {
  const overlay = currentOverlays().find((item) => item.id === overlayId);
  if (!overlay) return;
  mutate(() => {
    const targetLayout = state.layout === "horizontal" ? "vertical" : "horizontal";
    const sourcePreset = presetFor(state.layout);
    const targetPreset = presetFor(targetLayout);
    const copy = normalizeOverlay({
      ...clone(overlay),
      id: uid("ov"),
      x: Math.round((overlay.x / sourcePreset.width) * targetPreset.width),
      y: Math.round((overlay.y / sourcePreset.height) * targetPreset.height),
      width: Math.round((overlay.width / sourcePreset.width) * targetPreset.width),
      height: Math.round((overlay.height / sourcePreset.height) * targetPreset.height),
      z: maxZForLayout(targetLayout) + 10,
    });
    activeScene().overlays[targetLayout].push(copy);
    normalizeLayerOrderFor(targetLayout);
  }, "Layer copiada");
}

function alignSelected(mode) {
  const overlay = selectedOverlay();
  if (!overlay) return;
  mutate(() => {
    const preset = presetFor(state.layout);
    if (mode === "left") overlay.x = 0;
    if (mode === "centerX") overlay.x = Math.round((preset.width - overlay.width) / 2);
    if (mode === "right") overlay.x = preset.width - overlay.width;
    if (mode === "top") overlay.y = 0;
    if (mode === "centerY") overlay.y = Math.round((preset.height - overlay.height) / 2);
    if (mode === "bottom") overlay.y = preset.height - overlay.height;
  }, "Alinhado");
}

function sizeSelected(mode) {
  const overlay = selectedOverlay();
  if (!overlay) return;
  mutate(() => {
    const preset = presetFor(state.layout);
    if (mode === "fullWidth") {
      overlay.x = 0;
      overlay.width = preset.width;
    }
    if (mode === "fullHeight") {
      overlay.y = 0;
      overlay.height = preset.height;
    }
  }, "Tamanho ajustado");
}

function applyTemplate(templateId) {
  const template = LAYOUT_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return;
  if (!confirm(`Aplicar template "${template.name}" na cena atual?`)) return;
  mutate(() => {
    state.layout = template.layout;
    activeScene().overlays[template.layout] = template.overlays.map((overlay) => normalizeOverlay({
      ...overlay,
      id: uid("ov"),
    }));
    normalizeLayerOrder();
    selectedId = activeScene().overlays[template.layout].at(-1)?.id || null;
  }, "Template aplicado");
}

function onLayerDragStart(event, overlayId) {
  if (event.target.closest?.("button")) {
    event.preventDefault();
    return;
  }

  dragLayerId = overlayId;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-overlay-layer-id", overlayId);
  event.dataTransfer.setData("text/plain", overlayId);
}

function onLayerDragOver(event, targetId) {
  if (!dragLayerId || dragLayerId === targetId) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearLayerDropMarkers();

  const rect = event.currentTarget.getBoundingClientRect();
  const beforeTarget = event.clientY < rect.top + rect.height / 2;
  event.currentTarget.classList.add(beforeTarget ? "drag-over-before" : "drag-over-after");
}

function onLayerDragLeave(event) {
  event.currentTarget.classList.remove("drag-over-before", "drag-over-after");
}

function onLayerDrop(event, targetId) {
  const sourceId = event.dataTransfer.getData("application/x-overlay-layer-id") || dragLayerId;
  if (!sourceId || sourceId === targetId) return;

  event.preventDefault();
  event.stopPropagation();

  const rect = event.currentTarget.getBoundingClientRect();
  const beforeTarget = event.clientY < rect.top + rect.height / 2;
  clearLayerDropMarkers();
  reorderLayer(sourceId, targetId, beforeTarget);
}

function onLayerDragEnd(event) {
  dragLayerId = null;
  event.currentTarget.classList.remove("dragging");
  clearLayerDropMarkers();
}

function clearLayerDropMarkers() {
  document.querySelectorAll(".layer-row.drag-over-before, .layer-row.drag-over-after").forEach((row) => {
    row.classList.remove("drag-over-before", "drag-over-after");
  });
}

function reorderLayer(sourceId, targetId, beforeTarget) {
  const orderedIds = [...currentOverlays()]
    .sort((a, b) => b.z - a.z)
    .map((overlay) => overlay.id);
  const sourceIndex = orderedIds.indexOf(sourceId);
  if (sourceIndex < 0 || !orderedIds.includes(targetId)) return;

  orderedIds.splice(sourceIndex, 1);
  const targetIndex = orderedIds.indexOf(targetId);
  orderedIds.splice(targetIndex + (beforeTarget ? 0 : 1), 0, sourceId);

  mutate(() => {
    applyLayerOrderFromTop(orderedIds);
  }, "Layer salva");
}

function applyLayerOrderFromTop(orderedIds) {
  const overlays = currentOverlays();
  const byId = new Map(overlays.map((overlay) => [overlay.id, overlay]));
  orderedIds.forEach((id, index) => {
    const overlay = byId.get(id);
    if (overlay) overlay.z = (orderedIds.length - index) * 10;
  });
  normalizeLayerOrder();
}

function renderInspectorPanel(content) {
  const overlay = selectedOverlay();
  if (!overlay) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.textContent = "Nenhuma overlay selecionada.";
    content.appendChild(empty);
    return;
  }

  content.addEventListener("focusin", (event) => {
    if (event.target?.dataset?.field) beginLiveFieldEdit();
  });
  content.addEventListener("input", onInspectorInput);
  content.addEventListener("change", onInspectorInput);

  content.append(fieldWrap("Nome", dataTextInput("name", overlay.name)));
  content.append(fieldWrap("Source", dataTextInput("src", overlay.src)));

  const geometry = document.createElement("div");
  geometry.className = "form-grid four";
  geometry.append(
    fieldWrap("X", dataNumberInput("x", overlay.x)),
    fieldWrap("Y", dataNumberInput("y", overlay.y)),
    fieldWrap("W", dataNumberInput("width", overlay.width)),
    fieldWrap("H", dataNumberInput("height", overlay.height)),
  );
  content.append(geometry);

  const layer = document.createElement("div");
  layer.className = "form-grid";
  layer.append(
    fieldWrap("Z", dataNumberInput("z", overlay.z)),
    fieldWrap("Opacity", dataRangeInput("opacity", overlay.opacity, { min: 0, max: 1, step: 0.01 })),
  );
  content.append(layer);

  const style = document.createElement("div");
  style.className = "form-grid";
  style.append(
    fieldWrap("Rotacao", dataNumberInput("rotation", overlay.rotation, { min: -360, max: 360, step: 1 })),
    fieldWrap("Raio", dataNumberInput("radius", overlay.radius, { min: 0, max: 500, step: 1 })),
    fieldWrap("Borda", dataNumberInput("borderWidth", overlay.borderWidth, { min: 0, max: 80, step: 1 })),
    fieldWrap("Cor", dataColorInput("borderColor", overlay.borderColor)),
  );
  content.append(style);

  const crop = document.createElement("div");
  crop.className = "form-grid four";
  crop.append(
    fieldWrap("Crop T", dataNumberInput("crop.top", overlay.crop.top)),
    fieldWrap("Crop R", dataNumberInput("crop.right", overlay.crop.right)),
    fieldWrap("Crop B", dataNumberInput("crop.bottom", overlay.crop.bottom)),
    fieldWrap("Crop L", dataNumberInput("crop.left", overlay.crop.left)),
  );
  content.append(crop);

  content.append(
    checkWrap("Visivel", dataCheckbox("visible", overlay.visible)),
    checkWrap("Travada", dataCheckbox("locked", overlay.locked)),
    checkWrap("Proporcao", dataCheckbox("keepAspect", overlay.keepAspect)),
  );

  const alignButtons = document.createElement("div");
  alignButtons.className = "icon-button-row";
  alignButtons.append(
    miniIconButton("alignLeft", "Alinhar esquerda", () => alignSelected("left")),
    miniIconButton("alignCenter", "Centralizar horizontal", () => alignSelected("centerX")),
    miniIconButton("alignRight", "Alinhar direita", () => alignSelected("right")),
    miniIconButton("alignTop", "Alinhar topo", () => alignSelected("top")),
    miniIconButton("alignMiddle", "Centralizar vertical", () => alignSelected("centerY")),
    miniIconButton("alignBottom", "Alinhar base", () => alignSelected("bottom")),
  );
  content.appendChild(alignButtons);

  const sizeButtons = document.createElement("div");
  sizeButtons.className = "button-row";
  sizeButtons.append(
    actionButton("Largura total", () => sizeSelected("fullWidth")),
    actionButton("Altura total", () => sizeSelected("fullHeight")),
  );
  content.appendChild(sizeButtons);

  const buttons = document.createElement("div");
  buttons.className = "button-row";
  buttons.append(
    actionButton("Outro layout", () => copyLayerToOtherLayout(overlay.id)),
  );
  content.appendChild(buttons);

  const layerButtons = document.createElement("div");
  layerButtons.className = "button-row";
  layerButtons.append(
    actionButton("Frente", () => bringToFront(overlay.id)),
    actionButton("Tras", () => sendToBack(overlay.id)),
    actionButton("Excluir", () => deleteSelected(), "danger"),
  );
  content.appendChild(layerButtons);
}

function renderPropertiesPanel(content) {
  const gridSize = dataNumberInput("gridSize", state.editor.gridSize, { min: 5, max: 160, step: 5 });
  gridSize.addEventListener("input", () => {
    beginLiveFieldEdit();
    state.editor.gridSize = clamp(toInt(gridSize.value, 20), 5, 160);
    applyStageSize();
    scheduleSave("Grid salvo");
  });

  const current = activeScene();
  const sceneName = dataTextInput("sceneName", current.name);
  sceneName.addEventListener("focusin", beginLiveFieldEdit);
  sceneName.addEventListener("change", () => {
    current.name = sceneName.value.trim() || current.name;
    scheduleSave("Cena salva");
    renderAll();
  });

  content.append(fieldWrap("Cena", sceneName), fieldWrap("Grid", gridSize));
  content.append(
    checkWrap("Grid visivel", propertiesCheckbox(state.editor.showGrid, (value) => {
      mutate(() => {
        state.editor.showGrid = value;
      }, "Grid salvo");
    })),
  );

  const previewButtons = document.createElement("div");
  previewButtons.className = "button-row";
  const clearPreview = actionButton("Limpar previa", clearPreviewImage, "danger");
  clearPreview.disabled = !activePreviewImage();
  previewButtons.append(
    actionButton(activePreviewImage() ? "Trocar previa" : "Adicionar previa", choosePreviewImage),
    clearPreview,
  );
  content.append(fieldBlock("Imagem guia", previewButtons));

  const runtimeButtons = document.createElement("div");
  runtimeButtons.className = "button-row";
  runtimeButtons.append(
    actionButton("Copiar H", () => copyRuntimeUrl("horizontal")),
    actionButton("Copiar V", () => copyRuntimeUrl("vertical")),
  );
  content.appendChild(runtimeButtons);

  const buttons = document.createElement("div");
  buttons.className = "button-row";
  buttons.append(
    actionButton("Backup", exportProject),
    actionButton("Reset cena", () => resetCurrentScene(), "danger"),
    actionButton("Nova cena", () => addScene()),
  );
  content.appendChild(buttons);

  const dangerButtons = document.createElement("div");
  dangerButtons.className = "button-row";
  dangerButtons.append(actionButton("Limpar projeto", resetProject, "danger"));
  content.appendChild(dangerButtons);
}

function loadPreviewImages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY) || "{}");
    return {
      horizontal: typeof parsed.horizontal === "string" ? parsed.horizontal : "",
      vertical: typeof parsed.vertical === "string" ? parsed.vertical : "",
    };
  } catch {
    return { horizontal: "", vertical: "" };
  }
}

function savePreviewImages() {
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewImages));
    return true;
  } catch (error) {
    console.warn("Preview image could not be saved", error);
    return false;
  }
}

function activePreviewImage() {
  return previewImages[state.layout] || "";
}

function applyStagePreview() {
  if (!els.stagePreview) return;
  const image = activePreviewImage();
  els.stagePreview.style.backgroundImage = image ? `url(${JSON.stringify(image)})` : "";
}

function choosePreviewImage() {
  els.previewImageInput.click();
}

function clearPreviewImage() {
  if (!activePreviewImage()) {
    setStatus("Sem previa");
    return;
  }

  previewImages[state.layout] = "";
  savePreviewImages();
  applyStagePreview();
  renderDocks();
  setStatus("Previa removida");
}

async function importPreviewImage(file) {
  if (!file) return;
  if (!file.type?.startsWith("image/")) {
    setStatus("Use uma imagem");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    setStatus("Previa muito grande");
    return;
  }

  try {
    previewImages[state.layout] = await readImageDataUrl(file);
    const saved = savePreviewImages();
    applyStagePreview();
    renderDocks();
    setStatus(saved ? "Previa adicionada" : "Previa temporaria");
  } catch (error) {
    console.error(error);
    setStatus("Erro ao abrir previa");
  }
}

function readImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderStage() {
  const overlays = [...currentOverlays()]
    .filter((overlay) => overlay.visible !== false)
    .sort((a, b) => a.z - b.z);
  const existingNodes = new Map(
    Array.from(els.stageObjects.querySelectorAll(".overlay-node")).map((node) => [node.dataset.id, node]),
  );
  const activeIds = new Set();
  renderGuides([]);

  overlays.forEach((overlay) => {
    const selected = overlay.id === selectedId;
    const options = {
      selected,
      performanceMode: state.editor.performanceMode,
      runtime: false,
    };
    const mediaKey = mediaSignature(overlay, options);
    let node = existingNodes.get(overlay.id);

    if (node && node.dataset.mediaKey !== mediaKey) {
      const replacement = createStageOverlayNode(overlay, options);
      node.replaceWith(replacement);
      node = replacement;
    } else if (!node) {
      node = createStageOverlayNode(overlay, options);
      els.stageObjects.appendChild(node);
    } else {
      syncOverlayNode(node, overlay, options);
    }

    syncResizeHandles(node, overlay, selected);
    activeIds.add(overlay.id);
  });

  existingNodes.forEach((node, id) => {
    if (!activeIds.has(id)) node.remove();
  });
}

function createStageOverlayNode(overlay, options) {
  const node = createOverlayNode(overlay, options);
  node.addEventListener("pointerdown", onStageOverlayPointerDown);
  return node;
}

function onStageOverlayPointerDown(event) {
  const overlay = currentOverlays().find((item) => item.id === event.currentTarget.dataset.id);
  if (overlay) onOverlayPointerDown(event, overlay);
}

function syncResizeHandles(node, overlay, selected) {
  node.querySelectorAll(".handle").forEach((handle) => handle.remove());
  if (selected && !overlay.locked) addResizeHandles(node);
}

function updateStageSelection(previousId, nextId) {
  if (previousId && previousId !== nextId) {
    const previousNode = els.stageObjects.querySelector(`[data-id="${previousId}"]`);
    if (previousNode) {
      previousNode.classList.remove("selected");
      previousNode.querySelectorAll(".handle").forEach((handle) => handle.remove());
    }
  }

  const nextOverlay = currentOverlays().find((overlay) => overlay.id === nextId);
  const nextNode = nextId ? els.stageObjects.querySelector(`[data-id="${nextId}"]`) : null;
  if (!nextNode || !nextOverlay) return;

  nextNode.classList.add("selected");
  nextNode.querySelectorAll(".handle").forEach((handle) => handle.remove());
  if (!nextOverlay.locked) addResizeHandles(nextNode);
}

function onOverlayPointerDown(event, overlay) {
  const handle = event.target.closest(".handle");
  const edgeDir = !handle && event.altKey ? edgeHandleFromPointer(event) : null;
  const resizeDir = handle?.dataset.handle || edgeDir;
  const cropMode = Boolean(resizeDir && event.altKey);
  event.preventDefault();
  event.stopPropagation();

  if (selectedId !== overlay.id) {
    const previousId = selectedId;
    selectedId = overlay.id;
    updateStageSelection(previousId, selectedId);
    renderDocks();
  }

  if (overlay.locked) {
    setStatus("Overlay travada");
    return;
  }

  pushHistory();
  const startRect = rectFromOverlay(overlay);
  interaction = {
    id: overlay.id,
    type: resizeDir ? "resize" : "drag",
    dir: resizeDir,
    clientX: event.clientX,
    clientY: event.clientY,
    startRect,
    startCrop: clone(overlay.crop),
    cropMode,
  };

  els.interactionInfo.textContent = cropMode ? "Crop" : resizeDir ? "Resize" : "Drag";
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endPointerInteraction, { once: true });
}

function edgeHandleFromPointer(event) {
  const node = event.currentTarget;
  if (!node?.getBoundingClientRect) return null;

  const rect = node.getBoundingClientRect();
  const threshold = 12;
  const distances = {
    left: event.clientX - rect.left,
    right: rect.right - event.clientX,
    top: event.clientY - rect.top,
    bottom: rect.bottom - event.clientY,
  };
  const nearX = distances.left <= threshold || distances.right <= threshold;
  const nearY = distances.top <= threshold || distances.bottom <= threshold;
  let dir = "";

  if (nearY) dir += distances.top <= distances.bottom ? "n" : "s";
  if (nearX) dir += distances.left <= distances.right ? "w" : "e";

  return dir || null;
}

function onPointerMove(event) {
  if (!interaction) return;
  const overlay = currentOverlays().find((item) => item.id === interaction.id);
  if (!overlay) return;

  const dx = (event.clientX - interaction.clientX) / Math.max(currentScale, 0.01);
  const dy = (event.clientY - interaction.clientY) / Math.max(currentScale, 0.01);
  const useSnap = !event.shiftKey;

  if (interaction.type === "drag") {
    let rect = clampRect({
      ...interaction.startRect,
      x: interaction.startRect.x + dx,
      y: interaction.startRect.y + dy,
    }, state.layout);

    if (useSnap) {
      const snapped = snapRect(rect, currentOverlays(), overlay.id, state.layout, state.editor.gridSize);
      rect = snapped.rect;
      renderGuides(snapped.guides);
    } else {
      renderGuides([]);
    }

    applyRect(overlay, rect);
    updateSelectedNode(overlay);
    updateInspectorGeometry(overlay);
    return;
  }

  if (interaction.type === "resize" && (event.altKey || interaction.cropMode)) {
    const cropped = cropFrameFromHandle(overlay, interaction.startRect, interaction.startCrop, interaction.dir, dx, dy);
    overlay.crop = cropped.crop;
    overlay.sourceWidth = cropped.sourceWidth;
    overlay.sourceHeight = cropped.sourceHeight;
    applyRect(overlay, cropped.rect);
    updateSelectedNode(overlay);
    updateInspectorGeometry(overlay);
    els.interactionInfo.textContent = "Crop";
    return;
  }

  if (interaction.type === "resize") {
    let rect = resizeRect(interaction.startRect, interaction.dir, dx, dy, {
      layout: state.layout,
      fromCenter: event.ctrlKey,
      shiftKey: event.shiftKey || overlay.keepAspect,
      minSize: 24,
    });

    if (useSnap) {
      const snapped = snapRect(rect, currentOverlays(), overlay.id, state.layout, state.editor.gridSize);
      rect = snapped.rect;
      renderGuides(snapped.guides);
    } else {
      renderGuides([]);
    }

    applyRect(overlay, rect);
    updateSelectedNode(overlay);
    updateInspectorGeometry(overlay);
  }
}

function endPointerInteraction() {
  window.removeEventListener("pointermove", onPointerMove);
  interaction = null;
  liveFieldEditing = false;
  renderGuides([]);
  scheduleSave("Alteracao salva");
  renderDocks();
  updateHistoryButtons();
  els.interactionInfo.textContent = "Editor";
}

function renderGuides(guides) {
  els.guidesLayer.innerHTML = "";
  guides.forEach((guide) => {
    const line = document.createElement("div");
    line.className = `guide ${guide.axis === "x" ? "vertical" : "horizontal"}`;
    if (guide.axis === "x") line.style.left = `${guide.value}px`;
    if (guide.axis === "y") line.style.top = `${guide.value}px`;
    els.guidesLayer.appendChild(line);
  });
}

function updateSelectedNode(overlay) {
  const node = els.stageObjects.querySelector(`[data-id="${overlay.id}"]`);
  if (node) {
    syncOverlayNode(node, overlay, {
      selected: overlay.id === selectedId,
      performanceMode: state.editor.performanceMode,
      runtime: false,
    });
  }
}

function updateSelectedMediaTransform(overlay) {
  const node = els.stageObjects.querySelector(`[data-id="${overlay.id}"]`);
  if (node) applyMediaTransform(node, overlay);
}

function updateInspectorGeometry(overlay) {
  setFieldValue("x", overlay.x);
  setFieldValue("y", overlay.y);
  setFieldValue("width", overlay.width);
  setFieldValue("height", overlay.height);
  setFieldValue("sourceWidth", overlay.sourceWidth);
  setFieldValue("sourceHeight", overlay.sourceHeight);
  setFieldValue("z", overlay.z);
  setFieldValue("rotation", overlay.rotation);
  setFieldValue("radius", overlay.radius);
  setFieldValue("borderWidth", overlay.borderWidth);
  setFieldValue("crop.top", overlay.crop.top);
  setFieldValue("crop.right", overlay.crop.right);
  setFieldValue("crop.bottom", overlay.crop.bottom);
  setFieldValue("crop.left", overlay.crop.left);
}

function cropFrameFromHandle(overlay, startRect, startCrop, dir, dx, dy) {
  const preset = presetFor(state.layout);
  const minOutput = 12;
  const minVisible = 5;
  let sourceWidth = safeSourceSize(overlay.sourceWidth, startRect.width, minVisible);
  let sourceHeight = safeSourceSize(overlay.sourceHeight, startRect.height, minVisible);
  const visibleWidth = Math.max(minVisible, sourceWidth - startCrop.left - startCrop.right);
  const visibleHeight = Math.max(minVisible, sourceHeight - startCrop.top - startCrop.bottom);
  const scaleX = Math.max(MIN_CROP_SCALE, startRect.width / visibleWidth);
  const scaleY = Math.max(MIN_CROP_SCALE, startRect.height / visibleHeight);
  const crop = { ...startCrop };
  const rect = { ...startRect };

  if (dir.includes("w")) {
    let edgeDelta = (clamp(startCrop.left + dx / scaleX, 0, sourceWidth - startCrop.right - minVisible) - startCrop.left) * scaleX;
    edgeDelta = clamp(edgeDelta, -startRect.x, startRect.width - minOutput);
    crop.left = Math.round(startCrop.left + edgeDelta / scaleX);
    rect.x = startRect.x + edgeDelta;
    rect.width = startRect.width - edgeDelta;
  }

  if (dir.includes("e")) {
    const edgeDelta = clamp(dx, minOutput - startRect.width, preset.width - (startRect.x + startRect.width));
    const desiredRight = startCrop.right - edgeDelta / scaleX;
    if (desiredRight < 0) {
      sourceWidth = Math.min(MAX_SOURCE_SIZE, sourceWidth + Math.abs(desiredRight));
      crop.right = 0;
    } else {
      crop.right = Math.round(desiredRight);
    }
    rect.width = startRect.width + edgeDelta;
  }

  if (dir.includes("n")) {
    let edgeDelta = (clamp(startCrop.top + dy / scaleY, 0, sourceHeight - startCrop.bottom - minVisible) - startCrop.top) * scaleY;
    edgeDelta = clamp(edgeDelta, -startRect.y, startRect.height - minOutput);
    crop.top = Math.round(startCrop.top + edgeDelta / scaleY);
    rect.y = startRect.y + edgeDelta;
    rect.height = startRect.height - edgeDelta;
  }

  if (dir.includes("s")) {
    const edgeDelta = clamp(dy, minOutput - startRect.height, preset.height - (startRect.y + startRect.height));
    const desiredBottom = startCrop.bottom - edgeDelta / scaleY;
    if (desiredBottom < 0) {
      sourceHeight = Math.min(MAX_SOURCE_SIZE, sourceHeight + Math.abs(desiredBottom));
      crop.bottom = 0;
    } else {
      crop.bottom = Math.round(desiredBottom);
    }
    rect.height = startRect.height + edgeDelta;
  }

  const finalCrop = {
    top: clamp(toInt(crop.top, 0), 0, sourceHeight - minVisible),
    right: clamp(toInt(crop.right, 0), 0, sourceWidth - minVisible),
    bottom: clamp(toInt(crop.bottom, 0), 0, sourceHeight - minVisible),
    left: clamp(toInt(crop.left, 0), 0, sourceWidth - minVisible),
  };
  finalCrop.left = clamp(finalCrop.left, 0, sourceWidth - finalCrop.right - minVisible);
  finalCrop.right = clamp(finalCrop.right, 0, sourceWidth - finalCrop.left - minVisible);
  finalCrop.top = clamp(finalCrop.top, 0, sourceHeight - finalCrop.bottom - minVisible);
  finalCrop.bottom = clamp(finalCrop.bottom, 0, sourceHeight - finalCrop.top - minVisible);

  return {
    crop: finalCrop,
    rect: clampRect(rect, state.layout, minOutput),
    sourceWidth: safeSourceSize(sourceWidth, startRect.width, minVisible),
    sourceHeight: safeSourceSize(sourceHeight, startRect.height, minVisible),
  };
}

function applyCropFieldValue(overlay, side, nextValue) {
  const startRect = rectFromOverlay(overlay);
  const startCrop = clone(overlay.crop);
  const sourceWidth = safeSourceSize(overlay.sourceWidth, startRect.width, 5);
  const sourceHeight = safeSourceSize(overlay.sourceHeight, startRect.height, 5);
  const visibleWidth = Math.max(5, sourceWidth - startCrop.left - startCrop.right);
  const visibleHeight = Math.max(5, sourceHeight - startCrop.top - startCrop.bottom);
  const scaleX = Math.max(MIN_CROP_SCALE, startRect.width / visibleWidth);
  const scaleY = Math.max(MIN_CROP_SCALE, startRect.height / visibleHeight);
  let dir = "";
  let dx = 0;
  let dy = 0;

  if (side === "left") {
    dir = "w";
    dx = (Math.max(0, nextValue) - startCrop.left) * scaleX;
  }
  if (side === "right") {
    dir = "e";
    dx = -(Math.max(0, nextValue) - startCrop.right) * scaleX;
  }
  if (side === "top") {
    dir = "n";
    dy = (Math.max(0, nextValue) - startCrop.top) * scaleY;
  }
  if (side === "bottom") {
    dir = "s";
    dy = -(Math.max(0, nextValue) - startCrop.bottom) * scaleY;
  }

  if (!dir) return;

  const cropped = cropFrameFromHandle(overlay, startRect, startCrop, dir, dx, dy);
  overlay.crop = cropped.crop;
  overlay.sourceWidth = cropped.sourceWidth;
  overlay.sourceHeight = cropped.sourceHeight;
  applyRect(overlay, cropped.rect);
}

function clampOverlayCrop(overlay) {
  const minVisible = 5;
  overlay.sourceWidth = safeSourceSize(overlay.sourceWidth, overlay.width, minVisible);
  overlay.sourceHeight = safeSourceSize(overlay.sourceHeight, overlay.height, minVisible);
  const sourceWidth = overlay.sourceWidth;
  const sourceHeight = overlay.sourceHeight;

  overlay.crop.left = clamp(toInt(overlay.crop.left, 0), 0, sourceWidth - minVisible);
  overlay.crop.right = clamp(toInt(overlay.crop.right, 0), 0, sourceWidth - minVisible);
  if (overlay.crop.left + overlay.crop.right > sourceWidth - minVisible) {
    overlay.crop.right = Math.max(0, sourceWidth - minVisible - overlay.crop.left);
  }

  overlay.crop.top = clamp(toInt(overlay.crop.top, 0), 0, sourceHeight - minVisible);
  overlay.crop.bottom = clamp(toInt(overlay.crop.bottom, 0), 0, sourceHeight - minVisible);
  if (overlay.crop.top + overlay.crop.bottom > sourceHeight - minVisible) {
    overlay.crop.bottom = Math.max(0, sourceHeight - minVisible - overlay.crop.top);
  }
}

function safeSourceSize(value, fallback, minimum = 5) {
  const raw = toInt(value, fallback);
  const fallbackSize = toInt(fallback, minimum);
  if (raw > MAX_SOURCE_SIZE) {
    return Math.round(clamp(Math.max(fallbackSize, minimum), minimum, MAX_SOURCE_SIZE));
  }
  return Math.round(clamp(raw, minimum, MAX_SOURCE_SIZE));
}

function setFieldValue(field, value) {
  const input = document.querySelector(`[data-field="${field}"]`);
  if (input && document.activeElement !== input) input.value = value;
}

function onInspectorInput(event) {
  const field = event.target?.dataset?.field;
  if (!field) return;
  beginLiveFieldEdit();
  const overlay = selectedOverlay();
  if (!overlay) return;

  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  const preset = presetFor(state.layout);
  const cropField = field.startsWith("crop.");

  if (field === "name") overlay.name = String(value);
  if (field === "src") overlay.src = String(value);
  if (field === "type") overlay.type = "iframe";
  if (field === "fit") overlay.fit = "fill";
  if (field === "x") overlay.x = clamp(toInt(value, overlay.x), 0, preset.width - overlay.width);
  if (field === "y") overlay.y = clamp(toInt(value, overlay.y), 0, preset.height - overlay.height);
  if (field === "width") overlay.width = clamp(toInt(value, overlay.width), 24, preset.width - overlay.x);
  if (field === "height") overlay.height = clamp(toInt(value, overlay.height), 24, preset.height - overlay.y);
  if (field === "sourceWidth") overlay.sourceWidth = clamp(toInt(value, overlay.sourceWidth), 24, MAX_SOURCE_SIZE);
  if (field === "sourceHeight") overlay.sourceHeight = clamp(toInt(value, overlay.sourceHeight), 24, MAX_SOURCE_SIZE);
  if (field === "z") overlay.z = toInt(value, overlay.z);
  if (field === "opacity") overlay.opacity = clamp(toNumber(value, overlay.opacity), 0, 1);
  if (field === "rotation") overlay.rotation = clamp(toNumber(value, overlay.rotation), -360, 360);
  if (field === "radius") overlay.radius = clamp(toInt(value, overlay.radius), 0, 500);
  if (field === "borderWidth") overlay.borderWidth = clamp(toInt(value, overlay.borderWidth), 0, 80);
  if (field === "borderColor") overlay.borderColor = String(value || "#ffffff");
  if (field === "filter") overlay.filter = "none";
  if (field === "group") overlay.group = "";
  if (field === "visible") overlay.visible = Boolean(value);
  if (field === "locked") overlay.locked = Boolean(value);
  if (field === "muted") overlay.muted = true;
  if (field === "loop") overlay.loop = false;
  if (field === "autoplay") overlay.autoplay = false;
  if (field === "shadow") overlay.shadow = false;
  if (field === "keepAspect") overlay.keepAspect = Boolean(value);
  if (cropField) {
    const side = field.split(".")[1];
    applyCropFieldValue(overlay, side, toInt(value, overlay.crop[side]));
  }
  if (field === "sourceWidth" || field === "sourceHeight") {
    clampOverlayCrop(overlay);
    updateInspectorGeometry(overlay);
  }

  const fullRenderFields = new Set(["name", "src", "visible", "locked", "keepAspect"]);
  if (fullRenderFields.has(field)) {
    renderStage();
  } else if (cropField) {
    updateInspectorGeometry(overlay);
    updateSelectedNode(overlay);
  } else if (field === "sourceWidth" || field === "sourceHeight") {
    updateSelectedMediaTransform(overlay);
  } else {
    updateSelectedNode(overlay);
  }

  scheduleSave("Auto save");
}

function beginLiveFieldEdit() {
  if (liveFieldEditing) return;
  pushHistory();
  liveFieldEditing = true;
}

document.addEventListener("focusout", (event) => {
  if (event.target?.dataset?.field) {
    liveFieldEditing = false;
  }
}, true);

function switchScene(sceneId) {
  if (sceneId === state.currentSceneId) return;
  selectedId = null;
  state.currentSceneId = sceneId;
  scheduleSave("Cena ativa salva");
  renderAll();
}

function addScene() {
  const name = prompt("Nome da cena:", "Nova Cena");
  if (!name) return;
  mutate(() => {
    const usedIds = new Set(state.scenes.map((scene) => scene.id));
    const id = uniqueId(slugify(name), usedIds);
    state.scenes.push({
      id,
      name: name.trim(),
      overlays: { horizontal: [], vertical: [] },
    });
    state.currentSceneId = id;
    selectedId = null;
  }, "Cena criada");
}

function renameActiveScene() {
  const scene = activeScene();
  const name = prompt("Nome da cena:", scene.name);
  if (!name) return;
  mutate(() => {
    scene.name = name.trim() || scene.name;
  }, "Cena renomeada");
}

function deleteScene(sceneId) {
  if (state.scenes.length <= 1) {
    setStatus("Mantenha pelo menos uma cena");
    return;
  }

  const index = state.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) return;

  const scene = state.scenes[index];
  if (!confirm(`Excluir a cena "${scene.name}"?`)) return;

  mutate(() => {
    state.scenes.splice(index, 1);
    if (state.currentSceneId === sceneId) {
      const next = state.scenes[Math.min(index, state.scenes.length - 1)] || state.scenes[0];
      state.currentSceneId = next.id;
    }
    selectedId = null;
  }, "Cena excluida");
}

function duplicateScene(sceneId) {
  const source = state.scenes.find((scene) => scene.id === sceneId);
  if (!source) return;
  mutate(() => {
    const usedIds = new Set(state.scenes.map((scene) => scene.id));
    const id = uniqueId(`${source.id}-copy`, usedIds);
    const copy = clone(source);
    copy.id = id;
    copy.name = `${source.name} Copia`;
    copy.overlays.horizontal.forEach((overlay) => {
      overlay.id = uid("ov");
      overlay.x += 30;
      overlay.y += 30;
    });
    copy.overlays.vertical.forEach((overlay) => {
      overlay.id = uid("ov");
      overlay.x += 30;
      overlay.y += 30;
    });
    state.scenes.push(copy);
    state.currentSceneId = id;
    selectedId = null;
  }, "Cena duplicada");
}

function addOverlayFromForm(fields) {
  const src = fields.src.value.trim();
  if (!src) {
    setStatus("Informe o source");
    fields.src.focus();
    return;
  }

  mutate(() => {
    addOverlayToScene({
      name: fields.name.value.trim() || "Iframe",
      type: "iframe",
      src,
    });
  }, "Layer adicionada");
}

function addOverlayToScene(input, position = null) {
  const preset = presetFor(state.layout);
  const width = Math.round(preset.width * (state.layout === "vertical" ? 0.48 : 0.28));
  const height = Math.round(width * 0.56);
  const x = position ? clamp(Math.round(position.x - width / 2), 0, preset.width - width) : Math.round((preset.width - width) / 2);
  const y = position ? clamp(Math.round(position.y - height / 2), 0, preset.height - height) : Math.round((preset.height - height) / 2);
  const overlay = normalizeOverlay({
    id: uid("ov"),
    name: input.name,
    type: input.type,
    src: input.src,
    x,
    y,
    width,
    height,
    sourceWidth: input.sourceWidth || width,
    sourceHeight: input.sourceHeight || height,
    z: maxZ() + 10,
    visible: true,
    locked: false,
  });
  currentOverlays().push(overlay);
  normalizeLayerOrder();
  selectedId = overlay.id;
}

function selectOverlay(id) {
  if (selectedId === id) return;
  const previousId = selectedId;
  selectedId = id;
  updateStageSelection(previousId, selectedId);
  renderDocks();
  updateHistoryButtons();
}

function duplicateSelected() {
  const overlay = selectedOverlay();
  if (!overlay) return;
  mutate(() => {
    const preset = presetFor(state.layout);
    const copy = clone(overlay);
    copy.id = uid("ov");
    copy.name = `${overlay.name} Copia`;
    copy.x = clamp(copy.x + 32, 0, preset.width - copy.width);
    copy.y = clamp(copy.y + 32, 0, preset.height - copy.height);
    copy.z = maxZ() + 10;
    currentOverlays().push(copy);
    normalizeLayerOrder();
    selectedId = copy.id;
  }, "Overlay duplicada");
}

function deleteSelected() {
  if (!selectedId) return;
  deleteOverlay(selectedId);
}

function deleteOverlay(id) {
  const target = currentOverlays().find((overlay) => overlay.id === id);
  if (target && currentOverlays().length > 6 && !confirm(`Excluir a layer "${target.name}"?`)) return;
  mutate(() => {
    const overlays = currentOverlays();
    const index = overlays.findIndex((overlay) => overlay.id === id);
    if (index >= 0) overlays.splice(index, 1);
    if (selectedId === id) selectedId = null;
    normalizeLayerOrder();
  }, "Overlay removida");
}

function resetCurrentScene() {
  if (!confirm("Apagar overlays da cena atual?")) return;
  mutate(() => {
    activeScene().overlays[state.layout] = [];
    selectedId = null;
  }, "Cena resetada");
}

function resetProject() {
  if (!confirm("Apagar todo o projeto local?")) return;
  mutate(() => {
    state = normalizeState(null);
    selectedId = null;
  }, "Projeto limpo");
}

function toggleVisible(id) {
  mutate(() => {
    const overlay = currentOverlays().find((item) => item.id === id);
    if (overlay) overlay.visible = !overlay.visible;
  }, "Visibilidade salva");
}

function toggleLock(id) {
  mutate(() => {
    const overlay = currentOverlays().find((item) => item.id === id);
    if (overlay) overlay.locked = !overlay.locked;
  }, "Lock salvo");
}

function bringToFront(id) {
  mutate(() => {
    const overlay = currentOverlays().find((item) => item.id === id);
    if (overlay) overlay.z = maxZ() + 10;
    normalizeLayerOrder();
  }, "Layer salva");
}

function sendToBack(id) {
  mutate(() => {
    const overlay = currentOverlays().find((item) => item.id === id);
    if (overlay) overlay.z = minZ() - 10;
    normalizeLayerOrder();
  }, "Layer salva");
}

function moveLayer(id, direction) {
  mutate(() => {
    const overlays = currentOverlays().sort((a, b) => a.z - b.z);
    const index = overlays.findIndex((overlay) => overlay.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= overlays.length) return;
    const currentZ = overlays[index].z;
    overlays[index].z = overlays[target].z;
    overlays[target].z = currentZ;
    normalizeLayerOrder();
  }, "Layer salva");
}

function maxZ() {
  return currentOverlays().reduce((max, overlay) => Math.max(max, overlay.z || 0), 0);
}

function maxZForLayout(layout) {
  const scene = activeScene();
  return (scene.overlays[layout] || []).reduce((max, overlay) => Math.max(max, overlay.z || 0), 0);
}

function minZ() {
  return currentOverlays().reduce((min, overlay) => Math.min(min, overlay.z || 0), 0);
}

function normalizeLayerOrder() {
  normalizeLayerOrderFor(state.layout);
}

function normalizeLayerOrderFor(layout) {
  const scene = activeScene();
  if (!scene.overlays[layout]) scene.overlays[layout] = [];
  scene.overlays[layout]
    .sort((a, b) => a.z - b.z)
    .forEach((overlay, index) => {
      overlay.z = (index + 1) * 10;
    });
}

function runtimeUrl(layout = state.layout, payload = "") {
  const safeLayout = layout === "vertical" || layout === "horizontal" ? layout : state.layout;
  const url = new URL(`runtime/${safeLayout}/`, rootUrl());
  url.searchParams.set("v", RUNTIME_BUILD);
  if (payload) url.hash = `project=${payload}`;
  return url.href;
}

async function copyRuntimeUrl(layout = state.layout) {
  if (layout instanceof Event || (layout && typeof layout === "object")) layout = state.layout;
  if (layout !== "vertical" && layout !== "horizontal") layout = state.layout;
  setStatus("Gerando runtime");
  const payload = await createRuntimePayload(layout);
  const url = runtimeUrl(layout, payload);
  try {
    await navigator.clipboard.writeText(url);
    setStatus(url.length > 60000 ? "Runtime copiado (link grande)" : "Runtime copiado");
  } catch {
    prompt("Runtime URL:", url);
  }
}

async function createRuntimePayload(layout) {
  const project = normalizeState(state);
  const scene = project.scenes.find((item) => item.id === project.currentSceneId) || project.scenes[0];
  const runtimeScene = {
    ...scene,
    overlays: {
      horizontal: layout === "horizontal" ? scene.overlays.horizontal : [],
      vertical: layout === "vertical" ? scene.overlays.vertical : [],
    },
  };

  const runtimeState = normalizeState({
    version: project.version,
    layout,
    currentSceneId: runtimeScene.id,
    editor: project.editor,
    scenes: [runtimeScene],
  });

  return encodeRuntimeProject(runtimeState);
}

async function encodeRuntimeProject(project) {
  const json = JSON.stringify(project);
  const bytes = new TextEncoder().encode(json);
  return `json.${bytesToBase64Url(bytes)}`;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function exportProject() {
  const payload = normalizeState(state);
  downloadJson("overlay-manager-project.json", payload);
  setStatus("JSON exportado");
}

async function importProject(file) {
  if (!file) return;
  try {
    const text = await readTextFile(file);
    const next = normalizeState(JSON.parse(text));
    pushHistory();
    state = next;
    selectedId = null;
    persist("JSON importado");
    renderAll();
  } catch (error) {
    console.error(error);
    setStatus("JSON invalido");
  } finally {
    els.importInput.value = "";
  }
}

function setLayout(layout) {
  if (!LAYOUTS[layout] || state.layout === layout) return;
  selectedId = null;
  state.layout = layout;
  scheduleSave("Layout salvo");
  renderAll();
}

function setZoom(next) {
  state.editor.zoom = next;
  applyStageSize();
  scheduleSave("Zoom salvo");
}

function zoomBy(delta) {
  const base = state.editor.zoom === 0 ? currentScale : state.editor.zoom;
  setZoom(clamp(base + delta, 0.15, 2.5));
}

function onEditorWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.deltaY === 0) return;
  zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
}

function actionButton(text, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function iconButton(icon, label, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ["icon-only", className].filter(Boolean).join(" ");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICONS[icon] || ICONS.x;
  button.addEventListener("click", onClick);
  return button;
}

function miniIconButton(icon, label, onClick, className = "") {
  const button = iconButton(icon, label, onClick, className);
  button.classList.add("mini-btn");
  return button;
}

function fieldWrap(labelText, input) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const label = document.createElement("span");
  label.textContent = labelText;
  wrap.append(label, input);
  return wrap;
}

function fieldBlock(labelText, content) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("span");
  label.textContent = labelText;
  wrap.append(label, content);
  return wrap;
}

function checkWrap(labelText, input) {
  const wrap = document.createElement("label");
  wrap.className = "check-row";
  const label = document.createElement("span");
  label.textContent = labelText;
  wrap.append(input, label);
  return wrap;
}

function textInput(placeholder = "", value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function dataTextInput(field, value) {
  const input = textInput("", value);
  input.dataset.field = field;
  return input;
}

function dataNumberInput(field, value, attrs = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  input.dataset.field = field;
  Object.assign(input, attrs);
  return input;
}

function dataRangeInput(field, value, attrs = {}) {
  const input = document.createElement("input");
  input.type = "range";
  input.value = value;
  input.dataset.field = field;
  Object.assign(input, attrs);
  return input;
}

function dataColorInput(field, value) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#ffffff";
  input.dataset.field = field;
  return input;
}

function selectInput(options, value) {
  const select = document.createElement("select");
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = value;
  return select;
}

function dataSelect(field, options, value) {
  const select = selectInput(options, value);
  select.dataset.field = field;
  return select;
}

function dataCheckbox(field, checked) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.dataset.field = field;
  return input;
}

function propertiesCheckbox(checked, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

els.stageObjects.addEventListener("pointerdown", (event) => {
  if (event.target !== els.stageObjects) return;
  const previousId = selectedId;
  selectedId = null;
  updateStageSelection(previousId, selectedId);
  renderDocks();
});

els.layoutHorizontal.addEventListener("click", () => setLayout("horizontal"));
els.layoutVertical.addEventListener("click", () => setLayout("vertical"));
els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);
els.zoomOutBtn.addEventListener("click", () => zoomBy(-0.1));
els.zoomFitBtn.addEventListener("click", () => setZoom(0));
els.zoomInBtn.addEventListener("click", () => zoomBy(0.1));
els.copyRuntimeBtn.addEventListener("click", () => copyRuntimeUrl(state.layout));
els.saveBtn.addEventListener("click", () => persist("Salvo"));
els.exportBtn.addEventListener("click", exportProject);
els.importBtn.addEventListener("click", () => els.importInput.click());
els.importInput.addEventListener("change", () => importProject(els.importInput.files?.[0]));
els.previewImageInput.addEventListener("change", () => {
  importPreviewImage(els.previewImageInput.files?.[0]);
  els.previewImageInput.value = "";
});
window.addEventListener("wheel", onEditorWheel, { passive: false });

window.addEventListener("resize", () => {
  applyStageSize();
});

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  const key = event.key.toLowerCase();
  const cmd = event.ctrlKey || event.metaKey;

  if (cmd && key === "z" && event.shiftKey) {
    event.preventDefault();
    redo();
    return;
  }

  if (cmd && key === "z") {
    event.preventDefault();
    undo();
    return;
  }

  if (cmd && key === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if (cmd && key === "s") {
    event.preventDefault();
    persist("Salvo");
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
    return;
  }

  if (event.key === "1") setLayout("horizontal");
  if (event.key === "2") setLayout("vertical");
});

initTopbarIcons();
persist("Pronto");
renderAll();

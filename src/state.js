import {
  CURRENT_VERSION,
  DEFAULT_EDITOR,
  DEFAULT_SCENES,
  LEGACY_STORAGE_KEY,
  MAX_SOURCE_SIZE,
  STORAGE_KEY,
} from "./constants.js";
import { clamp, clone, inferAssetType, slugify, toInt, toNumber, uid, uniqueId } from "./utils.js";

export function createDefaultState() {
  return {
    version: CURRENT_VERSION,
    layout: "horizontal",
    currentSceneId: DEFAULT_SCENES[0].id,
    editor: clone(DEFAULT_EDITOR),
    scenes: DEFAULT_SCENES.map((scene) => ({
      id: scene.id,
      name: scene.name,
      overlays: {
        horizontal: [],
        vertical: [],
      },
    })),
  };
}

export function loadProject() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.error("Project load failed", error);
    }
  }

  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    try {
      return normalizeState(migrateLegacyState(JSON.parse(legacyRaw)));
    } catch (error) {
      console.error("Legacy migration failed", error);
    }
  }

  return createDefaultState();
}

export function saveProject(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return { ok: true };
  } catch (error) {
    console.error("Project save failed", error);
    return { ok: false, error };
  }
}

export function normalizeState(input) {
  const base = createDefaultState();
  if (!input || typeof input !== "object") return base;
  if (!Array.isArray(input.scenes) && (input.scenes?.landscape || input.scenes?.portrait)) {
    return normalizeState(migrateLegacyState(input));
  }

  base.version = CURRENT_VERSION;
  base.layout = input.layout === "vertical" || input.layout === "portrait" ? "vertical" : "horizontal";
  base.currentSceneId = typeof input.currentSceneId === "string" ? input.currentSceneId : base.currentSceneId;
  base.editor = normalizeEditor(input.editor);
  const usedSceneIds = new Set();
  const scenes = [];
  const inputScenes = Array.isArray(input.scenes) ? input.scenes : [];

  for (const scene of DEFAULT_SCENES) {
    const existing = inputScenes.find((item) => item?.id === scene.id || item?.name === scene.name);
    scenes.push(normalizeScene(existing || scene, scene.id, scene.name, usedSceneIds));
  }

  for (const scene of inputScenes) {
    if (!scene || typeof scene !== "object") continue;
    if (DEFAULT_SCENES.some((item) => item.id === scene.id || item.name === scene.name)) continue;
    scenes.push(normalizeScene(scene, scene.id || scene.name, scene.name || scene.id, usedSceneIds));
  }

  base.scenes = scenes;
  if (!base.scenes.some((scene) => scene.id === base.currentSceneId)) {
    base.currentSceneId = base.scenes[0]?.id || DEFAULT_SCENES[0].id;
  }

  return base;
}

function normalizeEditor(editor = {}) {
  const base = clone(DEFAULT_EDITOR);
  if (!editor || typeof editor !== "object") return base;

  base.zoom = editor.zoom === 0 ? 0 : clamp(editor.zoom, 0.15, 2.5);
  base.gridSize = clamp(toInt(editor.gridSize, 20), 5, 160);
  base.showGrid = editor.showGrid !== false;
  base.performanceMode = false;
  base.panels = clone(DEFAULT_EDITOR.panels);

  for (const key of Object.keys(base.panels)) {
    const incoming = editor.panels?.[key];
    if (!incoming || typeof incoming !== "object") continue;
    base.panels[key] = {
      ...base.panels[key],
      open: incoming.open !== false,
      dock: incoming.dock === "left" ? "left" : "right",
    };
  }

  return base;
}

function normalizeScene(scene, fallbackId, fallbackName, usedSceneIds) {
  const id = usedSceneIds.has(scene?.id) ? uniqueId(scene?.name || fallbackId, usedSceneIds) : uniqueId(scene?.id || fallbackId, usedSceneIds);
  const name = String(scene?.name || fallbackName || id).trim() || "Scene";
  const horizontal = Array.isArray(scene?.overlays?.horizontal) ? scene.overlays.horizontal : [];
  const vertical = Array.isArray(scene?.overlays?.vertical) ? scene.overlays.vertical : [];

  return {
    id,
    name,
    overlays: {
      horizontal: normalizeOverlayList(horizontal),
      vertical: normalizeOverlayList(vertical),
    },
  };
}

function normalizeOverlayList(list) {
  const normalized = list.map(normalizeOverlay).filter(Boolean);
  normalized.sort((a, b) => a.z - b.z);
  normalized.forEach((overlay, index) => {
    overlay.z = (index + 1) * 10;
  });
  return normalized;
}

export function normalizeOverlay(input) {
  if (!input || typeof input !== "object") return null;
  const rawSrc = String(input.src ?? input.url ?? "").trim();
  const src = isMediaSource(rawSrc) ? "about:blank" : rawSrc;
  const type = inferAssetType(src, input.type || "iframe");
  const width = Math.max(20, toInt(input.width ?? input.w, 420));
  const height = Math.max(20, toInt(input.height ?? input.h, 240));
  const crop = normalizeCrop(input.crop);
  const sourceWidth = normalizeSourceSize(input.sourceWidth ?? input.frameWidth, width, crop.left, crop.right);
  const sourceHeight = normalizeSourceSize(input.sourceHeight ?? input.frameHeight, height, crop.top, crop.bottom);
  const safeCrop = clampCropForSource(crop, sourceWidth, sourceHeight);

  return {
    id: String(input.id || uid("ov")),
    name: String(input.name || "Overlay").trim() || "Overlay",
    type,
    src,
    x: toInt(input.x, 80),
    y: toInt(input.y, 80),
    width,
    height,
    sourceWidth,
    sourceHeight,
    z: toInt(input.z ?? input.zIndex, 10),
    visible: input.visible !== false,
    locked: input.locked === true,
    opacity: clamp(toNumber(input.opacity, 1), 0, 1),
    rotation: clamp(toNumber(input.rotation, 0), -360, 360),
    radius: clamp(toInt(input.radius, 0), 0, 500),
    borderWidth: clamp(toInt(input.borderWidth, 0), 0, 80),
    borderColor: String(input.borderColor || "#ffffff").trim() || "#ffffff",
    shadow: false,
    keepAspect: input.keepAspect === true,
    filter: "none",
    group: String(input.group || "").trim(),
    fit: "fill",
    crop: safeCrop,
    muted: true,
    loop: false,
    autoplay: false,
  };
}

function normalizeSourceSize(value, fallback, cropStart = 0, cropEnd = 0) {
  const minimum = Math.max(20, cropStart + cropEnd + 5);
  const raw = toInt(value, fallback);
  if (raw > MAX_SOURCE_SIZE) {
    return clamp(Math.max(fallback, minimum), minimum, MAX_SOURCE_SIZE);
  }
  return clamp(raw, minimum, MAX_SOURCE_SIZE);
}

function isMediaSource(source) {
  const src = String(source || "").split("?")[0].split("#")[0].toLowerCase();
  return src.startsWith("omdb://")
    || src.startsWith("data:image/")
    || src.startsWith("data:video/")
    || /\.(gif|webm|png|jpe?g|avif|webp|bmp|svg|mp4|mov|m4v|ogg|ogv)$/.test(src);
}

function clampCropForSource(crop, sourceWidth, sourceHeight) {
  const minVisible = 5;
  const safeCrop = { ...crop };
  safeCrop.left = clamp(toInt(safeCrop.left, 0), 0, sourceWidth - minVisible);
  safeCrop.right = clamp(toInt(safeCrop.right, 0), 0, sourceWidth - minVisible);
  if (safeCrop.left + safeCrop.right > sourceWidth - minVisible) {
    safeCrop.right = Math.max(0, sourceWidth - minVisible - safeCrop.left);
  }
  safeCrop.top = clamp(toInt(safeCrop.top, 0), 0, sourceHeight - minVisible);
  safeCrop.bottom = clamp(toInt(safeCrop.bottom, 0), 0, sourceHeight - minVisible);
  if (safeCrop.top + safeCrop.bottom > sourceHeight - minVisible) {
    safeCrop.bottom = Math.max(0, sourceHeight - minVisible - safeCrop.top);
  }
  return safeCrop;
}

function normalizeCrop(crop = {}) {
  return {
    top: Math.max(0, toInt(crop.top, 0)),
    right: Math.max(0, toInt(crop.right, 0)),
    bottom: Math.max(0, toInt(crop.bottom, 0)),
    left: Math.max(0, toInt(crop.left, 0)),
  };
}

function migrateLegacyState(input) {
  const state = createDefaultState();
  if (!input || typeof input !== "object") return state;

  state.layout = input.layout === "portrait" ? "vertical" : "horizontal";
  const legacyLayouts = {
    landscape: "horizontal",
    portrait: "vertical",
  };
  const usedSceneIds = new Set(state.scenes.map((scene) => scene.id));

  for (const [legacyLayout, layout] of Object.entries(legacyLayouts)) {
    const branch = input.scenes?.[legacyLayout];
    if (!branch || typeof branch !== "object") continue;
    const sceneNames = Array.isArray(branch.sceneList) ? branch.sceneList : Object.keys(branch.sceneData || {});

    for (const legacyName of sceneNames) {
      const overlays = Array.isArray(branch.sceneData?.[legacyName]) ? branch.sceneData[legacyName] : [];
      const sceneId = legacyName === "Cena 1" ? "gameplay" : ensureMigratedScene(state, legacyName, usedSceneIds);
      const scene = state.scenes.find((item) => item.id === sceneId);
      if (!scene) continue;
      scene.overlays[layout] = overlays.map((overlay) => normalizeOverlay({ ...overlay, type: "iframe", src: overlay.url })).filter(Boolean);
      scene.overlays[layout].forEach((overlay, index) => {
        overlay.z = (index + 1) * 10;
      });
    }

    if (typeof branch.currentScene === "string") {
      state.currentSceneId = branch.currentScene === "Cena 1" ? "gameplay" : slugify(branch.currentScene);
    }
  }

  return state;
}

function ensureMigratedScene(state, name, usedSceneIds) {
  const existing = state.scenes.find((scene) => scene.name === name || scene.id === slugify(name));
  if (existing) return existing.id;
  const id = uniqueId(name, usedSceneIds);
  state.scenes.push({
    id,
    name: String(name || "Scene"),
    overlays: {
      horizontal: [],
      vertical: [],
    },
  });
  return id;
}

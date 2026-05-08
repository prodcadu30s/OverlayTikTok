export const STORAGE_KEY = "overlay_manager_v2";
export const LEGACY_STORAGE_KEY = "overlay_manager_v1";
export const CURRENT_VERSION = 2;

export const LAYOUTS = {
  horizontal: { id: "horizontal", label: "1920x1080", width: 1920, height: 1080 },
  vertical: { id: "vertical", label: "1080x1920", width: 1080, height: 1920 },
};

export const DEFAULT_SCENES = [
  { id: "gameplay", name: "Gameplay" },
  { id: "chatting", name: "Chatting" },
  { id: "starting-soon", name: "Starting Soon" },
  { id: "brb", name: "BRB" },
  { id: "ending", name: "Ending" },
];

export const ASSET_TYPES = ["iframe", "image", "video", "gif", "webm"];

export const LAYOUT_TEMPLATES = [
  {
    id: "vertical-gameplay",
    name: "TikTok gameplay",
    layout: "vertical",
    overlays: [
      { name: "Gameplay", type: "iframe", src: "about:blank", x: 54, y: 300, width: 972, height: 972, z: 10, radius: 22, borderWidth: 2, borderColor: "#32d0c4" },
      { name: "Chat", type: "iframe", src: "about:blank", x: 54, y: 1310, width: 972, height: 420, z: 20, radius: 18, borderWidth: 1, borderColor: "#8cc152" },
      { name: "Webcam", type: "image", src: "", x: 720, y: 84, width: 300, height: 170, z: 30, radius: 18, shadow: true },
    ],
  },
  {
    id: "horizontal-live",
    name: "Live horizontal",
    layout: "horizontal",
    overlays: [
      { name: "Gameplay", type: "iframe", src: "about:blank", x: 60, y: 60, width: 1320, height: 744, z: 10, radius: 12 },
      { name: "Chat", type: "iframe", src: "about:blank", x: 1420, y: 60, width: 440, height: 960, z: 20, radius: 12, borderWidth: 1, borderColor: "#32d0c4" },
      { name: "Webcam", type: "image", src: "", x: 60, y: 830, width: 420, height: 236, z: 30, radius: 14, shadow: true },
    ],
  },
  {
    id: "chat-sidebar",
    name: "Chat lateral",
    layout: "horizontal",
    overlays: [
      { name: "Conteudo", type: "iframe", src: "about:blank", x: 80, y: 80, width: 1200, height: 900, z: 10 },
      { name: "Chat", type: "iframe", src: "about:blank", x: 1320, y: 80, width: 520, height: 900, z: 20, radius: 10, borderWidth: 2, borderColor: "#8cc152" },
    ],
  },
  {
    id: "webcam-alerts",
    name: "Webcam + alertas",
    layout: "vertical",
    overlays: [
      { name: "Webcam", type: "image", src: "", x: 140, y: 160, width: 800, height: 450, z: 10, radius: 24, shadow: true },
      { name: "Alertas", type: "iframe", src: "about:blank", x: 90, y: 680, width: 900, height: 230, z: 20, radius: 16 },
      { name: "Chat", type: "iframe", src: "about:blank", x: 90, y: 960, width: 900, height: 740, z: 30, radius: 16 },
    ],
  },
];

export const PANEL_DEFAULTS = {
  scenes: { title: "Scenes", open: true, dock: "left" },
  layers: { title: "Layers", open: true, dock: "right" },
  inspector: { title: "Inspector", open: true, dock: "right" },
  properties: { title: "Properties", open: true, dock: "right" },
};

export const DEFAULT_EDITOR = {
  zoom: 0,
  gridSize: 20,
  showGrid: true,
  performanceMode: false,
  panels: PANEL_DEFAULTS,
};

import { ASSET_TYPES } from "./constants.js";

export function uid(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${random}_${Date.now().toString(36)}`;
}

export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

export function slugify(value) {
  return String(value || "scene")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "scene";
}

export function uniqueId(base, usedIds) {
  let id = slugify(base);
  let index = 2;
  while (usedIds.has(id)) {
    id = `${slugify(base)}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

export function inferAssetType(source = "", fallback = "iframe") {
  const src = String(source).split("?")[0].split("#")[0].toLowerCase();
  if (src.endsWith(".gif")) return "gif";
  if (src.endsWith(".webm")) return "webm";
  if (/\.(png|jpe?g|avif|webp|bmp|svg)$/.test(src)) return "image";
  if (/\.(mp4|mov|m4v|ogg|ogv)$/.test(src)) return "video";
  return ASSET_TYPES.includes(fallback) ? fallback : "iframe";
}

export function niceType(type) {
  const labels = {
    iframe: "Iframe",
    image: "Imagem",
    video: "Video",
    gif: "GIF",
    webm: "WEBM",
  };
  return labels[type] || "Asset";
}

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function rootUrl() {
  return new URL(".", window.location.href);
}

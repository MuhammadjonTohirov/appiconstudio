import { encodeRgbPng } from "./png.js";
import { createZip } from "./zip.js";

export const SOURCE_SIZE = 1024;
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const PLATFORMS = ["all", "ios", "mac"];

export function validateDimensions(width, height) {
  if (width !== SOURCE_SIZE || height !== SOURCE_SIZE) {
    throw new Error(
      `Your image is ${width} × ${height} px. Please choose a 1024 × 1024 image.`,
    );
  }
}

/** The universal iOS image serves modern Xcode; explicit slots cover older
 * catalogs and make every iPhone/iPad size available. No appearance is invented.
 */
export function iconEntries(platform) {
  if (!PLATFORMS.includes(platform))
    throw new Error("Choose iOS, macOS, or both.");
  const entries = [];
  if (platform !== "mac") {
    entries.push({
      filename: "icon-ios-1024.png",
      idiom: "universal",
      platform: "ios",
      size: "1024x1024",
    });
    const slots = {
      iphone: [
        [20, [2, 3]],
        [29, [1, 2, 3]],
        [40, [2, 3]],
        [60, [2, 3]],
      ],
      ipad: [
        [20, [1, 2]],
        [29, [1, 2]],
        [40, [1, 2]],
        [76, [1, 2]],
        [83.5, [2]],
      ],
    };
    for (const [idiom, sizes] of Object.entries(slots)) {
      for (const [size, scales] of sizes) {
        for (const scale of scales)
          entries.push({
            filename: `icon-${idiom}-${size}@${scale}x.png`,
            idiom,
            size: `${size}x${size}`,
            scale: `${scale}x`,
          });
      }
    }
    entries.push({
      filename: "icon-ios-1024.png",
      idiom: "ios-marketing",
      size: "1024x1024",
      scale: "1x",
    });
  }
  if (platform !== "ios") {
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2])
        entries.push({
          filename: `icon-mac-${size}@${scale}x.png`,
          idiom: "mac",
          size: `${size}x${size}`,
          scale: `${scale}x`,
        });
    }
  }
  return entries;
}

export function pixelSize(entry) {
  return (
    Number(entry.size.split("x")[0]) *
    Number((entry.scale || "1x").slice(0, -1))
  );
}

/** Reuse the same drawing for previews and downloads. */
export function drawIcon(
  canvas,
  image,
  { background, roundedMac },
  mac = false,
) {
  const size = canvas.width;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Your browser could not create an image canvas.");
  context.clearRect(0, 0, size, size);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const inset = mac && roundedMac ? (size * 100) / 1024 : 0;
  const edge = size - inset * 2;
  if (mac && roundedMac) {
    context.beginPath();
    context.roundRect(inset, inset, edge, edge, (size * 188) / 1024);
    context.clip();
  }
  context.fillStyle = background;
  context.fillRect(inset, inset, edge, edge);
  context.drawImage(image, inset, inset, edge, edge);
  context.restore();
}

async function canvasPng(canvas) {
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob)
    throw new Error("The browser could not encode an icon. Please try again.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportIconset(image, options, onProgress = () => {}) {
  validateDimensions(image.width, image.height);
  const entries = iconEntries(options.platform);
  const files = [];
  const names = new Set();
  const cache = new Map();
  for (const [index, entry] of entries.entries()) {
    if (names.has(entry.filename)) continue;
    const pixels = pixelSize(entry);
    const mac = entry.idiom === "mac";
    const key = `${mac ? "mac" : "ios"}:${pixels}`;
    let bytes = cache.get(key);
    if (!bytes) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = pixels;
      drawIcon(canvas, image, options, mac);
      bytes = mac
        ? await canvasPng(canvas)
        : await encodeRgbPng(
            canvas.getContext("2d").getImageData(0, 0, pixels, pixels),
          );
      cache.set(key, bytes);
    }
    files.push({ name: `AppIcon.appiconset/${entry.filename}`, data: bytes });
    names.add(entry.filename);
    onProgress(index + 1, entries.length);
    // Yield between sizes so status updates paint, including on slower devices.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const manifest = { images: entries, info: { author: "xcode", version: 1 } };
  files.push({
    name: "AppIcon.appiconset/Contents.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n"),
  });
  return new Blob([createZip(files)], { type: "application/zip" });
}

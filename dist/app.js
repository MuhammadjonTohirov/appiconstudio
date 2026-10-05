import {
  MAX_FILE_SIZE,
  PLATFORMS,
  validateDimensions,
  iconEntries,
  drawIcon,
  exportIconset,
} from "./lib/iconset.js";
import { registerTools } from "./lib/webmcp.js";

const byId = (id) => document.getElementById(id);
const fileInput = byId("file-input");
const dropzone = byId("dropzone");
const download = byId("download");
const platformInputs = [...document.querySelectorAll('[name="platform"]')];
const background = byId("background");
const roundedMac = byId("mac-rounded");
const previewPlatform = byId("preview-platform");
const status = byId("status-message");
const error = byId("error-message");
const state = {
  image: null,
  sourceUrl: null,
  filename: null,
  busy: false,
  loading: false,
  selection: 0,
};

function options() {
  return {
    platform: platformInputs.find((input) => input.checked).value,
    background: background.value,
    roundedMac: roundedMac.checked,
  };
}

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
}

function setBusy(busy) {
  state.busy = busy;
  document.body.classList.toggle("busy", busy);
  download.setAttribute("aria-busy", String(busy));
  for (const control of [
    fileInput,
    dropzone,
    byId("remove-file"),
    background,
    previewPlatform,
    ...platformInputs,
  ])
    control.disabled = busy;
  roundedMac.disabled = busy || options().platform === "ios";
  download.disabled = busy || state.loading || !state.image;
}

function render() {
  const config = options();
  const entries = iconEntries(config.platform);
  const description = {
    all: "iPhone, iPad & Mac",
    ios: "iPhone & iPad",
    mac: "Mac",
  }[config.platform];
  byId("export-meta").textContent =
    `${entries.length} icon slots · ${description}`;
  byId("background-value").textContent = config.background.toUpperCase();
  roundedMac.disabled = state.busy || config.platform === "ios";
  download.disabled = state.busy || state.loading || !state.image;
  byId("preview-state").hidden = Boolean(state.image);
  previewPlatform.hidden = !state.image;
  for (const option of previewPlatform.options)
    option.disabled =
      config.platform !== "all" && option.value !== config.platform;
  if (config.platform !== "all") previewPlatform.value = config.platform;
  const mac = previewPlatform.value === "mac";
  const hero = byId("hero-canvas");
  hero.parentElement.classList.toggle("has-image", Boolean(state.image));
  hero.parentElement.classList.toggle("mac-shape", mac && config.roundedMac);
  byId("placeholder-mark").hidden = Boolean(state.image);
  byId("preview-caption").textContent = state.image
    ? mac
      ? "macOS · Dock preview"
      : "iOS · Home Screen preview"
    : "Your next app starts here.";
  const canvases = [hero, ...document.querySelectorAll(".mini-icon")];
  for (const [index, canvas] of canvases.entries()) {
    if (index > 0) {
      const points = mac
        ? [128, 64, 32, 16][index - 1]
        : [60, 40, 29, 20][index - 1];
      canvas.width = canvas.height = mac ? points : points * 2;
      canvas.parentElement.nextElementSibling.textContent = `${points} ${mac ? "px" : "pt"}`;
      canvas.classList.toggle(
        "mac-shape",
        mac && config.roundedMac && Boolean(state.image),
      );
    }
    if (state.image) drawIcon(canvas, state.image, config, mac);
    else canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function selectFile(file) {
  if (!file || state.busy) return;
  const selection = ++state.selection;
  state.loading = true;
  render();
  showError("");
  status.textContent = "Checking your image…";
  let image;
  try {
    if (file.size > MAX_FILE_SIZE)
      throw new Error("Choose an image smaller than 20 MB.");
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (
      file.type
        ? !allowed.includes(file.type)
        : !/\.(png|jpe?g|webp)$/i.test(file.name)
    )
      throw new Error("Choose a PNG, JPG, or WebP image.");
    try {
      image = await createImageBitmap(file);
    } catch {
      throw new Error(
        "This image could not be opened. Please try another PNG, JPG, or WebP file.",
      );
    }
    validateDimensions(image.width, image.height);
    if (selection !== state.selection) {
      image.close();
      return;
    }
    state.image?.close();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.image = image;
    state.filename = file.name;
    state.sourceUrl = URL.createObjectURL(file);
    byId("file-thumbnail").src = state.sourceUrl;
    byId("file-name").textContent = file.name;
    byId("file-meta").textContent =
      `1024 × 1024 px · ${(file.size / 1024).toFixed(0)} KB`;
    byId("selected-file").hidden = false;
    dropzone.classList.add("has-image");
    dropzone.querySelector(".drop-title").textContent = "Drop a different logo";
    status.textContent =
      "Ready when you are. Your image stays in this browser.";
  } catch (failure) {
    image?.close();
    if (selection !== state.selection) return;
    showError(failure.message);
    status.textContent = state.image
      ? "Your previous logo is still ready to export."
      : "Add a 1024 × 1024 logo to get started.";
  } finally {
    if (selection === state.selection) {
      state.loading = false;
      render();
    }
  }
}

function clearFile() {
  if (state.busy) return;
  state.selection++;
  state.loading = false;
  state.image?.close();
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.image = state.sourceUrl = state.filename = null;
  fileInput.value = "";
  byId("file-thumbnail").removeAttribute("src");
  byId("selected-file").hidden = true;
  dropzone.classList.remove("has-image");
  dropzone.querySelector(".drop-title").textContent = "Drop your logo here";
  status.textContent = "Add your logo to get started.";
  showError("");
  render();
  dropzone.focus();
}

async function downloadIcons() {
  if (!state.image || state.busy || state.loading) return;
  setBusy(true);
  showError("");
  byId("download-label").textContent = "Making your icons…";
  try {
    const archive = await exportIconset(
      state.image,
      options(),
      (current, total) => {
        status.textContent = `Preparing icon ${current} of ${total}…`;
      },
    );
    const url = URL.createObjectURL(archive);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "AppIcon.appiconset.zip";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent =
      "Ready! Unzip and drag AppIcon.appiconset into your Xcode asset catalog.";
  } catch (failure) {
    showError(`Could not create the icon set. ${failure.message}`);
    status.textContent =
      "Your logo is still here. You can try the download again.";
  } finally {
    byId("download-label").textContent = "Download icon set";
    setBusy(false);
  }
}

dropzone.addEventListener("click", () => {
  fileInput.value = "";
  fileInput.click();
});
fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
byId("remove-file").addEventListener("click", clearFile);
download.addEventListener("click", downloadIcons);
for (const event of ["dragenter", "dragover"])
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    if (!state.busy) dropzone.classList.add("dragging");
  });
dropzone.addEventListener("dragleave", (e) => {
  if (!dropzone.contains(e.relatedTarget))
    dropzone.classList.remove("dragging");
});
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
  if (e.dataTransfer.files.length !== 1)
    showError("Choose one logo at a time.");
  else selectFile(e.dataTransfer.files[0]);
});
// Keep an accidental drop elsewhere from navigating away from the tool.
for (const event of ["dragover", "drop"])
  window.addEventListener(event, (e) => {
    if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
  });
for (const control of [...platformInputs, roundedMac, previewPlatform])
  control.addEventListener("change", render);
background.addEventListener("input", render);

function configureExport(input) {
  if (state.busy) throw new Error("Wait for the current export to finish.");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Options must be an object.");
  if (
    Object.keys(input).some(
      (key) => !["platform", "background", "roundedMac"].includes(key),
    )
  )
    throw new Error("Unknown export option.");
  if ("platform" in input && !PLATFORMS.includes(input.platform))
    throw new Error("Invalid platform.");
  if ("background" in input && !/^#[\da-f]{6}$/i.test(input.background))
    throw new Error("Background must be a six-digit hex color.");
  if ("roundedMac" in input && typeof input.roundedMac !== "boolean")
    throw new Error("roundedMac must be a boolean.");
  if ("platform" in input)
    platformInputs.find((control) => control.value === input.platform).checked =
      true;
  if ("background" in input) background.value = input.background;
  if ("roundedMac" in input) roundedMac.checked = input.roundedMac;
  render();
  return exportStatus();
}

function exportStatus() {
  return {
    ready: Boolean(state.image) && !state.loading && !state.busy,
    busy: state.busy,
    options: options(),
    slots: iconEntries(options().platform).length,
  };
}

render();
registerTools({ exportStatus, configureExport });

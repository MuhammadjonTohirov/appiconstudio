import { crc32, concatenate } from "./binary.js";

function chunk(type, data) {
  const name = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(name, 4);
  result.set(data, 8);
  view.setUint32(
    result.length - 4,
    crc32(result.subarray(4, result.length - 4)),
  );
  return result;
}

/** Encode RGB PNG explicitly: canvas.toBlob can keep an alpha channel even when
 * every pixel is opaque. Apple's default iOS/App Store icon must have no alpha.
 * The caller must composite transparency over the selected background first.
 */
export async function encodeRgbPng({ width, height, data }) {
  const stride = width * 3 + 1;
  const scanlines = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    // PNG Sub filter improves compression without another image library.
    scanlines[row] = 1;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      if (data[source + 3] !== 255)
        throw new Error("The iOS image must be flattened before export.");
      for (let channel = 0; channel < 3; channel++) {
        const previous = x ? data[source - 4 + channel] : 0;
        scanlines[row + 1 + x * 3 + channel] =
          (data[source + channel] - previous + 256) & 255;
      }
    }
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([scanlines])
        .stream()
        .pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // Eight bits per color channel.
  header[9] = 2; // Truecolor RGB, without alpha.
  return concatenate([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", header),
    chunk("sRGB", Uint8Array.of(0)),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array()),
  ]);
}

import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { crc32 } from "../dist/lib/binary.js";
import { createZip } from "../dist/lib/zip.js";
import { encodeRgbPng } from "../dist/lib/png.js";

test("CRC-32 matches the published standard test vector", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("PNG has true RGB pixels, valid checksums, and lossless Sub-filtered rows", async () => {
  const pixels = Uint8ClampedArray.of(
    255,
    0,
    0,
    255,
    0,
    255,
    80,
    255,
    11,
    22,
    33,
    255,
    100,
    180,
    240,
    255,
  );
  const png = await encodeRgbPng({ width: 2, height: 2, data: pixels });
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer);
  const chunks = {};
  for (let offset = 8; offset < png.length;) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    assert.equal(
      view.getUint32(offset + 8 + length),
      crc32(png.subarray(offset + 4, offset + 8 + length)),
    );
    chunks[type] = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
  }
  assert.equal(chunks.IHDR[9], 2, "RGB without alpha");
  assert.deepEqual(Object.keys(chunks), ["IHDR", "sRGB", "IDAT", "IEND"]);
  const decoded = inflateSync(chunks.IDAT);
  const rgb = [];
  for (let row = 0; row < 2; row++) {
    assert.equal(decoded[row * 7], 1);
    for (let channel = 0; channel < 6; channel++) {
      const left = channel >= 3 ? rgb[row * 6 + channel - 3] : 0;
      rgb.push((decoded[row * 7 + 1 + channel] + left) & 255);
    }
  }
  assert.deepEqual(rgb, [255, 0, 0, 0, 255, 80, 11, 22, 33, 100, 180, 240]);
  await assert.rejects(
    () =>
      encodeRgbPng({
        width: 1,
        height: 1,
        data: Uint8ClampedArray.of(1, 2, 3, 0),
      }),
    /flattened/,
  );
});

test("ZIP directory points to readable local entries, with repeatable bytes", () => {
  const encoder = new TextEncoder();
  const files = [
    {
      name: "AppIcon.appiconset/Contents.json",
      data: encoder.encode('{"info":{"version":1}}'),
    },
    { name: "AppIcon.appiconset/icon.png", data: Uint8Array.of(1, 2, 3, 4) },
  ];
  const archive = createZip(files);
  assert.deepEqual(createZip(files), archive);
  const view = new DataView(archive.buffer);
  const end = archive.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), files.length);
  let offset = view.getUint32(end + 16, true);
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    const filenameLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(
      archive.subarray(offset + 46, offset + 46 + filenameLength),
    );
    assert.equal(name, file.name);
    const localOffset = view.getUint32(offset + 42, true);
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);
    assert.equal(
      view.getUint16(localOffset + 8, true),
      0,
      "Stored compression",
    );
    const size = view.getUint32(localOffset + 18, true);
    const dataStart = localOffset + 30 + filenameLength;
    assert.deepEqual(archive.subarray(dataStart, dataStart + size), file.data);
    assert.equal(view.getUint32(localOffset + 14, true), crc32(file.data));
    offset += 46 + filenameLength;
  }
  assert.equal(offset, end);
});

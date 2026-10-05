import test from "node:test";
import assert from "node:assert/strict";
import {
  iconEntries,
  pixelSize,
  validateDimensions,
} from "../dist/lib/iconset.js";

test("each export contains complete, distinct platform slots", () => {
  assert.equal(iconEntries("all").length, 30);
  assert.equal(iconEntries("ios").length, 20);
  assert.equal(iconEntries("mac").length, 10);
  for (const platform of ["all", "ios", "mac"]) {
    const entries = iconEntries(platform);
    const slots = entries.map(({ filename, ...slot }) => JSON.stringify(slot));
    assert.equal(new Set(slots).size, slots.length);
    assert.ok(entries.every((entry) => Number.isInteger(pixelSize(entry))));
    assert.ok(entries.every((entry) => pixelSize(entry) <= 1024));
  }
  assert.ok(iconEntries("ios").every((entry) => entry.idiom !== "mac"));
  assert.ok(iconEntries("mac").every((entry) => entry.idiom === "mac"));
  const ipadPro = iconEntries("all").find(
    (entry) => entry.size === "83.5x83.5",
  );
  assert.equal(pixelSize(ipadPro), 167);
  assert.throws(() => iconEntries("android"), /Choose iOS/);
});

test("only a 1024 square source is accepted; wrong shapes are not stretched", () => {
  assert.doesNotThrow(() => validateDimensions(1024, 1024));
  for (const [width, height] of [
    [512, 512],
    [2048, 2048],
    [1024, 512],
    [0, 0],
  ]) {
    assert.throws(() => validateDimensions(width, height), /1024 × 1024/);
  }
});

import { crc32, concatenate } from "./binary.js";

/** Create a standards-compliant ZIP with stored entries. PNGs are already compressed.
 * Fixed timestamps make repeated exports byte-for-byte reproducible.
 */
export function createZip(files) {
  const localParts = [];
  const directory = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const { name, data } of files) {
    const filename = encoder.encode(name);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + filename.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x800, true); // UTF-8 filenames.
    header.setUint16(12, 33, true); // 1980-01-01.
    header.setUint32(14, checksum, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, filename.length, true);
    local.set(filename, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + filename.length);
    const entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x800, true);
    entry.setUint16(14, 33, true);
    entry.setUint32(16, checksum, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, filename.length, true);
    entry.setUint32(42, offset, true);
    central.set(filename, 46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const central = concatenate(directory);
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, files.length, true);
  footer.setUint16(10, files.length, true);
  footer.setUint32(12, central.length, true);
  footer.setUint32(16, offset, true);
  return concatenate([...localParts, central, end]);
}

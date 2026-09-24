/**
 * Just enough ZIP to read one named entry.
 *
 * 1Password's native export (.1pux) and Proton Pass's are ZIP archives holding a
 * JSON document. Pulling in a zip library for that would be the only runtime
 * dependency this package has beyond commander, so the central directory is read
 * here instead: node's zlib already does the decompression, and the container
 * format is a few dozen lines of offsets.
 *
 * Deliberately not a general ZIP implementation. No encryption, no multi-disk,
 * no ZIP64, and only the two compression methods an export actually uses.
 */
import { inflateRawSync } from "node:zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

export function looksLikeZip(buf: Buffer): boolean {
  return buf.length > 4 && buf.readUInt32LE(0) === SIG_LOCAL;
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Find the end-of-central-directory record.
 *
 * It sits at the end of the file, after a comment of up to 64KB, so it is found
 * by scanning backwards for its signature rather than by a fixed offset.
 */
function findEocd(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): CentralEntry[] {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("Not a ZIP archive: no end-of-central-directory record");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: CentralEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new Error("Corrupt ZIP central directory");
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** Every entry name in the archive, for diagnostics. */
export function zipEntryNames(buf: Buffer): string[] {
  return readCentralDirectory(buf).map((e) => e.name);
}

/**
 * Read one entry by name, or null if the archive has no such entry.
 *
 * The local header repeats the name and extra-field lengths, and its extra field
 * can differ in length from the central one, so the data offset is computed from
 * the local header rather than assumed.
 */
export function readZipEntry(buf: Buffer, name: string): Buffer | null {
  const entry = readCentralDirectory(buf).find((e) => e.name === name);
  if (!entry) return null;

  const lh = entry.localHeaderOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== SIG_LOCAL) {
    throw new Error(`Corrupt ZIP local header for ${name}`);
  }
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  const data = buf.subarray(start, end);

  if (entry.method === STORED) return Buffer.from(data);
  if (entry.method === DEFLATED) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${name}`);
}

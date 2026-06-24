// Minimal CBOR (RFC 8949) codec — the subset needed for COSE_Sign1 receipts:
// unsigned/negative ints, byte strings, text strings, arrays, maps, tags, and
// the simple values null/true/false. Maps decode to JS Map so integer header
// labels (COSE alg=1, kid=4) round-trip without key-coercion.
//
// This is intentionally small and fixture-driven; it is NOT a general-purpose
// CBOR implementation (no floats, no indefinite-length items, no bignums).

export class CborTag {
  constructor(public readonly tag: number, public readonly value: CborValue) {}
}

export type CborValue =
  | number
  | bigint
  | boolean
  | null
  | Uint8Array
  | string
  | CborValue[]
  | Map<CborValue, CborValue>
  | CborTag;

export function encodeCbor(value: CborValue): Uint8Array {
  const out: number[] = [];
  writeValue(out, value);
  return Uint8Array.from(out);
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = { bytes, pos: 0 };
  const value = readValue(reader);
  if (reader.pos !== bytes.length) throw new Error('cbor: trailing bytes');
  return value;
}

function writeHead(out: number[], major: number, n: number | bigint): void {
  const mt = major << 5;
  const big = BigInt(n);
  if (big < 24n) out.push(mt | Number(big));
  else if (big < 0x100n) out.push(mt | 24, Number(big));
  else if (big < 0x10000n) out.push(mt | 25, Number(big >> 8n) & 0xff, Number(big) & 0xff);
  else if (big < 0x100000000n) {
    out.push(mt | 26, Number(big >> 24n) & 0xff, Number(big >> 16n) & 0xff, Number(big >> 8n) & 0xff, Number(big) & 0xff);
  } else {
    out.push(mt | 27);
    for (let shift = 56n; shift >= 0n; shift -= 8n) out.push(Number((big >> shift) & 0xffn));
  }
}

function writeValue(out: number[], value: CborValue): void {
  if (value === null) { out.push(0xf6); return; }
  if (value === false) { out.push(0xf4); return; }
  if (value === true) { out.push(0xf5); return; }
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (value < 0) writeHead(out, 1, -BigInt(value) - 1n);
    else writeHead(out, 0, value);
    return;
  }
  if (value instanceof Uint8Array) {
    writeHead(out, 2, value.length);
    for (const b of value) out.push(b);
    return;
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    writeHead(out, 3, bytes.length);
    for (const b of bytes) out.push(b);
    return;
  }
  if (Array.isArray(value)) {
    writeHead(out, 4, value.length);
    for (const item of value) writeValue(out, item);
    return;
  }
  if (value instanceof Map) {
    writeHead(out, 5, value.size);
    for (const [k, v] of value) { writeValue(out, k); writeValue(out, v); }
    return;
  }
  if (value instanceof CborTag) {
    writeHead(out, 6, value.tag);
    writeValue(out, value.value);
    return;
  }
  throw new Error('cbor: unsupported value');
}

interface Reader { bytes: Uint8Array; pos: number; }

function readArg(r: Reader, info: number): number {
  if (info < 24) return info;
  if (info === 24) return r.bytes[r.pos++];
  if (info === 25) { const v = (r.bytes[r.pos] << 8) | r.bytes[r.pos + 1]; r.pos += 2; return v; }
  if (info === 26) {
    const v = (r.bytes[r.pos] * 0x1000000) + (r.bytes[r.pos + 1] << 16) + (r.bytes[r.pos + 2] << 8) + r.bytes[r.pos + 3];
    r.pos += 4;
    return v;
  }
  if (info === 27) {
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.bytes[r.pos++]);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: integer too large');
    return Number(v);
  }
  throw new Error(`cbor: bad additional info ${info}`);
}

function readValue(r: Reader): CborValue {
  const initial = r.bytes[r.pos++];
  const major = initial >> 5;
  const info = initial & 0x1f;
  switch (major) {
    case 0: return readArg(r, info);
    case 1: return -1 - readArg(r, info);
    case 2: { const len = readArg(r, info); const v = r.bytes.slice(r.pos, r.pos + len); r.pos += len; return v; }
    case 3: { const len = readArg(r, info); const v = new TextDecoder().decode(r.bytes.slice(r.pos, r.pos + len)); r.pos += len; return v; }
    case 4: { const len = readArg(r, info); const arr: CborValue[] = []; for (let i = 0; i < len; i++) arr.push(readValue(r)); return arr; }
    case 5: { const len = readArg(r, info); const map = new Map<CborValue, CborValue>(); for (let i = 0; i < len; i++) { const k = readValue(r); map.set(k, readValue(r)); } return map; }
    case 6: { const tag = readArg(r, info); return new CborTag(tag, readValue(r)); }
    case 7:
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      throw new Error(`cbor: unsupported simple value ${info}`);
    default:
      throw new Error(`cbor: unknown major type ${major}`);
  }
}

import { describe, expect, it } from 'vitest';
import { CborTag, decodeCbor, encodeCbor } from './cbor.js';

describe('cbor codec', () => {
  it('encodes known RFC 8949 vectors', () => {
    expect([...encodeCbor(0)]).toEqual([0x00]);
    expect([...encodeCbor(23)]).toEqual([0x17]);
    expect([...encodeCbor(24)]).toEqual([0x18, 0x18]);
    expect([...encodeCbor(1000)]).toEqual([0x19, 0x03, 0xe8]);
    expect([...encodeCbor(-1)]).toEqual([0x20]);
    expect([...encodeCbor(-7)]).toEqual([0x26]);
    expect([...encodeCbor('a')]).toEqual([0x61, 0x61]);
    expect([...encodeCbor(new Uint8Array([1, 2, 3]))]).toEqual([0x43, 0x01, 0x02, 0x03]);
    expect([...encodeCbor([1, 2, 3])]).toEqual([0x83, 0x01, 0x02, 0x03]);
  });

  it('round-trips ints, bytes, strings, arrays, maps, tags', () => {
    const value = new CborTag(18, [
      new Uint8Array([0xa1, 0x01, 0x26]),
      new Map<unknown, unknown>([
        [4, new Uint8Array([1, 2, 3, 4])],
        ['ans-proof', new Map<unknown, unknown>([['index', 1], ['size', 3], ['path', [new Uint8Array([9])]]])],
      ]),
      new Uint8Array([0xde, 0xad]),
      new Uint8Array(64).fill(7),
    ]);
    const decoded = decodeCbor(encodeCbor(value as never));
    expect(decoded).toEqual(value);
  });

  it('round-trips a large (4-byte and 8-byte) integer', () => {
    expect(decodeCbor(encodeCbor(70000))).toBe(70000);
    expect(decodeCbor(encodeCbor(5_000_000_000))).toBe(5_000_000_000);
  });
});

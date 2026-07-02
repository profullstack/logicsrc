import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from './bytes.js';

describe('fromHex', () => {
  it('decodes valid hex, with and without 0x prefix', () => {
    expect([...fromHex('00ff10')]).toEqual([0x00, 0xff, 0x10]);
    expect([...fromHex('0xdeadbeef')]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect([...fromHex('')]).toEqual([]);
  });

  it('round-trips with toHex', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
    expect([...fromHex(toHex(bytes))]).toEqual([...bytes]);
  });

  it('throws on odd-length input', () => {
    expect(() => fromHex('abc')).toThrow(/odd-length/);
  });

  it('throws on non-hex characters instead of silently decoding to 0', () => {
    // Previously parseInt('zz', 16) === NaN, which a Uint8Array stores as 0,
    // so fromHex('zzzz') silently returned [0, 0].
    expect(() => fromHex('zzzz')).toThrow(/invalid hex/);
    expect(() => fromHex('00gg')).toThrow(/invalid hex/);
    expect(() => fromHex('0xnothex')).toThrow(/invalid hex/);
  });
});

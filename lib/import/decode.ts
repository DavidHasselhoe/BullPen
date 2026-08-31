import type { DecodeResult } from './types';

/**
 * Decodes an uploaded file's raw bytes to text, sniffing encoding from the
 * BOM or, failing that, from null-byte distribution (BOM-less UTF-16, which
 * shows up in the wild). Never use `Buffer.toString('utf16le')` — it leaves
 * a stray U+FEFF in place; `TextDecoder` strips it correctly.
 */
export function decodeBytes(bytes: Uint8Array): DecodeResult {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // Guard against UTF-32LE (FF FE 00 00), a BOM prefix collision with UTF-16LE.
    if (bytes.length >= 4 && bytes[2] === 0x00 && bytes[3] === 0x00) {
      throw new Error('UTF-32 encoded files are not supported.');
    }
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', hadBom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', hadBom: true };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: stripBom(new TextDecoder('utf-8').decode(bytes)), encoding: 'utf-8', hadBom: true };
  }

  // No BOM. Scan for a BOM-less UTF-16 pattern: real files sometimes ship
  // without one. A high concentration of 0x00 bytes at one parity strongly
  // suggests every other byte is a UTF-16 high byte for Latin-range text.
  const sampleLen = Math.min(bytes.length, 4096);
  let nulAtEven = 0;
  let nulAtOdd = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0x00) {
      if (i % 2 === 0) nulAtEven++;
      else nulAtOdd++;
    }
  }
  const halfSample = sampleLen / 2;
  if (nulAtOdd > 0.2 * halfSample) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', hadBom: false };
  }
  if (nulAtEven > 0.2 * halfSample) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', hadBom: false };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: stripBom(text), encoding: 'utf-8', hadBom: false };
  } catch {
    // Not valid UTF-8. Windows-1252 is a superset of Latin-1 for the
    // printable range and covers the accented characters (é, ø, ü, ñ...)
    // and smart punctuation common in European broker exports.
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', hadBom: false };
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

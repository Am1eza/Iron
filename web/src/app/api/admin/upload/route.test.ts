// @vitest-environment node
/**
 * Unit coverage for the magic-byte sniffer — the actual security boundary of
 * the upload endpoint (a client can set `file.type`/the filename extension to
 * anything). Route-handler-level tests aren't this codebase's convention yet
 * (see leads.test.ts / idempotency.ts — coverage targets the extracted pure
 * logic, not `route.ts` itself).
 */
import { describe, it, expect } from 'vitest';
import { sniffImageExt } from './route';

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function webpHeader(): Buffer {
  const b = Buffer.alloc(12);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  return b;
}

describe('sniffImageExt', () => {
  it('recognizes a real JPEG by its magic bytes', () => {
    expect(sniffImageExt(JPEG_HEADER)).toBe('jpg');
  });

  it('recognizes a real PNG by its magic bytes', () => {
    expect(sniffImageExt(PNG_HEADER)).toBe('png');
  });

  it('recognizes a real WEBP by its RIFF/WEBP markers', () => {
    expect(sniffImageExt(webpHeader())).toBe('webp');
  });

  it('rejects an HTML payload disguised with a .jpg-shaped request', () => {
    expect(sniffImageExt(Buffer.from('<script>alert(1)</script>', 'utf8'))).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(sniffImageExt(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a PDF (%PDF magic) even though it is a common upload mistake', () => {
    expect(sniffImageExt(Buffer.from('%PDF-1.4', 'ascii'))).toBeNull();
  });
});

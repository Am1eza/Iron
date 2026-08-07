import { describe, it, expect, vi, afterEach } from 'vitest';
import { compressImageForUpload } from './compressImage';

// jsdom implements neither createImageBitmap nor a real 2D canvas backend,
// so every path this module can take is exercised by stubbing exactly the
// browser primitives it calls — not by decoding a real image.

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
    .fn()
    .mockResolvedValue({ width, height, close });
  return close;
}

function stubCanvas(ctx: object | null, blob: Blob | null) {
  const drawImage = vi.fn();
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(blob));
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx ? { drawImage, ...ctx } : null),
    toBlob,
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
  return { canvas, drawImage, toBlob };
}

function makeFile(name: string, sizeBytes: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe('compressImageForUpload', () => {
  it('returns a smaller WebP re-encode when the browser produces one', async () => {
    stubBitmap(4000, 3000);
    const smallerBlob = new Blob([new Uint8Array(1000)], { type: 'image/webp' });
    stubCanvas({}, smallerBlob);

    const original = makeFile('photo.jpg', 5000);
    const result = await compressImageForUpload(original);

    expect(result).not.toBe(original);
    expect(result.type).toBe('image/webp');
    expect(result.name).toBe('photo.webp');
    expect(result.size).toBe(1000);
  });

  it('caps the canvas at the max dimension, preserving aspect ratio', async () => {
    stubBitmap(4000, 2000); // 2:1
    const { canvas } = stubCanvas({}, new Blob([new Uint8Array(10)]));

    await compressImageForUpload(makeFile('wide.jpg', 5000));

    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(960);
  });

  it('falls back to the original file when the re-encode is not actually smaller', async () => {
    stubBitmap(100, 100);
    const biggerBlob = new Blob([new Uint8Array(9000)], { type: 'image/webp' });
    stubCanvas({}, biggerBlob);

    const original = makeFile('tiny.jpg', 1000);
    const result = await compressImageForUpload(original);

    expect(result).toBe(original);
  });

  it('falls back to the original file when canvas 2D context is unavailable', async () => {
    stubBitmap(800, 600);
    stubCanvas(null, null);

    const original = makeFile('photo.png', 2000, 'image/png');
    const result = await compressImageForUpload(original);

    expect(result).toBe(original);
  });

  it('falls back to the original file when toBlob yields nothing (encode failure)', async () => {
    stubBitmap(800, 600);
    stubCanvas({}, null);

    const original = makeFile('photo.png', 2000, 'image/png');
    const result = await compressImageForUpload(original);

    expect(result).toBe(original);
  });

  it('falls back to the original file when createImageBitmap throws (e.g. an undecodable source)', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error('decode error'));

    const original = makeFile('weird.jpg', 2000);
    const result = await compressImageForUpload(original);

    expect(result).toBe(original);
  });

  it('always closes the bitmap, even when the encode path fails', async () => {
    const close = stubBitmap(800, 600);
    stubCanvas(null, null);

    await compressImageForUpload(makeFile('photo.jpg', 2000));

    expect(close).toHaveBeenCalledTimes(1);
  });
});

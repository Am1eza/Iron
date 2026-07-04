import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withResilience, resetCircuitBreakers, CircuitOpenError } from './resilience';

describe('withResilience', () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withResilience('svc-a', fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a failing call and succeeds within the retry budget', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');
    const result = await withResilience('svc-b', fn, { retries: 2, baseDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(withResilience('svc-c', fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry when isRetryable rejects the error (e.g. a 4xx)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));
    await expect(
      withResilience('svc-d', fn, { retries: 3, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after the failure threshold and fails fast without calling fn', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    const opts = { retries: 0, baseDelayMs: 1, failureThreshold: 2, openMs: 10_000 };

    await expect(withResilience('svc-e', fn, opts)).rejects.toThrow('down');
    await expect(withResilience('svc-e', fn, opts)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(2);

    // Third call: circuit is now open — must fail fast, no network attempt.
    await expect(withResilience('svc-e', fn, opts)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(2); // unchanged — fn was never called again
  });

  it('closes the circuit again after openMs elapses', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn().mockRejectedValue(new Error('down'));
      const opts = { retries: 0, baseDelayMs: 1, failureThreshold: 1, openMs: 5_000 };

      await expect(withResilience('svc-f', fn, opts)).rejects.toThrow('down');
      await expect(withResilience('svc-f', fn, opts)).rejects.toBeInstanceOf(CircuitOpenError);

      vi.advanceTimersByTime(5_001);

      fn.mockResolvedValueOnce('back up');
      await expect(withResilience('svc-f', fn, opts)).resolves.toBe('back up');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a success resets consecutiveFailures so a later isolated failure does not open the circuit', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('blip again'));
    const opts = { retries: 0, baseDelayMs: 1, failureThreshold: 2, openMs: 10_000 };

    await expect(withResilience('svc-g', fn, opts)).rejects.toThrow('blip');
    await expect(withResilience('svc-g', fn, opts)).resolves.toBe('ok');
    // Only 1 consecutive failure again (not 2) — circuit should NOT be open.
    await expect(withResilience('svc-g', fn, opts)).rejects.toThrow('blip again');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

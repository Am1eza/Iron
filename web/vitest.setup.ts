import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Use the browser environment's storage, even when Node exposes its own
// global storage properties. Stores and components must share window storage.
const browserWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom
  ?.window;
if (browserWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      value: browserWindow[key],
      writable: true,
    });
  }
}

// Unmount React trees between tests to keep them isolated.
afterEach(() => cleanup());

// jsdom doesn't implement matchMedia — stub it for components that read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

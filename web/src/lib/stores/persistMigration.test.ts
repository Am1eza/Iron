import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The requests and profile stores declared a persist `version` for the FIRST
 * time. Every visitor with a saved request list or a chosen delivery city has
 * an UNVERSIONED (v0) payload sitting in localStorage right now, and zustand's
 * behaviour when the version moves and no `migrate` is supplied is to warn and
 * return undefined — i.e. silently wipe it.
 *
 * These tests exist for exactly one reason: to fail loudly if a future change
 * bumps a version without carrying the old payload forward. For the requests
 * store that data is a customer's own record of the پیش‌فاکتور they filed.
 *
 * Each test seeds a genuine v0 payload — the exact shape the shipped code
 * wrote — then imports the store fresh (so `persist` reads localStorage again
 * rather than reusing an already-hydrated module singleton) and rehydrates.
 */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function loadRequests() {
  return (await import('./requests')).useRequestsStore;
}
async function loadProfile() {
  return (await import('./profile')).useProfileStore;
}
async function loadCart() {
  return (await import('./cart')).useCartStore;
}
async function loadUi() {
  return (await import('./ui')).useUiStore;
}

const V0_REQUEST = {
  id: 'rq-1',
  ref: 'RQ-ABC123',
  type: 'proforma',
  title: 'میلگرد ۱۴ ذوب‌آهن',
  createdAt: '2026-07-01T00:00:00.000Z',
  status: 'submitted',
};

describe('requests store — an existing v0 payload survives the version bump', () => {
  it('keeps the saved request list', async () => {
    localStorage.setItem(
      'ahantime-requests',
      JSON.stringify({ state: { requests: [V0_REQUEST] }, version: 0 }),
    );
    const store = await loadRequests();
    await store.persist.rehydrate();
    expect(store.getState().requests).toHaveLength(1);
    expect(store.getState().requests[0]!.ref).toBe('RQ-ABC123');
    expect(store.getState().requests[0]!.title).toBe('میلگرد ۱۴ ذوب‌آهن');
  });

  it('degrades a corrupt v0 payload to an empty inbox, never to undefined', async () => {
    localStorage.setItem(
      'ahantime-requests',
      JSON.stringify({ state: { requests: 'not-an-array' }, version: 0 }),
    );
    const store = await loadRequests();
    await store.persist.rehydrate();
    // `requests: undefined` would throw on the first `.length` in the UI.
    expect(store.getState().requests).toEqual([]);
  });

  it('does not hydrate before it is asked to (skipHydration)', async () => {
    localStorage.setItem(
      'ahantime-requests',
      JSON.stringify({ state: { requests: [V0_REQUEST] }, version: 0 }),
    );
    const store = await loadRequests();
    // This is the render React hydrates against the server HTML: it must
    // match the server, which has no localStorage.
    expect(store.getState().requests).toEqual([]);
    expect(store.persist.hasHydrated()).toBe(false);
  });
});

describe('profile store — an existing v0 payload survives the version bump', () => {
  it('keeps the saved delivery city', async () => {
    localStorage.setItem(
      'ahantime-profile',
      JSON.stringify({ state: { warehouseCity: 'اصفهان' }, version: 0 }),
    );
    const store = await loadProfile();
    await store.persist.rehydrate();
    expect(store.getState().warehouseCity).toBe('اصفهان');
  });

  it('starts null on the hydrating render and only reads storage after', async () => {
    localStorage.setItem(
      'ahantime-profile',
      JSON.stringify({ state: { warehouseCity: 'اصفهان' }, version: 0 }),
    );
    const store = await loadProfile();
    expect(store.getState().warehouseCity).toBeNull();
    await store.persist.rehydrate();
    expect(store.getState().warehouseCity).toBe('اصفهان');
  });
});

/**
 * cart store — v1 (`items` only) → v2 (adds `lastUpdatedAt`, for
 * CartReminder). A visitor's already-committed request items must survive
 * the bump, same reasoning as the requests/profile stores above.
 */
describe('cart store — an existing v1 payload survives the version bump', () => {
  const V1_ITEM = { skuId: 'sku-1', name: 'میلگرد ۱۴ ذوب‌آهن', qty: 100, unit: 'kg', unitPrice: 42_000 };

  it('keeps the saved cart items', async () => {
    localStorage.setItem('ahantime-cart', JSON.stringify({ state: { items: [V1_ITEM] }, version: 1 }));
    const store = await loadCart();
    await store.persist.rehydrate();
    expect(store.getState().items).toEqual([V1_ITEM]);
  });

  it('backfills lastUpdatedAt for a non-empty migrated cart, rather than leaving it null (which would hide it from CartReminder forever)', async () => {
    localStorage.setItem('ahantime-cart', JSON.stringify({ state: { items: [V1_ITEM] }, version: 1 }));
    const store = await loadCart();
    await store.persist.rehydrate();
    expect(store.getState().lastUpdatedAt).not.toBeNull();
  });

  it('leaves lastUpdatedAt null for an empty migrated cart — nothing to remind anyone about', async () => {
    localStorage.setItem('ahantime-cart', JSON.stringify({ state: { items: [] }, version: 1 }));
    const store = await loadCart();
    await store.persist.rehydrate();
    expect(store.getState().lastUpdatedAt).toBeNull();
  });
});

/** ui store — v2 (dismissedClubPopupAt) → v3 (adds dismissedCartReminderAt). */
describe('ui store — an existing v2 payload survives the version bump', () => {
  it('keeps the existing club-popup dismissal and defaults the new field to null', async () => {
    localStorage.setItem(
      'ahantime-ui',
      JSON.stringify({ state: { theme: 'light', dismissedClubPopupAt: 1700000000000 }, version: 2 }),
    );
    const store = await loadUi();
    await store.persist.rehydrate();
    expect(store.getState().dismissedClubPopupAt).toBe(1700000000000);
    expect(store.getState().dismissedCartReminderAt).toBeNull();
  });
});

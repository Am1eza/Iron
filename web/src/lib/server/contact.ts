/**
 * Site contact info — admin-editable (settings key SITE_CONTACT) with the
 * hardcoded seo.ts CONTACT as fallback. Single read point so the footer,
 * contact card, proforma letterhead, legal pages and JSON-LD can never drift.
 */
import { getSetting } from '@/lib/server/repos/settingsRepo';
import { hasDb } from '@/lib/server/db/client';
import { CONTACT } from '@/lib/seo';

export interface SiteContact {
  address: string;
  phoneLandline: string;
  phoneMobile: string;
  email?: string;
}

export async function getContact(): Promise<SiteContact> {
  // No DB at build/prerender time (or mock mode) → static fallback, never throw.
  if (!hasDb()) return { ...CONTACT };
  try {
    return await getSetting<SiteContact>('SITE_CONTACT', { ...CONTACT });
  } catch {
    return { ...CONTACT };
  }
}

import { publicEnv } from '@/lib/validation/env';

export const API_MODE = publicEnv.NEXT_PUBLIC_API_MODE; // 'mock' | 'live'

/** Absolute on the server (fetch needs it), relative in the browser. */
export const BASE_URL = typeof window === 'undefined' ? publicEnv.NEXT_PUBLIC_SITE_URL : '';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_GET_RETRIES = 2;

'use client';
import { useAnnouncerStore } from '@/lib/stores/announcer';

/** Returns `announce(message, politeness?)` for screen-reader announcements. */
export function useAnnounce() {
  return useAnnouncerStore((s) => s.announce);
}

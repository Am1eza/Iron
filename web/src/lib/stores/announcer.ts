import { create } from 'zustand';

type Politeness = 'polite' | 'assertive';

type AnnouncerState = {
  polite: string;
  assertive: string;
  /** Announce a message to assistive tech via a live region. */
  announce: (message: string, politeness?: Politeness) => void;
};

/**
 * Global live-region store. The <Announcer/> renders the regions; `useAnnounce`
 * exposes `announce()`. Messages are re-set (with a zero-width toggle) so repeats
 * are still read. Use for route changes, async results, filter counts, etc.
 */
export const useAnnouncerStore = create<AnnouncerState>((set, get) => ({
  polite: '',
  assertive: '',
  announce: (message, politeness = 'polite') => {
    const key = politeness;
    // Force a change even if the text repeats, so SRs re-announce.
    const current = get()[key];
    const next = current === message ? `${message}​` : message;
    set({ [key]: next } as Partial<AnnouncerState>);
  },
}));

import { API_MODE } from '../config';
import { http } from '../http';
import { ApiError } from '../errors';

export const aiApi = {
  /** Streaming AI chat — returns the Response; the AI UI reads response.body.
   *  `conversationId` echoes the id the server announced in its
   *  {type:'conversation'} frame, keeping continuity across turns. */
  async chatStream(
    messages: unknown[],
    opts?: { conversationId?: string; signal?: AbortSignal },
  ): Promise<Response> {
    if (API_MODE === 'mock') {
      // The streaming UX + grounded tools are built in the AI section.
      throw new ApiError(501, 'دستیار هوشمند در بخش بعدی فعال می‌شود.');
    }
    return http.stream(
      '/api/ai/chat',
      { messages, ...(opts?.conversationId ? { conversationId: opts.conversationId } : {}) },
      { signal: opts?.signal },
    );
  },

  /**
   * The visitor edited the advisor's پیش‌فاکتور card — quantity, unit or
   * delivery city. Sends only WHAT (sku, qty, unit), never how much: the
   * server reprices through the same function `createLead` uses, so the card
   * the customer edits and the quote they are eventually issued cannot
   * disagree, and a tampered request can change the order but not the price.
   */
  async updateDraft(input: {
    draftId: string;
    items: Array<{ skuId: string; qty: number; unit: string }>;
    city?: string;
  }): Promise<{
    draftId: string;
    items: Array<{
      skuId: string;
      name: string;
      qty: number;
      unit: string;
      weightKg?: number;
      unitPrice?: number;
      lineTotal?: number;
    }>;
    totalWeightKg?: number;
    total?: number;
    allPriced?: boolean;
    city?: string;
    signedIn?: boolean;
  }> {
    if (API_MODE === 'mock') {
      throw new ApiError(501, 'دستیار هوشمند در بخش بعدی فعال می‌شود.');
    }
    return http.post('/api/ai/lead/draft', input);
  },

  /** «تأیید و ثبت درخواست» on the advisor's summary card — the ONLY path that
   *  turns an AI conversation into a real lead + پیش‌فاکتور + SMS. 401 means
   *  the visitor must sign in first; the draft stays valid meanwhile. */
  async confirmLead(draftId: string): Promise<{
    ref: string;
    proformaRef?: string;
    total?: number;
    validUntil?: string;
  }> {
    if (API_MODE === 'mock') {
      throw new ApiError(501, 'دستیار هوشمند در بخش بعدی فعال می‌شود.');
    }
    return http.post('/api/ai/lead/confirm', { draftId });
  },
};

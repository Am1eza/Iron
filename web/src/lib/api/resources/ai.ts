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

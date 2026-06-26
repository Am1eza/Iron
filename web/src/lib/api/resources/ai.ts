import { API_MODE } from '../config';
import { http } from '../http';
import { ApiError } from '../errors';

export const aiApi = {
  /** Streaming AI chat — returns the Response; the AI UI reads response.body. */
  async chatStream(messages: unknown[], opts?: { signal?: AbortSignal }): Promise<Response> {
    if (API_MODE === 'mock') {
      // The streaming UX + grounded tools are built in the AI section.
      throw new ApiError(501, 'دستیار هوشمند در بخش بعدی فعال می‌شود.');
    }
    return http.stream('/api/ai/chat', { messages }, { signal: opts?.signal });
  },
};

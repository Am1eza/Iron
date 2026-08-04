/**
 * Client-side persistence for the advisor chat so leaving the page (or a
 * reload) doesn't erase the conversation. The server already stores every turn
 * (ai_conversations/ai_messages); this keeps the CLIENT view — the visible
 * transcript + the conversationId used to continue the same server thread —
 * across navigation. localStorage (not a cookie) because the advisor is open
 * to anonymous visitors too, and the transcript never needs to reach the
 * server on its own.
 */
import type { Msg } from '@/components/ai/AdvisorChat';
import { safeLocalStorage, readJson, writeJson } from '@/lib/utils/safeStorage';

const KEY = 'ahantime-ai-chat-v1';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — stale threads are dropped

export interface StoredChat {
  messages: Msg[];
  conversationId?: string;
  transcript: { role: 'user' | 'ai'; text: string }[];
  savedAt: number;
}

export function loadChat(): StoredChat | null {
  const parsed = readJson<StoredChat | null>(KEY, null);
  if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
    if (parsed) safeLocalStorage.removeItem(KEY);
    return null;
  }
  if (!Array.isArray(parsed.messages)) return null;
  return parsed;
}

export function saveChat(chat: Omit<StoredChat, 'savedAt'>): void {
  // Never persist an empty thread (nothing to restore) — keeps the "new chat"
  // reset clean and avoids clobbering a real thread with a transient blank.
  if (chat.messages.length === 0) return;
  writeJson(KEY, { ...chat, savedAt: Date.now() } satisfies StoredChat);
}

export function clearChat(): void {
  safeLocalStorage.removeItem(KEY);
}

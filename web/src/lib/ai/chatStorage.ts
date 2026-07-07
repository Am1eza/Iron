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

const KEY = 'ahantime-ai-chat-v1';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — stale threads are dropped

export interface StoredChat {
  messages: Msg[];
  conversationId?: string;
  transcript: { role: 'user' | 'ai'; text: string }[];
  savedAt: number;
}

export function loadChat(): StoredChat | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveChat(chat: Omit<StoredChat, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    // Never persist an empty thread (nothing to restore) — keeps the "new chat"
    // reset clean and avoids clobbering a real thread with a transient blank.
    if (chat.messages.length === 0) return;
    const payload: StoredChat = { ...chat, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — persistence is best-effort */
  }
}

export function clearChat(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

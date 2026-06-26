import { create } from 'zustand';

export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  // grounded structured payloads (e.g. an estimate/BOM) attach here — never fabricated client-side
  data?: unknown;
};

type AiStatus = 'idle' | 'thinking' | 'streaming' | 'error';

type AiState = {
  sessionId: string | null;
  messages: ChatMessage[];
  status: AiStatus;
  suggestions: string[];
  setSessionId: (id: string) => void;
  pushMessage: (m: ChatMessage) => void;
  appendToLast: (chunk: string) => void; // streaming
  setStatus: (s: AiStatus) => void;
  setSuggestions: (s: string[]) => void;
  reset: () => void;
};

let msgSeq = 0;
export const newMessageId = () => `m${++msgSeq}`;

export const useAiStore = create<AiState>((set) => ({
  sessionId: null,
  messages: [],
  status: 'idle',
  suggestions: [],
  setSessionId: (sessionId) => set({ sessionId }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  appendToLast: (chunk) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (!last) return s;
      const updated = { ...last, content: last.content + chunk };
      return { messages: [...s.messages.slice(0, -1), updated] };
    }),
  setStatus: (status) => set({ status }),
  setSuggestions: (suggestions) => set({ suggestions }),
  reset: () => set({ messages: [], status: 'idle', suggestions: [], sessionId: null }),
}));

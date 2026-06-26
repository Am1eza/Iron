import { create } from 'zustand';

export type SessionUser = {
  id: string;
  mobile: string;
  name?: string;
  clubTier?: 'iron' | 'steel' | 'poolad';
};

type AuthState = {
  user: SessionUser | null;
  status: 'anonymous' | 'authenticated';
  setUser: (user: SessionUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'anonymous',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));

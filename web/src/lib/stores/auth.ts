import { create } from 'zustand';
import type { Role } from '@/lib/auth/types';

export type SessionUser = {
  id: string;
  mobile: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  clubTier?: 'iron' | 'steel' | 'poolad';
};

type AuthState = {
  user: SessionUser | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  setUser: (user: SessionUser | null) => void;
  setStatus: (status: AuthState['status']) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
  setStatus: (status) => set({ status }),
}));

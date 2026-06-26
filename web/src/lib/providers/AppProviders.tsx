'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query/queryClient';
import { StoreHydrator } from './StoreHydrator';
import { Toaster } from '@/components/feedback/Toaster';

/** Client provider tree — mounted once in the root layout. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <StoreHydrator />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

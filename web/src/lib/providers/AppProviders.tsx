'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query/queryClient';
import { StoreHydrator } from './StoreHydrator';
import { Toaster } from '@/components/feedback/Toaster';
import { Announcer } from '@/components/a11y/Announcer';
import { WebVitals } from '@/components/perf/WebVitals';
import { SmoothScroll } from '@/components/motion/SmoothScroll';

/** Client provider tree — mounted once in the root layout. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <StoreHydrator />
      {children}
      <Toaster />
      <Announcer />
      <WebVitals />
      <SmoothScroll />
    </QueryClientProvider>
  );
}

import { QueryClient } from '@tanstack/react-query';

/** Realtime events invalidate queries instantly; this interval is the fallback if the socket drops. */
export const FALLBACK_REFETCH_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchInterval: FALLBACK_REFETCH_MS, // pauses while the tab is hidden
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: { retry: 0 },
  },
});

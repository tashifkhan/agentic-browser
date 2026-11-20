import { QueryClient } from "@tanstack/react-query";

/**
 * Polling is opt-in per query (see query/hooks.ts) so idle screens stay quiet.
 * Data counts as fresh for 5s, which dedupes the burst of requests on mount.
 */
export function createDefaultQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true },
    },
  });
}

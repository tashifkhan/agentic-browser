import { keepPreviousData, queryOptions, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApi, type Api } from "../utils/http";
import { queryKeys } from "./keys";
import { useApi } from "./provider";
import type { BaseUrlResolver, DebugStatsResponse, IntegrationsStatus } from "../types/api";

const LIVE = 4_000; // data that changes while you watch (runs, stats)
const SLOW = 30_000;

/** queryOptions factories: usable with useQuery, prefetchQuery, or ensureQueryData. */
export function makeQueries(base: string, api: Api) {
  return {
    integrations: () => queryOptions({ queryKey: queryKeys.integrations(base), queryFn: api.integrationsStatus, refetchInterval: 8_000 }),
    stats: () => queryOptions({ queryKey: queryKeys.stats(base), queryFn: api.stats, refetchInterval: LIVE }),
    timeseries: (days = 30) => queryOptions({ queryKey: queryKeys.timeseries(base, days), queryFn: () => api.timeseries(days), refetchInterval: SLOW }),
    runs: (params: { status?: string; limit?: number; offset?: number } = {}) =>
      queryOptions({ queryKey: queryKeys.runs(base, params), queryFn: () => api.runs(params), refetchInterval: LIVE, placeholderData: keepPreviousData }),
    run: (id: string) =>
      queryOptions({
        queryKey: queryKeys.run(base, id),
        queryFn: () => api.run(id),
        refetchInterval: (q) => (q.state.data?.status === "running" ? 1_500 : false),
      }),
    runEvents: (id: string, live = false) =>
      queryOptions({ queryKey: queryKeys.runEvents(base, id), queryFn: () => api.runEvents(id), refetchInterval: live ? 1_500 : false }),
    memoryStats: () => queryOptions({ queryKey: queryKeys.memoryStats(base), queryFn: api.memoryStatsTyped, refetchInterval: SLOW }),
    claims: (params: { tier?: string; status?: string; limit?: number } = {}) =>
      queryOptions({ queryKey: queryKeys.claims(base, params), queryFn: () => api.claims(params), placeholderData: keepPreviousData }),
    maintenance: () => queryOptions({ queryKey: queryKeys.maintenance(base), queryFn: api.maintenance, refetchInterval: SLOW }),
    conversations: () => queryOptions({ queryKey: queryKeys.conversations(base), queryFn: api.conversations }),
    messages: (id: string) => queryOptions({ queryKey: queryKeys.messages(base, id), queryFn: () => api.conversationMessages(id) }),
    conversationRuns: (id: string) => queryOptions({ queryKey: queryKeys.conversationRuns(base, id), queryFn: () => api.conversationRuns(id) }),
  };
}

export type Queries = ReturnType<typeof makeQueries>;

/** The query factories bound to the current <ApiProvider>. */
export function useQueries(): Queries {
  const { baseUrl, api } = useApi();
  return useMemo(() => makeQueries(baseUrl, api), [baseUrl, api]);
}

export const useStats = () => useQuery(useQueries().stats());
export const useTimeseries = (days = 30) => useQuery(useQueries().timeseries(days));
export const useRuns = (params?: { status?: string; limit?: number; offset?: number }) => useQuery(useQueries().runs(params));
export const useRun = (id: string) => useQuery(useQueries().run(id));
export const useRunEvents = (id: string, live = false) => useQuery(useQueries().runEvents(id, live));
export const useMemoryStats = () => useQuery(useQueries().memoryStats());
export const useClaims = (params?: { tier?: string; status?: string; limit?: number }) => useQuery(useQueries().claims(params));
export const useMaintenance = () => useQuery(useQueries().maintenance());
export const useConversations = () => useQuery(useQueries().conversations());
export const useMessages = (id: string) => useQuery({ ...useQueries().messages(id), enabled: !!id });
export const useConversationRuns = (id: string) => useQuery({ ...useQueries().conversationRuns(id), enabled: !!id });
export const useIntegrations = () => useQuery(useQueries().integrations());

// ── older resolver-based hooks, kept so existing callers keep working ───────

type IntegrationsQueryOptions = Omit<UseQueryOptions<IntegrationsStatus, Error, IntegrationsStatus, readonly unknown[]>, "queryKey" | "queryFn">;
type DebugStatsQueryOptions = Omit<UseQueryOptions<DebugStatsResponse, Error, DebugStatsResponse, readonly unknown[]>, "queryKey" | "queryFn">;

export function useIntegrationsStatusQuery(resolveBaseUrl: BaseUrlResolver, options?: IntegrationsQueryOptions) {
  const baseUrl = resolveBaseUrl();
  const api = useMemo(() => createApi(() => baseUrl), [baseUrl]);
  return useQuery({ queryKey: queryKeys.integrations(baseUrl), queryFn: api.integrationsStatus, ...options });
}

export function useDebugStatsQuery(resolveBaseUrl: BaseUrlResolver, options?: DebugStatsQueryOptions) {
  const baseUrl = resolveBaseUrl();
  const api = useMemo(() => createApi(() => baseUrl), [baseUrl]);
  return useQuery({ queryKey: queryKeys.stats(baseUrl), queryFn: api.debugStats as () => Promise<DebugStatsResponse>, ...options });
}

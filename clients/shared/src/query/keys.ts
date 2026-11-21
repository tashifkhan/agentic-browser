/**
 * Query keys for every endpoint. The base URL is part of each key so a
 * client pointed at a different backend never reads another's cache.
 */
export const queryKeys = {
  all: (base: string) => ["ab", base] as const,
  integrations: (base: string) => ["ab", base, "integrations"] as const,
  mcp: (base: string) => ["ab", base, "mcp"] as const,
  stats: (base: string) => ["ab", base, "stats"] as const,
  timeseries: (base: string, days: number) => ["ab", base, "timeseries", days] as const,
  runs: (base: string, params: object = {}) => ["ab", base, "runs", params] as const,
  run: (base: string, id: string) => ["ab", base, "run", id] as const,
  runEvents: (base: string, id: string) => ["ab", base, "run", id, "events"] as const,
  memoryStats: (base: string) => ["ab", base, "memory", "stats"] as const,
  claims: (base: string, params: object = {}) => ["ab", base, "memory", "claims", params] as const,
  memoryGraph: (base: string, history: boolean) => ["ab", base, "memory", "graph", history] as const,
  compaction: (base: string) => ["ab", base, "compaction"] as const,
  models: (base: string) => ["ab", base, "models"] as const,
  maintenance: (base: string) => ["ab", base, "maintenance"] as const,
  conversations: (base: string) => ["ab", base, "conversations"] as const,
  messages: (base: string, id: string) => ["ab", base, "conversations", id, "messages"] as const,
  conversationRuns: (base: string, id: string) => ["ab", base, "conversations", id, "runs"] as const,
};

/** @deprecated kept for older call sites; prefer queryKeys */
export const sharedQueryKeys = {
  integrationsStatus: (baseUrl: string) => queryKeys.integrations(baseUrl),
  debugStats: (baseUrl: string) => queryKeys.stats(baseUrl),
};

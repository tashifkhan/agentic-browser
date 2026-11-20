import type {
  BaseUrlResolver,
  ChatMessage,
  Claim,
  Conversation,
  ConversationRun,
  MaintenanceRun,
  MemoryGraph,
  MemoryStats,
  Run,
  RunDetail,
  RunEvent,
  Stats,
  TimeseriesBucket,
  ToolCallRecord,
  ComposioToolkit,
  ComposioToolSummary,
  DebugStatsResponse,
  IntegrationsStatus,
  LLMEffective,
  VoiceConfigPublic,
} from "../types/api";

function withBase(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (!base) return path;
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail) {
      if (typeof data.detail === "string") return data.detail;
      if (typeof data.detail === "object") {
        return data.detail.message || data.detail.code || JSON.stringify(data.detail);
      }
    }
    return JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  }
}

export function createHttpClient(resolveBaseUrl: BaseUrlResolver) {
  const getUrl = (path: string) => withBase(resolveBaseUrl(), path);

  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(getUrl(path));
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    post: async <T>(path: string, body?: BodyInit | null, init?: RequestInit): Promise<T> => {
      const res = await fetch(getUrl(path), {
        method: "POST",
        body,
        ...init,
      });
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
    put: async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(getUrl(path), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
    del: async <T>(path: string): Promise<T> => {
      const res = await fetch(getUrl(path), { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
  };
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams(
    Object.entries(params ?? {}).flatMap(([key, value]) => (value == null || value === "" ? [] : [[key, String(value)]])),
  ).toString();
  return q ? `?${q}` : "";
}

/** One client for every backend endpoint the extension and the console use. */
export function createApi(resolveBaseUrl: BaseUrlResolver) {
  const { get, post, put, del } = createHttpClient(resolveBaseUrl);
  const json = (body: unknown) => ({ body: JSON.stringify(body), init: { headers: { "Content-Type": "application/json" } } });

  return {
    integrationsStatus: () => get<IntegrationsStatus>("/api/integrations/status"),
    oauthDisconnect: (provider: string) => del<{ status: string; provider: string }>(`/api/integrations/oauth/${provider}`),
    oauthClientSet: (provider: string, payload: { client_id?: string; client_secret?: string }) =>
      put<{ status: string; provider: string }>(`/api/integrations/oauth-clients/${provider}`, payload),
    oauthClientClear: (provider: string) => del<{ status: string; provider: string }>(`/api/integrations/oauth-clients/${provider}`),
    composioConnect: (toolkit: string) =>
      post<{ toolkit: string; redirect_url: string; connection_id?: string | null }>(`/api/integrations/composio/connect/${toolkit}`, null),
    composioDisconnect: (id: string) => del<{ status: string; id: string }>(`/api/integrations/composio/${id}`),
    composioConfigSet: (payload: { api_key?: string; user_id?: string }) =>
      put<{ status: string }>("/api/integrations/composio-config", payload),
    composioConfigClear: () => del<{ status: string }>("/api/integrations/composio-config"),
    composioToolkits: () => get<{ toolkits: ComposioToolkit[] }>("/api/integrations/composio/toolkits"),
    composioToolkitTools: (slug: string) => get<{ tools: ComposioToolSummary[] }>(`/api/integrations/composio/toolkits/${slug}/tools`),
    composioRenameConnection: (id: string, alias: string) =>
      post<{ status: string; id: string; alias: string }>(
        `/api/integrations/composio/connections/${id}/rename`,
        JSON.stringify({ alias }),
        { headers: { "Content-Type": "application/json" } },
      ),
    llmGet: () => get<{ effective: LLMEffective }>("/api/integrations/llm/model"),
    llmSet: (payload: { provider?: string; model?: string; temperature?: number; api_key?: string }) =>
      put<{ effective: LLMEffective }>("/api/integrations/llm/model", payload),
    llmClear: () => del<{ effective: LLMEffective }>("/api/integrations/llm/model"),
    chatTitleLlmGet: () => get<{ effective: LLMEffective }>("/api/integrations/llm/chat-title"),
    chatTitleLlmSet: (payload: { provider?: string; model?: string; temperature?: number }) =>
      put<{ effective: LLMEffective }>("/api/integrations/llm/chat-title", payload),
    chatTitleLlmClear: () => del<{ effective: LLMEffective }>("/api/integrations/llm/chat-title"),
    secretSet: (name: string, value: string) => put<{ status: string; name: string }>(`/api/integrations/secrets/${name}`, { value }),
    secretClear: (name: string) => del<{ status: string; name: string }>(`/api/integrations/secrets/${name}`),
    pyjiitSet: (payload: { username?: string; password?: string }) => put<{ status: string }>("/api/integrations/pyjiit", payload),
    pyjiitClear: () => del<{ status: string }>("/api/integrations/pyjiit"),
    voiceSet: (payload: Partial<VoiceConfigPublic>) => put<{ effective: VoiceConfigPublic }>("/api/integrations/voice", payload),
    voiceClear: () => del<{ effective: VoiceConfigPublic }>("/api/integrations/voice"),
    deleteSession: (id: string) => del<{ status: string; id: string }>(`/api/state/sessions/${id}`),
    debugStats: () => get<DebugStatsResponse>("/api/debug/stats"),
    memoryStats: () => get<Record<string, unknown>>("/api/debug/memory/stats"),
    memoryClaims: (params?: Record<string, string | number | boolean | undefined>) => {
      const q = new URLSearchParams(
        Object.entries(params ?? {}).flatMap(([key, value]) => (value == null ? [] : [[key, String(value)]])),
      ).toString();
      return get<Record<string, unknown>>(`/api/debug/memory/claims${q ? `?${q}` : ""}`);
    },
    memoryMaintenance: () => get<Record<string, unknown>>("/api/debug/maintenance"),
    memoryClear: () => post<Record<string, unknown>>("/api/debug/memory/clear", null),

    // Console
    stats: () => get<Stats>("/api/debug/stats"),
    timeseries: (days = 30) => get<TimeseriesBucket[]>(`/api/debug/timeseries${qs({ days })}`),
    runs: (params?: { status?: string; limit?: number; offset?: number }) => get<Run[]>(`/api/debug/runs${qs(params)}`),
    run: (id: string) => get<RunDetail>(`/api/debug/runs/${id}`),
    runEvents: (id: string) => get<RunEvent[]>(`/api/debug/runs/${id}/events`),
    memoryStatsTyped: () => get<MemoryStats>("/api/debug/memory/stats"),
    claims: (params?: { tier?: string; status?: string; limit?: number; offset?: number }) =>
      get<Claim[]>(`/api/debug/memory/claims${qs(params)}`),
    maintenance: () => get<MaintenanceRun[]>("/api/debug/maintenance"),
    memoryGraph: (history = false) => get<MemoryGraph>(`/api/debug/memory/graph${qs({ history })}`),
    forgetClaim: (id: string) => post<{ deleted_claims: number }>("/api/memory/forget", JSON.stringify({ claim_ids: [id] }), { headers: { "Content-Type": "application/json" } }),
    confirmClaim: (id: string) => post<Record<string, unknown>>(`/api/memory/confirm/${id}`, null),

    // Conversations
    conversations: () => get<{ conversations: Conversation[] }>("/api/conversations").then((d) => d.conversations ?? []),
    conversationMessages: (id: string) =>
      get<{ messages: ChatMessage[] }>(`/api/conversations/${id}/messages`).then((d) => d.messages ?? []),
    conversationRuns: (id: string) => get<{ runs: ConversationRun[] }>(`/api/conversations/${id}/runs`).then((d) => d.runs ?? []),
    runToolCalls: (id: string) => get<{ tool_calls: ToolCallRecord[] }>(`/api/runs/${id}/tool-calls`).then((d) => d.tool_calls ?? []),
    createConversation: (title = "New Conversation", clientId = "debug-app") => {
      const { body, init } = json({ title, client_id: clientId });
      return post<{ conversation_id: string; title: string }>("/api/conversations", body, init);
    },
  };
}

/** @deprecated use createApi */
export const createSharedApi = createApi;

export type Api = ReturnType<typeof createApi>;

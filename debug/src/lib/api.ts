const BASE = "/api/debug";
const MEMORY_BASE = "/api/memory";
const INTEGRATIONS_BASE = "/api/integrations";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface Stats {
  runs: { total: number; running: number; completed: number; failed: number };
  conversations: number;
  tool_calls: number;
  events: number;
  memory: {
    total_active: number;
    short_term: number;
    long_term: number;
    permanent: number;
    sources: number;
  };
}

export interface Run {
  run_id: string;
  conversation_id: string;
  entrypoint: string;
  status: string;
  final_answer: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  duration_s: number | null;
}

export interface RunDetail extends Run {
  subagents: Subagent[];
  tool_calls: ToolCallRecord[];
}

export interface Subagent {
  subagent_run_id: string;
  name: string;
  task: string;
  status: string;
  result: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ToolCallRecord {
  tool_call_id: string;
  tool_name: string;
  status: string;
  args: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  duration_s: number | null;
}

export interface RunEvent {
  event_id: string;
  event_type: string;
  subagent_run_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MemoryStats {
  by_tier_status: { tier: string; status: string; count: number }[];
  by_class: { class: string; count: number }[];
  avg_confidence: number;
  sources_by_type: { type: string; count: number }[];
}

export interface Claim {
  claim_id: string;
  claim_text: string;
  tier: string;
  memory_class: string;
  segment: string;
  status: string;
  confidence: number;
  trust_score: number;
  access_count: number;
  user_confirmed: boolean;
  created_at: string | null;
}

export interface MaintenanceRun {
  run_id: string;
  run_type: string;
  status: string;
  claims_reviewed: number | null;
  claims_updated: number | null;
  claims_archived: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface TimeseriesBucket {
  day: string;
  runs: number;
  tool_calls: number;
}

export interface MemoryInitQueuedResponse {
  status: string;
  sources?: number;
  filename?: string;
  source_type?: string;
}

export interface MemoryInitLinkedInResponse {
  toolkit: string;
  tool_name: string;
  source_type: string;
  raw_text: string;
  ingestion?: {
    source_id: string;
    artifacts_created: number;
    entities_created: number;
    claims_created: number;
    claims_provisional: number;
  } | null;
}

async function post<T>(path: string, body?: BodyInit | null, init?: RequestInit): Promise<T> {
  const url = path.startsWith("/api/") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    body,
    ...init,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function readError(res: Response): Promise<string> {
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

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export interface ComposioConnection {
  id: string | null;
  toolkit: string | null;
  status: string | null;
  user_id: string | null;
  alias: string | null;
  account_email: string | null;
  account_name: string | null;
  account_label: string | null;
  account_avatar_url: string | null;
  created_at: string | null;
}

export interface ComposioToolkit {
  slug: string;
  display_name: string;
  auth_mode: "managed" | "byo" | string;
  has_auth_config: boolean;
  logo_url: string | null;
  description: string | null;
  tool_count: number | null;
  connections: ComposioConnection[];
}

export interface ComposioToolSummary {
  slug: string;
  name: string;
  description: string | null;
}

export interface ComposioStatus {
  configured: boolean;
  user_id: string | null;
  connected: ComposioConnection[];
  toolkits: ComposioToolkit[];
  catalog_count: number;
  error: string | null;
}

export interface LLMEffective {
  provider: string;
  model: string;
  temperature: number;
  source: "env" | "db";
}

export interface SecretStatus {
  name: string;
  env_var: string;
  db_set: boolean;
  env_set: boolean;
  source: "db" | "env" | "unset";
  masked: string | null;
}

export interface ComposioConfigPublic {
  api_key_masked: string | null;
  user_id: string | null;
  api_key_source: "db" | "env" | "unset";
  user_id_source: "db" | "env" | "unset";
}

export interface SearchConfigPublic {
  provider: string;
  api_key_masked: string | null;
  api_key_source: "db" | "env" | "unset";
  configured: boolean;
}

export interface PyJIITPublic {
  username: string | null;
  password_masked: string | null;
  configured: boolean;
}

export interface IntegrationsStatus {
  composio: ComposioStatus;
  composio_config: ComposioConfigPublic;
  llm: {
    effective: LLMEffective;
    providers_configured: Record<string, boolean>;
    secrets: SecretStatus[];
  };
  search: SearchConfigPublic;
  pyjiit: PyJIITPublic;
  native_tools: Array<{ id: string; label: string; auth: string }>;
  agents: Array<{ id: string; label: string; module: string }>;
  infra: Record<string, { ok: boolean; error?: string }>;
}

export const api = {
  stats: () => get<Stats>("/stats"),
  timeseries: (days = 30) => get<TimeseriesBucket[]>(`/timeseries?days=${days}`),
  runs: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return get<Run[]>(`/runs${qs ? `?${qs}` : ""}`);
  },
  run: (id: string) => get<RunDetail>(`/runs/${id}`),
  runEvents: (id: string) => get<RunEvent[]>(`/runs/${id}/events`),
  memoryStats: () => get<MemoryStats>("/memory/stats"),
  claims: (params?: { tier?: string; status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.tier) q.set("tier", params.tier);
    if (params?.status) q.set("status", params.status ?? "active");
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return get<Claim[]>(`/memory/claims${qs ? `?${qs}` : ""}`);
  },
  maintenance: () => get<MaintenanceRun[]>("/maintenance"),
  ingestProfile: (payload: {
    linkedin_text?: string;
    google_profile_text?: string;
    notes?: string;
    sources?: Array<{
      text: string;
      source_type: string;
      title?: string;
      external_id?: string;
      author?: string;
      trust_level?: number;
      metadata?: Record<string, unknown>;
    }>;
    default_trust_level?: number;
  }) =>
    post<MemoryInitQueuedResponse>(`${MEMORY_BASE}/ingest/profile`, JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    }),
  ingestProfileDocument: (formData: FormData) =>
    post<MemoryInitQueuedResponse>(`${MEMORY_BASE}/ingest/profile/document`, formData),
  ingestComposioLinkedInMe: (payload?: { ingest?: boolean; trust_level?: number }) =>
    post<MemoryInitLinkedInResponse>(
      `${MEMORY_BASE}/ingest/profile/composio/linkedin/me`,
      JSON.stringify(payload ?? { ingest: true }),
      { headers: { "Content-Type": "application/json" } },
    ),
  ingestAeroLeadsLinkedIn: (payload: {
    linkedin_url: string;
    ingest?: boolean;
    trust_level?: number;
    }) =>
    post<MemoryInitLinkedInResponse>(
      `${MEMORY_BASE}/ingest/profile/composio/aeroleads/linkedin`,
      JSON.stringify(payload),
      { headers: { "Content-Type": "application/json" } },
    ),

  // ── Integrations / Settings ──────────────────────────────────────────────
  integrationsStatus: () =>
    fetch(`${INTEGRATIONS_BASE}/status`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<IntegrationsStatus>;
    }),
  composioConnect: (toolkit: string) =>
    post<{ toolkit: string; redirect_url: string; connection_id?: string | null }>(
      `${INTEGRATIONS_BASE}/composio/connect/${toolkit}`,
      null,
    ),
  composioDisconnect: (id: string) =>
    del<{ status: string; id: string }>(`${INTEGRATIONS_BASE}/composio/${id}`),
  composioToolkits: () =>
    fetch(`${INTEGRATIONS_BASE}/composio/toolkits`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<{ toolkits: ComposioToolkit[] }>;
    }),
  composioToolkitTools: (slug: string) =>
    fetch(`${INTEGRATIONS_BASE}/composio/toolkits/${slug}/tools`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<{ tools: ComposioToolSummary[] }>;
    }),
  composioRenameConnection: (id: string, alias: string) =>
    post<{ status: string; id: string; alias: string }>(
      `${INTEGRATIONS_BASE}/composio/connections/${id}/rename`,
      JSON.stringify({ alias }),
      { headers: { "Content-Type": "application/json" } },
    ),
  llmGet: () =>
    fetch(`${INTEGRATIONS_BASE}/llm/model`).then((r) => r.json()),
  llmSet: (payload: { provider?: string; model?: string; temperature?: number }) =>
    put<{ effective: LLMEffective }>(`${INTEGRATIONS_BASE}/llm/model`, payload),
  llmClear: () =>
    del<{ effective: LLMEffective }>(`${INTEGRATIONS_BASE}/llm/model`),

  // Encrypted LLM provider keys
  secretSet: (name: string, value: string) =>
    put<{ status: string; name: string }>(`${INTEGRATIONS_BASE}/secrets/${name}`, { value }),
  secretClear: (name: string) =>
    del<{ status: string; name: string }>(`${INTEGRATIONS_BASE}/secrets/${name}`),

  // Composio config
  composioConfigSet: (payload: { api_key?: string; user_id?: string }) =>
    put<{ status: string }>(`${INTEGRATIONS_BASE}/composio-config`, payload),
  composioConfigClear: () =>
    del<{ status: string }>(`${INTEGRATIONS_BASE}/composio-config`),

  // PyJIIT credentials
  pyjiitSet: (payload: { username?: string; password?: string }) =>
    put<{ status: string }>(`${INTEGRATIONS_BASE}/pyjiit`, payload),
  pyjiitClear: () => del<{ status: string }>(`${INTEGRATIONS_BASE}/pyjiit`),
};

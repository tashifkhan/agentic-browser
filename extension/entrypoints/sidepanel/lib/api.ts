const getBase = () => localStorage.getItem("baseUrl") || "http://localhost:5454";

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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getBase()}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body?: BodyInit | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: "POST",
    body,
    ...init,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface OAuthConnection {
  provider: string;
  status: string;
  account_email?: string;
  account_name?: string;
  scopes?: string[];
  expires_at?: string;
}

export interface OAuthClientStatus {
  provider: string;
  client_id_source: string;
  client_id_masked: string | null;
  client_secret_source: string;
  client_secret_masked: string | null;
}

export interface ComposioConnection {
  id: string | null;
  toolkit: string | null;
  status: string | null;
  account_email: string | null;
}

export interface ComposioStatus {
  configured: boolean;
  connected: ComposioConnection[];
  error: string | null;
}

export interface ComposioConfigPublic {
  api_key_masked: string | null;
  user_id: string | null;
  api_key_source: "db" | "env" | "unset";
  user_id_source: "db" | "env" | "unset";
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
  source: "db" | "env" | "unset";
  masked: string | null;
}

export interface PyJIITPublic {
  username: string | null;
  password_masked: string | null;
  configured: boolean;
}

export interface VoiceConfigPublic {
  stt_provider: string;
  stt_model: string;
  tts_provider: string;
  tts_voice: string;
  auto_submit: boolean;
  source: "default" | "db";
}

export interface IntegrationsStatus {
  oauth: OAuthConnection[];
  oauth_clients: OAuthClientStatus[];
  composio: ComposioStatus;
  composio_config: ComposioConfigPublic;
  llm: {
    effective: LLMEffective;
    providers_configured: Record<string, boolean>;
    secrets: SecretStatus[];
  };
  search: {
    configured: boolean;
    api_key_masked: string | null;
  };
  pyjiit: PyJIITPublic;
  voice: {
    effective: VoiceConfigPublic;
    secrets: SecretStatus[];
  };
  native_tools: Array<{ id: string; label: string; auth: string }>;
  agents: Array<{ id: string; label: string; module: string }>;
  infra: Record<string, { ok: boolean; error?: string }>;
}

// ── API ─────────────────────────────────────────────────────────────────────

export const api = {
  integrationsStatus: () => get<IntegrationsStatus>("/api/integrations/status"),
  
  oauthDisconnect: (provider: string) => del<any>(`/api/integrations/oauth/${provider}`),
  
  oauthClientSet: (provider: string, payload: any) => put<any>(`/api/integrations/oauth-clients/${provider}`, payload),
  oauthClientClear: (provider: string) => del<any>(`/api/integrations/oauth-clients/${provider}`),
  
  composioConnect: (toolkit: string) => post<any>(`/api/integrations/composio/connect/${toolkit}`, null),
  composioDisconnect: (id: string) => del<any>(`/api/integrations/composio/connections/${id}`),
  composioConfigSet: (payload: any) => put<any>("/api/integrations/composio-config", payload),
  composioConfigClear: () => del<any>("/api/integrations/composio-config"),
  
  llmSet: (payload: any) => put<any>("/api/integrations/llm/model", payload),
  llmClear: () => del<any>("/api/integrations/llm/model"),
  
  secretSet: (name: string, value: string) => put<any>(`/api/integrations/secrets/${name}`, { value }),
  secretClear: (name: string) => del<any>(`/api/integrations/secrets/${name}`),
  
  pyjiitSet: (payload: any) => put<any>("/api/integrations/pyjiit", payload),
  pyjiitClear: () => del<any>("/api/integrations/pyjiit"),

  voiceSet: (payload: any) => put<any>("/api/integrations/voice", payload),
  voiceClear: () => del<any>("/api/integrations/voice"),
  deleteSession: (id: string) => del<any>(`/api/state/sessions/${id}`),

  // Debug/Memory endpoints
  debugStats: () => get<any>("/api/debug/stats"),
  memoryStats: () => get<any>("/api/debug/memory/stats"),
  memoryClaims: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return get<any>(`/api/debug/memory/claims?${q}`);
  },
  memoryMaintenance: () => get<any>("/api/debug/maintenance"),
  memoryClear: () => post<any>("/api/debug/memory/clear", null),
};

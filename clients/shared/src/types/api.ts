export type BaseUrlResolver = () => string;

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
  user_id?: string | null;
  alias?: string | null;
  account_email: string | null;
  account_name?: string | null;
  account_label?: string | null;
  account_avatar_url?: string | null;
  created_at?: string | null;
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
  user_id?: string | null;
  connected: ComposioConnection[];
  toolkits?: ComposioToolkit[];
  catalog_count?: number;
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
  env_set?: boolean;
  source: "db" | "env" | "unset";
  masked: string | null;
}

export interface SearchConfigPublic {
  provider?: string;
  configured: boolean;
  api_key_masked: string | null;
  api_key_source?: "db" | "env" | "unset";
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

export interface TelegramBotPublic {
  token_masked: string | null;
  token_source: "db" | "env" | "unset";
  configured: boolean;
}

export interface IntegrationsStatus {
  oauth: OAuthConnection[];
  oauth_clients?: OAuthClientStatus[];
  composio: ComposioStatus;
  composio_config: ComposioConfigPublic;
  llm: {
    effective: LLMEffective;
    chat_title: LLMEffective;
    providers_configured: Record<string, boolean>;
    secrets: SecretStatus[];
  };
  search: SearchConfigPublic;
  pyjiit: PyJIITPublic;
  voice: {
    effective: VoiceConfigPublic;
    secrets: SecretStatus[];
  };
  telegram: TelegramBotPublic;
  native_tools: Array<{ id: string; label: string; auth: string }>;
  agents: Array<{ id: string; label: string; module: string }>;
  infra: Record<string, { ok: boolean; error?: string }>;
}

export interface DebugStatsResponse {
  memory?: Record<string, unknown>;
  [key: string]: unknown;
}

import { createHttpClient, createSharedApi } from "@agentic-browser/shared/api";

export type {
  ComposioConfigPublic,
  ComposioConnection,
  ComposioStatus,
  ComposioToolkit,
  ComposioToolSummary,
  IntegrationsStatus,
  LLMEffective,
  OAuthClientStatus,
  OAuthConnection,
  PyJIITPublic,
  SearchConfigPublic,
  SecretStatus,
  TelegramBotPublic,
  VoiceConfigPublic,
} from "@agentic-browser/shared/api";

const BASE = "/api/debug";
const MEMORY_BASE = "/api/memory";

const { get } = createHttpClient(() => BASE);
const { post } = createHttpClient(() => "");
const sharedApi = createSharedApi(() => "");

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

export interface Conversation {
  conversation_id: string;
  title: string | null;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
}

export interface ChatMessage {
  message_id: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ConversationRun {
  run_id: string;
  conversation_id: string;
  user_message_id: string | null;
  final_message_id: string | null;
  client_id: string;
  entrypoint: string;
  status: string;
  final_answer: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
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
  integrationsStatus: sharedApi.integrationsStatus,
  oauthDisconnect: sharedApi.oauthDisconnect,
  oauthClientSet: sharedApi.oauthClientSet,
  oauthClientClear: sharedApi.oauthClientClear,
  composioConnect: sharedApi.composioConnect,
  composioDisconnect: sharedApi.composioDisconnect,
  composioToolkits: sharedApi.composioToolkits,
  composioToolkitTools: sharedApi.composioToolkitTools,
  composioRenameConnection: sharedApi.composioRenameConnection,
  llmGet: sharedApi.llmGet,
  llmSet: sharedApi.llmSet,
  llmClear: sharedApi.llmClear,
  chatTitleLlmGet: sharedApi.chatTitleLlmGet,
  chatTitleLlmSet: sharedApi.chatTitleLlmSet,
  chatTitleLlmClear: sharedApi.chatTitleLlmClear,
  secretSet: sharedApi.secretSet,
  secretClear: sharedApi.secretClear,
  composioConfigSet: sharedApi.composioConfigSet,
  composioConfigClear: sharedApi.composioConfigClear,
  pyjiitSet: sharedApi.pyjiitSet,
  pyjiitClear: sharedApi.pyjiitClear,
  voiceSet: sharedApi.voiceSet,
  voiceClear: sharedApi.voiceClear,
  deleteSession: sharedApi.deleteSession,

  // ── Chat ─────────────────────────────────────────────────────────────────
  conversations: () => 
    fetch("/api/conversations").then(r => r.json() as Promise<{ conversations: Conversation[] }>).then(d => d.conversations),
  conversationHistory: (id: string) =>
    fetch(`/api/conversations/${id}/messages`).then(r => r.json() as Promise<{ messages: ChatMessage[] }>).then(d => d.messages),
  createConversation: async (title = "New Conversation") => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, client_id: "debug-app" }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ conversation_id: string; title: string }>;
  },
  addMessage: async (conversation_id: string, role: string, content: string) => {
    const res = await fetch(`/api/conversations/${conversation_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content, client_id: "debug-app" }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  
  chatStream: async (question: string, conversation_id?: string, onEvent?: (data: any) => void, attached_file_path?: string) => {
    const res = await fetch("/api/genai/react/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        conversation_id,
        chat_history: [], // Backend handles history if conversation_id is provided
        attached_file_path,
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent?.(data);
          } catch (e) {
            // ignore partial json
          }
        }
      }
    }
  },

  // ── Conversation Runs & Tool Calls ──────────────────────────────────────
  conversationRuns: (conversationId: string) =>
    fetch(`/api/conversations/${conversationId}/runs`)
      .then(r => r.json() as Promise<{ runs: ConversationRun[] }>)
      .then(d => d.runs),
  runToolCalls: (runId: string) =>
    fetch(`/api/runs/${runId}/tool-calls`)
      .then(r => r.json() as Promise<{ tool_calls: ToolCallRecord[] }>)
      .then(d => d.tool_calls),
};

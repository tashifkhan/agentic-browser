// Types for the console (debug) and conversation endpoints.

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

import { createApi, createHttpClient } from "@agentic-browser/shared/api";
import type {
  MemoryInitLinkedInResponse,
  MemoryInitQueuedResponse,
} from "@agentic-browser/shared/api";

// Types and most endpoints live in @agentic-browser/shared. This file adds the
// console-only calls (memory ingestion, chat streaming) on top.
export type * from "@agentic-browser/shared/api";

const MEMORY_BASE = "/api/memory";
const { post } = createHttpClient(() => "");
const shared = createApi(() => "");

export const api = {
  ...shared,
  memoryStats: shared.memoryStatsTyped,
  conversationHistory: shared.conversationMessages,
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

  // ── Chat ─────────────────────────────────────────────────────────────────
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
        client_id: "console",
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

};

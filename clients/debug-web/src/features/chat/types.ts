import type { Conversation } from "@agentic-browser/shared/api";

/** /api/conversations returns a few fields the shared type doesn't list. */
export type ConversationRow = Conversation & { updated_at?: string; client_id?: string };

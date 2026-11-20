import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { appendEvent, type AgentEvent } from "@agentic-browser/shared/agent";
import { queryKeys, useApi } from "@agentic-browser/shared/query";
import { api } from "../../lib/api";
import { resolveRequest } from "./commands";

/** The reply being produced right now. Answer text is kept per model step. */
export type Pending = {
  question: string;
  answerSteps: Record<number, string>;
  events: AgentEvent[];
  failed: boolean;
  /** Conversation this reply belongs to, once known. */
  convId?: string;
};

export const pendingAnswer = (p: Pending) =>
  Object.keys(p.answerSteps).map(Number).sort((a, b) => a - b).map((k) => p.answerSteps[k].trim()).filter(Boolean).join("\n\n");

/**
 * Sends a message: streams agent runs, calls one-shot endpoints for slash
 * commands, and refreshes the shared conversation queries afterwards. A
 * failed run stays on screen until the next message.
 */
export function useChatSender(conversationId: string | undefined) {
  const { baseUrl } = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);

  const now = () => new Date().toISOString();
  const add = (evt: Record<string, unknown>) =>
    setPending((p) => (p ? { ...p, events: appendEvent(p.events, { ...evt, event: String(evt.event), at: now() }) } : p));

  const refresh = (convId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.messages(baseUrl, convId) }),
      qc.invalidateQueries({ queryKey: queryKeys.conversationRuns(baseUrl, convId) }),
      qc.invalidateQueries({ queryKey: queryKeys.conversations(baseUrl) }),
    ]);

  async function send(text: string, attachmentPath?: string) {
    const input = text.trim();
    if (!input || (pending && !pending.failed)) return;
    let convId = conversationId || crypto.randomUUID();
    const req = resolveRequest(input, convId);
    let failed = false;
    let saved = false; // the backend created a run, so the thread can show the failure itself
    setPending({ question: input, answerSteps: {}, events: [], failed: false });
    try {
      if (req.stream) {
        await api.chatStream(String(req.payload.question), convId, (data) => {
          const step = Number(data.step ?? 0);
          if (data.event === "conversation" && data.conversation_id) {
            convId = data.conversation_id;
            saved = true;
          }
          else if (data.event === "answer_delta" && data.delta)
            setPending((p) => (p ? { ...p, answerSteps: { ...p.answerSteps, [step]: (p.answerSteps[step] ?? "") + data.delta } } : p));
          else if (data.event === "final" && data.answer)
            setPending((p) => (p ? { ...p, answerSteps: { 0: String(data.answer) } } : p));
          else {
            if (data.event === "error") failed = true;
            add(data);
          }
        }, attachmentPath);
      } else {
        if (!conversationId) convId = (await api.createConversation()).conversation_id;
        await api.addMessage(convId, "user", input);
        add({ event: "subagent_tool_call", tool: req.label, args: req.payload });
        const qs = req.payload.url ? `?url=${encodeURIComponent(String(req.payload.url))}` : "";
        const res = await fetch(`${req.endpoint}${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const answer = data.answer || data.summary || (typeof data === "string" ? data : JSON.stringify(data, null, 2));
        add({ event: "subagent_tool_result", tool: req.label });
        add({ event: "final" });
        setPending((p) => (p ? { ...p, answerSteps: { 0: answer } } : p));
        await api.addMessage(convId, "assistant", answer);
      }
    } catch (err) {
      failed = true;
      add({ event: "error", message: err instanceof Error ? err.message.slice(0, 300) : "No response from the backend" });
    }
    await refresh(convId).catch(() => undefined);
    if (!conversationId) navigate({ to: `/chat/${convId}` });
    // A run the backend recorded shows up in the thread (with its error) after
    // the refresh. One that never reached the backend stays on screen until
    // the next send.
    setPending((p) => (failed && !saved && p ? { ...p, failed: true, convId } : null));
  }

  return { send, pending, busy: !!pending && !pending.failed };
}

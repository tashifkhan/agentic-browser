import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys, useApi } from "@agentic-browser/shared/query";
import { api } from "../../lib/api";
import { resolveRequest } from "./commands";
import { eventToStep, type StepEvent } from "./events";

export type Pending = { question: string; answer: string; steps: StepEvent[] };

/**
 * Sends a message: streams agent runs, calls one-shot endpoints for slash
 * commands, and refreshes the shared conversation queries afterwards.
 */
export function useChatSender(conversationId: string | undefined) {
  const { baseUrl } = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);

  const push = (step: StepEvent | null) => step && setPending((p) => (p ? { ...p, steps: [...p.steps, step] } : p));
  const now = () => new Date().toISOString();

  async function send(text: string, attachmentPath?: string) {
    const input = text.trim();
    if (!input || pending) return;
    let convId = conversationId || crypto.randomUUID();
    const req = resolveRequest(input, convId);
    setPending({ question: input, answer: "", steps: [] });
    try {
      if (req.stream) {
        await api.chatStream(String(req.payload.question), convId, (data) => {
          if (data.event === "conversation" && data.conversation_id) convId = data.conversation_id;
          else if (data.event === "answer_delta" && data.delta) setPending((p) => (p ? { ...p, answer: p.answer + data.delta } : p));
          else if (data.event === "run_finished" && data.answer) setPending((p) => (p ? { ...p, answer: data.answer } : p));
          else push(eventToStep(data, now(), crypto.randomUUID()));
        }, attachmentPath);
      } else {
        if (!conversationId) convId = (await api.createConversation()).conversation_id;
        await api.addMessage(convId, "user", input);
        push({ id: crypto.randomUUID(), type: "subagent_tool_call", label: `Calling ${req.label}`, at: now() });
        const qs = req.payload.url ? `?url=${encodeURIComponent(String(req.payload.url))}` : "";
        const res = await fetch(`${req.endpoint}${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const answer = data.answer || data.summary || (typeof data === "string" ? data : JSON.stringify(data, null, 2));
        push({ id: crypto.randomUUID(), type: "final", label: "Answered", at: now() });
        setPending((p) => (p ? { ...p, answer } : p));
        await api.addMessage(convId, "assistant", answer);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.messages(baseUrl, convId) }),
        qc.invalidateQueries({ queryKey: queryKeys.conversationRuns(baseUrl, convId) }),
        qc.invalidateQueries({ queryKey: queryKeys.conversations(baseUrl) }),
      ]);
      if (!conversationId) navigate({ to: `/chat/${convId}` });
      setPending(null);
    } catch (err) {
      push({ id: crypto.randomUUID(), type: "error", label: `Error: ${err instanceof Error ? err.message.slice(0, 160) : "no response"}`, at: now() });
      setPending((p) => (p ? { ...p, answer: p.answer || "The agent didn't answer. Check that the backend is running and try again." } : p));
      setTimeout(() => setPending(null), 6000);
    }
  }

  return { send, pending, busy: !!pending };
}

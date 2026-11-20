import { useState } from "react";
import { wsClient } from "../../../utils/websocket-client";
import { parseAgentCommand } from "../../../utils/parseAgentCommand";
import { executeAgent, continueBrowserRuntimeSession, type AgentStreamEvent } from "../../../utils/executeAgent";
import { executeBrowserActions } from "../../../utils/executeActions";
import { formatResponseToText } from "../content";
import type { AttachedFile } from "../types";
import type { SessionsApi } from "./useSessions";

const RUNTIME_PLACEHOLDER = "Executing browser actions. Awaiting new page state...";

/** Friendlier text for HTML error pages from upstream providers. */
function cleanError(message: string): string {
	if (!message.includes("<!DOCTYPE html>") && !message.includes("<html")) return message;
	if (message.includes("groq.com") && message.includes("500"))
		return "Groq API is currently unavailable (500 Internal Server Error). Please try again in a few minutes.";
	if (message.includes("502") || message.includes("503")) return "Service temporarily unavailable. Please try again later.";
	if (message.includes("429")) return "Rate limit exceeded. Please wait before trying again.";
	return "Server error occurred. Please try again later.";
}

/**
 * Sends a command to the agent and streams its events into the active
 * session: each backend event becomes a labelled step on the reply, answer
 * deltas update the reply text, and browser action plans run in this browser.
 */
export function useAgentRun(sessions: SessionsApi) {
	const [isExecuting, setIsExecuting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const execute = async (text: string, attachment: AttachedFile | null) => {
		let command = text.trim();
		if (!command) {
			setError("Please enter a goal for the agent");
			return;
		}
		const sid = sessions.activeSessionId;
		const history = sessions.activeMessages;
		const serverConvId = sessions.activeSession?.serverConversationId;

		sessions.addMessage(sid, { id: Date.now().toString(), role: "user", content: command, timestamp: new Date().toISOString() });
		if (!command.startsWith("/")) command = `/react-ask ${command}`;
		setIsExecuting(true);

		const parsed = parseAgentCommand(command);
		if (parsed?.stage !== "complete") {
			return runOverSocket(command);
		}

		setError(null);
		const replyId = `${Date.now()}-assistant`;
		// Every backend event is kept with its payload; the shared work log
		// turns them into thinking blocks, tool rows and notes.
		const record = (event: string, data: Record<string, unknown> = {}) =>
			sessions.pushAgentEvent(sid, replyId, { ...data, event, at: new Date().toISOString() });
		const step = (type: string, label: string) => record(type, { label });
		const setReply = (content: string) => sessions.updateMessage(sid, replyId, content);
		// Answer text per model step, joined with a blank line between steps.
		const answerSteps = new Map<number, string>();
		const joined = () =>
			[...answerSteps.entries()].sort(([a], [b]) => a - b).map(([, t]) => t.trim()).filter(Boolean).join("\n\n");
		let streamed = "";
		let runtimeAnswer = "";
		let runtimeHandled = false;

		try {
			const space = command.indexOf(" ");
			const prompt = space === -1 ? "" : command.slice(space + 1).trim();
			sessions.addMessage(sid, { id: replyId, role: "assistant", content: "", timestamp: new Date().toISOString() });

			const onEvent = async (evt: AgentStreamEvent) => {
				const d = (evt.data || {}) as Record<string, any>;
				const stepNo = Number(d.step ?? 0);
				switch (evt.event) {
					case "conversation":
						if (d.conversation_id) sessions.linkServerConversation(sid, d.conversation_id, d.title);
						break;
					case "answer_delta":
						if (typeof d.delta === "string" && d.delta) {
							answerSteps.set(stepNo, (answerSteps.get(stepNo) ?? "") + d.delta);
							streamed = joined();
							setReply(streamed);
						}
						break;
					case "subagent_tool_result": {
						record(evt.event, d);
						if (d.tool !== "browser_action_agent") break;
						if (d?.result?.runtime_step || d?.result?.result?.runtime_step) {
							const result = await continueBrowserRuntimeSession(d.result, onEvent);
							runtimeHandled = true;
							runtimeAnswer = String(result?.answer || "");
							if (runtimeAnswer) streamed = runtimeAnswer;
							break;
						}
						const runtimeAction = d?.result?.runtime_step?.action || d?.result?.result?.runtime_step?.action || null;
						const plan = d?.result?.action_plan || d?.result?.result?.action_plan || (runtimeAction ? { actions: [runtimeAction] } : d?.result);
						if (plan && typeof plan === "object" && Array.isArray(plan.actions)) {
							step("browser_exec", `Running ${plan.actions.length} browser action${plan.actions.length === 1 ? "" : "s"}`);
							await executeBrowserActions(plan.actions);
						}
						break;
					}
					case "final": {
						if (d.answer === RUNTIME_PLACEHOLDER && runtimeHandled && runtimeAnswer) {
							record(evt.event, {});
							break;
						}
						setReply(typeof d.answer === "string" && d.answer ? d.answer : streamed);
						record(evt.event, { status: d.status, mode: d.mode, iterations: d.iterations });
						break;
					}
					case "error":
						if (d.message) {
							setError(String(d.message));
							setReply(`Error: ${String(d.message)}`);
						}
						record(evt.event, d);
						break;
					default:
						record(evt.event, d);
				}
			};

			const response = await executeAgent(command, prompt, history, attachment?.path, onEvent, serverConvId || sid);

			if (response?.ok && response.action_plan) {
				if (response.runtime_step) {
					const result = await continueBrowserRuntimeSession(response, onEvent);
					runtimeHandled = true;
					runtimeAnswer = String(result?.answer || "");
					if (runtimeAnswer) streamed = runtimeAnswer;
				} else {
					await executeBrowserActions(response.action_plan.actions || []);
				}
			}
			const fallback = typeof response?.answer === "string" && response.answer ? response.answer : formatResponseToText(response);
			if (!streamed && fallback) setReply(fallback);
		} catch (err: any) {
			const message = err.message || "Something went wrong.";
			setError(err.message || String(err));
			sessions.addMessage(sid, { id: Date.now().toString(), role: "assistant", content: `**Error:** ${message}`, timestamp: new Date().toISOString() });
			setReply(`Error: ${message}`);
			record("error", { message });
		} finally {
			setIsExecuting(false);
		}
	};

	/** Legacy path for commands the parser doesn't recognise. */
	const runOverSocket = async (command: string) => {
		setError(null);
		try {
			await wsClient.executeAgent(command, () => {});
		} catch (err) {
			setError(cleanError((err as Error).message));
		} finally {
			setIsExecuting(false);
		}
	};

	const stop = async () => {
		try {
			await wsClient.stopAgent();
			setIsExecuting(false);
			setError("Agent execution stopped by user");
		} catch (err: any) {
			setError(err.message || "Failed to stop agent");
		}
	};

	return { isExecuting, error, setError, execute, stop };
}

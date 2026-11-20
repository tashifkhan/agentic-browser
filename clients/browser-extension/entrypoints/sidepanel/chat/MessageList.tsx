import { useEffect, useRef } from "react";
import { AppMark } from "@agentic-browser/shared/ui";
import { AssistantMessage } from "./AssistantMessage";
import { AgentTrace } from "./AgentTrace";
import { UserMessage } from "./UserMessage";
import type { ChatMessage } from "./types";

export function MessageList({
	messages,
	busy,
	sessionId,
	playingId,
	onSpeak,
}: {
	messages: ChatMessage[];
	busy: boolean;
	sessionId: string | null;
	playingId: string | null;
	onSpeak: (m: ChatMessage) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	// Stick to the bottom as messages arrive or the chat changes.
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, [messages.length, busy, sessionId]);

	const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
	const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
	// The reply being produced is the last assistant message after the last question.
	const liveId = busy && lastAssistant && messages.indexOf(lastAssistant) > lastUserIdx ? lastAssistant.id : null;
	const waitingForReply = busy && !liveId;

	return (
		<div className="thread" ref={ref}>
			{messages.map((m) =>
				m.role === "user" ? (
					<UserMessage key={m.id} message={m} />
				) : (
					<AssistantMessage key={m.id} message={m} live={m.id === liveId} playingId={playingId} onSpeak={onSpeak} />
				),
			)}
			{waitingForReply && (
				<article className="msg msg--agent">
					<div className="msg__meta">
						<AppMark size={16} />
						<span>Agent</span>
					</div>
					<AgentTrace events={[]} live />
				</article>
			)}
		</div>
	);
}

import { useEffect, useRef } from "react";
import { AppMark } from "@agentic-browser/shared/ui";
import { AssistantMessage, Thinking } from "./AssistantMessage";
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

	const waitingForReply = busy && !messages.some((m) => m.role === "assistant" && !m.content);

	return (
		<div className="thread" ref={ref}>
			{messages.map((m) =>
				m.role === "user" ? (
					<UserMessage key={m.id} message={m} />
				) : (
					<AssistantMessage key={m.id} message={m} pending={!m.content && busy} playingId={playingId} onSpeak={onSpeak} />
				),
			)}
			{waitingForReply && (
				<article className="msg msg--agent">
					<div className="msg__meta">
						<AppMark size={16} />
						<span>Agent</span>
					</div>
					<Thinking />
				</article>
			)}
		</div>
	);
}

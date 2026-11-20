import type { ChatMessage } from "./types";

export const messageTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function UserMessage({ message }: { message: ChatMessage }) {
	return (
		<article className="msg msg--user">
			<div className="msg__bubble">{message.content}</div>
			<time className="msg__time">{messageTime(message.timestamp)}</time>
		</article>
	);
}

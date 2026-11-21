import { FileText } from "@agentic-browser/shared/icons";
import type { ChatMessage } from "./types";

export const messageTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function UserMessage({ message }: { message: ChatMessage }) {
	return (
		<article className="msg msg--user">
			{message.attachments?.map((a) =>
				a.isImage ? (
					<a key={a.url} className="msg__image" href={a.url} target="_blank" rel="noreferrer" title={a.name}>
						<img src={a.url} alt={a.name} loading="lazy" />
					</a>
				) : (
					<a key={a.url} className="msg__file" href={a.url} target="_blank" rel="noreferrer">
						<FileText size={13} />
						<span>{a.name}</span>
					</a>
				),
			)}
			<div className="msg__bubble">{message.content}</div>
			<time className="msg__time">{messageTime(message.timestamp)}</time>
		</article>
	);
}

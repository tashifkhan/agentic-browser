import { Loader2, Square, Volume2, XCircle } from "@agentic-browser/shared/icons";
import { AppMark, Button, Pill } from "@agentic-browser/shared/ui";
import { AgentTrace } from "./AgentTrace";
import { Markdown } from "./Markdown";
import { parseContent } from "./content";
import { messageTime } from "./UserMessage";
import type { ChatMessage } from "./types";

function Body({ content }: { content: string }) {
	const plan = content.match(/^Ok:\s*(true|false)\s*Action plan:/i);
	if (plan) {
		const ok = content.includes("Ok: true");
		return (
			<div className={`plan ${ok ? "plan--ok" : "plan--err"}`}>
				<Pill tone={ok ? "ok" : "err"}>{ok ? "action plan" : "plan failed"}</Pill>
				<pre className="plan__body">{content}</pre>
			</div>
		);
	}
	if (/^Error:/i.test(content)) {
		return (
			<div className="msg__error" role="alert">
				<XCircle size={14} />
				<Markdown>{parseContent(content).replace(/^Error:\s*/i, "")}</Markdown>
			</div>
		);
	}
	return <Markdown>{parseContent(content)}</Markdown>;
}

export function AssistantMessage({
	message,
	live,
	playingId,
	onSpeak,
}: {
	message: ChatMessage;
	/** This reply is still being produced. */
	live: boolean;
	playingId: string | null;
	onSpeak: (m: ChatMessage) => void;
}) {
	const speaking = playingId === message.id;
	const loading = playingId === `loading-${message.id}`;
	return (
		<article className="msg msg--agent">
			<div className="msg__meta">
				<AppMark size={16} />
				<span>Agent</span>
				<time className="msg__time">{messageTime(message.timestamp)}</time>
			</div>
			{(live || (message.events && message.events.length > 0)) && <AgentTrace events={message.events ?? []} live={live} />}
			{message.content && <Body content={message.content} />}
			{message.content && !live && (
				<div className="msg__tools">
					<Button
						variant="ghost"
						size="sm"
						className={speaking ? "is-on" : undefined}
						disabled={loading}
						onClick={() => onSpeak(message)}
						title={speaking ? "Stop reading" : "Read aloud"}
						icon={speaking ? <Square size={10} weight="Filled" /> : loading ? <Loader2 size={12} className="spin-icon" /> : <Volume2 size={13} />}
					>
						{speaking ? "Stop" : loading ? "Preparing" : "Read aloud"}
					</Button>
				</div>
			)}
		</article>
	);
}

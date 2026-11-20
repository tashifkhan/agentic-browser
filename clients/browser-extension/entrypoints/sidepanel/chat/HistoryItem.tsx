import { Trash2 } from "@agentic-browser/shared/icons";
import { IconButton } from "@agentic-browser/shared/ui";
import { relativeDate } from "./content";
import type { Session } from "./types";

export function HistoryItem({
	session,
	active,
	onSelect,
	onDelete,
}: {
	session: Session;
	active: boolean;
	onSelect: () => void;
	onDelete: () => void;
}) {
	return (
		<div
			role="button"
			tabIndex={0}
			className={`drawer__item${active ? " is-active" : ""}`}
			aria-current={active ? "true" : undefined}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
		>
			<span className="drawer__title">{session.title === "New Chat" ? "New chat" : session.title}</span>
			<span className="drawer__meta">
				{relativeDate(session.updatedAt)}
				{session.messages.length > 0 && ` · ${session.messages.length} msg`}
			</span>
			<IconButton
				size="sm"
				label="Delete chat"
				className="drawer__del"
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
			>
				<Trash2 size={13} />
			</IconButton>
		</div>
	);
}

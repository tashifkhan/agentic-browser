import { useEffect } from "react";
import { Plus } from "@agentic-browser/shared/icons";
import { Button } from "@agentic-browser/shared/ui";
import { HistoryItem } from "./HistoryItem";
import type { Session } from "./types";

export function HistoryDrawer({
	sessions,
	activeId,
	onSelect,
	onDelete,
	onNewChat,
	onClose,
}: {
	sessions: Session[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
	onNewChat: () => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="drawer" role="dialog" aria-modal="true" aria-label="Chat history">
			<div className="drawer__scrim" onClick={onClose} />
			<aside className="drawer__panel">
				<div className="drawer__head">
					<span className="ab-eyebrow">History</span>
					<Button size="sm" icon={<Plus size={13} />} onClick={onNewChat}>
						New chat
					</Button>
				</div>
				<div className="drawer__list">
					{sessions.length === 0 ? (
						<div className="drawer__empty">No chats yet.</div>
					) : (
						sessions.map((s) => (
							<HistoryItem
								key={s.id}
								session={s}
								active={s.id === activeId}
								onSelect={() => onSelect(s.id)}
								onDelete={() => onDelete(s.id)}
							/>
						))
					)}
				</div>
			</aside>
		</div>
	);
}

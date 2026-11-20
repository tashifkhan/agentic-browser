import { PanelLeft, Plus, Settings } from "@agentic-browser/shared/icons";
import { IconButton, Pill } from "@agentic-browser/shared/ui";

export function ChatHeader({
	title,
	busy,
	historyOpen,
	onToggleHistory,
	onNewChat,
	onSettings,
}: {
	title: string;
	busy: boolean;
	historyOpen: boolean;
	onToggleHistory: () => void;
	onNewChat: () => void;
	onSettings: () => void;
}) {
	return (
		<header className="chat__bar">
			<IconButton size="sm" label="Chat history" className={historyOpen ? "is-on" : undefined} onClick={onToggleHistory}>
				<PanelLeft size={16} />
			</IconButton>
			<span className="chat__title" title={title}>
				{title}
			</span>
			{busy && <Pill tone="live">working</Pill>}
			<IconButton size="sm" label="New chat" onClick={onNewChat}>
				<Plus size={16} />
			</IconButton>
			<IconButton size="sm" label="Settings" onClick={onSettings}>
				<Settings size={15} />
			</IconButton>
		</header>
	);
}

import { useEffect, useState, type KeyboardEvent } from "react";
import { ApiProvider } from "@agentic-browser/shared/query";
import "./chat.css";
import { ChatHeader } from "./chat/ChatHeader";
import { Composer } from "./chat/Composer";
import { EmptyState } from "./chat/EmptyState";
import { ErrorNotice } from "./chat/ErrorNotice";
import { HistoryDrawer } from "./chat/HistoryDrawer";
import { MentionMenu } from "./chat/MentionMenu";
import { MessageList } from "./chat/MessageList";
import { SlashMenu } from "./chat/SlashMenu";
import { useAgentRun } from "./chat/hooks/useAgentRun";
import { useAttachment } from "./chat/hooks/useAttachment";
import { useSessions } from "./chat/hooks/useSessions";
import { useSlashCommands } from "./chat/hooks/useSlashCommands";
import { useSpeech } from "./chat/hooks/useSpeech";
import { useTabs } from "./chat/hooks/useTabs";
import { useVoiceConfig } from "./chat/hooks/useVoiceConfig";
import { useVoiceInput } from "./chat/hooks/useVoiceInput";
import type { QuickAction } from "./chat/commands";
import { loadModelChoice, saveModelChoice, type ModelChoice } from "../utils/modelChoice";

interface AgentExecutorProps {
	wsConnected: boolean;
	onToggleSettings: () => void;
}

const backendBase = () => localStorage.getItem("baseUrl") || import.meta.env.VITE_API_URL || "http://localhost:5454";

/** Side panel chat. Provides the API base for the TanStack Query hooks below. */
export function AgentExecutor(props: AgentExecutorProps) {
	return (
		<ApiProvider baseUrl={backendBase().replace(/\/$/, "")}>
			<Chat {...props} />
		</ApiProvider>
	);
}

function Chat({ onToggleSettings }: AgentExecutorProps) {
	const sessions = useSessions();
	const run = useAgentRun(sessions);
	const slash = useSlashCommands();
	const tabs = useTabs();
	const attachment = useAttachment(run.setError);
	const speech = useSpeech(useVoiceConfig(), sessions.activeMessages);

	const [goal, setGoal] = useState("");
	const [model, setModelState] = useState<ModelChoice>(null);
	useEffect(() => {
		loadModelChoice().then(setModelState);
	}, []);
	const setModel = (choice: ModelChoice) => {
		setModelState(choice);
		void saveModelChoice(choice);
	};
	const [historyOpen, setHistoryOpen] = useState(false);
	const [mentionOpen, setMentionOpen] = useState(false);
	const [focusSignal, setFocusSignal] = useState(0);
	const focusComposer = () => setFocusSignal((n) => n + 1);

	const submit = (override?: string) => {
		const text = override ?? goal;
		if (!text.trim()) return run.setError("Please enter a goal for the agent");
		setGoal("");
		slash.close();
		setMentionOpen(false);
		run.execute(text, attachment.take());
	};

	const voice = useVoiceInput({
		onError: run.setError,
		onTranscript: (text, autoSubmit) => {
			setGoal(text);
			focusComposer();
			if (autoSubmit && text) setTimeout(() => submit(text), 300);
		},
	});

	const onChange = (value: string) => {
		setGoal(value);
		const mentioning = !!value.split(" ").pop()?.startsWith("@");
		setMentionOpen(mentioning);
		if (mentioning) tabs.refresh();
		slash.update(value);
	};

	const pickSuggestion = (item: string) => {
		setGoal(slash.complete(item));
		focusComposer();
	};

	const pickMention = (value: string) => {
		const words = goal.split(" ");
		words.pop();
		setGoal([...words, `@${value} `].join(" "));
		setMentionOpen(false);
	};

	const onMenuKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
		const items = slash.suggestions;
		if ((items.length > 0 || mentionOpen) && e.key === "Escape") {
			e.preventDefault();
			slash.close();
			setMentionOpen(false);
			return true;
		}
		if (items.length === 0) return false;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			slash.move(e.key === "ArrowDown" ? 1 : -1);
			return true;
		}
		if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
			const idx = slash.selected >= 0 ? slash.selected : items.length === 1 || e.key === "Tab" ? 0 : -1;
			if (idx >= 0) {
				e.preventDefault();
				pickSuggestion(items[idx]);
				return true;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				return true;
			}
		}
		return false;
	};

	const onQuickAction = (action: QuickAction) => {
		if (action.cmd.endsWith(" ")) {
			setGoal(action.cmd);
			focusComposer();
		} else {
			submit(action.cmd);
		}
	};

	const newChat = () => {
		sessions.newChat();
		setHistoryOpen(false);
	};

	const title = sessions.activeSession?.title;
	const messages = sessions.activeMessages;

	return (
		<div className="chat">
			{historyOpen && (
				<HistoryDrawer
					sessions={sessions.sessions}
					activeId={sessions.activeSessionId}
					onSelect={(id) => {
						sessions.setActiveSessionId(id);
						setHistoryOpen(false);
					}}
					onDelete={sessions.deleteSession}
					onNewChat={newChat}
					onClose={() => setHistoryOpen(false)}
				/>
			)}

			<ChatHeader
				title={title && title !== "New Chat" ? title : "New chat"}
				busy={run.isExecuting}
				historyOpen={historyOpen}
				onToggleHistory={() => setHistoryOpen((o) => !o)}
				onNewChat={newChat}
				onSettings={onToggleSettings}
			/>

			<div className="chat__main">
				{messages.length === 0 ? (
					<EmptyState dimmed={slash.suggestions.length > 0 || mentionOpen} onPick={onQuickAction} />
				) : (
					<MessageList
						messages={messages}
						busy={run.isExecuting}
						sessionId={sessions.activeSessionId}
						playingId={speech.playingId}
						onSpeak={speech.speak}
					/>
				)}
			</div>

			<div className="dock">
				{run.error && <ErrorNotice message={run.error} onDismiss={() => run.setError(null)} />}
				{slash.suggestions.length > 0 && (
					<SlashMenu items={slash.suggestions} selected={slash.selected} skills={slash.skills} onHover={slash.setSelected} onPick={pickSuggestion} />
				)}
				{mentionOpen && <MentionMenu tabs={tabs.tabs} onPick={pickMention} />}
				<Composer
					value={goal}
					onChange={onChange}
					onSubmit={() => submit()}
					onMenuKey={onMenuKey}
					busy={run.isExecuting}
					onStop={run.stop}
					onBrowserAction={() => submit(`/browser-action ${goal}`)}
					model={model}
					onModelChange={setModel}
					listening={voice.isListening}
					onToggleVoice={voice.toggle}
					attachment={attachment.file}
					uploading={attachment.isUploading}
					fileInputRef={attachment.inputRef}
					onFileSelect={attachment.onSelect}
					onAttach={attachment.open}
					onRemoveAttachment={attachment.clear}
					focusSignal={focusSignal}
				/>
			</div>
		</div>
	);
}

export default AgentExecutor;

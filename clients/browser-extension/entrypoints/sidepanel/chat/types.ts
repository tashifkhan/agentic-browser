export interface AgentLoopEvent {
	id: string;
	label: string;
	/** Backend event name (thinking, subagent_tool_call, ...) or a local step type. */
	type: string;
	timestamp: string;
	/** The backend payload (tool, args, result, text...). Missing on older saved chats. */
	data?: Record<string, unknown>;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
	events?: AgentLoopEvent[];
	/** Files sent with a user message, shown above the bubble. */
	attachments?: MessageAttachment[];
}

export interface MessageAttachment {
	name: string;
	/** Absolute URL the backend serves the upload from. */
	url: string;
	size: number;
	isImage: boolean;
}

export interface Session {
	id: string;
	title: string;
	messages: ChatMessage[];
	updatedAt: string;
	serverConversationId?: string;
}

export interface AttachedFile {
	name: string;
	path: string;
	size: number;
	url: string;
	isImage: boolean;
}

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

export const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");

export const newSession = (): Session => ({
	id: Date.now().toString(),
	title: "New Chat",
	messages: [],
	updatedAt: new Date().toISOString(),
});

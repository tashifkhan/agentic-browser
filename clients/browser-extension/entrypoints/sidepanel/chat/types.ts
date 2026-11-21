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
}

export const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");

export const newSession = (): Session => ({
	id: Date.now().toString(),
	title: "New Chat",
	messages: [],
	updatedAt: new Date().toISOString(),
});

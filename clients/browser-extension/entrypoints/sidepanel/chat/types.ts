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

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export const MODELS: ModelOption[] = [
	{ id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen", provider: "Google" },
	{ id: "gpt-5-mini", name: "GPT-5.2", provider: "OpenAI" },
	{ id: "claude-4-sonnet", name: "Claude 4.5 Sonnet", provider: "Anthropic" },
	{ id: "llama3", name: "Llama 3", provider: "Ollama" },
	{ id: "deepseek-chat", name: "DeepSeek v3.2", provider: "DeepSeek" },
	{ id: "mistral-7b", name: "Kimi K2", provider: "OpenRouter" },
];

export const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");

export const newSession = (): Session => ({
	id: Date.now().toString(),
	title: "New Chat",
	messages: [],
	updatedAt: new Date().toISOString(),
});

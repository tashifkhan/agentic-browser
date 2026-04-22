import { useState, useEffect, useRef } from "react";
import {
	Settings,
	Brain,
	Wrench,
	CheckCircle,
	XCircle,
	FileText,
	ArrowUp,
	Paperclip,
	Mic,
	MicOff,
	Upload,
	X,
	Search,
	Mail,
	Calendar,
	Youtube,
	MessageCircle,
	Globe,
	Bot,
	ChevronDown,
	Check,
	Plus,
	Trash2,
	MessageSquare,
	PanelLeft,
} from "lucide-react";
import { wsClient } from "../utils/websocket-client";
import { parseAgentCommand } from "../utils/parseAgentCommand";
import { executeAgent, AgentStreamEvent } from "../utils/executeAgent";
import { executeBrowserActions } from "../utils/executeActions";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
interface AgentExecutorProps {
	wsConnected: boolean;
}

interface ProgressUpdate {
	status: string;
	message: string;
	timestamp?: string;
}

interface AgentLoopEvent {
	id: string;
	label: string;
	type: string;
	timestamp: string;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

interface Session {
	id: string;
	title: string;
	messages: ChatMessage[];
	updatedAt: string;
}

export function AgentExecutor({ wsConnected }: AgentExecutorProps) {
	const [goal, setGoal] = useState("");
	const [isExecuting, setIsExecuting] = useState(false);
	const [autoExecute, setAutoExecute] = useState(true);
	const [progress, setProgress] = useState<ProgressUpdate[]>([]);
	const [loopEvents, setLoopEvents] = useState<AgentLoopEvent[]>([]);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);
	const [showMentionMenu, setShowMentionMenu] = useState(false);
	const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
	const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

	// Session State
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);

	const [openTabs, setOpenTabs] = useState<any[]>([]);
	const chatContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const MIN_TEXTAREA_HEIGHT = 24;
	const MAX_TEXTAREA_HEIGHT = 200;

	// Model Selector State
	const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

	// Voice Input State
	const [isListening, setIsListening] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);


	// File Attachment State
	const [attachedFile, setAttachedFile] = useState<{ name: string; path: string; size: number } | null>(null);
	const [isUploading, setIsUploading] = useState(false);

	const models = [
		{ id: "gemini-2.5-flash", name: "Gemini 3 Pro", provider: "Google" },
		{ id: "gpt-5-mini", name: "GPT-5.2", provider: "OpenAI" },
		{ id: "claude-4-sonnet", name: "Claude 4.5 Sonnet", provider: "Anthropic" },
		{ id: "llama3", name: "Llama 3", provider: "Ollama" },
		{ id: "deepseek-chat", name: "DeepSeek v3.2", provider: "DeepSeek" },
		{ id: "mistral-7b", name: "Kimi K2", provider: "OpenRouter" },
	];

	// Fetch open tabs
	const fetchTabs = async () => {
		try {
			const tabs = await browser.tabs.query({});
			setOpenTabs(tabs);
		} catch (error) {
			console.error("Failed to fetch tabs:", error);
		}
	};

	// Load chat history from browser storage on mount
	// Load sessions from browser storage on mount
	useEffect(() => {
		const loadSessions = async () => {
			try {
				const result = await browser.storage.local.get([
					"sessions",
					"chatHistory",
				]);

				if (
					result.sessions &&
					Array.isArray(result.sessions) &&
					result.sessions.length > 0
				) {
					// Sort sessions by updatedAt desc
					const sorted = result.sessions.sort(
						(a: Session, b: Session) =>
							new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
					);
					setSessions(sorted);
					// Set active session to the most recent one
					setActiveSessionId(sorted[0].id);
					console.log("✅ Loaded sessions:", sorted.length);
				} else if (
					Array.isArray(result.chatHistory) &&
					result.chatHistory.length > 0
				) {
					// Migration: Convert legacy chatHistory to a session
					const legacySession: Session = {
						id: Date.now().toString(),
						title: "Previous Chat",
						messages: result.chatHistory as ChatMessage[],
						updatedAt: new Date().toISOString(),
					};
					setSessions([legacySession]);
					setActiveSessionId(legacySession.id);
					console.log("✅ Migrated legacy chat history to session");

					// Clear legacy key
					browser.storage.local.remove("chatHistory");
				} else {
					// No history, create new session
					handleNewChat();
				}
			} catch (error) {
				console.error("Failed to load history:", error);
				// Fallback
				handleNewChat();
			}
		};
		loadSessions();
		fetchTabs();
	}, []);

	// Save sessions to browser storage whenever they change
	useEffect(() => {
		if (sessions.length > 0) {
			browser.storage.local
				.set({ sessions })
				.then(() => {
					console.log("Saved sessions count:", sessions.length);
				})
				.catch((error) => {
					console.error("Failed to save sessions:", error);
				});
		}
	}, [sessions]);

	// Auto-scroll to bottom when active session messages update
	const activeSession = sessions.find((s) => s.id === activeSessionId);
	const activeMessages = activeSession?.messages || [];

	const resizeTextarea = (element?: HTMLTextAreaElement | null) => {
		const textarea = element || textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		const nextHeight = Math.max(
			MIN_TEXTAREA_HEIGHT,
			Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)
		);
		textarea.style.height = `${nextHeight}px`;
	};

	useEffect(() => {
		if (chatContainerRef.current) {
			chatContainerRef.current.scrollTop =
				chatContainerRef.current.scrollHeight;
		}
	}, [activeMessages.length, isExecuting, activeSessionId]);

	useEffect(() => {
		resizeTextarea();
	}, [goal]);

	// Helper to add message to active session
	const addMessageToActive = (msg: ChatMessage) => {
		setSessions((prev) => {
			if (!activeSessionId) return prev;

			return prev
				.map((session) => {
					if (session.id === activeSessionId) {
						// Update title if it's the first user message and title is default
						let newTitle = session.title;
						if (session.messages.length === 0 && msg.role === "user") {
							newTitle =
								msg.content.slice(0, 30) +
								(msg.content.length > 30 ? "..." : "");
						}

						return {
							...session,
							messages: [...session.messages, msg],
							title: newTitle,
							updatedAt: new Date().toISOString(),
						};
					}
					return session;
				})
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
		});
	};

	const updateMessageInActive = (messageId: string, content: string) => {
		setSessions((prev) => {
			if (!activeSessionId) return prev;
			return prev.map((session) => {
				if (session.id !== activeSessionId) return session;
				return {
					...session,
					messages: session.messages.map((message) =>
						message.id === messageId ? { ...message, content } : message
					),
					updatedAt: new Date().toISOString(),
				};
			});
		});
	};

	const pushLoopEvent = (type: string, label: string) => {
		setLoopEvents((prev) => {
			const next = [
				...prev,
				{
					id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					type,
					label,
					timestamp: new Date().toISOString(),
				},
			];
			return next.slice(-20);
		});
	};

	// Hardcoded test responses with context awareness
	const getTestResponse = (
		userMessage: string,
		conversationHistory: ChatMessage[]
	): string => {
		// Log the conversation context being passed
		console.log(
			"🤖 Generating response with context:",
			conversationHistory.length,
			"previous messages"
		);
		const lowerMessage = userMessage.toLowerCase();

		if (
			lowerMessage.includes("summarize") ||
			lowerMessage.includes("summary")
		) {
			return "📝 **Summary Generated**\n\nThis page discusses the latest developments in AI technology, focusing on:\n\n• Large Language Models (LLMs) and their applications\n• Recent breakthroughs in neural networks\n• Ethical considerations in AI development\n• Future trends and predictions\n\nKey takeaway: AI is rapidly evolving with significant implications for various industries.";
		}

		if (lowerMessage.includes("explain") || lowerMessage.includes("what is")) {
			return "💡 **Explanation**\n\nBased on the current page content, here's a detailed breakdown:\n\nThe main concept revolves around browser automation and intelligent agents. These AI-powered assistants can:\n\n1. Navigate web pages autonomously\n2. Extract and process information\n3. Interact with UI elements\n4. Make decisions based on context\n\nThis technology enables users to automate repetitive tasks and gain insights from web content efficiently.";
		}

		if (lowerMessage.includes("analyze") || lowerMessage.includes("analysis")) {
			return "🔍 **Analysis Results**\n\n**Content Type:** Technical Documentation\n**Reading Time:** ~8 minutes\n**Complexity Level:** Intermediate\n\n**Key Insights:**\n• The page contains 1,247 words\n• 15 code snippets identified\n• 8 external links found\n• Primary topics: AI, automation, web scraping\n\n**Sentiment:** Positive and informative\n**Recommendation:** Good resource for developers learning about browser automation.";
		}

		if (
			lowerMessage.includes("help") ||
			lowerMessage.includes("what can you do")
		) {
			return "🤖 **Available Commands**\n\nI can help you with:\n\n**📝 Content Actions**\n• Summarize - Get a quick overview\n• Explain - Detailed explanations\n• Analyze - Deep content analysis\n\n**🔧 Web Actions**\n• Extract links and data\n• Fill forms automatically\n• Navigate between pages\n• Take screenshots\n\n**🎯 Advanced Features**\n• Search within page\n• Compare content\n• Generate reports\n\nJust type your request or use @ to mention tabs!";
		}

		if (
			lowerMessage.includes("screenshot") ||
			lowerMessage.includes("capture")
		) {
			return (
				"📸 **Screenshot Captured**\n\nI've taken a screenshot of the current page!\n\n✅ Image saved successfully\n📏 Resolution: 1920x1080\n📅 Timestamp: " +
				new Date().toLocaleString() +
				"\n\nThe screenshot has been saved to your downloads folder."
			);
		}

		// Default response
		return (
			'✨ **Response**\n\nI understand you said: "' +
			userMessage +
			"\"\n\nI'm your AI browser assistant! I can help you:\n• Understand page content\n• Automate tasks\n• Extract information\n• Navigate efficiently\n\nTry asking me to summarize, explain, or analyze the current page!"
		);
	};

	const formatResponseToText = (data: any): string => {
		if (!data) return "Empty response.";

		// If already plain text, return
		if (typeof data === "string") return data;

		// Humanize a key (turn snake_case → Snake Case)
		const humanize = (key: string) =>
			key
				.replace(/[_-]/g, " ")
				.replace(/([a-z])([A-Z])/g, "$1 $2")
				.replace(/\s+/g, " ")
				.replace(/^./, (x) => x.toUpperCase());

		// Universal recursive parser
		const parse = (obj: any, indent = 0): string => {
			const pad = " ".repeat(indent);

			// Primitive
			if (obj === null || obj === undefined) return `${pad}None`;
			if (typeof obj !== "object") return `${pad}${obj}`;

			// Array
			if (Array.isArray(obj)) {
				if (obj.length === 0) return `${pad}(empty list)\n`;
				return obj
					.map((item, i) => `${pad}- ${parse(item, indent + 2).trim()}`)
					.join("\n");
			}

			// Object
			let out = "";
			for (const [key, val] of Object.entries(obj)) {
				const label = humanize(key);

				if (typeof val === "object" && val !== null) {
					out += `${pad}${label}:\n${parse(val, indent + 2)}\n`;
				} else {
					out += `${pad}${label}: ${val}\n`;
				}
			}
			return out;
		};

		// Run parser
		return parse(data).trim();
	};

	const handleExecute = async (commandOverride?: string | any) => {
		const currentAttachedFile = attachedFile;
		setAttachedFile(null); // Clear attachment immediately

		let commandToExecute = goal.trim();
		if (typeof commandOverride === "string") {
			commandToExecute = commandOverride;
		}

		if (!commandToExecute.trim()) {
			setError("Please enter a goal for the agent");
			return;
		}

		// Add user message to chat history
		const userMessage: ChatMessage = {
			id: Date.now().toString(),
			role: "user",
			content:
				typeof commandOverride === "string"
					? /**
					   * If we're overriding, clean up the slash command for display if desired?
					   * Actually, usually we display what the user *typed* or the *intent*.
					   * If user clicks Globe button, they typed "open youtube".
					   * We are executing "/browser-action open youtube".
					   * We probably want to show "open youtube" (the goal) in the chat,
					   * OR show the full command.
					   * Existing logic: content: goal.trim().
					   * If I use commandToExecute, it shows the slash command.
					   * Let's stick to showing what's executed or keep it simple.
					   * User's request is "triggert ... api only".
					   * Let's use commandToExecute for the message content to be transparent,
					   * or we can strip it. The original code uses `goal.trim()`.
					   * I'll use `goal.trim()` for the user message content to keep it clean (what they typed),
					   * even if we execute a slash command behind the scenes.
					   */
					  goal.trim()
					: goal.trim(),
			timestamp: new Date().toISOString(),
		};
		addMessageToActive(userMessage);

		// Default to react-ask if no slash command
		if (!commandToExecute.startsWith("/")) {
			commandToExecute = `/react-ask ${commandToExecute}`;
		}

		setGoal(""); // Clear input immediately
		if (textareaRef.current) {
			textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
		}
		requestAnimationFrame(() => resizeTextarea());
		setIsExecuting(true);
		setLoopEvents([]);

		const parsed = parseAgentCommand(commandToExecute);
		if (parsed?.stage === "complete") {
			setIsExecuting(true);
			setError(null);
			let assistantMessageId = `${Date.now()}-assistant`;
			try {
				const firstSpaceIndex = commandToExecute.indexOf(" ");
				const promptText =
					firstSpaceIndex === -1
						? ""
						: commandToExecute.slice(firstSpaceIndex + 1).trim();

				addMessageToActive({
					id: assistantMessageId,
					role: "assistant",
					content: "",
					timestamp: new Date().toISOString(),
				});

				let streamedAnswer = "";
				const onStreamEvent = async (evt: AgentStreamEvent) => {
					const d = evt.data || {};
					switch (evt.event) {
						case "run_started":
							pushLoopEvent("run", "Run started");
							break;
						case "supervisor_iteration":
							pushLoopEvent(
								"supervisor",
								`Supervisor loop #${d.iteration || "?"}: ${d.action || "delegate"} ${d.selected_subagent ? `(${d.selected_subagent})` : ""}`
							);
							break;
						case "subagent_started":
							pushLoopEvent(
								"subagent",
								`${d.subagent || "subagent"} started: ${(d.task || "").toString().slice(0, 120)}`
							);
							break;
						case "subagent_tool_call": {
							let argsStr = "";
							if (d.args && typeof d.args === "object") {
								const keys = Object.keys(d.args);
								if (keys.length > 0) {
									const firstKey = keys[0];
									let val = String(d.args[firstKey]);
									if (val.length > 40) val = val.substring(0, 40) + "...";
									argsStr = `: ${firstKey}="${val}"`;
								}
							}
							pushLoopEvent(
								"tool",
								`${d.subagent || "subagent"} -> ${d.tool || "tool"}${argsStr}`
							);
							break;
						}
						case "subagent_tool_result": {
							pushLoopEvent(
								"tool_result",
								`${d.tool || "tool"} completed`
							);

							if (d.tool === "browser_action_agent") {
								const actionPlan =
									d?.result?.action_plan ||
									d?.result?.result?.action_plan ||
									d?.result;

								if (
									actionPlan &&
									typeof actionPlan === "object" &&
									Array.isArray(actionPlan.actions)
								) {
									if (autoExecute || window.confirm(`Agent wants to execute ${actionPlan.actions.length} actions. Allow?`)) {
										pushLoopEvent(
											"browser_exec",
											`Executing ${actionPlan.actions.length} browser actions`
										);
										await executeBrowserActions(actionPlan.actions);
									} else {
										pushLoopEvent("browser_exec", "User denied action execution");
									}
								}
							}
							break;
						}
						case "subagent_completed":
							pushLoopEvent(
								"subagent_done",
								`${d.subagent || "subagent"} completed`
							);
							break;
						case "quality_check":
							pushLoopEvent(
								"quality",
								`Quality: ${d.satisfactory ? "satisfactory" : "needs more work"} (score ${d.score ?? "?"})`
							);
							break;
						case "answer_delta": {
							const delta = typeof d.delta === "string" ? d.delta : "";
							if (delta) {
								streamedAnswer += delta;
								updateMessageInActive(assistantMessageId, streamedAnswer);
							}
							break;
						}
						case "final": {
							const finalText =
								typeof d.answer === "string" && d.answer
									? d.answer
									: streamedAnswer;
							updateMessageInActive(assistantMessageId, finalText);
							pushLoopEvent(
								"final",
								`Finished in ${d.iterations ?? "?"} supervisor loops`
							);
							break;
						}
						case "error":
							if (d.message) {
								setError(String(d.message));
								updateMessageInActive(
									assistantMessageId,
									`❌ **Error:** ${String(d.message)}`
								);
							}
							break;
						default:
							break;
					}
				};

				const responseData = await executeAgent(
					commandToExecute,
					promptText,
					activeMessages, // Pass current session history
					currentAttachedFile?.path,
					onStreamEvent
				);

				// Handle valid response with potential action plan
				if (responseData && responseData.ok && responseData.action_plan) {
					// This comes from the slash command direct hit
					console.log(
						"⚡ Executing slash command actions:",
						responseData.action_plan
					);
					await executeBrowserActions(responseData.action_plan.actions || []);
				}

				setResult(responseData);
				const fallbackText =
					typeof responseData?.answer === "string" && responseData.answer
						? responseData.answer
						: formatResponseToText(responseData);
				if (!streamedAnswer && fallbackText) {
					updateMessageInActive(assistantMessageId, fallbackText);
				}
			} catch (err: any) {
				setError(err.message || String(err));
				updateMessageInActive(
					assistantMessageId,
					`❌ **Error:** ${err.message || "Something went wrong."}`
				);
				pushLoopEvent("error", `Error: ${err.message || "Something went wrong."}`);
			} finally {
				setIsExecuting(false);
			}
			return;
		}

		setIsExecuting(true);
		setProgress([]);
		setResult(null);
		setError(null);

		try {
			const response = await wsClient.executeAgent(
				commandToExecute,
				(progressData) => {
					setProgress((prev) => [
						...prev,
						{
							status: progressData.status,
							message: progressData.message,
							timestamp: new Date().toISOString(),
						},
					]);
				}
			);

			setResult(response);
			setProgress((prev) => [
				...prev,
				{
					status: "completed",
					message: "Agent execution completed successfully!",
					timestamp: new Date().toISOString(),
				},
			]);
		} catch (err) {
			let errorMessage = (err as Error).message;

			// Parse HTML error responses for better display
			if (
				errorMessage.includes("<!DOCTYPE html>") ||
				errorMessage.includes("<html")
			) {
				if (errorMessage.includes("groq.com") && errorMessage.includes("500")) {
					errorMessage =
						"Groq API is currently unavailable (500 Internal Server Error). Please try again in a few minutes.";
				} else if (
					errorMessage.includes("502") ||
					errorMessage.includes("503")
				) {
					errorMessage =
						"Service temporarily unavailable. Please try again later.";
				} else if (errorMessage.includes("429")) {
					errorMessage =
						"Rate limit exceeded. Please wait before trying again.";
				} else {
					errorMessage = "Server error occurred. Please try again later.";
				}
			}

			setError(errorMessage);
			setProgress((prev) => [
				...prev,
				{
					status: "error",
					message: `Error: ${errorMessage}`,
					timestamp: new Date().toISOString(),
				},
			]);
		} finally {
			setIsExecuting(false);
		}
	};

	const handleStop = async () => {
		try {
			await wsClient.stopAgent();
			setIsExecuting(false);
			setError("Agent execution stopped by user");
		} catch (err: any) {
			console.error("Failed to stop agent:", err);
			setError(err.message || "Failed to stop agent");
		}
	};

	const [availableSkills, setAvailableSkills] = useState<{name: string, id: string}[]>([]);

	const fetchSkills = async () => {
		try {
			const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5454";
			const resp = await fetch(`${baseUrl}/api/skills/`.replace(/\/{2,}/g, "/").replace("http:/", "http://").replace("https:/", "https://"));
			if (resp.ok) {
				const data = await resp.json();
				setAvailableSkills(data.skills || []);
			}
		} catch (e) {
			console.error("Failed to fetch skills:", e);
		}
	};

	useEffect(() => {
		fetchSkills();
	}, []);

	const checkAndSetSuggestions = (value: string, fromSelection: boolean = false) => {
		const parsed = parseAgentCommand(value);
		if (!parsed) {
			setSlashSuggestions([]);
			setSelectedSuggestionIndex(-1);
			return value;
		}

		if (parsed.agent === "skill" && parsed.actions && parsed.actions[0] === "run") {
			// We are typing `/skill-run ` or `/skill-run My Sk`
			const queryMatch = value.match(/^\/skill-run\s*(.*)$/i);
			let searchStr = "";
			if (queryMatch) {
				searchStr = queryMatch[1].toLowerCase();
			}

			if (!searchStr) {
				// Show all if empty
				setSlashSuggestions(availableSkills.map(s => `/skill-run ${s.name} `));
			} else {
				// Filter by name
				const matches = availableSkills
					.filter(s => s.name.toLowerCase().startsWith(searchStr))
					.map(s => `/skill-run ${s.name} `);
				setSlashSuggestions(matches);
			}

			setSelectedSuggestionIndex(fromSelection ? 0 : -1);
			if (fromSelection && !value.endsWith(" ")) {
				return value + " ";
			}
			return value;
		}

		if (parsed.stage === "agent_select" || parsed.stage === "agent_partial") {
			setSlashSuggestions((parsed as any).agents.map((a: string) => `/${a}`));
			setSelectedSuggestionIndex(fromSelection ? 0 : -1);
			return value;
		}
		if (parsed.stage === "action_select" || parsed.stage === "action_partial") {
			const actions = (parsed as any).actions;
			if (fromSelection && actions.length === 1) {
				const autoCompleted = `/${parsed.agent}-${actions[0]} `;
				setSlashSuggestions([]);
				setSelectedSuggestionIndex(-1);
				return autoCompleted;
			}
			setSlashSuggestions(
				actions.map((ac: string) => `/${parsed.agent}-${ac}`)
			);
			setSelectedSuggestionIndex(fromSelection ? 0 : -1);
			return value;
		}
		if (parsed.stage === "complete") {
			setSlashSuggestions([]);
			setSelectedSuggestionIndex(-1);
			if (fromSelection && !value.endsWith(" ")) {
				return value + " ";
			}
			return value;
		}
		setSlashSuggestions([]);
		setSelectedSuggestionIndex(-1);
		return value;
	};

	const handleInputChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		const value = e.target.value;
		setGoal(value);

		const lastWord = value.split(" ").pop();
		if (lastWord?.startsWith("@")) {
			setShowMentionMenu(true);
			fetchTabs();
		} else {
			setShowMentionMenu(false);
		}

		checkAndSetSuggestions(value, false);
	};

	const handleSuggestionSelect = (s: string) => {
		const newValue = s + (s.endsWith(" ") ? "" : " ");
		const finalValue = checkAndSetSuggestions(newValue, true);
		setGoal(finalValue);
		// Focus back on the textarea can be helpful, but keeping it simple for now
	};

	// Voice Input Handler
	const toggleVoiceInput = async () => {
		if (isListening) {
			if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
				mediaRecorderRef.current.stop();
			}
			setIsListening(false);
			return;
		}

		setError(null);
		setIsListening(true); // Immediate feedback

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;
			audioChunksRef.current = [];

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
				stream.getTracks().forEach(track => track.stop());

				if (audioBlob.size === 0) {
					setIsListening(false);
					return;
				}

				try {
					const baseUrl = (import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");
					const formData = new FormData();
					formData.append("file", audioBlob, "recording.webm");

					const resp = await fetch(`${baseUrl}/api/voice/transcribe`, {
						method: "POST",
						body: formData,
					});

					if (!resp.ok) {
						throw new Error(`Transcription failed: ${await resp.text()}`);
					}

					const data = await resp.json();
					if (data.ok && data.text) {
						setGoal(data.text);
						if (textareaRef.current) {
							textareaRef.current.focus();
							setTimeout(() => resizeTextarea(), 0);
						}
					}
				} catch (err: any) {
					console.error("Transcription error:", err);
					setError(`Voice transcription failed: ${err.message}`);
				} finally {
					setIsListening(false);
				}
			};

			mediaRecorder.start();
		} catch (err: any) {
			console.error("Error accessing microphone:", err);
			if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
				setError("Microphone access denied. Opening setup page...");
				setTimeout(() => {
					browser.tabs.create({ 
						url: browser.runtime.getURL("/voice-setup.html" as any),
						active: true 
					});
				}, 1500);

			} else {
				setError(`Could not access microphone: ${err.message}`);
			}
			setIsListening(false);
		}

	};



	// File Upload Handler
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setIsUploading(true);
		try {
			const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5454";
			const formData = new FormData();
			formData.append("file", file);
			const resp = await fetch(`${baseUrl}/api/upload/`.replace(/\/{2,}/g, "/").replace("http:/", "http://").replace("https:/", "https://"), {
				method: "POST",
				body: formData,
			});
			if (!resp.ok) {
				const errText = await resp.text();
				throw new Error(`Upload failed: ${errText}`);
			}
			const data = await resp.json();
			setAttachedFile({ name: data.filename, path: data.path, size: data.size });
		} catch (err: any) {
			setError(err.message || "File upload failed");
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	const handleMentionSelect = (action: string) => {
		// Replace the last @... with the selected tab
		const words = goal.split(" ");
		words.pop(); // Remove the partial mention
		const newGoal = [...words, `@${action} `].join(" ");
		setGoal(newGoal);
		setShowMentionMenu(false);
	};

	const handleNewChat = () => {
		const newSession: Session = {
			id: Date.now().toString(),
			title: "New Chat",
			messages: [],
			updatedAt: new Date().toISOString(),
		};
		setSessions((prev) => [newSession, ...prev]);
		setActiveSessionId(newSession.id);
		setIsHistoryOpen(false); // Close history on new chat
	};

	const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
		e.stopPropagation(); // Prevent executing selection
		setSessions((prev) => {
			const newSessions = prev.filter((s) => s.id !== sessionId);
			// If we deleted the active session, switch to the first available or create new
			if (sessionId === activeSessionId) {
				if (newSessions.length > 0) {
					setActiveSessionId(newSessions[0].id);
				} else {
					// We'll handle creating a new one in the next render cycle or right here
					// Ideally we just clear activeId and let the effect handle it, but synchronous is safer here
					const newSession: Session = {
						id: Date.now().toString(),
						title: "New Chat",
						messages: [],
						updatedAt: new Date().toISOString(),
					};
					newSessions.push(newSession);
					setActiveSessionId(newSession.id);
				}
			}
			return newSessions;
		});

		// If explicit clean up from storage needed (though effect covers it)
		if (sessions.length === 1 && sessions[0].id === sessionId) {
			browser.storage.local.remove("sessions");
		}
	};

	const getStatusIcon = (status: string) => {
		const iconProps = { size: 14, strokeWidth: 2.5 };
		switch (status) {
			case "initializing":
				return <Settings {...iconProps} />;
			case "planning":
				return <Brain {...iconProps} />;
			case "executing":
				return <Wrench {...iconProps} />;
			case "completed":
				return <CheckCircle {...iconProps} />;
			case "error":
				return <XCircle {...iconProps} />;
			default:
				return <FileText {...iconProps} />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "initializing":
				return "#60a5fa";
			case "planning":
				return "#a78bfa";
			case "executing":
				return "#fbbf24";
			case "completed":
				return "#34d399";
			case "error":
				return "#f87171";
			default:
				return "#9ca3af";
		}
	};

	const exampleGoals = [
		"Open a new tab and search for 'AI news'",
		"Fill out the login form with test@example.com",
		"Take a screenshot of the current page",
		"Click all buttons with class 'submit'",
		"Extract all links from the current page",
	];

	return (
		<div className="agent-executor-fixed">
			{/* WebSocket Connection Warning */}
			{/* {!wsConnected && ( */}
			{/* <div className="ws-warning">⚠️ WebSocket not connected - Please connect in settings</div> */}
			{/* )} */}

			{/* History Sidebar Overlay */}
			{isHistoryOpen && (
				<div className="history-overlay">
					<div className="history-sidebar">
						<div className="history-header">
							<h3>Recent Chats</h3>
							<button className="new-chat-btn-small" onClick={handleNewChat}>
								<Plus size={16} /> New Chat
							</button>
						</div>
						<div className="history-list">
							{sessions.map((session) => (
								<div
									key={session.id}
									className={`history-item ${
										activeSessionId === session.id ? "active" : ""
									}`}
									onClick={() => {
										setActiveSessionId(session.id);
										setIsHistoryOpen(false); // Mobile-like behavior: close functionality on select
									}}
								>
									<MessageSquare size={14} className="history-icon" />
									<div className="history-info">
										<span className="history-title">{session.title}</span>
										<span className="history-date">
											{new Date(session.updatedAt).toLocaleDateString()}
										</span>
									</div>
									<button
										className="delete-session-btn"
										onClick={(e) => handleDeleteSession(e, session.id)}
									>
										<Trash2 size={12} />
									</button>
								</div>
							))}
						</div>
					</div>
					<div
						className="history-backdrop"
						onClick={() => setIsHistoryOpen(false)}
					/>
				</div>
			)}

			{/* Top Bar / Header */}
			<div className="agent-header">
				<button
					className={`icon-btn ${isHistoryOpen ? "active" : ""}`}
					onClick={() => setIsHistoryOpen(!isHistoryOpen)}
					title="Chat History"
				>
					<PanelLeft size={18} />
				</button>
				<span className="header-title">
					{activeSession?.title || "Agentic Browser"}
				</span>
				<label title="Auto-execute browser actions" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", color: "#888" }}>
					<input 
						type="checkbox" 
						checked={autoExecute} 
						onChange={(e) => setAutoExecute(e.target.checked)} 
					/> Auto-Run
				</label>
			</div>

			{/* Center content */}
			<div className="main-area">
				{activeMessages.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-orb" />
						<h3>What can I help you with?</h3>
						<p>Choose a quick action or type your message below</p>
						<div className="quick-actions-grid">
							{[
								{ icon: <MessageCircle size={18} />, label: "Summarize this page", cmd: "/react-ask Summarize this page" },
								{ icon: <Search size={18} />, label: "Search Google", cmd: "/google-search " },
								{ icon: <Youtube size={18} />, label: "Ask about a video", cmd: "/youtube-ask " },
								{ icon: <Mail size={18} />, label: "Check unread emails", cmd: "/gmail-unread" },
								{ icon: <Calendar size={18} />, label: "View calendar", cmd: "/calendar-events" },
								{ icon: <Globe size={18} />, label: "Browser automation", cmd: "/browser-action " },
							].map((action, i) => (
								<button
									key={i}
									className="quick-action-card"
									onClick={() => {
										if (action.cmd.endsWith(" ")) {
											setGoal(action.cmd);
										} else {
											handleExecute(action.cmd);
										}
									}}
								>
									<span className="quick-action-icon">{action.icon}</span>
									<span className="quick-action-label">{action.label}</span>
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="chat-container" ref={chatContainerRef}>
						{loopEvents.length > 0 && (
							<div className="loop-events-card">
								<div className="loop-events-title">Agent loop progress</div>
								<div className="loop-events-list">
									{loopEvents.map((evt) => (
										<div key={evt.id} className={`loop-event-item ${evt.type}`}>
											<span className="loop-event-dot" />
											<span className="loop-event-label">{evt.label}</span>
										</div>
									))}
								</div>
							</div>
						)}
						{activeMessages.map((msg) => (
							<div key={msg.id} className={`chat-message ${msg.role}`}>
								<div className="message-header">
									<span className="role-label">
										{msg.role === "user" ? (
											"You"
										) : (
											<span className="bot-label">
												<Bot size={14} /> Agent
											</span>
										)}
									</span>
									<span className="timestamp">
										{new Date(msg.timestamp).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
								</div>
								<div className="message-bubble">
									{msg.content.match(/^Ok:\s*(true|false)\s*Action plan:/i) ? (
										<div className="action-plan-message">
											<div className="action-status">
												{msg.content.includes("Ok: true") ? (
													<span className="status-badge success">✓ Action Plan</span>
												) : (
													<span className="status-badge error">✗ Failed</span>
												)}
											</div>
											<pre className="action-plan-content">{msg.content}</pre>
										</div>
									) : msg.content.match(/^Error:/i) ? (
										<div className="error-message">
											<span className="error-badge">✕ Error</span>
											<div className="error-content">
												<ReactMarkdown
													remarkPlugins={[remarkMath]}
													rehypePlugins={[rehypeKatex]}
													components={{
														p: ({ children }) => <p className="markdown-p">{children}</p>,
														code: ({ children }) => <code className="inline-code">{children}</code>,
													}}
												>
													{msg.content}
												</ReactMarkdown>
											</div>
										</div>
									) : (
										<ReactMarkdown
											remarkPlugins={[remarkMath]}
											rehypePlugins={[rehypeKatex]}
											components={{
												h1: ({ children }) => <h1 className="markdown-h1">{children}</h1>,
												h2: ({ children }) => <h2 className="markdown-h2">{children}</h2>,
												h3: ({ children }) => <h3 className="markdown-h3">{children}</h3>,
												code({ node, className, children, ...props }) {
													const match = /language-(\w+)/.exec(className || "");
													return match ? (
														<pre className="code-block">
															<code className={className} {...props}>
																{children}
															</code>
														</pre>
													) : (
														<code className="inline-code" {...props}>
															{children}
														</code>
													);
												},
												p: ({ children }) => (
													<p className="markdown-p">{children}</p>
												),
												ul: ({ children }) => (
													<ul className="markdown-ul">{children}</ul>
												),
												ol: ({ children }) => (
													<ol className="markdown-ol">{children}</ol>
												),
												li: ({ children }) => (
													<li className="markdown-li">{children}</li>
												),
												a: ({ href, children }) => (
													<a
														href={href}
														target="_blank"
														rel="noopener noreferrer"
														className="markdown-link"
													>
														{children}
													</a>
												),
											}}
										>
											{msg.content}
										</ReactMarkdown>
									)}
								</div>
							</div>
						))}
						{isExecuting && (
							<div className="chat-message assistant">
								<div className="message-header">
									<span className="role-label">
										<Bot size={12} /> Assistant
									</span>
								</div>
								<div className="message-bubble typing">
									<span className="typing-indicator"></span>
									<span className="typing-indicator"></span>
									<span className="typing-indicator"></span>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Chat Input Card */}
			{error && (
				<div className="global-error-banner">
					<div className="error-content">
						<XCircle size={14} />
						<span>{error}</span>
					</div>
					<button className="error-close" onClick={() => setError(null)}>
						<X size={14} />
					</button>
				</div>
			)}

			{/* Chat Input Area */}
			<div className="chat-input-container">

				{slashSuggestions.length > 0 && (
					<div className="slash-menu">
						{slashSuggestions.map((s, idx) => (
							<div
								key={idx}
								className={`slash-item ${idx === selectedSuggestionIndex ? "selected" : ""}`}
								onClick={() => handleSuggestionSelect(s)}
							>
								{s}
							</div>
						))}
					</div>
				)}

				{showMentionMenu && (
					<div className="mention-menu">
						<div className="mention-menu-header">Mention Tab</div>
						{openTabs.map((tab) => (
							<button
								key={tab.id}
								className="mention-option"
								onClick={() =>
									handleMentionSelect(tab.url || tab.title || "Untitled Tab")
								}
							>
								<Globe size={16} className="mention-icon" />
								<span className="mention-text truncate">
									{tab.title || tab.url}
								</span>
							</button>
						))}
					</div>
				)}

				<div className="input-wrapper">
					{/* Hidden file input */}
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleFileSelect}
						style={{ display: "none" }}
						accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.csv,.json,.xml,.py,.js,.ts,.html,.css"
					/>
					{/* Attachment preview */}
					{attachedFile && (
						<div className="attachment-chip">
							<FileText size={14} />
							<span className="attachment-name">{attachedFile.name}</span>
							<span className="attachment-size">({(attachedFile.size / 1024).toFixed(1)} KB)</span>
							<button className="attachment-remove" onClick={() => setAttachedFile(null)}><X size={12} /></button>
						</div>
					)}
					{isUploading && (
						<div className="attachment-chip uploading">
							<Upload size={14} className="spin-icon" />
							<span>Uploading...</span>
						</div>
					)}
					{isListening ? (
						<div className="voice-wave-container">
							<div className="voice-wave-label">Recording audio...</div>
							<div className="voice-wave">
								{[...Array(12)].map((_, i) => (
									<div 
										key={i} 
										className="voice-wave-bar" 
										style={{ 
											animationDelay: `${i * 0.08}s`,
											opacity: 1 - (Math.abs(i - 5.5) * 0.1)
										}} 
									/>
								))}
							</div>
						</div>
					) : (
						<textarea
							ref={textareaRef}
							value={goal}
							onChange={(e) => {
								handleInputChange(e as any);
								resizeTextarea(e.target);
							}}
							onKeyDown={(e) => {
								if (slashSuggestions.length > 0) {
									if (e.key === "ArrowDown") {
										e.preventDefault();
										setSelectedSuggestionIndex((prev) => 
											prev < slashSuggestions.length - 1 ? prev + 1 : prev
										);
										return;
									}
									if (e.key === "ArrowUp") {
										e.preventDefault();
										setSelectedSuggestionIndex((prev) => 
											prev > 0 ? prev - 1 : 0
										);
										return;
									}
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < slashSuggestions.length) {
											handleSuggestionSelect(slashSuggestions[selectedSuggestionIndex]);
										} else {
											// If nothing explicitly selected but only 1 option available, we can auto-select the first one.
											if (slashSuggestions.length === 1) {
												handleSuggestionSelect(slashSuggestions[0]);
											} else {
												// Else let them continue or do nothing
											}
										}
										return;
									}
								}
								
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleExecute();
								}
							}}
							placeholder="Type your message here..."
							disabled={isExecuting}
							className="chat-textarea"
							rows={1}
						/>
					)}

				</div>

				<div className="input-footer">
					<div className="left-actions">
						<div style={{ position: "relative" }}>
							<button
								className="model-selector"
								onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
							>
								<span>
									{models.find((m) => m.id === selectedModel)?.name ||
										selectedModel}
								</span>
								<ChevronDown size={14} />
							</button>

							{isModelMenuOpen && (
								<div className="model-menu">
									<div className="model-menu-header">Select Model</div>
									{models.map((model) => (
										<button
											key={model.id}
											className={`model-option ${
												selectedModel === model.id ? "active" : ""
											}`}
											onClick={() => {
												setSelectedModel(model.id);
												setIsModelMenuOpen(false);
											}}
										>
											<div className="model-info">
												<span className="model-name">{model.name}</span>
												<span className="model-provider">{model.provider}</span>
											</div>
											{selectedModel === model.id && (
												<Check size={14} className="check-icon" />
											)}
										</button>
									))}
								</div>
							)}
						</div>
						<button
							className="action-btn"
							title="Browser Action (Generate Script)"
							onClick={() => handleExecute(`/browser-action ${goal}`)}
						>
							<Globe size={18} />
						</button>
						<button
							className={`action-btn ${isUploading ? "uploading" : ""}`}
							title="Attach File"
							onClick={() => fileInputRef.current?.click()}
							disabled={isUploading}
						>
							<Paperclip size={18} />
						</button>
						<button
							className={`action-btn ${isListening ? "listening" : ""}`}
							title={isListening ? "Stop Listening" : "Voice Input"}
							onClick={toggleVoiceInput}
						>
							{isListening ? <MicOff size={18} /> : <Mic size={18} />}
						</button>
					</div>

					<div className="right-actions">
						<button
							className="submit-btn"
							onClick={handleExecute}
							disabled={isExecuting || !goal.trim()}
						>
							<ArrowUp size={20} strokeWidth={2.5} />
						</button>
					</div>
				</div>
			</div>

			<style>{`
		.agent-executor-fixed {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			height: 100vh;
			display: flex;
			flex-direction: column;
			background: #0d0d0f;
			color: #e5e5e5;
			z-index: 1000;
			overflow: hidden;
		}

		/* ─── Header ─── */
		.agent-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px 16px;
			background: rgba(18, 18, 22, 0.75);
			backdrop-filter: blur(16px) saturate(1.4);
			-webkit-backdrop-filter: blur(16px) saturate(1.4);
			border-bottom: 1px solid rgba(232, 121, 160, 0.08);
			height: 52px;
			flex-shrink: 0;
			position: relative;
		}
		.agent-header::after {
			content: '';
			position: absolute;
			bottom: 0;
			left: 16px;
			right: 16px;
			height: 1px;
			background: linear-gradient(90deg, transparent, rgba(232, 121, 160, 0.25), transparent);
		}
		
		.header-title {
			font-size: 15px;
			font-weight: 600;
			color: #f0f0f0;
			max-width: 200px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			letter-spacing: -0.2px;
		}
		
		.icon-btn {
			background: transparent;
			border: none;
			color: #888;
			cursor: pointer;
			padding: 7px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		}
		
		.icon-btn:hover, .icon-btn.active {
			background: rgba(232, 121, 160, 0.1);
			color: #e879a0;
		}

		/* ─── Main area & chat ─── */
		.main-area {
			flex: 1;
			overflow-y: hidden;
			display: flex;
			flex-direction: column;
			position: relative;
			padding-bottom: 12px;
		}

		.chat-container {
			flex: 1;
			overflow-y: auto;
			padding: 24px 16px;
			display: flex;
			flex-direction: column;
			gap: 20px;
			scroll-behavior: smooth;
		}

		.loop-events-card {
			background: rgba(20, 20, 26, 0.75);
			border: 1px solid rgba(96, 165, 250, 0.2);
			border-radius: 12px;
			padding: 10px 12px;
		}

		.loop-events-title {
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.5px;
			text-transform: uppercase;
			color: #93c5fd;
			margin-bottom: 8px;
		}

		.loop-events-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		.loop-event-item {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 12px;
			color: #cbd5e1;
		}

		.loop-event-dot {
			width: 8px;
			height: 8px;
			border-radius: 9999px;
			background: #64748b;
			flex-shrink: 0;
		}

		.loop-event-item.supervisor .loop-event-dot { background: #60a5fa; }
		.loop-event-item.subagent .loop-event-dot { background: #a78bfa; }
		.loop-event-item.tool .loop-event-dot { background: #fbbf24; }
		.loop-event-item.tool_result .loop-event-dot { background: #34d399; }
		.loop-event-item.browser_exec .loop-event-dot { background: #fb7185; }
		.loop-event-item.quality .loop-event-dot { background: #22c55e; }
		.loop-event-item.final .loop-event-dot { background: #4ade80; }
		.loop-event-item.error .loop-event-dot { background: #f87171; }

		/* ─── Chat Messages ─── */
		.chat-message {
			display: flex;
			flex-direction: column;
			max-width: 88%;
			animation: msgIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
		}
		@keyframes msgIn {
			from { opacity: 0; transform: translateY(8px); }
			to   { opacity: 1; transform: translateY(0); }
		}

		.chat-message.user {
			align-self: flex-end;
		}

		.chat-message.assistant {
			align-self: flex-start;
		}

		.message-header {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 6px;
			padding: 0 6px;
		}

		.role-label {
			font-size: 12px;
			font-weight: 600;
			color: #bbb;
			text-transform: uppercase;
			letter-spacing: 0.4px;
		}

		.bot-label {
			display: flex;
			align-items: center;
			gap: 6px;
			color: #e879a0;
		}

		.timestamp {
			font-size: 10px;
			color: #555;
		}
		
		.message-bubble {
			padding: 14px 18px;
			font-size: 14px;
			line-height: 1.65;
			color: #e5e5e5;
			white-space: normal;
			word-wrap: break-word;
			border-radius: 16px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.15);
		}

		/* Markdown element spacing */
		.markdown-p {
			margin: 0 0 16px 0 !important;
			line-height: 1.7;
		}
		.markdown-p:last-child {
			margin-bottom: 0 !important;
		}

		.markdown-h1, .markdown-h2, .markdown-h3 {
			margin-top: 20px !important;
			margin-bottom: 14px !important;
			font-weight: 600;
		}
		.markdown-h1 { font-size: 1.4em; }
		.markdown-h2 { font-size: 1.2em; }
		.markdown-h3 { font-size: 1.05em; }
		.markdown-h1:first-child, .markdown-h2:first-child, .markdown-h3:first-child {
			margin-top: 0 !important;
		}

		.markdown-ul, .markdown-ol {
			margin: 18px 0 !important;
			padding-left: 28px !important;
		}
		.markdown-ul { list-style-type: disc; }
		.markdown-ol { list-style-type: decimal; }

		.markdown-li {
			margin: 10px 0 !important;
			line-height: 1.7;
		}

		.markdown-link {
			color: #60a5fa;
			text-decoration: underline;
			transition: color 0.2s;
		}
		.markdown-link:hover {
			color: #93c5fd;
		}

		/* Action Plan Message Renderer */
		.action-plan-message {
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.action-status {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.status-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 12px;
			border-radius: 8px;
			font-size: 12px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.status-badge.success {
			background: rgba(34, 197, 94, 0.12);
			color: #22c55e;
			border: 1px solid rgba(34, 197, 94, 0.2);
		}

		.status-badge.error {
			background: rgba(239, 68, 68, 0.12);
			color: #ef4444;
			border: 1px solid rgba(239, 68, 68, 0.2);
		}

		.action-plan-content {
			background: rgba(0, 0, 0, 0.4);
			border: 1px solid rgba(232, 121, 160, 0.1);
			padding: 12px;
			border-radius: 8px;
			font-size: 12px;
			line-height: 1.6;
			color: #d1d5db;
			overflow-x: auto;
			margin: 0;
			font-family: 'SF Mono', 'Fira Code', monospace;
			white-space: pre-wrap;
			word-break: break-word;
		}

		/* Error Message Renderer */
		.error-message {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		.error-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 12px;
			border-radius: 8px;
			font-size: 12px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			background: rgba(239, 68, 68, 0.12);
			color: #f87171;
			border: 1px solid rgba(239, 68, 68, 0.2);
			width: fit-content;
		}

		.error-content {
			background: rgba(239, 68, 68, 0.08);
			border-left: 3px solid #f87171;
			padding: 12px;
			border-radius: 6px;
		}

		.code-block {
			background: #111114;
			padding: 12px;
			border-radius: 8px;
			overflow-x: auto;
			margin: 8px 0;
			border: 1px solid rgba(232, 121, 160, 0.08);
			font-size: 13px;
		}

		.inline-code {
			background: rgba(232, 121, 160, 0.1);
			padding: 2px 6px;
			border-radius: 4px;
			font-family: 'SF Mono', 'Fira Code', monospace;
			font-size: 0.88em;
			color: #f0a0b8;
		}

		.chat-message.user .message-bubble {
			background: rgba(232, 121, 160, 0.09);
			border: 1px solid rgba(232, 121, 160, 0.12);
			color: #f0f0f0;
			border-top-right-radius: 4px;
		}

		.chat-message.assistant .message-bubble {
			background: transparent;
			box-shadow: none;
			padding-left: 2px;
			padding-right: 2px;
			padding-top: 0;
		}
		
		.chat-message.user .message-header {
			flex-direction: row-reverse;
		}

		/* ─── Chat Input Glow Keyframes ─── */
		@keyframes chatInputGlowPulse {
			0%, 100% {
				box-shadow: 0 6px 28px rgba(0, 0, 0, 0.35),
				            0 0 18px rgba(232, 121, 160, 0.18),
				            0 0 40px rgba(232, 121, 160, 0.07);
			}
			50% {
				box-shadow: 0 8px 36px rgba(0, 0, 0, 0.4),
				            0 0 28px rgba(232, 121, 160, 0.30),
				            0 0 60px rgba(232, 121, 160, 0.12);
			}
		}

		/* ─── Chat Input Container ─── */
		.chat-input-container {
			margin: 0 14px 16px 14px;
			background: rgba(22, 22, 28, 0.8);
			backdrop-filter: blur(12px) saturate(1.3);
			-webkit-backdrop-filter: blur(12px) saturate(1.3);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 20px;
			padding: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(232, 121, 160, 0.04);
			transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.chat-input-container:focus-within {
			border-color: transparent;
			background-image: linear-gradient(rgba(22, 22, 28, 0.92), rgba(22, 22, 28, 0.92)), linear-gradient(135deg, #e879a0, #c0507a 50%, rgba(255,255,255,0.08) 100%);
			background-origin: border-box;
			background-clip: padding-box, border-box;
			transform: translateY(-1px);
			animation: chatInputGlowPulse 2.4s ease-in-out infinite;
		}

		.input-wrapper {
			padding: 14px 18px 4px 18px;
		}

		.chat-textarea {
			width: 100%;
			background: transparent;
			border: none;
			color: #e5e5e5;
			font-size: 15px;
			line-height: 1.5;
			resize: none;
			outline: none;
			min-height: 24px;
			max-height: 200px;
			font-family: inherit;
			padding: 0;
		}
		.chat-textarea:focus { background: transparent; outline: none; }
		.chat-textarea::placeholder { color: #555; }

		/* ─── Voice Wave Animation ─── */
		.voice-wave-container {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 10px 0;
			gap: 8px;
			min-height: 60px;
		}
		.voice-wave-label {
			font-size: 12px;
			color: #e879a0;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 1px;
			animation: pulseScale 1.5s ease-in-out infinite;
		}
		.voice-wave {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 3px;
			height: 24px;
		}
		.voice-wave-bar {
			width: 3px;
			height: 8px;
			background: linear-gradient(to bottom, #e879a0, #c0507a);
			border-radius: 4px;
			animation: voiceWaveAnim 1s ease-in-out infinite;
		}
		@keyframes voiceWaveAnim {
			0%, 100% { height: 6px; }
			50% { height: 24px; }
		}
		@keyframes pulseScale {
			0%, 100% { opacity: 0.7; transform: scale(1); }
			50% { opacity: 1; transform: scale(1.02); }
		}

		.global-error-banner {
			margin: 0 14px 10px 14px;
			padding: 8px 12px;
			background: rgba(248, 113, 113, 0.1);
			border: 1px solid rgba(248, 113, 113, 0.2);
			border-radius: 10px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			animation: slideInUp 0.3s ease-out;
		}
		.global-error-banner .error-content {
			display: flex;
			align-items: center;
			gap: 8px;
			color: #f87171;
			font-size: 13px;
			font-weight: 500;
		}
		.error-close {
			background: transparent;
			border: none;
			color: #f87171;
			cursor: pointer;
			display: flex;
			padding: 2px;
			border-radius: 4px;
		}
		.error-close:hover {
			background: rgba(248, 113, 113, 0.15);
		}
		@keyframes slideInUp {
			from { opacity: 0; transform: translateY(10px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.action-btn.listening {
			background: rgba(248, 113, 113, 0.15);
			color: #f87171;
			border-color: rgba(248, 113, 113, 0.3);
			animation: micPulse 1.5s infinite;
		}
		@keyframes micPulse {
			0% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.4); }
			70% { box-shadow: 0 0 0 10px rgba(248, 113, 113, 0); }
			100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
		}

		.input-footer {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 14px 14px 14px;
		}

		.left-actions {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.model-selector {
			display: flex;
			align-items: center;
			gap: 6px;
			background: transparent;
			border: none;
			color: #888;
			font-size: 13px;
			font-weight: 500;
			cursor: pointer;
			padding: 6px 10px;
			border-radius: 8px;
			transition: all 0.2s;
		}
		.model-selector:hover {
			background: rgba(232, 121, 160, 0.08);
			color: #e5e5e5;
		}

		.action-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			border-radius: 10px;
			background: rgba(255, 255, 255, 0.04);
			border: 1px solid rgba(255, 255, 255, 0.06);
			color: #888;
			cursor: pointer;
			padding: 0;
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.action-btn:hover {
			background: rgba(232, 121, 160, 0.1);
			color: #e879a0;
			border-color: rgba(232, 121, 160, 0.15);
			transform: translateY(-1px);
		}

		/* ─── Submit Button ─── */
		.submit-btn {
			width: 38px;
			height: 38px;
			border-radius: 12px;
			background: linear-gradient(135deg, #e879a0, #c0507a);
			color: #ffffff;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			box-shadow: 0 2px 10px rgba(232, 121, 160, 0.25);
		}
		.submit-btn:disabled {
			background: #1e1e22;
			color: #444;
			cursor: not-allowed;
			box-shadow: none;
			opacity: 0.6;
		}
		.submit-btn:hover:not(:disabled) {
			background: linear-gradient(135deg, #f08cb2, #d0608a);
			transform: translateY(-2px);
			box-shadow: 0 6px 20px rgba(232, 121, 160, 0.35);
		}
		.submit-btn:active:not(:disabled) {
			transform: translateY(0);
		}

		/* ─── Slash & Mention Menus ─── */
		.slash-menu, .mention-menu {
			position: absolute;
			bottom: 100%;
			left: 0;
			width: 100%;
			background: rgba(22, 22, 28, 0.95);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 14px;
			margin-bottom: 8px;
			overflow: hidden;
			box-shadow: 0 -4px 24px rgba(0,0,0,0.35);
			z-index: 50;
		}
		
		.slash-item, .mention-option {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			padding: 11px 16px;
			border: none;
			background: transparent;
			color: #e5e5e5;
			cursor: pointer;
			text-align: left;
			font-size: 14px;
			transition: background 0.15s;
		}
		.slash-item:hover, .mention-option:hover, .slash-item.selected {
			background: rgba(232, 121, 160, 0.08);
		}

		/* ─── Model Menu ─── */
		.model-menu {
			position: absolute;
			bottom: 100%;
			left: 0;
			width: 240px;
			background: rgba(22, 22, 28, 0.95);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 14px;
			margin-bottom: 8px;
			overflow: hidden;
			box-shadow: 0 4px 30px rgba(0,0,0,0.45);
			z-index: 60;
			padding: 4px;
		}
		.model-menu-header {
			padding: 10px 14px 6px;
			font-size: 10px;
			font-weight: 700;
			color: #666;
			text-transform: uppercase;
			letter-spacing: 0.8px;
		}
		.model-option {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 9px 12px;
			background: transparent;
			border: none;
			border-radius: 10px;
			cursor: pointer;
			text-align: left;
			transition: all 0.2s;
		}
		.model-option:hover { background: rgba(232, 121, 160, 0.06); }
		.model-option.active { background: rgba(232, 121, 160, 0.08); }
		.model-info { display: flex; flex-direction: column; gap: 2px; }
		.model-name { font-size: 13px; color: #e5e5e5; font-weight: 500; }
		.model-provider { font-size: 11px; color: #777; }
		.check-icon { color: #e879a0; }

		.mention-menu-header {
			padding: 10px 16px 6px;
			font-size: 10px;
			text-transform: uppercase;
			color: #666;
			font-weight: 700;
			letter-spacing: 0.8px;
			background: rgba(12, 12, 15, 0.5);
		}

		/* ─── Scrollbars ─── */
		::-webkit-scrollbar { width: 5px; }
		::-webkit-scrollbar-track { background: transparent; }
		::-webkit-scrollbar-thumb { background: rgba(232, 121, 160, 0.15); border-radius: 4px; }
		::-webkit-scrollbar-thumb:hover { background: rgba(232, 121, 160, 0.3); }

		/* ─── Typing Animation ─── */
		.typing-indicator {
			display: inline-block;
			width: 7px;
			height: 7px;
			background-color: #e879a0;
			border-radius: 50%;
			animation: typing 1.4s infinite ease-in-out both;
			margin: 0 3px;
		}
		.typing-indicator:nth-child(1) { animation-delay: -0.32s; }
		.typing-indicator:nth-child(2) { animation-delay: -0.16s; }
		@keyframes typing {
			0%, 80%, 100% { transform: scale(0); opacity: 0.4; } 
			40% { transform: scale(1); opacity: 1; }
		}

		/* ─── History Sidebar ─── */
		.history-overlay {
			position: absolute;
			top: 52px;
			left: 0;
			bottom: 0;
			right: 0;
			z-index: 2000;
			display: flex;
		}
		
		.history-sidebar {
			width: 270px;
			background: rgba(16, 16, 20, 0.92);
			backdrop-filter: blur(20px) saturate(1.4);
			-webkit-backdrop-filter: blur(20px) saturate(1.4);
			border-right: 1px solid rgba(232, 121, 160, 0.06);
			display: flex;
			flex-direction: column;
			animation: slideRight 0.25s cubic-bezier(0.22, 1, 0.36, 1);
		}
		
		.history-backdrop {
			flex: 1;
			background: rgba(0,0,0,0.5);
			backdrop-filter: blur(4px);
			animation: fadeIn 0.2s ease-out;
		}
		
		@keyframes slideRight {
			from { transform: translateX(-100%); opacity: 0.5; }
			to { transform: translateX(0); opacity: 1; }
		}
		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
		
		.history-header {
			padding: 16px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		}
		.history-header h3 {
			font-size: 14px;
			font-weight: 600;
			margin: 0;
			color: #e5e5e5;
		}
		
		.new-chat-btn-small {
			display: flex;
			align-items: center;
			gap: 5px;
			font-size: 12px;
			font-weight: 500;
			background: linear-gradient(135deg, #e879a0, #c0507a);
			color: #fff;
			border: none;
			padding: 5px 10px;
			border-radius: 6px;
			cursor: pointer;
			transition: all 0.2s;
			box-shadow: 0 2px 8px rgba(232, 121, 160, 0.2);
		}
		.new-chat-btn-small:hover {
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(232, 121, 160, 0.3);
		}
		
		.history-list {
			flex: 1;
			overflow-y: auto;
			padding: 10px;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		
		.history-item {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.2s;
			position: relative;
		}
		.history-item:hover {
			background: rgba(232, 121, 160, 0.04);
		}
		.history-item.active {
			background: rgba(232, 121, 160, 0.06);
		}
		
		.history-icon { color: #555; flex-shrink: 0; }
		.history-item.active .history-icon { color: #e879a0; }

		.history-info {
			display: flex;
			flex-direction: column;
			gap: 3px;
			overflow: hidden;
			flex: 1;
		}
		.history-title {
			font-size: 13px;
			color: #ccc;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			font-weight: 500;
		}
		.history-item.active .history-title { color: #f0f0f0; }
		.history-date { font-size: 10px; color: #555; }
		
		.delete-session-btn {
			background: transparent;
			border: none;
			color: #555;
			opacity: 0;
			transition: all 0.2s;
			padding: 4px;
			border-radius: 6px;
			cursor: pointer;
		}
		.history-item:hover .delete-session-btn { opacity: 1; }
		.delete-session-btn:hover {
			color: #f87171;
			background: rgba(248, 113, 113, 0.1);
		}

		/* ─── Empty State ─── */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 48px 24px;
			flex: 1;
			position: relative;
			overflow: hidden;
		}
		.empty-state h3 {
			font-size: 22px;
			font-weight: 700;
			color: #f0f0f0;
			margin: 0 0 8px 0;
			position: relative;
			z-index: 1;
			letter-spacing: -0.3px;
		}
		.empty-state p {
			font-size: 13px;
			color: #666;
			margin: 0 0 28px 0;
			position: relative;
			z-index: 1;
		}
		.empty-state-orb {
			position: absolute;
			top: 5%;
			left: 50%;
			transform: translateX(-50%);
			width: 280px;
			height: 280px;
			background: radial-gradient(circle, rgba(232, 121, 160, 0.14) 0%, rgba(192, 80, 122, 0.05) 40%, transparent 70%);
			border-radius: 50%;
			filter: blur(50px);
			animation: floatOrb 8s ease-in-out infinite;
		}
		@keyframes floatOrb {
			0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
			50% { transform: translateX(-50%) translateY(-18px) scale(1.05); }
		}

		/* ─── Quick Action Cards ─── */
		.quick-actions-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 10px;
			width: 100%;
			max-width: 330px;
			position: relative;
			z-index: 1;
		}
		.quick-action-card {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 14px 14px;
			background: rgba(255, 255, 255, 0.02);
			border: 1px solid rgba(255, 255, 255, 0.05);
			border-radius: 14px;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			text-align: left;
			color: #d5d5d5;
			position: relative;
			overflow: hidden;
		}
		.quick-action-card::before {
			content: '';
			position: absolute;
			inset: 0;
			background: linear-gradient(135deg, rgba(232, 121, 160, 0.04), transparent 60%);
			opacity: 0;
			transition: opacity 0.25s;
		}
		.quick-action-card:hover::before { opacity: 1; }
		.quick-action-card:hover {
			background: rgba(255, 255, 255, 0.04);
			border-color: rgba(232, 121, 160, 0.2);
			transform: translateY(-2px);
			box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(232, 121, 160, 0.06);
		}
		.quick-action-icon {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			border-radius: 10px;
			background: rgba(232, 121, 160, 0.1);
			color: #e879a0;
			flex-shrink: 0;
			position: relative;
		}
		.quick-action-label {
			font-size: 12px;
			font-weight: 500;
			line-height: 1.3;
			position: relative;
		}

		/* ─── Attachment Chip ─── */
		.attachment-chip {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 7px 12px;
			background: rgba(232, 121, 160, 0.08);
			border: 1px solid rgba(232, 121, 160, 0.15);
			border-radius: 10px;
			font-size: 12px;
			color: #e879a0;
			margin-bottom: 8px;
		}
		.attachment-chip.uploading {
			color: #fbbf24;
			background: rgba(251, 191, 36, 0.08);
			border-color: rgba(251, 191, 36, 0.15);
		}
		.attachment-name {
			max-width: 120px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-weight: 500;
		}
		.attachment-size { color: #666; }
		.attachment-remove {
			background: none;
			border: none;
			color: #666;
			cursor: pointer;
			padding: 2px;
			border-radius: 4px;
			display: flex;
			align-items: center;
			transition: all 0.15s;
		}
		.attachment-remove:hover {
			color: #f87171;
			background: rgba(248, 113, 113, 0.1);
		}

		/* ─── Voice Input Animation ─── */
		.action-btn.listening {
			color: #f87171 !important;
			background: rgba(248, 113, 113, 0.12) !important;
			border-color: rgba(248, 113, 113, 0.25) !important;
			animation: voicePulse 1.5s ease-in-out infinite;
		}
		@keyframes voicePulse {
			0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.3); }
			50% { box-shadow: 0 0 0 8px rgba(248, 113, 113, 0); }
		}

		.spin-icon { animation: spinIcon 1s linear infinite; }
		@keyframes spinIcon {
			from { transform: rotate(0deg); }
			to { transform: rotate(360deg); }
		}

		@keyframes slideIn {
			from { opacity: 0; transform: translateY(6px); }
			to { opacity: 1; transform: translateY(0); }
		}
	`}</style>
		</div>
	);
}

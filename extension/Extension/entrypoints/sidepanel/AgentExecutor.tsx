import { useState, useEffect, useRef } from "react";
import {
	Settings,
	Brain,
	Wrench,
	CheckCircle,
	XCircle,
	FileText,
	Clock,
	StopCircle,
	Camera,
	Image,
	Mic,
	Plus,
	ArrowUp,
	MoreHorizontal,
	MessageSquarePlus,
	Paperclip,
	Globe,
	Sparkles,
	Bot,
	Lightbulb,
	Search,
	AlertTriangle,
	ChevronDown,
	Check,
} from "lucide-react";
import { wsClient } from "../utils/websocket-client";
import { parseAgentCommand } from "../utils/parseAgentCommand";
import { executeAgent } from "../utils/executeAgent";
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

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

export function AgentExecutor({ wsConnected }: AgentExecutorProps) {
	const [goal, setGoal] = useState("");
	const [isExecuting, setIsExecuting] = useState(false);
	const [progress, setProgress] = useState<ProgressUpdate[]>([]);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);
	const [showMentionMenu, setShowMentionMenu] = useState(false);
	const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
	const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
	const chatContainerRef = useRef<HTMLDivElement>(null);

	// Model Selector State
	const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

	const models = [
		{ id: "gemini-2.5-flash", name: "Gemini 3 Pro", provider: "Google" },
		{ id: "gpt-5-mini", name: "GPT-5.2", provider: "OpenAI" },
		{ id: "claude-4-sonnet", name: "Claude 4.5 Sonnet", provider: "Anthropic" },
		{ id: "llama3", name: "Llama 3", provider: "Ollama" },
		{ id: "deepseek-chat", name: "DeepSeek v3.2", provider: "DeepSeek" },
		{ id: "mistral-7b", name: "Kimi K2", provider: "OpenRouter" },
	];

	// Load chat history from browser storage on mount
	useEffect(() => {
		const loadChatHistory = async () => {
			try {
				const result = await browser.storage.local.get("chatHistory");
				if (result.chatHistory) {
					setChatHistory(result.chatHistory);
					console.log(
						"✅ Loaded chat history from storage:",
						result.chatHistory.length,
						"messages"
					);
				}
			} catch (error) {
				console.error("Failed to load chat history:", error);
			}
		};
		loadChatHistory();
	}, []);

	// Save chat history to browser storage whenever it changes
	useEffect(() => {
		if (chatHistory.length > 0) {
			browser.storage.local
				.set({ chatHistory })
				.then(() => {
					console.log(
						"Saved chat history to storage:",
						chatHistory.length,
						"messages"
					);
				})
				.catch((error) => {
					console.error("Failed to save chat history:", error);
				});
		}
	}, [chatHistory]);

	// Auto-scroll to bottom when chat history updates
	useEffect(() => {
		if (chatContainerRef.current) {
			chatContainerRef.current.scrollTop =
				chatContainerRef.current.scrollHeight;
		}
	}, [chatHistory, isExecuting]);

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

	const handleExecute = async () => {
		if (!goal.trim()) {
			setError("Please enter a goal for the agent");
			return;
		}

		// Add user message to chat history
		const userMessage: ChatMessage = {
			id: Date.now().toString(),
			role: "user",
			content: goal.trim(),
			timestamp: new Date().toISOString(),
		};
		setChatHistory((prev) => [...prev, userMessage]);

		const currentGoal = goal.trim();
		setGoal(""); // Clear input immediately
		setIsExecuting(true);

		if (!currentGoal.startsWith("/")) {
			try {
				const tabs = await browser.tabs.query({
					active: true,
					currentWindow: true,
				});
				const currentTab = tabs[0];
				const url = currentTab?.url;

				const response = await fetch("http://localhost:8000/api/react-agent/", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						question: `URL: ${url}\n\n${currentGoal}`,
						chat_history: chatHistory.slice(-10),
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(
						errorData.detail || "Failed to fetch from react agent"
					);
				}

				const responseData = await response.json();

				const assistantMessage: ChatMessage = {
					id: Date.now().toString(),
					role: "assistant",
					content: formatResponseToText(responseData.answer),
					timestamp: new Date().toISOString(),
				};
				setChatHistory((prev) => [...prev, assistantMessage]);
			} catch (err: any) {
				setError(err.message || String(err));
				setChatHistory((prev) => [
					...prev,
					{
						id: Date.now().toString(),
						role: "assistant",
						content: `❌ **Error:** ${err.message || "Something went wrong."}`,
						timestamp: new Date().toISOString(),
					},
				]);
			} finally {
				setIsExecuting(false);
			}

			return;
		}

		// Simulate thinking delay
		// setTimeout(() => {
		//   setChatHistory((prev) => {
		//     // Generate test response with full conversation context
		//     const responseContent = getTestResponse(currentGoal, prev);
		//     const assistantMessage: ChatMessage = {
		//       id: (Date.now() + 1).toString(),
		//       role: "assistant",
		//       content: responseContent,
		//       timestamp: new Date().toISOString(),
		//     };
		//     const updatedHistory = [...prev, assistantMessage];
		//     console.log('✨ Response generated. Total messages:', updatedHistory.length);
		//     return updatedHistory;
		//   });
		//   setIsExecuting(false);
		// }, 800);

		// return;

		// Original code below (commented out for testing)
		const parsed = parseAgentCommand(goal.trim());
		if (parsed?.stage === "complete") {
			setIsExecuting(true);
			setError(null);
			try {
				const firstSpaceIndex = goal.indexOf(" ");
				const promptText =
					firstSpaceIndex === -1 ? "" : goal.slice(firstSpaceIndex + 1).trim();
				const responseData = await executeAgent(goal.trim(), promptText);
				setResult(responseData);
				const assistantMessage: ChatMessage = {
					id: Date.now().toString(), // Unique ID
					role: "assistant",
					content: formatResponseToText(responseData), // Extract text from JSON
					timestamp: new Date().toISOString(),
				};
				setChatHistory((prev) => [...prev, assistantMessage]);
			} catch (err: any) {
				setError(err.message || String(err));
				setChatHistory((prev) => [
					...prev,
					{
						id: Date.now().toString(),
						role: "assistant",
						content: `❌ **Error:** ${err.message || "Something went wrong."}`,
						timestamp: new Date().toISOString(),
					},
				]);
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
			const response = await wsClient.executeAgent(goal, (progressData) => {
				setProgress((prev) => [
					...prev,
					{
						status: progressData.status,
						message: progressData.message,
						timestamp: new Date().toISOString(),
					},
				]);
			});

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

	const handleInputChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		const value = e.target.value;
		setGoal(value);
		if (value.endsWith("@")) setShowMentionMenu(true);
		else setShowMentionMenu(false);
		const parsed = parseAgentCommand(value);
		if (!parsed) {
			setSlashSuggestions([]);
			return;
		}
		if (parsed.stage === "agent_select" || parsed.stage === "agent_partial") {
			const list = parsed.agents || parsed.agents || [];
			setSlashSuggestions((parsed as any).agents.map((a: string) => `/${a}`));
			return;
		}
		if (parsed.stage === "action_select") {
			setSlashSuggestions(
				(parsed as any).actions.map((ac: string) => `/${parsed.agent}-${ac}`)
			);
			return;
		}
		if (parsed.stage === "action_partial") {
			setSlashSuggestions(
				(parsed as any).actions.map((ac: string) => `/${parsed.agent}-${ac}`)
			);
			return;
		}
		if (parsed.stage === "complete") {
			setSlashSuggestions([]);
			return;
		}
		setSlashSuggestions([]);
	};

	const handleMentionSelect = (action: string) => {
		// Remove the @ and add the selected action
		const newGoal = goal.slice(0, -1) + action;
		setGoal(newGoal);
		setShowMentionMenu(false);
	};

	const handleNewChat = async () => {
		try {
			// Clear chat history from state
			setChatHistory([]);
			// Clear from browser storage
			await browser.storage.local.remove("chatHistory");
			console.log("Chat history cleared - starting new conversation");
		} catch (error) {
			console.error("Failed to clear chat history:", error);
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

			{/* Small rotated mention card (top-left) - only show when no messages */}
			{chatHistory.length === 0 && (
				<div className="mention-card">
					<div className="mention-card-header">
						<div className="at-icon-wrapper">
							<span className="at">@</span>
						</div>
						<span className="title">Mention Tabs</span>
					</div>
					<div className="mention-card-body">
						<div className="question">
							Should I buy <u>Multicolor Titanium</u> or <u>ACTIVE TU...</u>
						</div>
					</div>
				</div>
			)}

			{/* Center content */}
			<div className="main-area">
				{chatHistory.length === 0 ? (
					<div className="empty-state">
						<h3>Mention tabs to add context</h3>
						<p>Type @ to mention a tab</p>
					</div>
				) : (
					<div className="chat-container" ref={chatContainerRef}>
						{chatHistory.map((msg) => (
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
									<ReactMarkdown
										remarkPlugins={[remarkMath]}
										rehypePlugins={[rehypeKatex]}
										components={{
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
												<p className="mb-2 last:mb-0">{children}</p>
											),
											ul: ({ children }) => (
												<ul className="list-disc ml-4 mb-2">{children}</ul>
											),
											ol: ({ children }) => (
												<ol className="list-decimal ml-4 mb-2">{children}</ol>
											),
											li: ({ children }) => (
												<li className="mb-1">{children}</li>
											),
											a: ({ href, children }) => (
												<a
													href={href}
													target="_blank"
													rel="noopener noreferrer"
													className="text-blue-400 hover:underline"
												>
													{children}
												</a>
											),
										}}
									>
										{msg.content}
									</ReactMarkdown>
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
									<span className="typing-indicator">●</span>
									<span className="typing-indicator">●</span>
									<span className="typing-indicator">●</span>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Chat Input Card */}
			{/* Chat Input Area */}
			<div className="chat-input-container">
				{slashSuggestions.length > 0 && (
					<div className="slash-menu">
						{slashSuggestions.map((s, idx) => (
							<div
								key={idx}
								className="slash-item"
								onClick={() => {
									setGoal(s + " ");
									setSlashSuggestions([]);
								}}
							>
								{s}
							</div>
						))}
					</div>
				)}

				{showMentionMenu && (
					<div className="mention-menu">
						<div className="mention-menu-header">Quick Actions</div>
						<button
							className="mention-option"
							onClick={() => handleMentionSelect("Summarize")}
						>
							<FileText size={16} className="mention-icon" />
							<span className="mention-text">Summarize</span>
						</button>
						<button
							className="mention-option"
							onClick={() => handleMentionSelect("Explain")}
						>
							<Lightbulb size={16} className="mention-icon" />
							<span className="mention-text">Explain</span>
						</button>
						<button
							className="mention-option"
							onClick={() => handleMentionSelect("Analyze")}
						>
							<Search size={16} className="mention-icon" />
							<span className="mention-text">Analyze</span>
						</button>
					</div>
				)}

				<div className="input-wrapper">
					<textarea
						value={goal}
						onChange={(e) => {
							handleInputChange(e as any);
							// Auto-resize
							e.target.style.height = "auto";
							e.target.style.height =
								Math.min(e.target.scrollHeight, 200) + "px";
						}}
						onKeyDown={(e) => {
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
						<button className="action-btn" title="Search Web">
							<Globe size={18} />
						</button>
						<button className="action-btn" title="Add Attachment">
							<Paperclip size={18} />
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
			background: #121212;
			color: #e5e5e5;
			z-index: 1000;
			overflow: hidden;
		}

		.main-area {
			flex: 1;
			overflow-y: hidden;
			display: flex;
			flex-direction: column;
			position: relative;
			padding-bottom: 20px;
		}

		.chat-container {
			flex: 1;
			overflow-y: auto;
			padding: 20px 15px;
			display: flex;
			flex-direction: column;
			gap: 16px;
			scroll-behavior: smooth;
		}

		.chat-input-container {
			margin: 0 15px 20px 15px;
			background: #1e1e1e;
			border: 1px solid #333;
			border-radius: 16px;
			padding: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
			transition: border-color 0.2s;
		}

		.chat-input-container:focus-within {
			border-color: #444;
		}

		.input-wrapper {
			padding: 12px 16px 4px 16px;
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

		.chat-textarea::placeholder {
			color: #666;
		}

		.input-footer {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 12px 12px 12px;
		}

		.left-actions {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.model-selector {
			display: flex;
			align-items: center;
			gap: 6px;
			background: transparent;
			border: none;
			color: #999;
			font-size: 13px;
			font-weight: 500;
			cursor: pointer;
			padding: 6px 8px;
			border-radius: 6px;
			transition: all 0.2s;
		}

		.model-selector:hover {
			background: rgba(255, 255, 255, 0.05);
			color: #e5e5e5;
		}

		.action-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border-radius: 50%;
			background: rgba(255, 255, 255, 0.05); /* Slight background for round buttons */
			border: 1px solid rgba(255, 255, 255, 0.05);
			color: #999;
			cursor: pointer;
			padding: 0;
			transition: all 0.2s;
		}

		.action-btn:hover {
			background: rgba(255, 255, 255, 0.1);
			color: #e5e5e5;
			border-color: rgba(255, 255, 255, 0.1);
		}

		.submit-btn {
			width: 36px;
			height: 36px;
			border-radius: 10px; /* Squircle shape */
			background: #4a3b4f; /* Muted purple/brown context from image */
			color: #ffffff; /* Explicit white icon */
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			transition: all 0.2s;
			opacity: 1;
		}

		.submit-btn:disabled {
			background: #2a2a2a;
			color: #555;
			cursor: not-allowed;
			opacity: 0.7;
		}

		.submit-btn:hover:not(:disabled) {
			background: #5d4a63;
			transform: translateY(-1px);
		}

		/* Slash & Mention Menus */
		.slash-menu, .mention-menu {
			position: absolute;
			bottom: 100%;
			left: 0;
			width: 100%;
			background: #1e1e1e;
			border: 1px solid #333;
			border-radius: 12px;
			margin-bottom: 8px;
			overflow: hidden;
			box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
			z-index: 50;
		}
		
		.slash-item, .mention-option {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			padding: 10px 16px;
			border: none;
			background: transparent;
			color: #e5e5e5;
			cursor: pointer;
			text-align: left;
			font-size: 14px;
			transition: background 0.15s;
		}

		.slash-item:hover, .mention-option:hover {
			background: #2a2a2a;
		}

		/* Model Menu */
		.model-menu {
			position: absolute;
			bottom: 100%;
			left: 0;
			width: 240px;
			background: #1e1e1e;
			border: 1px solid #333;
			border-radius: 12px;
			margin-bottom: 8px;
			overflow: hidden;
			box-shadow: 0 4px 20px rgba(0,0,0,0.4);
			z-index: 60;
			padding: 4px;
		}

		.model-menu-header {
			padding: 8px 12px;
			font-size: 11px;
			font-weight: 600;
			color: #666;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.model-option {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 8px 12px;
			background: transparent;
			border: none;
			border-radius: 8px;
			cursor: pointer;
			text-align: left;
			transition: all 0.2s;
		}

		.model-option:hover {
			background: #2a2a2a;
		}

		.model-option.active {
			background: #2a2a2a;
		}

		.model-info {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		.model-name {
			font-size: 13px;
			color: #e5e5e5;
			font-weight: 500;
		}

		.model-provider {
			font-size: 11px;
			color: #888;
		}

		.check-icon {
			color: #4ade80;
		}

		.mention-menu-header {
			padding: 8px 16px;
			font-size: 11px;
			text-transform: uppercase;
			color: #666;
			font-weight: 600;
			letter-spacing: 0.5px;
			background: #181818;
		}

		/* Chat Message Styling */
		.chat-message {
			display: flex;
			flex-direction: column;
			max-width: 85%;
			animation: slideIn 0.3s ease;
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
			margin-bottom: 4px;
			padding: 0 4px;
		}

		.role-label {
			font-size: 13px;
			font-weight: 500;
			color: #e5e5e5;
		}

		.bot-label {
			display: flex;
			align-items: center;
			gap: 6px;
			color: #a78bfa;
		}

		.timestamp {
			font-size: 11px;
			color: #666;
		}
		
		.message-bubble {
			padding: 12px 16px;
			font-size: 14px;
			line-height: 1.6;
			color: #e5e5e5;
			white-space: pre-wrap;
			word-wrap: break-word;
			border-radius: 12px;
			box-shadow: 0 1px 2px rgba(0,0,0,0.1);
		}

		.message-bubble p {
			margin: 0 0 8px 0;
		}

		.message-bubble p:last-child {
			margin-bottom: 0;
		}

		.code-block {
			background: #1a1a1a;
			padding: 10px;
			border-radius: 6px;
			overflow-x: auto;
			margin: 8px 0;
			border: 1px solid #333;
		}

		.inline-code {
			background: rgba(255, 255, 255, 0.1);
			padding: 2px 4px;
			border-radius: 4px;
			font-family: monospace;
			font-size: 0.9em;
		}

		.chat-message.user .message-bubble {
			background: #2a2a2a;
			color: #fff;
			border-top-right-radius: 4px;
		}

		.chat-message.assistant .message-bubble {
			background: transparent;
			padding-left: 0;
			padding-right: 0;
			padding-top: 0;
		}
		
		.chat-message.user .message-header {
			flex-direction: row-reverse;
		}
		
		/* Scrollbars */
		::-webkit-scrollbar { width: 6px; }
		::-webkit-scrollbar-track { background: transparent; }
		::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
		::-webkit-scrollbar-thumb:hover { background: #444; }

		/* Empty State */
		.empty-state { text-align: center; opacity: 0.6; padding: 40px 20px; }
	`}</style>
		</div>
	);
}

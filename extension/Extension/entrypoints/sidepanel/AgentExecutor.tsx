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
} from "lucide-react";
import { wsClient } from "../utils/websocket-client";
import { parseAgentCommand } from "../utils/parseAgentCommand";
import { executeAgent } from "../utils/executeAgent";
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
					throw new Error(errorData.detail || "Failed to fetch from react agent");
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
												<Bot size={12} /> Assistant
											</span>
										)}
									</span>
									<span className="timestamp">
										{new Date(msg.timestamp).toLocaleTimeString()}
									</span>
								</div>
								<div className="message-content">
									{msg.content.split("\n").map((line, idx) => (
										<div key={idx}>{line || <br />}</div>
									))}
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
								<div className="message-content typing">
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
			<div className="chat-input-card">
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

				<div className="input-top-row">
					<button
						className="context-pill"
						onClick={() =>
							setGoal((prev) => prev + (prev.endsWith(" ") ? "@" : " @"))
						}
					>
						<span className="at-symbol">@</span>
						<span>Add context</span>
					</button>
				</div>

				<textarea
					value={goal}
					onChange={(e) => {
						handleInputChange(e as any);
						// Auto-resize
						e.target.style.height = "auto";
						e.target.style.height = e.target.scrollHeight + "px";
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleExecute();
						}
					}}
					placeholder="Ask, search, or make anything..."
					disabled={isExecuting}
					className="chat-textarea"
					rows={1}
				/>

				<div className="input-bottom-row">
					<div className="left-actions">
						<button className="action-btn">
							<Paperclip size={14} />
							<span>Auto</span>
						</button>
						<button className="action-btn">
							<Globe size={14} />
							<span>All Sources</span>
						</button>
					</div>

					<button
						className="submit-btn"
						onClick={handleExecute}
						disabled={isExecuting || !goal.trim()}
					>
						<ArrowUp size={18} />
					</button>
				</div>
			</div>

			<style>{`
        .agent-executor-fixed {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: calc(100vh - 52px);
          padding: 20px 18px;
          background: linear-gradient(180deg,#070707,#040404);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -10px 30px rgba(0,0,0,0.7);
        }

        .ws-warning { padding:8px 12px; font-size:11px; color:#f87171; background:#2a1414; border-radius:8px; text-align:center; margin-bottom:10px }

        .mention-card { position:absolute; top:60px; left:50%; width:300px; background: linear-gradient(135deg, rgba(30,30,30,0.95), rgba(20,20,20,0.98)); border-radius:16px; padding:0; transform: translateX(-50%) rotate(-4deg); box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1) inset; border:1px solid rgba(255,255,255,0.08); color:#e5e5e5; z-index:30; overflow:hidden; backdrop-filter:blur(10px) }
        .mention-card-header { display:flex; align-items:center; gap:12px; padding:14px 16px; background: linear-gradient(135deg, rgba(40,40,40,0.6), rgba(25,25,25,0.8)); border-bottom:1px solid rgba(255,255,255,0.06) }
        .mention-card-header .at { background: linear-gradient(135deg, #fff, #e8e8e8); color:#000; width:28px; height:28px; border-radius:50%; font-weight:700; font-size:15px; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 8px rgba(255,255,255,0.2) }
        .mention-card-header .title { font-size:15px; font-weight:600; color:#fff; letter-spacing:0.3px }
        .mention-card-body { padding:14px 16px }
        .mention-card .question { color:#c0c0c0; font-size:13.5px; line-height:1.6 }

        .main-area { flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column; overflow:hidden }
        .empty-state h3 { margin:0; color:#e8e8e8; font-size:19px; font-weight:600; letter-spacing:0.2px }
        .empty-state p { margin:8px 0 0 0; color:#888; font-size:14px; letter-spacing:0.3px }

        /* Chat Container */
        .chat-container { width:100%; height:100%; overflow-y:auto; padding:20px 10px; display:flex; flex-direction:column; gap:16px }
        .chat-container::-webkit-scrollbar { width:6px }
        .chat-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:3px }
        .chat-container::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15) }
        
        .chat-message { padding:14px 16px; border-radius:12px; max-width:85%; animation: slideIn 0.3s ease }
        .chat-message.user { background: linear-gradient(135deg, rgba(60,60,200,0.15), rgba(40,40,150,0.2)); border:1px solid rgba(100,100,255,0.2); align-self:flex-end; margin-left:auto }
        .chat-message.assistant { background: linear-gradient(135deg, rgba(50,50,50,0.5), rgba(35,35,35,0.6)); border:1px solid rgba(255,255,255,0.08); align-self:flex-start }
        
        .message-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:12px }
        .role-label { font-size:12px; font-weight:600; color:#a0a0a0; text-transform:uppercase; letter-spacing:0.5px; display: flex; align-items: center; gap: 6px; }
        .bot-label { display: flex; align-items: center; gap: 4px; }
        .mention-icon { color: #a0a0a0; }
        .timestamp { font-size:11px; color:#666; }
        
        .message-content { color:#e8e8e8; font-size:14px; line-height:1.6; white-space:pre-wrap; word-wrap:break-word }
        
        /* Typing indicator */
        .typing { display:flex; gap:4px; padding:8px 0 }
        .typing-indicator { width:8px; height:8px; border-radius:50%; background:#888; animation: bounce 1.4s infinite ease-in-out both }
        .typing-indicator:nth-child(1) { animation-delay: -0.32s }
        .typing-indicator:nth-child(2) { animation-delay: -0.16s }
        
        @keyframes slideIn {
          from { opacity:0; transform: translateY(10px) }
          to { opacity:1; transform: translateY(0) }
        }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity:0.5 }
          40% { transform: scale(1); opacity:1 }
        }

        .chat-input-card {
          background: #141414;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: relative;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }

        .input-top-row {
          display: flex;
          align-items: center;
        }

        .context-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #1f1f1f;
          border: 1px solid #2a2a2a;
          border-radius: 20px;
          padding: 4px 10px;
          color: #a0a0a0;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .context-pill:hover {
          background: #2a2a2a;
          color: #e5e5e5;
        }

        .at-symbol {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          background: #333;
          border-radius: 50%;
          font-size: 10px;
          color: #fff;
        }

        .chat-textarea {
          background: transparent;
          border: none;
          color: #e5e5e5;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          outline: none;
          padding: 4px 0;
          min-height: 24px;
          max-height: 120px;
          font-family: inherit;
        }

        .chat-textarea::placeholder {
          color: #666;
        }

        .input-bottom-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 4px;
        }

        .left-actions {
          display: flex;
          gap: 12px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .action-btn:hover {
          color: #e5e5e5;
          background: rgba(255,255,255,0.05);
        }

        .submit-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e5e5e5;
          color: #000;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
        }

        .submit-btn:hover:not(:disabled) {
          transform: scale(1.05);
          background: #fff;
        }

        /* Mention Menu Position Fix */
        .mention-menu {
          bottom: 100%;
          margin-bottom: 10px;
        }
        
        .slash-menu {
          bottom: 100%;
          margin-bottom: 10px;
        }
      `}</style>
		</div>
	);
}

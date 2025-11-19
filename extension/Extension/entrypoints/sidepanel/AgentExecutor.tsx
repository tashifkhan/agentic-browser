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

  // Auto-scroll to bottom when chat history updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isExecuting]);

  // Hardcoded test responses
  const getTestResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes("summarize") || lowerMessage.includes("summary")) {
      return "📝 **Summary Generated**\n\nThis page discusses the latest developments in AI technology, focusing on:\n\n• Large Language Models (LLMs) and their applications\n• Recent breakthroughs in neural networks\n• Ethical considerations in AI development\n• Future trends and predictions\n\nKey takeaway: AI is rapidly evolving with significant implications for various industries.";
    }
    
    if (lowerMessage.includes("explain") || lowerMessage.includes("what is")) {
      return "💡 **Explanation**\n\nBased on the current page content, here's a detailed breakdown:\n\nThe main concept revolves around browser automation and intelligent agents. These AI-powered assistants can:\n\n1. Navigate web pages autonomously\n2. Extract and process information\n3. Interact with UI elements\n4. Make decisions based on context\n\nThis technology enables users to automate repetitive tasks and gain insights from web content efficiently.";
    }
    
    if (lowerMessage.includes("analyze") || lowerMessage.includes("analysis")) {
      return "🔍 **Analysis Results**\n\n**Content Type:** Technical Documentation\n**Reading Time:** ~8 minutes\n**Complexity Level:** Intermediate\n\n**Key Insights:**\n• The page contains 1,247 words\n• 15 code snippets identified\n• 8 external links found\n• Primary topics: AI, automation, web scraping\n\n**Sentiment:** Positive and informative\n**Recommendation:** Good resource for developers learning about browser automation.";
    }
    
    if (lowerMessage.includes("help") || lowerMessage.includes("what can you do")) {
      return "🤖 **Available Commands**\n\nI can help you with:\n\n**📝 Content Actions**\n• Summarize - Get a quick overview\n• Explain - Detailed explanations\n• Analyze - Deep content analysis\n\n**🔧 Web Actions**\n• Extract links and data\n• Fill forms automatically\n• Navigate between pages\n• Take screenshots\n\n**🎯 Advanced Features**\n• Search within page\n• Compare content\n• Generate reports\n\nJust type your request or use @ to mention tabs!";
    }
    
    if (lowerMessage.includes("screenshot") || lowerMessage.includes("capture")) {
      return "📸 **Screenshot Captured**\n\nI've taken a screenshot of the current page!\n\n✅ Image saved successfully\n📏 Resolution: 1920x1080\n📅 Timestamp: " + new Date().toLocaleString() + "\n\nThe screenshot has been saved to your downloads folder.";
    }
    
    // Default response
    return "✨ **Response**\n\nI understand you said: \"" + userMessage + "\"\n\nI'm your AI browser assistant! I can help you:\n• Understand page content\n• Automate tasks\n• Extract information\n• Navigate efficiently\n\nTry asking me to summarize, explain, or analyze the current page!";
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

    // Simulate thinking delay
    setTimeout(() => {
      // Generate test response
      const responseContent = getTestResponse(currentGoal);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseContent,
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, assistantMessage]);
      setIsExecuting(false);
    }, 800);

    return;

    // Original code below (commented out for testing)
    /*
    const parsed = parseAgentCommand(goal.trim());
    if (parsed?.stage === "complete") {
      setIsExecuting(true);
      setError(null);
      try {
        const firstSpaceIndex = goal.indexOf(" ");
        const promptText = firstSpaceIndex === -1
          ? ""
          : goal.slice(firstSpaceIndex + 1).trim();
        const responseData = await executeAgent(goal.trim(), promptText);
        setResult(responseData);
      } catch (err: any) {
        setError(err.message || String(err));
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
    */
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setSlashSuggestions((parsed as any).actions.map((ac: string) => `/${parsed.agent}-${ac}`));
      return;
    }
    if (parsed.stage === "action_partial") {
      setSlashSuggestions((parsed as any).actions.map((ac: string) => `/${parsed.agent}-${ac}`));
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
      {!wsConnected && (
        <div className="ws-warning">⚠️ WebSocket not connected - Please connect in settings</div>
      )}

      {/* Small rotated mention card (top-left) */}
      <div className="mention-card">
        <div className="mention-card-header">
          <span className="at">@</span>
          <span className="title">Mention Tabs</span>
        </div>
        <div className="mention-card-body">
          <div className="question">Should I buy <u>Multicolor Titanium</u> or <u>ACTIVE TU...</u></div>
        </div>
      </div>

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
                    {msg.role === "user" ? "You" : "🤖 Assistant"}
                  </span>
                  <span className="timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">
                  {msg.content.split('\n').map((line, idx) => (
                    <div key={idx}>{line || <br />}</div>
                  ))}
                </div>
              </div>
            ))}
            {isExecuting && (
              <div className="chat-message assistant">
                <div className="message-header">
                  <span className="role-label">🤖 Assistant</span>
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

      {/* Pills above composer */}
      <div className="pills-row">
        <button className="pill" onClick={() => { setGoal("Summarize this page"); }}>Summarize</button>
        <button className="pill" onClick={() => { setGoal("Explain this page"); }}>Explain</button>
        <button className="pill" onClick={() => { setGoal("Analyze this page"); }}>Analyze</button>
      </div>

      {/* Composer */}
      <div className="composer-wrap">
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
            <button className="mention-option" onClick={() => handleMentionSelect("Summarize")}>
              <span className="mention-icon">📝</span>
              <span className="mention-text">Summarize</span>
            </button>
            <button className="mention-option" onClick={() => handleMentionSelect("Explain")}>
              <span className="mention-icon">💡</span>
              <span className="mention-text">Explain</span>
            </button>
            <button className="mention-option" onClick={() => handleMentionSelect("Analyze")}>
              <span className="mention-icon">🔍</span>
              <span className="mention-text">Analyze</span>
            </button>
          </div>
        )}

        <div className="composer-bar">
          <div className="left-icons">
            <button className="icon-btn"><Plus size={16} /></button>
            <button className="icon-btn"><MoreHorizontal size={16} /></button>
          </div>

          <input
            value={goal}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder="Ask a question about this page..."
            disabled={isExecuting}
          />

          <div className="right-icons">
            <button className="icon-btn"><Camera size={16} /></button>
            <button className="icon-btn"><Mic size={16} /></button>
          </div>

          {/* <button className="send" onClick={handleExecute} disabled={isExecuting || !wsConnected}><ArrowUp size={20} /></button> */}
          <button
            className="send"
            onClick={handleExecute}
            disabled={isExecuting || !goal.trim()}
          >
            <ArrowUp size={20} />
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
        .role-label { font-size:12px; font-weight:600; color:#a0a0a0; text-transform:uppercase; letter-spacing:0.5px }
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

        .pills-row { display:flex; gap:10px; margin-bottom:20px; padding:0 4px }
        .pill { background: linear-gradient(135deg, rgba(60,60,60,0.3), rgba(40,40,40,0.5)); color:#d8d8d8; padding:10px 20px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); font-size:13.5px; cursor:pointer; font-weight:500; letter-spacing:0.3px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 8px rgba(0,0,0,0.2) }
        .pill:hover { background: linear-gradient(135deg, rgba(80,80,80,0.4), rgba(60,60,60,0.6)); color:#fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3) }

        .composer-wrap { position:relative; padding-top:10px }
        .composer-bar { display:flex; align-items:center; gap:12px; background: linear-gradient(135deg, rgba(50,50,50,0.6), rgba(35,35,35,0.8)); border-radius:24px; padding:12px 14px; border:1px solid rgba(255,255,255,0.1); min-height:56px; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset; backdrop-filter: blur(10px) }
        .composer-bar input { flex:1; border:0; outline:none; background:transparent; color:#f0f0f0; font-size:15px; padding:8px 10px }
        .composer-bar input::placeholder { color:#888; font-size:15px; letter-spacing:0.2px }
        .left-icons { display:flex; gap:4px; align-items:center }
        .right-icons { display:flex; gap:4px; align-items:center }
        .icon-btn { background: rgba(255,255,255,0.05); border:0; color:#b0b0b0; padding:9px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border:1px solid rgba(255,255,255,0.05) }
        .icon-btn:hover { background: rgba(255,255,255,0.12); color:#e8e8e8; transform: translateY(-1px); border-color: rgba(255,255,255,0.1) }
        .send { background: linear-gradient(135deg, rgba(100,100,255,0.2), rgba(80,80,200,0.3)); border:none; color:#fff; width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; border:1px solid rgba(120,120,255,0.3); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 16px rgba(80,80,200,0.2) }
        .send:disabled { opacity:0.4; cursor:not-allowed }
        .send:hover:not(:disabled) { background: linear-gradient(135deg, rgba(120,120,255,0.3), rgba(100,100,220,0.4)); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(100,100,220,0.3) }

        /* Mention Menu */
        .mention-menu { position:absolute; bottom:72px; left:0; right:0; background: linear-gradient(135deg, rgba(45,45,45,0.98), rgba(30,30,30,0.98)); border-radius:16px; padding:8px; border:1px solid rgba(255,255,255,0.1); box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1) inset; backdrop-filter: blur(20px); animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1) }
        .mention-menu-header { padding:10px 12px; font-size:12px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:0.5px }
        .mention-option { width:100%; background: rgba(255,255,255,0.03); border:none; padding:12px 14px; border-radius:10px; margin-bottom:4px; cursor:pointer; display:flex; align-items:center; gap:12px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border:1px solid rgba(255,255,255,0.05) }
        .mention-option:last-child { margin-bottom:0 }
        .mention-option:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); transform: translateX(4px) }
        .mention-icon { font-size:18px; flex-shrink:0 }
        .mention-text { color:#e0e0e0; font-size:14px; font-weight:500; letter-spacing:0.2px }
        
        @keyframes slideUp {
          from { opacity:0; transform: translateY(10px) }
          to { opacity:1; transform: translateY(0) }
        }

        /* scrollbar tidy */
        .agent-executor-fixed::-webkit-scrollbar { width:6px }
        .agent-executor-fixed::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.03); border-radius:3px }
        /* Slash command popup */
.slash-menu {
  position: absolute;
  bottom: 72px;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, rgba(50,50,50,0.95), rgba(30,30,30,0.95));
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 6px;
  z-index: 3000;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  backdrop-filter: blur(12px);
}

.slash-item {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: #eee;
  cursor: pointer;
  transition: 0.15s;
}

.slash-item:hover {
  background: rgba(255,255,255,0.07);
  transform: translateX(4px);
}

      `}</style>
    </div>
  );
}
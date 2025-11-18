import { useState } from "react";
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

export function AgentExecutor({ wsConnected }: AgentExecutorProps) {
  const [goal, setGoal] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
  const handleExecute = async () => {
    if (!goal.trim()) {
      setError("Please enter a goal for the agent");
      return;
    }

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
        <div className="empty-state">
          <h3>Mention tabs to add context</h3>
          <p>Type @ to mention a tab</p>
        </div>
      </div>

      {/* Pills above composer */}
      <div className="pills-row">
        <button className="pill">Summarize</button>
        <button className="pill">Explain</button>
        <button className="pill">Analyze</button>
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

        .main-area { flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column }
        .empty-state h3 { margin:0; color:#e8e8e8; font-size:19px; font-weight:600; letter-spacing:0.2px }
        .empty-state p { margin:8px 0 0 0; color:#888; font-size:14px; letter-spacing:0.3px }

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
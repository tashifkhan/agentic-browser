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
} from "lucide-react";
import { wsClient } from "../utils/websocket-client";

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

  const handleExecute = async () => {
    if (!goal.trim()) {
      setError("Please enter a goal for the agent");
      return;
    }

    if (!wsConnected) {
      setError("WebSocket not connected. Please connect first.");
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
        <div
          style={{
            padding: "8px 12px",
            fontSize: "11px",
            color: "#f87171",
            backgroundColor: "#2a1414",
            borderBottom: "1px solid #3f1f1f",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          ⚠️ WebSocket not connected - Please connect in settings
        </div>
      )}

      {/* Output Section */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          backgroundColor: "#0f0f0f",
          borderBottom: "1px solid #1f1f1f",
          minHeight: "200px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {progress.length === 0 && !error && !result ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#666",
              fontSize: "13px",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div style={{ maxWidth: "320px" }}>
              <FileText
                size={32}
                strokeWidth={1.5}
                style={{ marginBottom: "12px", opacity: 0.5 }}
              />
              <h3
                style={{
                  margin: "0 0 6px 0",
                  color: "#999",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                AI Agent Ready
              </h3>
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "11px",
                  color: "#555",
                  lineHeight: "1.5",
                }}
              >
                Describe your task and the agent will handle it
              </p>

              <div style={{ textAlign: "left" }}>
                <p
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "10px",
                    color: "#777",
                    fontWeight: 500,
                  }}
                >
                  ✨ Capabilities:
                </p>
                <ul
                  style={{
                    margin: 0,
                    padding: "0 0 0 18px",
                    fontSize: "10px",
                    color: "#666",
                    lineHeight: "1.6",
                  }}
                >
                  <li>Navigate & interact with websites</li>
                  <li>Fill forms & extract data</li>
                  <li>Manage tabs & take screenshots</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <>
            {progress.length > 0 && (
              <div>
                {progress.map((update, index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: "8px",
                      fontSize: "12px",
                      lineHeight: "1.6",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "2px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          color: getStatusColor(update.status),
                        }}
                      >
                        {getStatusIcon(update.status)}
                      </span>
                      <span
                        style={{
                          color: getStatusColor(update.status),
                          fontWeight: "600",
                          fontSize: "11px",
                        }}
                      >
                        {update.status.toUpperCase()}
                      </span>
                      {update.timestamp && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#666666",
                          }}
                        >
                          {new Date(update.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        color: "#e5e5e5",
                        paddingLeft: "20px",
                      }}
                    >
                      {update.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result && (
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid #1f1f1f",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#4ade80",
                    fontWeight: "600",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <CheckCircle size={12} strokeWidth={2.5} />
                  RESULT:
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#e5e5e5",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {result.result || JSON.stringify(result, null, 2)}
                </div>
                {result.steps_taken && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "10px",
                      color: "#888",
                    }}
                  >
                    Steps taken: {result.steps_taken}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid #1f1f1f",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "#f87171",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <XCircle size={14} strokeWidth={2.5} />
                  ERROR: {error}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          backgroundColor: "#0a0a0a",
          zIndex: 10,
        }}
      >
        <textarea
          id="agent-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="What should the agent do?"
          rows={2}
          disabled={isExecuting}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px 8px 0 0",
            border: "1px solid #2a2a2a",
            borderBottom: "none",
            backgroundColor: "#141414",
            color: "#e5e5e5",
            fontSize: "12px",
            resize: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
            margin: 0,
          }}
        />

        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
          <button
            onClick={handleExecute}
            disabled={isExecuting || !wsConnected}
            style={{
              flex: 1,
              padding: "10px",
              backgroundColor: isExecuting
                ? "#0f0f0f"
                : wsConnected
                ? "#1f1f1f"
                : "#141414",
              color: wsConnected ? "#ffffff" : "#666666",
              border: "1px solid #2a2a2a",
              borderTop: "none",
              borderRadius: isExecuting ? "0" : "0 0 0 8px",
              fontSize: "12px",
              fontWeight: "500",
              cursor: isExecuting || !wsConnected ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              boxSizing: "border-box",
            }}
          >
            {isExecuting ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "center",
                }}
              >
                <Clock size={14} strokeWidth={2.5} />
                Working...
              </span>
            ) : (
              "Execute"
            )}
          </button>

          {isExecuting && (
            <button
              onClick={handleStop}
              style={{
                padding: "10px 16px",
                backgroundColor: "#7f1d1d",
                color: "#ffffff",
                border: "1px solid #991b1b",
                borderTop: "none",
                borderRadius: "0 0 8px 0",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.15s",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#991b1b";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#7f1d1d";
              }}
            >
              <StopCircle size={14} strokeWidth={2.5} />
              Stop
            </button>
          )}
        </div>
      </div>

      <style>{`
        .agent-executor-fixed {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0;
          background-color: #0a0a0a;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.5);
          z-index: 1000;
          border-top: 1px solid #1f1f1f;
          height: calc(100vh - 52px);
          max-height: calc(100vh - 52px);
          display: flex;
          flex-direction: column;
        }

        .agent-executor-fixed > div:first-child::-webkit-scrollbar {
          width: 6px;
        }

        .agent-executor-fixed > div:first-child::-webkit-scrollbar-track {
          background: transparent;
        }

        .agent-executor-fixed > div:first-child::-webkit-scrollbar-thumb {
          background: #2a2a2a;
          border-radius: 3px;
        }

        .agent-executor-fixed > div:first-child::-webkit-scrollbar-thumb:hover {
          background: #3a3a3a;
        }
      `}</style>
    </div>
  );
}

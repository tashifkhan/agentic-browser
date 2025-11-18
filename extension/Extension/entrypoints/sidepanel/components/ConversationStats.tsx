import { useState } from "react";
import { wsClient } from "../../utils/websocket-client";
import { BarChart3, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface ConversationStatsProps {
  conversationStats: any;
  wsConnected: boolean;
  useWebSocket: boolean;
  onRefresh: () => void;
  onClearResponse: (message: string) => void;
  position?: { top?: string; right?: string; bottom?: string; left?: string };
}

export function ConversationStats({
  conversationStats,
  wsConnected,
  useWebSocket,
  onRefresh,
  onClearResponse,
  position = { top: "16px", right: "16px" },
}: ConversationStatsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClearHistory = async () => {
    if (!confirm("Delete all conversation history? This cannot be undone.")) {
      return;
    }

    try {
      if (useWebSocket && wsConnected) {
        await wsClient.clearHistory();
        onClearResponse("History cleared");
      } else {
        const response = await fetch("http://localhost:8080/clear-history", {
          method: "POST",
        });
        const data = await response.json();
        if (data.ok) {
          onClearResponse("History cleared");
        } else {
          onClearResponse(`Error: ${data.error}`);
        }
      }
      onRefresh();
      setIsOpen(false);
    } catch (error) {
      onClearResponse(`Error: ${(error as Error).message}`);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          ...position,
          width: "38px",
          height: "38px",
          borderRadius: "9px",
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10001,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(42, 42, 42, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <BarChart3 size={20} color="#e5e5e5" />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: isOpen ? 0 : "-300px",
        width: "300px",
        height: "auto",
        maxHeight: "50vh",
        backgroundColor: "#1a1a1a",
        borderLeft: "1px solid #2a2a2a",
        borderTop: "1px solid #2a2a2a",
        borderTopLeftRadius: "12px",
        zIndex: 10000,
        boxShadow: "-4px -4px 24px rgba(0,0,0,0.5)",
        color: "white",
        padding: "16px",
        transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BarChart3 size={18} />
          <h3 style={{ margin: 0, fontSize: "16px" }}>Learning Stats</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "#999",
            cursor: "pointer",
            padding: "4px",
            fontSize: "18px",
          }}
        >
          ×
        </button>
      </div>

      <div className="stat-card">
        <span className="stat-label">Total Interactions</span>
        <span className="stat-value">
          {conversationStats?.total_interactions ?? 0}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Successful</span>
        <span className="stat-value">
          {conversationStats?.successful_interactions ?? 0}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Current Session</span>
        <span className="stat-value">
          {conversationStats?.current_session_length ?? 0}
        </span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        <button
          onClick={handleRefresh}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
          disabled={isRefreshing}
        >
          <RefreshCw
            size={14}
            style={{
              animation: isRefreshing ? "spin 1s linear infinite" : "none",
            }}
          />
          Refresh
        </button>
        <button
          onClick={handleClearHistory}
          style={{
            flex: 1,
            background: "#2a1414",
            borderColor: "#3f1f1f",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

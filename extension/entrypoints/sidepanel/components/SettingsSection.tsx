import { useState } from "react";
import { wsClient } from "../../utils/websocket-client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CuteTextInput } from "./CuteTextInput";

interface SettingsSectionProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  onSave: () => void;
  wsConnected: boolean;
}

export function SettingsSection({
  apiKey,
  setApiKey,
  onSave,
  wsConnected,
}: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section style={{ padding: "8px 12px" }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h3 style={{ margin: 0 }}>Settings</h3>
          <div
            className={`status-indicator ${
              wsConnected ? "status-connected" : "status-disconnected"
            }`}
            style={{
              padding: "3px 6px",
              fontSize: "10px",
              marginBottom: 0,
            }}
          >
            <span>{wsConnected ? "●" : "○"}</span>
          </div>
        </div>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {isExpanded && (
        <div style={{ marginTop: "8px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "6px",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <CuteTextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder="Gemini API Key"
              onSubmit={onSave}
            />
            <button onClick={onSave} style={{ padding: "7px 12px" }}>
              Save
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "6px",
              alignItems: "center",
            }}
          >
            <div
              className={`status-indicator ${
                wsConnected ? "status-connected" : "status-disconnected"
              }`}
              style={{ marginBottom: 0 }}
            >
              <span>{wsConnected ? "●" : "○"}</span>
              <span style={{ fontSize: "11px" }}>
                {wsConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <button
              onClick={() => {
                if (wsConnected) {
                  wsClient.disconnect();
                } else {
                  wsClient.connect();
                }
              }}
              style={{ padding: "7px 12px" }}
            >
              {wsConnected ? "Disconnect" : "Connect"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

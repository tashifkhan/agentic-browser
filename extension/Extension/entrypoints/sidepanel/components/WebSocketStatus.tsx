import { wsClient } from "../../utils/websocket-client";

interface WebSocketStatusProps {
  wsConnected: boolean;
}

export function WebSocketStatus({ wsConnected }: WebSocketStatusProps) {
  return (
    <section style={{ padding: "8px 12px" }}>
      <div
        className={`status-indicator ${
          wsConnected ? "status-connected" : "status-disconnected"
        }`}
      >
        <span>{wsConnected ? "●" : "○"}</span>
        <span>{wsConnected ? "Connected" : "Disconnected"}</span>
      </div>
      <button
        onClick={() => {
          if (wsConnected) {
            wsClient.disconnect();
          } else {
            wsClient.connect();
          }
        }}
        style={{
          marginTop: "8px",
          width: "100%",
        }}
      >
        {wsConnected ? "Disconnect" : "Reconnect"}
      </button>
    </section>
  );
}

import { useState, useEffect } from "react";
import { wsClient } from "../../utils/websocket-client";

export function useWebSocket(setResponse: (response: string) => void) {
  const [wsConnected, setWsConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);

  useEffect(() => {
    setupWebSocket();
    checkAutoConnectStatus();

    return () => {
      // Don't disconnect on unmount to allow auto-reconnect
      // wsClient.disconnect();
    };
  }, []);

  const checkAutoConnectStatus = async () => {
    try {
      const result = await browser.storage.local.get("wsAutoConnect");
      setAutoConnectEnabled(result.wsAutoConnect !== false);
    } catch (error) {
      console.log("Could not check auto-connect status:", error);
    }
  };

  const setupWebSocket = () => {
    wsClient.on("connection_status", (data: any) => {
      setWsConnected(data.connected);
      if (data.connected) {
        console.log("✅ WebSocket connected");
        setResponse("🔗 WebSocket connected to server");
      } else {
        console.log("❌ WebSocket disconnected:", data.reason);
        setResponse("⚠️ WebSocket disconnected. Falling back to HTTP...");
      }
    });

    wsClient.on("generation_progress", (data: any) => {
      setResponse(`⏳ ${data.message}`);
    });

    setWsConnected(wsClient.isSocketConnected());
  };

  return { wsConnected, useWebSocket, autoConnectEnabled };
}

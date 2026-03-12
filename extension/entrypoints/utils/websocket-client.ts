// Minimal WebSocket client stub
// This provides the wsClient API surface referenced across the extension

import { io, Socket } from "socket.io-client";

const WS_URL = import.meta.env.VITE_API_URL || "http://localhost:5454";
const SOCKET_IO_ENABLED = import.meta.env.VITE_ENABLE_SOCKET_IO === "true";

class WebSocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private autoConnect: boolean = true;

  constructor() {
    if (SOCKET_IO_ENABLED) {
      this.connect();
    } else {
      console.info(
        "Socket.IO disabled (set VITE_ENABLE_SOCKET_IO=true to enable). Using HTTP mode."
      );
    }
  }

  connect() {
    if (!SOCKET_IO_ENABLED) {
      return;
    }

    try {
      this.socket = io(WS_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 5,
      });

      this.socket.on("connect", () => {
        this.emit("connection_status", { connected: true });
      });

      this.socket.on("disconnect", (reason: string) => {
        this.emit("connection_status", { connected: false, reason });
      });

      this.socket.on("generation_progress", (data: any) => {
        this.emit("generation_progress", data);
      });

      this.socket.on("connect_error", (error: any) => {
        this.emit("connection_status", {
          connected: false,
          reason: error?.message || "connect_error",
        });
      });
    } catch (e) {
      console.log("WebSocket connection failed:", e);
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  isSocketConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  async executeAgent(
    command: string,
    onProgress?: (data: any) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      if (onProgress) {
        this.socket.on("agent_progress", onProgress);
      }

      this.socket.emit("execute_agent", { command });

      this.socket.once("agent_result", (data: any) => {
        if (onProgress) {
          this.socket?.off("agent_progress", onProgress);
        }
        resolve(data);
      });

      this.socket.once("agent_error", (data: any) => {
        if (onProgress) {
          this.socket?.off("agent_progress", onProgress);
        }
        reject(new Error(data.message || "Agent execution failed"));
      });
    });
  }

  async stopAgent(): Promise<void> {
    this.socket?.emit("stop_agent");
  }

  async getStats(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false });
        return;
      }
      this.socket.emit("get_stats");
      this.socket.once("stats_result", (data: any) => resolve(data));
      // Timeout fallback
      setTimeout(() => resolve({ ok: false }), 3000);
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }

  connectSocket() {
    if (!this.socket?.connected) {
      this.socket?.connect();
    }
  }

  enableAutoConnect() {
    this.autoConnect = true;
    if (!this.socket?.connected) {
      this.connect();
    }
  }

  disableAutoConnect() {
    this.autoConnect = false;
  }
}

export const wsClient = new WebSocketClient();

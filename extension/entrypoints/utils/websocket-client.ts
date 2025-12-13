/**
 * WebSocket Client for AI Extension
 * Manages stable connection to the Python Flask-SocketIO server
 */

import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:8080";

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnected = false;
  private eventHandlers: Map<string, Function[]> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private autoConnectEnabled = true;
  private autoConnectInterval: NodeJS.Timeout | null = null;
  private isManuallyDisconnected = false;

  constructor() {
    this.loadAutoConnectPreference();
    if (this.autoConnectEnabled) {
      this.connect();
      this.startAutoConnectMonitor();
    }
  }

  /**
   * Load auto-connect preference from storage
   */
  private async loadAutoConnectPreference(): Promise<void> {
    try {
      const result = await browser.storage.local.get("wsAutoConnect");
      this.autoConnectEnabled = result.wsAutoConnect !== false; // Default to true
    } catch (error) {
      console.log("Could not load auto-connect preference:", error);
      this.autoConnectEnabled = true;
    }
  }

  /**
   * Save auto-connect preference to storage
   */
  private async saveAutoConnectPreference(): Promise<void> {
    try {
      await browser.storage.local.set({
        wsAutoConnect: this.autoConnectEnabled,
      });
    } catch (error) {
      console.log("Could not save auto-connect preference:", error);
    }
  }

  /**
   * Start monitoring connection and auto-reconnect if enabled
   */
  private startAutoConnectMonitor(): void {
    if (this.autoConnectInterval) {
      clearInterval(this.autoConnectInterval);
    }

    this.autoConnectInterval = setInterval(() => {
      if (
        this.autoConnectEnabled &&
        !this.isConnected &&
        !this.isManuallyDisconnected
      ) {
        console.log("🔄 Auto-connect: Attempting to reconnect...");
        this.connect();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop auto-connect monitoring
   */
  private stopAutoConnectMonitor(): void {
    if (this.autoConnectInterval) {
      clearInterval(this.autoConnectInterval);
      this.autoConnectInterval = null;
    }
  }

  /**
   * Enable auto-connect
   */
  enableAutoConnect(): void {
    this.autoConnectEnabled = true;
    this.saveAutoConnectPreference();
    this.startAutoConnectMonitor();
    if (!this.isConnected) {
      this.connect();
    }
  }

  /**
   * Disable auto-connect
   */
  disableAutoConnect(): void {
    this.autoConnectEnabled = false;
    this.saveAutoConnectPreference();
    this.stopAutoConnectMonitor();
  }

  /**
   * Establish WebSocket connection
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log("WebSocket already connected");
      return;
    }

    this.isManuallyDisconnected = false;
    console.log("Connecting to WebSocket server...", SERVER_URL);

    this.socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 10000,
      autoConnect: true,
    });

    this.setupEventListeners();
  }

  /**
   * Setup core WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ WebSocket connected successfully");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.startPingInterval();
      this.emit("connection_status", { connected: true });
    });

    this.socket.on("connection_established", (data) => {
      console.log("🔗 Connection established:", data);
      this.emit("connection_established", data);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ WebSocket disconnected:", reason);
      this.isConnected = false;
      this.stopPingInterval();
      this.emit("connection_status", { connected: false, reason });

      if (reason === "io server disconnect") {
        // Server disconnected, try to reconnect manually
        this.attemptReconnect();
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ WebSocket connection error:", error.message);
      this.isConnected = false;
      this.emit("connection_error", { error: error.message });
      this.attemptReconnect();
    });

    this.socket.on("pong", (data) => {
      // Keep-alive pong received
      console.log("🏓 Pong received from server");
    });

    // Listen for all custom events
    this.socket.onAny((eventName, ...args) => {
      console.log(`📨 Received event: ${eventName}`, args);
      this.emit(eventName, ...args);
    });

    // Listen for tool execution requests from agent
    this.socket.on("tool_execution_request", async (data) => {
      console.log("\n" + "=".repeat(60));
      console.log("🔧 TOOL EXECUTION REQUEST RECEIVED IN WEBSOCKET CLIENT");
      console.log("Tool ID:", data.tool_id);
      console.log("Action Type:", data.action_type);
      console.log("Params:", JSON.stringify(data.params, null, 2));
      console.log("Context: Running in", window.location.href);
      console.log("=".repeat(60) + "\n");

      try {
        console.log(
          "📤 Sending EXECUTE_AGENT_TOOL message to background script..."
        );
        console.log("Message to send:", {
          type: "EXECUTE_AGENT_TOOL",
          payload: {
            tool_id: data.tool_id,
            action_type: data.action_type,
            params: data.params,
          },
        });

        // Send to background script to execute the tool
        const result = await browser.runtime.sendMessage({
          type: "EXECUTE_AGENT_TOOL",
          payload: {
            tool_id: data.tool_id,
            action_type: data.action_type,
            params: data.params,
          },
        });

        console.log("✅ Tool execution completed");
        console.log("Result received:", JSON.stringify(result, null, 2));

        // Send result back to server
        console.log("📤 Sending tool_execution_result back to server...");
        this.socket?.emit("tool_execution_result", {
          tool_id: data.tool_id,
          result: result,
        });
        console.log("✅ Result sent to server");
      } catch (error) {
        console.error("❌ Tool execution error:", error);
        console.error("Error stack:", (error as Error).stack);
        this.socket?.emit("tool_execution_result", {
          tool_id: data.tool_id,
          result: { success: false, error: (error as Error).message },
        });
      }
    });

    // Listen for agent progress updates
    this.socket.on("agent_progress", (data) => {
      console.log(`🤖 Agent progress [${data.status}]: ${data.message}`);
      this.emit("agent_progress", data);
    });

    this.socket.on("agent_completed", (data) => {
      console.log("✅ Agent completed:", data);
      this.emit("agent_completed", data);
    });

    this.socket.on("agent_error", (data) => {
      console.error("❌ Agent error:", data);
      this.emit("agent_error", data);
    });
  }

  /**
   * Start sending periodic pings to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval(); // Clear any existing interval

    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit("ping", { timestamp: Date.now() });
      }
    }, 20000); // Ping every 20 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "❌ Max reconnection attempts reached. Please check server status."
      );
      this.emit("max_reconnect_attempts_reached", {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      10000
    );

    console.log(
      `🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`
    );

    setTimeout(() => {
      if (!this.socket?.connected) {
        this.socket?.connect();
      }
    }, delay);
  }

  /**
   * Send a message through WebSocket
   */
  send(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      this.socket.emit(event, data, (response: any) => {
        resolve(response);
      });
    });
  }

  /**
   * Register an event handler
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit to registered handlers
   */
  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Generate script using WebSocket
   */
  async generateScript(
    goal: string,
    targetUrl: string,
    domStructure: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      // Listen for progress updates
      const progressHandler = (data: any) => {
        console.log("Progress:", data.message);
        this.emit("generation_progress", data);
      };

      const successHandler = (data: any) => {
        this.socket?.off("script_progress", progressHandler);
        this.socket?.off("script_generated", successHandler);
        this.socket?.off("script_error", errorHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("script_progress", progressHandler);
        this.socket?.off("script_generated", successHandler);
        this.socket?.off("script_error", errorHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      this.socket.on("script_progress", progressHandler);
      this.socket.on("script_generated", successHandler);
      this.socket.on("script_error", errorHandler);

      // Send request
      this.socket.emit("generate_script_ws", {
        goal,
        target_url: targetUrl,
        dom_structure: domStructure,
        constraints: {},
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        this.socket?.off("script_progress", progressHandler);
        this.socket?.off("script_generated", successHandler);
        this.socket?.off("script_error", errorHandler);
        reject(new Error("Request timeout"));
      }, 30000);
    });
  }

  /**
   * Update result using WebSocket
   */
  async updateResult(result: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const successHandler = (data: any) => {
        this.socket?.off("result_updated", successHandler);
        this.socket?.off("update_error", errorHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("result_updated", successHandler);
        this.socket?.off("update_error", errorHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      this.socket.on("result_updated", successHandler);
      this.socket.on("update_error", errorHandler);

      this.socket.emit("update_result_ws", { result });

      setTimeout(() => {
        this.socket?.off("result_updated", successHandler);
        this.socket?.off("update_error", errorHandler);
        reject(new Error("Request timeout"));
      }, 10000);
    });
  }

  /**
   * Get conversation stats using WebSocket
   */
  async getStats(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const successHandler = (data: any) => {
        this.socket?.off("stats_response", successHandler);
        this.socket?.off("stats_error", errorHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("stats_response", successHandler);
        this.socket?.off("stats_error", errorHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      this.socket.on("stats_response", successHandler);
      this.socket.on("stats_error", errorHandler);

      this.socket.emit("get_stats_ws");

      setTimeout(() => {
        this.socket?.off("stats_response", successHandler);
        this.socket?.off("stats_error", errorHandler);
        reject(new Error("Request timeout"));
      }, 10000);
    });
  }

  /**
   * Clear conversation history using WebSocket
   */
  async clearHistory(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const successHandler = (data: any) => {
        this.socket?.off("history_cleared", successHandler);
        this.socket?.off("clear_error", errorHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("history_cleared", successHandler);
        this.socket?.off("clear_error", errorHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      this.socket.on("history_cleared", successHandler);
      this.socket.on("clear_error", errorHandler);

      this.socket.emit("clear_history_ws");

      setTimeout(() => {
        this.socket?.off("history_cleared", successHandler);
        this.socket?.off("clear_error", errorHandler);
        reject(new Error("Request timeout"));
      }, 10000);
    });
  }

  /**
   * Execute AI agent with sophisticated tools
   */
  async executeAgent(
    goal: string,
    onProgress?: (data: any) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      // Listen for progress updates
      const progressHandler = (data: any) => {
        console.log("Agent progress:", data.message);
        if (onProgress) {
          onProgress(data);
        }
        this.emit("agent_progress", data);
      };

      const successHandler = (data: any) => {
        this.socket?.off("agent_progress", progressHandler);
        this.socket?.off("agent_completed", successHandler);
        this.socket?.off("agent_error", errorHandler);
        this.socket?.off("agent_stopped", stoppedHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("agent_progress", progressHandler);
        this.socket?.off("agent_completed", successHandler);
        this.socket?.off("agent_error", errorHandler);
        this.socket?.off("agent_stopped", stoppedHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      const stoppedHandler = (data: any) => {
        this.socket?.off("agent_progress", progressHandler);
        this.socket?.off("agent_completed", successHandler);
        this.socket?.off("agent_error", errorHandler);
        this.socket?.off("agent_stopped", stoppedHandler);
        reject(new Error("Agent execution stopped by user"));
      };

      this.socket.on("agent_progress", progressHandler);
      this.socket.on("agent_completed", successHandler);
      this.socket.on("agent_error", errorHandler);
      this.socket.on("agent_stopped", stoppedHandler);

      // Send agent execution request
      this.socket.emit("execute_agent_ws", { goal });

      // Timeout after 5 minutes (agents can take time)
      setTimeout(() => {
        this.socket?.off("agent_progress", progressHandler);
        this.socket?.off("agent_completed", successHandler);
        this.socket?.off("agent_error", errorHandler);
        this.socket?.off("agent_stopped", stoppedHandler);
        reject(new Error("Agent execution timeout"));
      }, 300000);
    });
  }

  /**
   * Stop the currently running agent execution
   */
  async stopAgent(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const successHandler = (data: any) => {
        this.socket?.off("agent_stopped", successHandler);
        this.socket?.off("agent_error", errorHandler);
        resolve(data);
      };

      const errorHandler = (data: any) => {
        this.socket?.off("agent_stopped", successHandler);
        this.socket?.off("agent_error", errorHandler);
        reject(new Error(data.error || "Unknown error"));
      };

      this.socket.on("agent_stopped", successHandler);
      this.socket.on("agent_error", errorHandler);

      this.socket.emit("stop_agent_ws", {});

      setTimeout(() => {
        this.socket?.off("agent_stopped", successHandler);
        this.socket?.off("agent_error", errorHandler);
        reject(new Error("Stop request timeout"));
      }, 5000);
    });
  }

  /**
   * Check if WebSocket is connected
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    console.log("Disconnecting WebSocket...");
    this.isManuallyDisconnected = true;
    this.stopPingInterval();
    this.socket?.disconnect();
    this.isConnected = false;
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; attempts: number } {
    return {
      connected: this.isConnected,
      attempts: this.reconnectAttempts,
    };
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();

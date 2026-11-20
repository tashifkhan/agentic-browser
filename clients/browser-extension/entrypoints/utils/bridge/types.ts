export const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:5455/bridge/ws";

export type BridgeState = "connected" | "connecting" | "disconnected" | "disabled";

export type BridgeStatus = {
  state: BridgeState;
  url: string;
  error?: string;
  since: number;
  calls: number;
  lastMethod?: string;
};

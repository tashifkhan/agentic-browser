import { useState, useEffect } from "react";
import {
  X,
  Settings as SettingsIcon,
  CheckCircle,
  XCircle,
  Lock,
  RefreshCw,
  LogOut,
  Zap,
  Key,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { wsClient } from "../../utils/websocket-client";
import { CuteTextInput } from "./CuteTextInput";

// LLM Model Options
const LLM_OPTIONS = [
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)", provider: "OpenAI" },
  {
    value: "openai/gpt-4o-mini",
    label: "GPT-4o Mini (OpenAI)",
    provider: "OpenAI",
  },
  { value: "openai/o1", label: "o1 (OpenAI)", provider: "OpenAI" },
  { value: "openai/o1-mini", label: "o1 Mini (OpenAI)", provider: "OpenAI" },
  {
    value: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet (Anthropic)",
    provider: "Anthropic",
  },
  {
    value: "anthropic/claude-3-opus",
    label: "Claude 3 Opus (Anthropic)",
    provider: "Anthropic",
  },
  {
    value: "anthropic/claude-3-haiku",
    label: "Claude 3 Haiku (Anthropic)",
    provider: "Anthropic",
  },
  {
    value: "google/gemini-2.0-flash",
    label: "Gemini 2.0 Flash (Google)",
    provider: "Google",
  },
  {
    value: "google/gemini-1.5-pro",
    label: "Gemini 1.5 Pro (Google)",
    provider: "Google",
  },
  {
    value: "meta/llama-3.3-70b",
    label: "Llama 3.3 70B (Meta)",
    provider: "Meta",
  },
  {
    value: "meta/llama-3.1-405b",
    label: "Llama 3.1 405B (Meta)",
    provider: "Meta",
  },
  {
    value: "mistral/mistral-large",
    label: "Mistral Large (Mistral AI)",
    provider: "Mistral AI",
  },
  {
    value: "groq/mixtral-8x7b",
    label: "Mixtral 8x7B (Groq)",
    provider: "Groq",
  },
];

interface UnifiedSettingsMenuProps {
  // Profile props
  user: any;
  showToken: boolean;
  setShowToken: (show: boolean) => void;
  showRefreshToken: boolean;
  setShowRefreshToken: (show: boolean) => void;
  tokenStatus: string;
  browserInfo: { name: string; isFirefox: boolean; isChrome: boolean };
  handleManualRefresh: () => void;
  handleLogout: () => void;
  getTokenAge: () => string;
  getTokenExpiry: () => string;

  // Settings props
  apiKey: string;
  setApiKey: (key: string) => void;
  onSaveApiKey: () => void;
  wsConnected: boolean;

  // Position prop
  position?: { top?: string; right?: string; bottom?: string; left?: string };
}

export function UnifiedSettingsMenu({
  user,
  showToken,
  setShowToken,
  showRefreshToken,
  setShowRefreshToken,
  tokenStatus,
  browserInfo,
  handleManualRefresh,
  handleLogout,
  getTokenAge,
  getTokenExpiry,
  apiKey,
  setApiKey,
  onSaveApiKey,
  wsConnected,
  position = { top: "16px", right: "16px" },
}: UnifiedSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "profile">(
    "settings"
  );
  const [selectedModel, setSelectedModel] = useState(LLM_OPTIONS[0].value);
  const [autoConnect, setAutoConnect] = useState(true);

  // Credentials state
  const [savedEmail, setSavedEmail] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Load saved model and auto-connect preference from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem("selectedLLM");
    if (savedModel && LLM_OPTIONS.find((opt) => opt.value === savedModel)) {
      setSelectedModel(savedModel);
    }

    // Load auto-connect preference
    browser.storage.local.get("wsAutoConnect").then((result) => {
      setAutoConnect(result.wsAutoConnect !== false);
    });

    // Load saved credentials
    loadCredentials();
  }, []);
  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    // Save to localStorage or send to backend
    localStorage.setItem("selectedLLM", value);
    console.log("Selected model:", value);
  };

  const handleAutoConnectToggle = async () => {
    const newValue = !autoConnect;
    setAutoConnect(newValue);
    await browser.storage.local.set({ wsAutoConnect: newValue });

    if (newValue) {
      wsClient.enableAutoConnect();
    } else {
      wsClient.disableAutoConnect();
    }
  };

  const loadCredentials = async () => {
    try {
      const result = await browser.storage.local.get([
        "savedEmail",
        "savedPassword",
      ]);
      if (result.savedEmail) setSavedEmail(result.savedEmail);
      if (result.savedPassword) setSavedPassword(result.savedPassword);
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const saveCredentials = async () => {
    if (!newEmail || !newPassword) {
      alert("Please enter both email and password");
      return;
    }

    try {
      await browser.storage.local.set({
        savedEmail: newEmail,
        savedPassword: newPassword,
      });
      setSavedEmail(newEmail);
      setSavedPassword(newPassword);
      setNewEmail("");
      setNewPassword("");
      alert("Credentials saved successfully!");
    } catch (error) {
      console.error("Error saving credentials:", error);
      alert("Failed to save credentials");
    }
  };

  const deleteCredentials = async () => {
    if (!confirm("Are you sure you want to delete saved credentials?")) {
      return;
    }

    try {
      await browser.storage.local.remove(["savedEmail", "savedPassword"]);
      setSavedEmail("");
      setSavedPassword("");
      setNewEmail("");
      setNewPassword("");
      alert("Credentials deleted successfully");
    } catch (error) {
      console.error("Error deleting credentials:", error);
      alert("Failed to delete credentials");
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
        <SettingsIcon size={20} color="#e5e5e5" />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: isOpen ? 0 : "-340px",
        width: "340px",
        height: "100%",
        backgroundColor: "#1a1a1a",
        borderLeft: "1px solid #2a2a2a",
        zIndex: 10000,
        overflowY: "auto",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
        color: "white",
        transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div style={{ padding: "0" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            padding: "12px 16px",
          }}
        >
          <h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>
            Settings & Profile
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#999",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
            borderBottom: "1px solid #2a2a2a",
            padding: "0 16px",
          }}
        >
          <button
            onClick={() => setActiveTab("settings")}
            style={{
              flex: 1,
              padding: "8px",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === "settings"
                  ? "2px solid #4285f4"
                  : "2px solid transparent",
              color: activeTab === "settings" ? "#4285f4" : "#999",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            style={{
              flex: 1,
              padding: "8px",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === "profile"
                  ? "2px solid #4285f4"
                  : "2px solid transparent",
              color: activeTab === "profile" ? "#4285f4" : "#999",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            Profile
          </button>
        </div>

        {/* Content */}
        {activeTab === "settings" ? (
          <div style={{ padding: "0 16px 16px" }}>
            {/* LLM Model Selection */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "#e5e5e5",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                <Zap size={14} />
                AI Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "8px",
                  color: "#e5e5e5",
                  fontSize: "12px",
                  cursor: "pointer",
                  outline: "none",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4285f4";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                }}
              >
                {LLM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginTop: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>Provider:</span>
                <span style={{ color: "#999", fontWeight: 500 }}>
                  {
                    LLM_OPTIONS.find((opt) => opt.value === selectedModel)
                      ?.provider
                  }
                </span>
              </div>
            </div>

            {/* API Key Section */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "#e5e5e5",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                <Lock size={14} />
                API Key
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <CuteTextInput
                    type="password"
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder="Enter your API key"
                    onSubmit={onSaveApiKey}
                  />
                </div>
                <button
                  onClick={onSaveApiKey}
                  style={{
                    padding: "10px 20px",
                    whiteSpace: "nowrap",
                    backgroundColor: "#4285f4",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    minWidth: "80px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#5294ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#4285f4";
                  }}
                >
                  Save
                </button>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginTop: "6px",
                }}
              >
                Secure storage • Never shared
              </div>
            </div>

            {/* Credentials Section */}
            <div style={{ marginTop: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "#e5e5e5",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                <Key size={14} />
                Saved Credentials
              </label>

              <details
                open={showCredentials}
                onToggle={(e: any) => setShowCredentials(e.target.open)}
                style={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#999",
                    userSelect: "none",
                    marginBottom: showCredentials ? "12px" : "0",
                  }}
                >
                  {savedEmail ? "View & Manage" : "Add Credentials"}
                </summary>

                {savedEmail ? (
                  <div style={{ marginTop: "12px" }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#1a1a1a",
                        borderRadius: "6px",
                        marginBottom: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#666",
                          marginBottom: "4px",
                        }}
                      >
                        Email
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#e5e5e5",
                          wordBreak: "break-all",
                          overflowWrap: "break-word",
                        }}
                      >
                        {savedEmail}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#1a1a1a",
                        borderRadius: "6px",
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#666",
                            marginBottom: "4px",
                          }}
                        >
                          Password
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#e5e5e5",
                            filter: showPassword ? "none" : "blur(4px)",
                            userSelect: showPassword ? "text" : "none",
                          }}
                        >
                          {savedPassword}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4285f4",
                          cursor: "pointer",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>

                    <button
                      onClick={deleteCredentials}
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#7f1d1d",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#991b1b";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#7f1d1d";
                      }}
                    >
                      <Trash2 size={14} />
                      Delete Credentials
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Email"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #2a2a2a",
                          borderRadius: "6px",
                          color: "#e5e5e5",
                          fontSize: "12px",
                          outline: "none",
                          transition: "all 0.2s",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "#4285f4";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: "10px" }}>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Password"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #2a2a2a",
                          borderRadius: "6px",
                          color: "#e5e5e5",
                          fontSize: "12px",
                          outline: "none",
                          transition: "all 0.2s",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "#4285f4";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                      />
                    </div>

                    <button
                      onClick={saveCredentials}
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#4285f4",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#5294ff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#4285f4";
                      }}
                    >
                      Save Credentials
                    </button>
                  </div>
                )}

                <div
                  style={{
                    fontSize: "10px",
                    color: "#666",
                    marginTop: "8px",
                    lineHeight: "1.4",
                  }}
                >
                  Stored locally • Auto-fill ready
                </div>
              </details>
            </div>

            {/* WebSocket Section */}
            <div style={{ marginTop: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#e5e5e5",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                Backend Connection
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  padding: "10px 12px",
                  backgroundColor: "#0a0a0a",
                  borderRadius: "8px",
                  border: "1px solid #2a2a2a",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: wsConnected ? "#4ade80" : "#f87171",
                      boxShadow: wsConnected
                        ? "0 0 8px rgba(74, 222, 128, 0.5)"
                        : "0 0 8px rgba(248, 113, 113, 0.5)",
                    }}
                  />
                  <span style={{ fontSize: "12px", color: "#e5e5e5" }}>
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
                  style={{
                    padding: "8px 16px",
                    whiteSpace: "nowrap",
                    backgroundColor: wsConnected ? "#7f1d1d" : "#1e40af",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    minWidth: "100px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = wsConnected
                      ? "#991b1b"
                      : "#2563eb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = wsConnected
                      ? "#7f1d1d"
                      : "#1e40af";
                  }}
                >
                  {wsConnected ? "Disconnect" : "Connect"}
                </button>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#666",
                  marginTop: "6px",
                }}
              >
                WebSocket • localhost:8080
              </div>

              {/* Auto-Connect Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "12px",
                  padding: "10px 12px",
                  backgroundColor: "#0a0a0a",
                  borderRadius: "8px",
                  border: "1px solid #2a2a2a",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#e5e5e5",
                      marginBottom: "2px",
                    }}
                  >
                    Auto-connect
                  </div>
                  <div style={{ fontSize: "10px", color: "#666" }}>
                    Automatically reconnect when disconnected
                  </div>
                </div>
                <label
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: "44px",
                    height: "24px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoConnect}
                    onChange={handleAutoConnectToggle}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: autoConnect ? "#4285f4" : "#2a2a2a",
                      borderRadius: "24px",
                      transition: "0.3s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        content: "",
                        height: "18px",
                        width: "18px",
                        left: autoConnect ? "23px" : "3px",
                        bottom: "3px",
                        backgroundColor: "white",
                        borderRadius: "50%",
                        transition: "0.3s",
                      }}
                    />
                  </span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "0 16px" }}>
            {/* Profile Content */}
            <div
              style={{
                textAlign: "center",
                marginBottom: "16px",
                padding: "12px",
                backgroundColor: "#0a0a0a",
                borderRadius: "12px",
              }}
            >
              <img
                src={user.picture}
                alt="profile"
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  border: "3px solid #4285f4",
                  marginBottom: "8px",
                }}
              />
              <h4 style={{ margin: "0 0 3px 0", color: "#fff" }}>
                {user.name}
              </h4>
              <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>
                {user.email}
              </p>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <ProfileDetail label="User ID" value={user.id} />
              <ProfileDetail
                label="Verified Email"
                value={user.verified_email ? "Yes" : "No"}
                icon={
                  user.verified_email ? (
                    <CheckCircle size={12} />
                  ) : (
                    <XCircle size={12} />
                  )
                }
                valueColor={user.verified_email ? "#4ade80" : "#f87171"}
              />
              <ProfileDetail label="Browser" value={browserInfo.name} />
              <ProfileDetail
                label="Login Time"
                value={new Date(user.loginTime).toLocaleString()}
              />

              <details style={{ marginTop: "8px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "6px 10px",
                    backgroundColor: "#0a0a0a",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#999",
                    userSelect: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Lock size={12} />
                  Advanced Details
                </summary>
                <div style={{ marginTop: "6px" }}>
                  <ProfileDetail label="Picture URL" value={user.picture} />
                  <ProfileDetail
                    label="Redirect URI"
                    value={user.redirectUri}
                  />

                  {user?.tokenTimestamp && (
                    <>
                      <ProfileDetail label="Token Age" value={getTokenAge()} />
                      <ProfileDetail
                        label="Token Expires In"
                        value={getTokenExpiry()}
                        valueColor={
                          getTokenExpiry() === "Expired" ? "#dc2626" : "#fff"
                        }
                      />
                      {user?.refreshToken && (
                        <ProfileDetail
                          label="Has Refresh Token"
                          value="Yes (auto-refresh enabled)"
                          icon={<CheckCircle size={12} />}
                          valueColor="#4ade80"
                        />
                      )}
                    </>
                  )}

                  {user?.token && (
                    <TokenDisplay
                      label="Access Token"
                      token={user.token}
                      show={showToken}
                      onToggle={() => setShowToken(!showToken)}
                    />
                  )}

                  {user?.refreshToken && (
                    <TokenDisplay
                      label="Refresh Token"
                      token={user.refreshToken}
                      show={showRefreshToken}
                      onToggle={() => setShowRefreshToken(!showRefreshToken)}
                      blur={44}
                    />
                  )}
                </div>
              </details>
            </div>

            {user?.refreshToken && (
              <button
                onClick={handleManualRefresh}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "13px",
                  cursor: "pointer",
                  backgroundColor: "#4285f4",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  transition: "all 0.3s",
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <RefreshCw size={14} />
                Refresh Token Manually
              </button>
            )}

            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "13px",
                cursor: "pointer",
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                transition: "all 0.3s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileDetail({
  label,
  value,
  valueColor = "#fff",
  icon,
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        marginBottom: "6px",
        borderRadius: "8px",
        backgroundColor: "#0a0a0a",
        wordBreak: "break-word",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          color: "#666",
          marginBottom: "3px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: valueColor,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {icon && (
          <span style={{ display: "flex", color: valueColor }}>{icon}</span>
        )}
        {value}
      </div>
    </div>
  );
}

function TokenDisplay({
  label,
  token,
  show,
  onToggle,
  blur = 4,
}: {
  label: string;
  token: string;
  show: boolean;
  onToggle: () => void;
  blur?: number;
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        marginBottom: "6px",
        borderRadius: "8px",
        backgroundColor: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "10px",
            color: "#666",
            marginBottom: "3px",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: show ? "normal" : "nowrap",
            filter: show ? "none" : `blur(${blur}px)`,
            wordBreak: "break-all",
          }}
        >
          {show
            ? token
            : String(token).length > 48
            ? String(token).substring(0, 48) + "..."
            : token}
        </div>
      </div>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          color: "#2196F3",
          cursor: "pointer",
          fontSize: "11px",
          padding: "4px 8px",
          whiteSpace: "nowrap",
          alignSelf: "flex-start",
        }}
      >
        {show ? "hide" : "show"}
      </button>
    </div>
  );
}

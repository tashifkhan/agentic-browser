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
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "../components/ui/select"

// LLM Model Options
const LLM_OPTIONS = [
  {
    value: "openai/gpt-5",
    label: "ChatGPT 5 (OpenAI)",
    provider: "OpenAI",
  },
  {
    value: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro (Google)",
    provider: "Google",
  },
  {
    value: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Google)",
    provider: "Google",
  },
  {
    value: "anthropic/claude-4.5-sonnet",
    label: "Claude 4.5 Sonnet (Anthropic)",
    provider: "Anthropic",
  }, {
    value: "ollama/llama3.1",
    label: "Open Source Local LLM (Ollama)",
    provider: "Ollama",
  }
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
  isOpen: boolean;
  onToggle: () => void;
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
  isOpen,
  onToggle,
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
  // const [isOpen, setIsOpen] = useState(false);
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
  const [baseUrl, setBaseUrl] = useState("");
  const [jportalConnected, setJportalConnected] = useState(false);
  const [jportalOpen, setJportalOpen] = useState(false);
  const [jportalId, setJportalId] = useState("");
  const [jportalPass, setJportalPass] = useState("");

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
    browser.storage.local.get("baseUrl").then((result) => {
      if (result.baseUrl) setBaseUrl(result.baseUrl);
    });
    browser.storage.local
      .get(["jportalId", "jportalPass", "jportalConnected"])
      .then((result) => {
        if (result.jportalId) setJportalId(result.jportalId);
        if (result.jportalPass) setJportalPass(result.jportalPass);
        if (result.jportalConnected) setJportalConnected(true);
      });
    // Load saved credentials
    loadCredentials();
  }, []);
  const handleLoginJportal = async () => {
    if (!jportalId || !jportalPass) {
      alert("Enter both College ID and Password");
      return;
    }
    await browser.storage.local.set({
      jportalId,
      jportalPass,
      jportalConnected: true,
    });

    setJportalConnected(true);
    alert("Logged in to JIIT Web Portal!");
  };
  const handleLogoutJportal = async () => {
    await browser.storage.local.set({ jportalConnected: false });
    setJportalConnected(false);
    alert("Logged out from JIIT Web Portal");
  };


  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    // Save to localStorage or send to backend
    localStorage.setItem("selectedLLM", value);
    console.log("Selected model:", value);
  };
  const onSaveBaseUrl = async () => {
    if (!baseUrl) {
      alert("Please enter a valid Base URL");
      return;
    }
    await browser.storage.local.set({ baseUrl });
    alert("Base URL saved!");
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
        onClick={onToggle}
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
            onClick={onToggle}
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
            {/* Base URL Section */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0px",
                  fontSize: "12px",
                  color: "#e5e5e5",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                {/* Inline SVG globe icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                >
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.93 6h-2.01a15.3 15.3 0 00-1.12-3.09A8.03 8.03 0 0117.93 8zM12 4c.66 0 1.97 3.07 2.6 7H9.4C10.03 7.07 11.34 4 12 4zM4.07 8A8.03 8.03 0 0110.2 4.91 15.3 15.3 0 009.08 8H4.07zM4 12c0-.34.02-.67.06-1h3.98a13.7 13.7 0 000 2H4.06c-.04-.33-.06-.66-.06-1zm1.1 4h2.01c.5 1.64 1.2 3.01 1.98 3.98A8.03 8.03 0 015.1 16zM15.92 20.09c-.78-.97-1.48-2.34-1.98-3.98h3.98a8.03 8.03 0 01-2 3.98zM12 20c-.66 0-1.97-3.07-2.6-7h5.2C13.97 16.93 12.66 20 12 20z"
                  />
                </svg>

                <span style={{ marginLeft: 6 }}>Base URL</span>
              </label>

              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <CuteTextInput
                    type="text"
                    value={baseUrl}
                    onChange={setBaseUrl}
                    placeholder="Enter API base URL (e.g., http://localhost:3000)"
                    onSubmit={onSaveBaseUrl}
                  />
                </div>

                <button
                  onClick={onSaveBaseUrl}
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
                Stored locally • Used for all backend requests
              </div>
            </div>
            {/* WebSocket Section */}
            <div style={{ marginTop: "20px" }}>
              {/* Google Connection Status */}
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
                  Google Connection
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
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: user?.token ? "#4ade80" : "#f87171",
                      boxShadow: user?.token
                        ? "0 0 8px rgba(74, 222, 128, 0.5)"
                        : "0 0 8px rgba(248, 113, 113, 0.5)",
                    }}
                  />

                  <span style={{ fontSize: "12px", color: "#e5e5e5" }}>
                    {user?.token ? "Connected to Google" : "Not Connected"}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "10px",
                    color: "#666",
                    marginTop: "6px",
                  }}
                >
                  OAuth2 • Google API Connection Status
                </div>
              </div>

              {/* JIIT Web Portal Connection */}
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                  >
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" opacity=".3" />
                    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 
      1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 
      4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  JIIT Web Portal
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
                  {/* Status Indicator */}
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
                        backgroundColor: jportalConnected ? "#4ade80" : "#f87171",
                        boxShadow: jportalConnected
                          ? "0 0 8px rgba(74, 222, 128, 0.5)"
                          : "0 0 8px rgba(248, 113, 113, 0.5)",
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "#e5e5e5" }}>
                      {jportalConnected
                        ? "Connected to JIIT Web Portal"
                        : "Not Connected"}
                    </span>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => {
                      if (!jportalConnected) setJportalOpen(!jportalOpen);
                      else handleLogoutJportal();
                    }}
                    style={{
                      padding: "8px 16px",
                      whiteSpace: "nowrap",
                      backgroundColor: jportalConnected ? "#7f1d1d" : "#1e40af",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      minWidth: "130px",
                    }}
                  >
                    {jportalConnected ? "Logout" : "Login"}
                  </button>
                </div>

                {/* Collapsible Login Panel */}
                {(!jportalConnected && jportalOpen) && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "12px",
                      backgroundColor: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      borderRadius: "8px",
                    }}
                  >
                    <input
                      type="text"
                      placeholder="College ID"
                      value={jportalId}
                      onChange={(e) => setJportalId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        marginBottom: "10px",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: "6px",
                        color: "#e5e5e5",
                        fontSize: "12px",
                      }}
                    />

                    <input
                      type="password"
                      placeholder="Password"
                      value={jportalPass}
                      onChange={(e) => setJportalPass(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        marginBottom: "12px",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: "6px",
                        color: "#e5e5e5",
                        fontSize: "12px",
                      }}
                    />

                    <button
                      onClick={handleLoginJportal}
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
                      }}
                    >
                      Save & Login
                    </button>
                  </div>
                )}
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

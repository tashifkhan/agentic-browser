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
  const [isJportalLoading, setIsJportalLoading] = useState(false);
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
    // 1. Basic Validation
    if (!jportalId || !jportalPass) {
      alert("Enter both College ID and Password");
      return;
    }

    setIsJportalLoading(true);

    try {
      // 2. API Call
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/api/pyjiit/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: jportalId,
          password: jportalPass,
        }),
      });

      // 3. Error Handling
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to login to JIIT Portal");
      }

      // 4. Success: Get Data
      const data = await response.json();

      // 5. Store in Browser Storage (Credentials + Data)
      await browser.storage.local.set({
        jportalId,
        jportalPass,
        jportalConnected: true,
        jportalData: data, // Storing the full response object here
      });

      // 6. Update UI State
      setJportalConnected(true);
      setJportalOpen(false); // Close the login panel
      alert("Logged in to JIIT Web Portal successfully!");

    } catch (error: any) {
      console.error("JIIT Login Error:", error);
      alert(`Login Failed: ${error.message}`);
      setJportalConnected(false);
    } finally {
      setIsJportalLoading(false);
    }
  };
  const handleLogoutJportal = async () => {
    await browser.storage.local.set({
      jportalConnected: false,
      jportalData: null
    });
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
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(135deg, rgba(50,50,50,0.6), rgba(35,35,35,0.8))",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10001,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, rgba(70,70,70,0.7), rgba(50,50,50,0.9))";
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, rgba(50,50,50,0.6), rgba(35,35,35,0.8))";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
        }}
      >
        <SettingsIcon size={18} color="#e5e5e5" />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: isOpen ? 0 : "-360px",
        width: "360px",
        height: "100%",
        background: "linear-gradient(135deg, rgba(20,20,20,0.98), rgba(10,10,10,0.98))",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        zIndex: 10000,
        overflowY: "auto",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
        color: "white",
        transition: "right 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div style={{ padding: "0" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            padding: "18px 20px",
            background: "linear-gradient(135deg, rgba(40,40,40,0.5), rgba(25,25,25,0.7))",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h3 style={{ margin: 0, color: "#f0f0f0", fontSize: "17px", fontWeight: 600, letterSpacing: "0.3px" }}>
            Settings & Profile
          </h3>
          <button
            onClick={onToggle}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#b0b0b0",
              cursor: "pointer",
              padding: "8px",
              display: "flex",
              alignItems: "center",
              borderRadius: "10px",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "#e0e0e0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "#b0b0b0";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "20px",
            padding: "0 20px",
          }}
        >
          <button
            onClick={() => setActiveTab("settings")}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: activeTab === "settings"
                ? "linear-gradient(135deg, rgba(66,133,244,0.15), rgba(66,133,244,0.25))"
                : "rgba(255,255,255,0.03)",
              border: activeTab === "settings"
                ? "1px solid rgba(66,133,244,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              color: activeTab === "settings" ? "#6ba3ff" : "#999",
              cursor: "pointer",
              fontSize: "13.5px",
              fontWeight: 500,
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              letterSpacing: "0.3px",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "settings") {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "settings") {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }
            }}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: activeTab === "profile"
                ? "linear-gradient(135deg, rgba(66,133,244,0.15), rgba(66,133,244,0.25))"
                : "rgba(255,255,255,0.03)",
              border: activeTab === "profile"
                ? "1px solid rgba(66,133,244,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              color: activeTab === "profile" ? "#6ba3ff" : "#999",
              cursor: "pointer",
              fontSize: "13.5px",
              fontWeight: 500,
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              letterSpacing: "0.3px",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "profile") {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "profile") {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }
            }}
          >
            Profile
          </button>
        </div>

        {/* Content */}
        {activeTab === "settings" ? (
          <div style={{ padding: "0 20px 20px" }}>
            {/* LLM Model Selection */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#e8e8e8",
                  marginBottom: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.2px",
                }}
              >
                <Zap size={15} />
                AI Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "linear-gradient(135deg, rgba(30,30,30,0.8), rgba(20,20,20,0.9))",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#e8e8e8",
                  fontSize: "13px",
                  cursor: "pointer",
                  outline: "none",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(100,100,255,0.3)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(80,80,200,0.2)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
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
                  fontSize: "11px",
                  color: "#888",
                  marginTop: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  letterSpacing: "0.2px",
                }}
              >
                <span>Provider:</span>
                <span style={{ color: "#b0b0b0", fontWeight: 500 }}>
                  {
                    LLM_OPTIONS.find((opt) => opt.value === selectedModel)
                      ?.provider
                  }
                </span>
              </div>
            </div>

            {/* API Key Section */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#e8e8e8",
                  marginBottom: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.2px",
                }}
              >
                <Lock size={15} />
                API Key
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
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
                    padding: "12px 22px",
                    whiteSpace: "nowrap",
                    background: "linear-gradient(135deg, rgba(100,100,255,0.2), rgba(80,80,200,0.3))",
                    color: "white",
                    border: "1px solid rgba(120,120,255,0.3)",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    minWidth: "80px",
                    letterSpacing: "0.3px",
                    boxShadow: "0 4px 16px rgba(80,80,200,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(120,120,255,0.3), rgba(100,100,220,0.4))";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(100,100,220,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(100,100,255,0.2), rgba(80,80,200,0.3))";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(80,80,200,0.2)";
                  }}
                >
                  Save
                </button>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#888",
                  marginTop: "8px",
                  letterSpacing: "0.2px",
                }}
              >
                Secure storage • Never shared
              </div>
            </div>
            {/* Base URL Section */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#e8e8e8",
                  marginBottom: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.2px",
                }}
              >
                {/* Inline SVG globe icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  aria-hidden="true"
                  focusable="false"
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                >
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.93 6h-2.01a15.3 15.3 0 00-1.12-3.09A8.03 8.03 0 0117.93 8zM12 4c.66 0 1.97 3.07 2.6 7H9.4C10.03 7.07 11.34 4 12 4zM4.07 8A8.03 8.03 0 0110.2 4.91 15.3 15.3 0 009.08 8H4.07zM4 12c0-.34.02-.67.06-1h3.98a13.7 13.7 0 000 2H4.06c-.04-.33-.06-.66-.06-1zm1.1 4h2.01c.5 1.64 1.2 3.01 1.98 3.98A8.03 8.03 0 015.1 16zM15.92 20.09c-.78-.97-1.48-2.34-1.98-3.98h3.98a8.03 8.03 0 01-2 3.98zM12 20c-.66 0-1.97-3.07-2.6-7h5.2C13.97 16.93 12.66 20 12 20z"
                  />
                </svg>
                <span>Base URL</span>
              </label>

              <div style={{ display: "flex", gap: "10px" }}>
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
                    padding: "12px 22px",
                    whiteSpace: "nowrap",
                    background: "linear-gradient(135deg, rgba(100,100,255,0.2), rgba(80,80,200,0.3))",
                    color: "white",
                    border: "1px solid rgba(120,120,255,0.3)",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    minWidth: "80px",
                    letterSpacing: "0.3px",
                    boxShadow: "0 4px 16px rgba(80,80,200,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(120,120,255,0.3), rgba(100,100,220,0.4))";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(100,100,220,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(100,100,255,0.2), rgba(80,80,200,0.3))";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(80,80,200,0.2)";
                  }}
                >
                  Save
                </button>
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: "#888",
                  marginTop: "8px",
                  letterSpacing: "0.2px",
                }}
              >
                Stored locally • Used for all backend requests
              </div>
            </div>
            {/* WebSocket Section */}
            <div style={{ marginTop: "24px" }}>
              {/* Google Connection Status */}
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    color: "#e8e8e8",
                    marginBottom: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.2px",
                  }}
                >
                  Google Connection
                </label>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    padding: "14px 16px",
                    background: "linear-gradient(135deg, rgba(30,30,30,0.8), rgba(20,20,20,0.9))",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: user?.token ? "#4ade80" : "#f87171",
                      boxShadow: user?.token
                        ? "0 0 12px rgba(74, 222, 128, 0.6)"
                        : "0 0 12px rgba(248, 113, 113, 0.6)",
                    }}
                  />

                  <span style={{ fontSize: "13px", color: "#e8e8e8", letterSpacing: "0.2px" }}>
                    {user?.token ? "Connected to Google" : "Not Connected"}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "#888",
                    marginTop: "8px",
                    letterSpacing: "0.2px",
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

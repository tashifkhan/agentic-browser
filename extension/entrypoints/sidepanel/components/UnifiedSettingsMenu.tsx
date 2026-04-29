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
  Sun,
  Moon,
  Monitor,
  Palette,
  Settings2,
  ChevronDown,
  Globe,
  Database,
  Link as LinkIcon,
  Bot
} from "lucide-react";

type ThemePreference = "dark" | "light" | "system";
import { wsClient } from "../../utils/websocket-client";
import { CuteTextInput } from "./CuteTextInput";
import { MemoryInitModal } from "./MemoryInitSection";

const LLM_OPTIONS = [
  { value: "openai/gpt-5", label: "ChatGPT 5 (OpenAI)", provider: "OpenAI" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Google)", provider: "Google" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Google)", provider: "Google" },
  { value: "anthropic/claude-4.5-sonnet", label: "Claude 4.5 Sonnet (Anthropic)", provider: "Anthropic" },
  { value: "ollama/llama3.1", label: "Open Source Local LLM (Ollama)", provider: "Ollama" }
];

interface UnifiedSettingsMenuProps {
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
  apiKey: string;
  setApiKey: (key: string) => void;
  onSaveApiKey: () => void;
  wsConnected: boolean;
  themePreference?: ThemePreference;
  onThemeChange?: (theme: ThemePreference) => void;
  position?: { top?: string; right?: string; bottom?: string; left?: string };
}

// --- Industrial Aesthetic Components ---
function StatusPill({ ok, label, onClick }: { ok: boolean | null; label: string; onClick?: () => void }) {
  const bg = ok === true ? "var(--status-connected-bg, rgba(74, 222, 128, 0.1))" : ok === false ? "var(--status-error-bg, rgba(220, 38, 38, 0.1))" : "var(--input-bg)";
  const color = ok === true ? "var(--status-connected-text, #16a34a)" : ok === false ? "var(--status-error-text, #dc2626)" : "var(--text-muted)";
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, padding: "3px 8px",
        borderRadius: 4, background: bg, color, border: `1px solid ${ok === null ? "var(--border-color)" : "transparent"}`,
        textTransform: "uppercase", letterSpacing: "0.05em", cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, defaultOpen = false, children }: { title: string; icon?: any; defaultOpen?: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section style={{ background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: 6, marginBottom: 16, boxShadow: "0 2px 4px rgba(0,0,0,0.02)", overflow: "hidden" }}>
      <header onClick={() => setIsOpen(!isOpen)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--input-bg)", borderBottom: isOpen ? "1px solid var(--border-color)" : "1px solid transparent", cursor: "pointer", userSelect: "none", transition: "background 0.2s ease, border-color 0.2s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icon && <Icon size={16} color="var(--text-primary)" />}
          <h2 style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</h2>
        </div>
        <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </header>
      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "20px 16px" }}>{children}</div>
        </div>
      </div>
    </section>
  );
}

function btnStyle(variant: "primary" | "danger" | "ghost" = "ghost"): React.CSSProperties {
  const common: React.CSSProperties = { padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 4, cursor: "pointer", border: "1px solid var(--border-color)", transition: "all 0.2s ease" };
  if (variant === "primary") return { ...common, background: "var(--accent-color)", color: "#fff", border: "1px solid var(--accent-color)", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" };
  if (variant === "danger") return { ...common, background: "transparent", color: "#dc2626", borderColor: "#dc2626" };
  return { ...common, background: "var(--input-bg)", color: "var(--text-primary)" };
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--bg-color)", color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-mono, monospace)" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}
// ---------------------------------------

export function UnifiedSettingsMenu({
  isOpen, onToggle, user, showToken, setShowToken, showRefreshToken, setShowRefreshToken,
  tokenStatus, browserInfo, handleManualRefresh, handleLogout, getTokenAge, getTokenExpiry,
  apiKey, setApiKey, onSaveApiKey, wsConnected, themePreference = "dark", onThemeChange, position = { top: "16px", right: "16px" },
}: UnifiedSettingsMenuProps) {
  const [activeTab, setActiveTab] = useState<"general" | "integrations" | "memory" | "profile">("general");
  const [selectedModel, setSelectedModel] = useState(LLM_OPTIONS[0].value);
  const [autoConnect, setAutoConnect] = useState(true);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [jportalConnected, setJportalConnected] = useState(false);
  const [jportalId, setJportalId] = useState("");
  const [jportalPass, setJportalPass] = useState("");
  const [isJportalLoading, setIsJportalLoading] = useState(false);
  const resolvedBackendUrl = (baseUrl || import.meta.env.VITE_API_URL || "http://localhost:5454").replace(/\/$/, "");

  // Composio integration status
  const [composioStatus, setComposioStatus] = useState<any>(null);

  useEffect(() => {
    const savedModel = localStorage.getItem("selectedLLM");
    if (savedModel && LLM_OPTIONS.find((opt) => opt.value === savedModel)) setSelectedModel(savedModel);
    browser.storage.local.get("wsAutoConnect").then((res) => setAutoConnect(res.wsAutoConnect !== false));
    browser.storage.local.get("baseUrl").then((res) => { if (res.baseUrl) setBaseUrl(res.baseUrl); });
    browser.storage.local.get(["jportalId", "jportalPass", "jportalConnected"]).then((res) => {
      if (res.jportalId) setJportalId(res.jportalId);
      if (res.jportalPass) setJportalPass(res.jportalPass);
      if (res.jportalConnected) setJportalConnected(true);
    });

    // Fetch integration status for Composio
    fetch(`${resolvedBackendUrl}/api/integrations/status`)
      .then(r => r.json())
      .then(d => { if (d && d.composio) setComposioStatus(d.composio); })
      .catch(() => {});
  }, [resolvedBackendUrl]);

  const handleLoginJportal = async () => {
    if (!jportalId || !jportalPass) return alert("Enter both College ID and Password");
    setIsJportalLoading(true);
    try {
      const response = await fetch(`${resolvedBackendUrl}/api/pyjiit/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: jportalId, password: jportalPass }),
      });
      if (!response.ok) throw new Error("Failed to login to JIIT Portal");
      const data = await response.json();
      await browser.storage.local.set({ jportalId, jportalPass, jportalConnected: true, jportalData: data });
      setJportalConnected(true);
      alert("Logged in to JIIT Web Portal successfully!");
    } catch (error: any) {
      alert(`Login Failed: ${error.message}`);
      setJportalConnected(false);
    } finally {
      setIsJportalLoading(false);
    }
  };

  const handleLogoutJportal = async () => {
    await browser.storage.local.set({ jportalConnected: false, jportalData: null });
    setJportalConnected(false);
    alert("Logged out from JIIT Web Portal");
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    localStorage.setItem("selectedLLM", value);
  };

  const onSaveBaseUrl = async () => {
    if (!baseUrl) return alert("Please enter a valid Base URL");
    await browser.storage.local.set({ baseUrl });
    alert("Base URL saved!");
  };

  if (!isOpen) {
    return (
      <button onClick={onToggle} style={{ position: "fixed", ...position, width: "40px", height: "40px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--header-bg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001, backdropFilter: "blur(10px)", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", color: "var(--text-primary)" }}>
        <SettingsIcon size={18} />
      </button>
    );
  }

  const tabs = [
    { id: "general", label: "General" },
    { id: "integrations", label: "Integrations" },
    { id: "memory", label: "Memory" },
    { id: "profile", label: "Profile" }
  ];

  return (
    <div style={{ position: "fixed", top: 0, right: isOpen ? 0 : "-420px", width: "420px", height: "100%", background: "var(--bg-color)", borderLeft: "1px solid var(--border-color)", zIndex: 10000, overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.1)", color: "var(--text-primary)", transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
      <div style={{ padding: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", background: "var(--bg-color)", borderBottom: "1px solid var(--border-color)", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Settings2 size={18} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Control Panel</h3>
          </div>
          <button onClick={onToggle} style={{ ...btnStyle(), padding: "6px" }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "2px", padding: "16px 24px", background: "var(--bg-color)", borderBottom: "1px solid var(--border-color)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{ flex: 1, padding: "8px 12px", background: activeTab === t.id ? "var(--input-bg)" : "transparent", border: "1px solid", borderColor: activeTab === t.id ? "var(--border-color)" : "transparent", borderRadius: "4px", color: activeTab === t.id ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", transition: "all 0.2s" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "24px" }}>
          {activeTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Section title="Appearance" icon={Palette} defaultOpen>
                {onThemeChange && (
                  <Field label="Theme Preference">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "4px" }}>
                      {([ { value: "dark", label: "Dark", Icon: Moon }, { value: "light", label: "Light", Icon: Sun }, { value: "system", label: "System", Icon: Monitor } ] as const).map(({ value, label, Icon }) => {
                        const active = themePreference === value;
                        return (
                          <button key={value} onClick={() => onThemeChange(value)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px", background: active ? "var(--bg-color)" : "transparent", color: active ? "var(--text-primary)" : "var(--text-muted)", border: active ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                            <Icon size={14} /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
              </Section>
              
              <Section title="Network Settings" icon={Globe} defaultOpen>
                <Field label="Backend Base URL">
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="e.g., http://localhost:5454" style={inputStyle} />
                    </div>
                    <button onClick={onSaveBaseUrl} style={btnStyle("primary")}>Save</button>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>Used for all API requests.</div>
                </Field>
              </Section>
            </div>
          )}

          {activeTab === "integrations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              <Section title="Cognitive Engine (LLM)" icon={Bot} defaultOpen>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <Field label="Selected Model">
                    <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} style={inputStyle}>
                      {LLM_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "flex", gap: 6, alignItems: "center" }}>
                      PROVIDER: <StatusPill ok={null} label={LLM_OPTIONS.find(o => o.value === selectedModel)?.provider || "Unknown"} />
                    </div>
                  </Field>
                  
                  <Field label="API Key">
                    <div style={{ display: "flex", gap: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API key" style={inputStyle} />
                      </div>
                      <button onClick={onSaveApiKey} style={btnStyle("primary")}>Commit</button>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="Google OAuth Connection" icon={LinkIcon} defaultOpen>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--input-bg)", padding: "12px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <strong style={{ fontSize: "12px" }}>Google Connection</strong>
                  <StatusPill ok={!!user?.token} label={user?.token ? "CONNECTED" : "DISCONNECTED"} />
                </div>
              </Section>

              <Section title="JIIT Web Portal" icon={Database} defaultOpen>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--input-bg)", padding: "12px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "12px" }}>J-Portal Authentication</strong>
                    <StatusPill ok={jportalConnected} label={jportalConnected ? "AUTHENTICATED" : "NOT SET"} />
                  </div>
                  
                  {!jportalConnected ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px", borderTop: "1px dashed var(--border-color)", paddingTop: "12px" }}>
                      <Field label="Enrolment Number">
                        <input type="text" value={jportalId} onChange={(e) => setJportalId(e.target.value)} placeholder="College ID" style={inputStyle} />
                      </Field>
                      <Field label="Password">
                        <input type="password" value={jportalPass} onChange={(e) => setJportalPass(e.target.value)} placeholder="Password" style={inputStyle} />
                      </Field>
                      <button onClick={handleLoginJportal} style={{ ...btnStyle("primary"), marginTop: "4px" }} disabled={isJportalLoading}>
                        {isJportalLoading ? "Connecting..." : "Connect"}
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleLogoutJportal} style={btnStyle("danger")}>Disconnect</button>
                  )}
                </div>
              </Section>

              <Section title="Composio Integration" icon={LinkIcon} defaultOpen>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--input-bg)", padding: "12px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "12px" }}>Composio Tools</strong>
                    <StatusPill ok={composioStatus?.configured} label={composioStatus?.configured ? "CONFIGURED" : "PENDING/MISSING"} />
                  </div>
                  {composioStatus?.toolkits && composioStatus.toolkits.length > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Active Toolkits: {composioStatus.toolkits.map((t:any) => t.slug).join(", ")}
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>Manage advanced integrations from the Debug Dashboard.</div>
                </div>
              </Section>
            </div>
          )}

          {activeTab === "memory" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Section title="Memory Management" icon={Database} defaultOpen>
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Initialize Graph</h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Connect Google, LinkedIn, or upload documents to populate your agent's memory.
                  </p>
                  <button onClick={() => setIsMemoryModalOpen(true)} style={btnStyle("primary")}>Launch Memory Modal</button>
                </div>
              </Section>
              <MemoryInitModal user={user} backendUrl={resolvedBackendUrl} isOpen={isMemoryModalOpen} onClose={() => setIsMemoryModalOpen(false)} />
            </div>
          )}

          {activeTab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Section title="User Identity" icon={Lock} defaultOpen>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                  <img src={user.picture} alt="profile" style={{ width: "48px", height: "48px", borderRadius: "4px", border: "1px solid var(--border-color)" }} />
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", fontWeight: 600 }}>{user.name}</h4>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>{user.email}</p>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <ProfileDetail label="User ID" value={user.id} />
                  <ProfileDetail label="Verified Email" value={user.verified_email ? "YES" : "NO"} valueColor={user.verified_email ? "#16a34a" : "#dc2626"} />
                  <ProfileDetail label="Browser" value={browserInfo.name} />
                  <ProfileDetail label="Login Time" value={new Date(user.loginTime).toLocaleString()} />
                </div>

                <details style={{ marginTop: "16px" }}>
                  <summary style={{ cursor: "pointer", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 0", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Key size={12} /> Access Tokens
                  </summary>
                  <div style={{ paddingTop: "12px", display: "grid", gap: "8px" }}>
                    {user?.tokenTimestamp && (
                      <>
                        <ProfileDetail label="Token Age" value={getTokenAge()} />
                        <ProfileDetail label="Token Expires" value={getTokenExpiry()} valueColor={getTokenExpiry() === "Expired" ? "#dc2626" : "var(--text-primary)"} />
                      </>
                    )}
                    {user?.token && <TokenDisplay label="Access Token" token={user.token} show={showToken} onToggle={() => setShowToken(!showToken)} />}
                    {user?.refreshToken && <TokenDisplay label="Refresh Token" token={user.refreshToken} show={showRefreshToken} onToggle={() => setShowRefreshToken(!showRefreshToken)} blur={44} />}
                  </div>
                </details>
              </Section>
              
              <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                {user?.refreshToken && (
                  <button onClick={handleManualRefresh} style={btnStyle()}>
                    <RefreshCw size={12} style={{ display: "inline", marginRight: "6px", verticalAlign: "text-bottom" }} /> Refresh Tokens
                  </button>
                )}
                <button onClick={handleLogout} style={btnStyle("danger")}>
                  <LogOut size={12} style={{ display: "inline", marginRight: "6px", verticalAlign: "text-bottom" }} /> Terminate Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileDetail({ label, value, valueColor = "var(--text-primary)" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--input-bg)", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "11px" }}>
      <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</span>
      <span style={{ color: valueColor, fontFamily: "var(--font-mono, monospace)", textAlign: "right", wordBreak: "break-all", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function TokenDisplay({ label, token, show, onToggle, blur = 4 }: { label: string; token: string; show: boolean; onToggle: () => void; blur?: number }) {
  return (
    <div style={{ padding: "8px 10px", background: "var(--input-bg)", borderRadius: "4px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</span>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>{show ? "Hide" : "Show"}</button>
      </div>
      <div style={{ fontSize: "10px", color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)", filter: show ? "none" : `blur(${blur}px)`, wordBreak: "break-all", whiteSpace: show ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {show ? token : String(token).length > 48 ? String(token).substring(0, 48) + "..." : token}
      </div>
    </div>
  );
}

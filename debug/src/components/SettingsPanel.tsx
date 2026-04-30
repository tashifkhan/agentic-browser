import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type IntegrationsStatus,
  type OAuthConnection,
} from "../lib/api";
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
  Layout,
  Database,
  User as UserIcon,
  Globe,
  Activity,
  Cpu,
  Plus,
  Info
} from "lucide-react";
import { MemoryInitModal } from "./MemoryInitModal";

// LLM Model Options matching extension
const LLM_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Google)", provider: "google" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Google)", provider: "google" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)", provider: "openai" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)", provider: "openai" },
  { value: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet (Anthropic)", provider: "anthropic" },
  { value: "ollama/llama3.1", label: "Llama 3.1 (Ollama)", provider: "ollama" }
];

const COMPOSIO_SUGGESTED = ["linkedin", "gmail", "google_calendar", "github", "notion", "slack"];

// --- Styled Components (Functional) ---

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === true ? "#4ade80" : ok === false ? "#f87171" : "var(--text-muted)";
  const bg = ok === true ? "rgba(74, 222, 128, 0.1)" : ok === false ? "rgba(248, 113, 113, 0.1)" : "var(--input-bg)";
  
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 10px",
      borderRadius: 999,
      background: bg,
      color,
      border: `1px solid ${ok !== null ? color : "var(--border-color)"}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-card, rgba(255, 255, 255, 0.03))",
      border: "1px solid var(--border-color)",
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      backdropFilter: "blur(10px)",
    }}>
      <h3 style={{
        fontSize: 14,
        fontWeight: 600,
        margin: "0 0 16px 0",
        color: "var(--text-primary)",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
        {Icon && <Icon size={16} className="text-accent" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ children, noBorder }: { children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: noBorder ? "none" : "1px solid var(--border-color)",
      gap: 12
    }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--input-bg, rgba(255, 255, 255, 0.05))",
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  transition: "border-color 0.2s",
};

// --- Sub-sections ---

function SettingsTab({ data, onChange }: { data: IntegrationsStatus; onChange: () => void }) {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [provider, setProvider] = useState(data.llm.effective.provider);
  const [model, setModel] = useState(data.llm.effective.model);
  const [temp, setTemp] = useState(String(data.llm.effective.temperature ?? 0.4));
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem("baseUrl") || "http://localhost:5454");
  const [showKey, setShowKey] = useState(false);
  const [toolkit, setToolkit] = useState("");

  // JIIT Portal State
  const [jportalId, setJportalId] = useState(localStorage.getItem("jportalId") || "");
  const [jportalPass, setJportalPass] = useState("");
  const [jportalOpen, setJportalOpen] = useState(false);
  const [jportalConnected, setJportalConnected] = useState(!!localStorage.getItem("jportalConnected"));

  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const setLLM = useMutation({
    mutationFn: () => api.llmSet({
      provider,
      model,
      temperature: parseFloat(temp) || 0.4,
      api_key: apiKey || undefined
    }),
    onSuccess: () => {
      onChange();
      setApiKey("");
    },
  });

  const connectComposio = useMutation({
    mutationFn: (tk: string) => api.composioConnect(tk),
    onSuccess: (res) => {
      if (res.redirect_url) window.open(res.redirect_url, "_blank");
      onChange();
      setToolkit("");
    },
  });

  const disconnectComposio = useMutation({
    mutationFn: (id: string) => api.composioDisconnect(id),
    onSuccess: onChange,
  });

  const clearLLM = useMutation({
    mutationFn: () => api.llmClear(),
    onSuccess: onChange,
  });

  const handleSaveBaseUrl = () => {
    localStorage.setItem("baseUrl", baseUrl);
    alert("Base URL saved! Please refresh if changes don't take effect.");
  };

  const handleJportalLogin = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/pyjiit/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: jportalId, password: jportalPass })
      });
      if (!res.ok) throw new Error("Login failed");
      localStorage.setItem("jportalId", jportalId);
      localStorage.setItem("jportalConnected", "true");
      setJportalConnected(true);
      setJportalOpen(false);
      alert("JIIT Portal Connected!");
    } catch (err) {
      alert("JIIT Login Failed: " + err);
    }
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Appearance */}
      <Section title="Appearance" icon={Palette}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "dark", label: "Dark", icon: Moon },
            { id: "light", label: "Light", icon: Sun },
            { id: "system", label: "System", icon: Monitor },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px",
                background: theme === t.id ? "var(--accent-glow)" : "var(--input-bg)",
                border: `1px solid ${theme === t.id ? "var(--accent-color)" : "var(--border-color)"}`,
                borderRadius: 12,
                color: theme === t.id ? "var(--accent-color)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                transition: "all 0.2s"
              }}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      {/* AI Model */}
      <Section title="AI Model" icon={Zap}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>MODEL SELECTION</label>
            <select
              value={`${provider}/${model}`}
              onChange={(e) => {
                const [p, m] = e.target.value.split("/");
                setProvider(p);
                setModel(m);
              }}
              style={inputStyle}
            >
              {LLM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>API KEY (OPTIONAL OVERRIDE)</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste new key to override"
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TEMP</label>
              <input value={temp} onChange={(e) => setTemp(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              onClick={() => setLLM.mutate()}
              disabled={setLLM.isPending}
              style={{
                flex: 1,
                padding: "10px",
                background: "var(--accent-color)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              {setLLM.isPending ? "Saving..." : "Save Override"}
            </button>
            <button
              onClick={() => clearLLM.mutate()}
              disabled={clearLLM.isPending}
              style={{
                padding: "10px 16px",
                background: "rgba(0,0,0,0.1)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </Section>

      {/* Backend Connection */}
      <Section title="Backend Connection" icon={Globe}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>BASE URL</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:5454"
                style={inputStyle}
              />
              <button
                onClick={handleSaveBaseUrl}
                style={{
                  padding: "0 16px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                  color: "var(--text-primary)"
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* JIIT Portal */}
      <Section title="JIIT Web Portal" icon={UserIcon}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: jportalConnected ? "#4ade80" : "#f87171" }} />
            <span style={{ fontSize: 13 }}>{jportalConnected ? "Connected" : "Disconnected"}</span>
          </div>
          <button
            onClick={() => jportalConnected ? (localStorage.removeItem("jportalConnected"), setJportalConnected(false)) : setJportalOpen(!jportalOpen)}
            style={{
              padding: "6px 16px",
              background: jportalConnected ? "rgba(248, 113, 113, 0.1)" : "var(--accent-glow)",
              color: jportalConnected ? "#f87171" : "var(--accent-color)",
              border: `1px solid ${jportalConnected ? "#f87171" : "var(--accent-color)"}`,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {jportalConnected ? "Logout" : (jportalOpen ? "Cancel" : "Login")}
          </button>
        </div>

        {jportalOpen && !jportalConnected && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 10 }}>
            <input
              placeholder="Enrolment Number"
              value={jportalId}
              onChange={(e) => setJportalId(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Portal Password"
              value={jportalPass}
              onChange={(e) => setJportalPass(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleJportalLogin}
              style={{
                padding: "8px",
                background: "var(--accent-color)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Connect JIIT Account
            </button>
          </div>
        )}
      </Section>

      {/* Composio Toolkits */}
      <Section title="Composio Toolkits" icon={Layout}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.composio.connected.map((c) => (
            <div key={c.id || Math.random()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{c.toolkit}</strong>
                <StatusPill ok={c.status === "ACTIVE"} label={c.status || "UNKNOWN"} />
              </div>
              <button
                onClick={() => c.id && disconnectComposio.mutate(c.id)}
                disabled={disconnectComposio.isPending}
                style={{ background: "none", border: "none", color: "#f87171", fontSize: 11, cursor: "pointer" }}
              >
                Disconnect
              </button>
            </div>
          ))}
          
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>CONNECT NEW</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={toolkit}
                onChange={(e) => setToolkit(e.target.value)}
                placeholder="e.g. linkedin, github"
                style={inputStyle}
              />
              <button
                onClick={() => connectComposio.mutate(toolkit)}
                disabled={connectComposio.isPending || !toolkit}
                style={{ padding: "0 14px", background: "var(--accent-color)", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Provision
              </button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}


function ProfileTab({ data, onChange }: { data: IntegrationsStatus; onChange: () => void }) {
  const queryClient = useQueryClient();
  const google = data.oauth.find(o => o.provider === "google");
  const github = data.oauth.find(o => o.provider === "github");

  const disconnectOAuth = useMutation({
    mutationFn: (provider: string) => api.oauthDisconnect(provider),
    onSuccess: onChange,
  });

  return (
    <div style={{ padding: "0 4px" }}>
      <Section title="Google Account" icon={UserIcon}>
        {google ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyItems: "center", overflow: "hidden" }}>
                {google.account_email ? (
                   <img src={`https://ui-avatars.com/api/?name=${google.account_email}&background=random`} alt="Avatar" />
                ) : <UserIcon size={24} style={{ margin: "auto" }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{google.account_email || "Connected"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{google.scopes?.length || 0} permissions granted</div>
              </div>
            </div>
            <StatusPill ok={true} label="Active" />
            <button
              onClick={() => disconnectOAuth.mutate("google")}
              disabled={disconnectOAuth.isPending}
              style={{ fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              {disconnectOAuth.isPending ? "Disconnecting..." : "Disconnect Google Account"}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Not connected to Google.</p>
            <button
              onClick={() => window.open("/api/integrations/oauth/google/connect", "_blank")}
              style={{ padding: "8px 20px", background: "var(--accent-color)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Connect Google
            </button>
          </div>
        )}
      </Section>

      <Section title="Other Integrations" icon={Activity}>
        <Row noBorder>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
             <strong>GitHub</strong>
             <StatusPill ok={!!github} label={github ? "Connected" : "Not connected"} />
          </div>
          {github ? (
             <button
              onClick={() => disconnectOAuth.mutate("github")}
              disabled={disconnectOAuth.isPending}
              style={{ fontSize: 11, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}
             >
               Disconnect
             </button>
          ) : (
             <button
              onClick={() => window.open("/api/integrations/oauth/github/connect", "_blank")}
              style={{ padding: "4px 12px", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
             >
               Connect
             </button>
          )}
        </Row>
      </Section>

      <Section title="Infrastructure" icon={Activity}>
        {Object.entries(data.infra || {}).map(([key, info]) => (
          <Row key={key} noBorder>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--input-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Cpu size={16} color="var(--accent-color)" />
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>{key}</div>
            </div>
            <StatusPill ok={info.ok} label={info.ok ? "Healthy" : (info.error || "Error")} />
          </Row>
        ))}
      </Section>

      <Section title="Native Tools" icon={Layout}>
         <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
           {data.native_tools.map(t => (
             <div key={t.id} style={{ padding: "6px 12px", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
               <CheckCircle size={12} color="var(--accent-color)" />
               {t.label}
             </div>
           ))}
         </div>
      </Section>
      
      <Section title="Registered Agents" icon={Monitor}>
         <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
           {data.agents.map(a => (
             <div key={a.id} style={{ padding: "10px", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
               <div>
                 <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                 <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.module}</div>
               </div>
               <StatusPill ok={true} label="Ready" />
             </div>
           ))}
         </div>
      </Section>
    </div>
  );
}

// --- Main Component ---

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<"settings" | "profile">("settings");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: api.integrationsStatus,
    refetchInterval: 10000,
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading settings...</div>;
  if (error || !data) return <div style={{ padding: 40, textAlign: "center", color: "#f87171" }}>Failed to load integration status.</div>;

  const tabs = [
    { id: "settings", label: "Settings", icon: SettingsIcon },
    { id: "profile", label: "Profile", icon: UserIcon },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-color)" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SettingsIcon size={24} color="var(--accent-color)" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>System Settings</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Configure AI models, theme, and managed integrations.</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ padding: "0 32px", borderBottom: "1px solid var(--border-color)", display: "flex", gap: 8, background: "rgba(0,0,0,0.02)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "16px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent-color)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--accent-color)" : "var(--text-muted)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s"
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {activeTab === "settings" && <SettingsTab data={data} onChange={() => queryClient.invalidateQueries({ queryKey: ["integrations-status"] })} />}
          {activeTab === "profile" && <ProfileTab data={data} onChange={() => queryClient.invalidateQueries({ queryKey: ["integrations-status"] })} />}
        </div>
      </div>

      {/* Footer Status */}
      <div style={{ padding: "12px 32px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.02)" }}>
         <div style={{ display: "flex", gap: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
               <Database size={12} />
               Graph: <span style={{ color: data.infra.neo4j?.ok ? "#4ade80" : "#f87171" }}>{data.infra.neo4j?.ok ? "Connected" : "Error"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
               <Activity size={12} />
               API: <span style={{ color: "#4ade80" }}>Online</span>
            </div>
         </div>
         <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>v1.2.4-debug</div>
      </div>
    </div>
  );
}

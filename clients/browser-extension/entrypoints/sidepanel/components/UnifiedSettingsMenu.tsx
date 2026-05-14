import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings2, X, ChevronDown, Link as LinkIcon,
  Bot, Server, Wrench, Globe, HardDrive, Database,
  Info, KeyRound, Zap, Trash2, Activity, ShieldAlert, Volume2, Mic, MicOff,
  Palette, Sun, Moon, Monitor, Send
} from "lucide-react";
import { sharedQueryKeys, useDebugStatsQuery, useIntegrationsStatusQuery } from "@agentic-browser/shared/query";
import {
  SettingsField as Field,
  SettingsModal as SharedModal,
  SettingsRow as Row,
  SettingsSection as Section,
  SettingsStatusPill as StatusPill,
  settingsButtonStyle as btnStyle,
  settingsInputStyle as inputStyle,
} from "@agentic-browser/shared/settings-ui";
import {
  api,
  type IntegrationsStatus,
  type SecretStatus,
  type ComposioConfigPublic,
  type ComposioConnection,
  type PyJIITPublic,
} from "../lib/api";

// ── Components ────────────────────────────────────────────────────────────────
function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <SharedModal {...props} zIndex={20002} />;
}

function AppearanceSection({ theme, onChange }: { theme: any, onChange: (t: any) => void }) {
  const themes = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <Section title="Appearance" icon={Palette} defaultOpen={true}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        background: "var(--input-bg)",
        padding: 8,
        borderRadius: 12,
        border: "1px solid var(--border-color)",
      }}>
        {themes.map((t) => {
          const isActive = theme === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "16px 8px",
                borderRadius: 8,
                border: isActive ? "1px solid var(--accent-color)" : "1px solid transparent",
                background: isActive ? "var(--accent-glow)" : "transparent",
                color: isActive ? "var(--accent-color)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                outline: "none",
                boxShadow: isActive ? "0 4px 12px rgba(232, 121, 160, 0.15)" : "none",
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function LLMSection({ llm, onRefresh }: { llm: any; onRefresh: () => void }) {
  const [provider, setProvider] = useState(llm.effective.provider);
  const [model, setModel] = useState(llm.effective.model);
  const [temperature, setTemperature] = useState(String(llm.effective.temperature ?? 0.4));
  const [titleProvider, setTitleProvider] = useState(llm.chat_title.provider);
  const [titleModel, setTitleModel] = useState(llm.chat_title.model);
  const [titleTemperature, setTitleTemperature] = useState(String(llm.chat_title.temperature ?? 0.1));
  const [editingSecret, setEditingSecret] = useState<SecretStatus | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.llmSet({ provider, model, temperature: parseFloat(temperature) || 0 });
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await api.llmClear();
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTitle = async () => {
    setIsSaving(true);
    try {
      await api.chatTitleLlmSet({
        provider: titleProvider,
        model: titleModel,
        temperature: parseFloat(titleTemperature) || 0,
      });
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearTitle = async () => {
    setIsSaving(true);
    try {
      await api.chatTitleLlmClear();
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSecret = async () => {
    setIsSaving(true);
    try {
      await api.secretSet(editingSecret!.name, secretValue);
      setEditingSecret(null);
      setSecretValue("");
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSecret = async (name: string) => {
    setIsSaving(true);
    try {
      await api.secretClear(name);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const providers = Object.keys(llm.providers_configured);

  return (
    <Section title="Cognitive Engine (LLM)" icon={Bot} defaultOpen={true}>
      <div style={{
        fontSize: 11, color: "var(--text-muted)", marginBottom: 20, padding: "10px 14px",
        background: "var(--input-bg)", borderLeft: "3px solid var(--accent-color)",
        borderRadius: "0 4px 4px 0", fontFamily: "var(--font-mono, monospace)"
      }}>
        <span style={{ color: "var(--text-primary)" }}>SRC: {llm.effective.source.toUpperCase()}</span>
        <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
        MODEL: {llm.effective.provider}/{llm.effective.model}
        <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
        TEMP: {llm.effective.temperature}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 12, alignItems: "end" }}>
        <Field label="Provider">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()} {llm.providers_configured[p] ? "" : "(MISSING KEY)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model Identifier">
          <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Temp">
          <input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
        <button style={btnStyle("primary")} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Applying…" : "Apply Override"}
        </button>
        <button style={btnStyle()} onClick={handleClear} disabled={isSaving}>
          {isSaving ? "Reverting…" : "Revert to Default"}
        </button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.05em" }}>
          CHAT TITLE GENERATION
        </div>
        <div style={{ 
          fontSize: 11, color: "var(--text-muted)", marginBottom: 16, padding: "10px 14px", 
          background: "var(--input-bg)", borderRadius: 4, fontFamily: "var(--font-mono, monospace)"
        }}>
          <span style={{ color: "var(--text-primary)" }}>SRC: {llm.chat_title.source.toUpperCase()}</span>
          <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
          MODEL: {llm.chat_title.provider}/{llm.chat_title.model}
          <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
          TEMP: {llm.chat_title.temperature}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 12, alignItems: "end" }}>
          <Field label="Title Provider">
            <select value={titleProvider} onChange={(e) => setTitleProvider(e.target.value)} style={inputStyle}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()} {llm.providers_configured[p] ? "" : "(MISSING KEY)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title Model">
            <input value={titleModel} onChange={(e) => setTitleModel(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Temp">
            <input value={titleTemperature} onChange={(e) => setTitleTemperature(e.target.value)} inputMode="decimal" style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button style={btnStyle("primary")} onClick={handleSaveTitle} disabled={isSaving}>
            {isSaving ? "Applying…" : "Apply Title Override"}
          </button>
          <button style={btnStyle()} onClick={handleClearTitle} disabled={isSaving}>
            {isSaving ? "Reverting…" : "Revert Title Default"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
          <KeyRound size={12} /> SECRETS REGISTRY
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-color)", borderRadius: 6, overflow: "hidden" }}>
          {llm.secrets.map((s: any, idx: number) => (
            <div key={s.name} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
              background: idx % 2 === 0 ? "var(--bg-color)" : "var(--input-bg)",
              borderBottom: idx !== llm.secrets.length - 1 ? "1px solid var(--border-color)" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <strong style={{ fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>{s.name}</strong>
                <StatusPill ok={s.source !== "unset"} label={s.source} />
                {s.masked && <code style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4 }}>{s.masked}</code>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnStyle()} onClick={() => { setEditingSecret(s); setSecretValue(""); }}>Edit</button>
                {s.db_set && <button style={btnStyle("danger")} onClick={() => handleClearSecret(s.name)}>Clear</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingSecret && (
        <Modal title={`Configure: ${editingSecret.name}`} onClose={() => setEditingSecret(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Secret Value">
              <input type="password" value={secretValue} onChange={(e) => setSecretValue(e.target.value)} style={inputStyle} autoFocus />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditingSecret(null)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={!secretValue || isSaving} onClick={handleSaveSecret}>Commit</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function ConnectionsSection({ status, config, onRefresh }: { status: any; config: any; onRefresh: () => void }) {
  const [toolkit, setToolkit] = useState("");
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveCfg = async () => {
    setIsSaving(true);
    try {
      await api.composioConfigSet({ api_key: apiKey || undefined, user_id: userId || undefined });
      setEditing(false);
      onRefresh();
    } finally { setIsSaving(false); }
  };

  return (
    <Section title="External Connections" icon={LinkIcon}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Composio Integration</strong>
            <StatusPill ok={status.configured} label={status.configured ? "configured" : "missing"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            KEY ({config.api_key_source}): <span>{config.api_key_masked || "—"}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
            UID ({config.user_id_source}): <span>{config.user_id || "—"}</span>
          </div>
        </div>
        <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
      </Row>

      {status.configured && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {status.connected?.map?.((c: any) => (
            <div key={c.id} style={{ padding: "12px 14px", border: "1px solid var(--border-color)", borderRadius: 6, background: "var(--input-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{c.toolkit}</strong>
                <StatusPill ok={c.status === "active" || c.status === "ACTIVE"} label={c.status} />
              </div>
              <button style={btnStyle("danger")} onClick={async () => { await api.composioDisconnect(c.id); onRefresh(); }}>Disconnect</button>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: 16, border: "1px dashed var(--border-color)", borderRadius: 6, background: "rgba(0,0,0,0.01)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12 }}>PROVISION NEW TOOLKIT</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={toolkit} onChange={(e) => setToolkit(e.target.value)} placeholder="e.g. gmail" style={inputStyle} />
              <button style={btnStyle("primary")} disabled={!toolkit.trim()} onClick={async () => {
                const res = await api.composioConnect(toolkit.trim());
                if (res.redirect_url) window.open(res.redirect_url, "_blank");
                setToolkit("");
                onRefresh();
              }}>Provision</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <Modal title="Composio Configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="API Key">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
            </Field>
            <Field label="User Identity (ID)">
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={config.user_id || "Leave blank to keep existing"} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button style={btnStyle("primary")} disabled={isSaving} onClick={handleSaveCfg}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function SearchSection({ search, onRefresh }: { search: any; onRefresh: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(false);

  return (
    <Section title="Search Backend" icon={Globe}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Google Search Adapter</strong>
            <StatusPill ok={search.configured} label={search.configured ? "configured" : "missing"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            PRV: <span>{search.provider}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
            KEY: <span>{search.api_key_masked || "—"}</span>
          </div>
        </div>
        <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
      </Row>

      {editing && (
        <Modal title="Search Engine Configuration" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="API Key">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button style={btnStyle("primary")} onClick={async () => {
                await api.secretSet("tavily_api_key", apiKey);
                setEditing(false); setApiKey(""); onRefresh();
              }}>Commit</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function MemorySection({ stats, onRefresh }: { stats: any; onRefresh: () => void }) {
  const [clearing, setClearing] = useState(false);
  const handleClear = async () => {
    if (!confirm("Are you sure? Nuclear reset of memory graph.")) return;
    setClearing(true);
    try { await api.memoryClear(); onRefresh(); } finally { setClearing(false); }
  };

  return (
    <Section title="Memory Graph" icon={Database}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "var(--input-bg)", padding: 12, borderRadius: 6, border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Active Claims</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{stats?.total_active || 0}</div>
        </div>
        <div style={{ background: "var(--input-bg)", padding: 12, borderRadius: 6, border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Sources</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{stats?.sources || 0}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Row><div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}><Zap size={14} color="#f59e0b" /><span>Short-term</span></div><span style={{ fontWeight: 600 }}>{stats?.short_term || 0}</span></Row>
        <Row><div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}><Activity size={14} color="#8b5cf6" /><span>Long-term</span></div><span style={{ fontWeight: 600 }}>{stats?.long_term || 0}</span></Row>
        <Row noBorder><div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}><ShieldAlert size={14} color="#10b981" /><span>Permanent</span></div><span style={{ fontWeight: 600 }}>{stats?.permanent || 0}</span></Row>
      </div>
      <button onClick={handleClear} disabled={clearing} style={{ ...btnStyle("danger"), width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Trash2 size={14} />{clearing ? "Clearing..." : "Nuclear Reset"}
      </button>
    </Section>
  );
}

function PyJIITSection({ pyjiit, onRefresh }: { pyjiit: PyJIITPublic; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Section title="J-Portal Credentials" icon={Database}>
      <Row>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>Authentication</strong>
            <StatusPill ok={pyjiit.configured} label={pyjiit.configured ? "configured" : "not set"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
            USER: {pyjiit.username || "—"} | PASS: {pyjiit.password_masked || "—"}
          </div>
        </div>
        <button style={btnStyle()} onClick={() => setEditing(true)}>Configure</button>
      </Row>
      {editing && (
        <Modal title="PyJIIT Credentials" onClose={() => setEditing(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} /></Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={btnStyle()} onClick={() => setEditing(false)}>Cancel</button>
              <button style={btnStyle("primary")} onClick={async () => {
                await api.pyjiitSet({ username, password }); setEditing(false); onRefresh();
              }}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function SecretRow({ secret, onChange }: { secret: any, onChange: () => void }) {
  const [value, setValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.secretSet(secret.name, value);
      setIsEditing(false);
      setValue("");
      onChange();
    } catch (e) {
      alert("Failed to save secret");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm(`Clear ${secret.name}?`)) return;
    try {
      await api.secretClear(secret.name);
      onChange();
    } catch (e) {
      alert("Failed to clear secret");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-3)", borderRadius: 4, border: "1px solid var(--border-color)", marginBottom: 8 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{secret.name}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{secret.masked || "Not set"}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {isEditing ? (
          <>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter key..."
              style={{ width: 100, padding: "4px 8px", fontSize: 10, background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: 4 }}
            />
            <button onClick={save} disabled={saving || !value} style={{ fontSize: 10, padding: "4px 8px", background: "var(--accent-color)", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Save</button>
            <button onClick={() => setIsEditing(false)} style={{ fontSize: 10, padding: "4px 8px", background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => setIsEditing(true)} style={{ fontSize: 10, padding: "4px 8px", background: "var(--bg-2)", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: 4, cursor: "pointer" }}>Update</button>
            {secret.db_set && (
              <button onClick={clear} style={{ fontSize: 10, padding: "4px 8px", background: "transparent", border: "1px solid #dc2626", color: "#dc2626", borderRadius: 4, cursor: "pointer" }}>Clear</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VoiceSection({ voice, onRefresh }: { voice: any, onRefresh: () => void }) {
  const [config, setConfig] = useState(voice.effective || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setConfig(voice.effective || {}); }, [voice]);

  const save = async (patch: any) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setSaving(true);
    try {
      console.log("Saving voice config:", next);
      await api.voiceSet(next);
      // Force reload after save - emit FRESH data
      setTimeout(async () => {
        try {
          const res = await api.integrationsStatus();
          const freshVoice = res?.voice?.effective;
          if (freshVoice) {
            setConfig(freshVoice);
            onRefresh?.();
            console.log("Voice config reloaded after save:", freshVoice);
            window.dispatchEvent(new CustomEvent('voice-config-updated', { detail: freshVoice }));
          }
        } catch (e) {
          console.error("Failed to reload voice config:", e);
        }
      }, 500);
    } catch (e) {
      console.error("Failed to save voice config:", e);
      alert("Failed to save voice config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Voice Configuration" icon={Mic}>
      <div style={{ padding: "16px", background: "var(--bg-2)" }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, marginTop: 0 }}>
          Configure speech-to-text (STT) and text-to-speech (TTS) engines.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>STT Provider</label>
            <select
              value={config.stt_provider || "whisper_local"}
              onChange={(e) => save({ stt_provider: e.target.value })}
              style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "6px", borderRadius: 4, fontSize: 11 }}
            >
              <option value="whisper_local">Whisper (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="groq">Groq (Fast)</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>STT Model</label>
            <input
              type="text"
              value={config.stt_model || ""}
              onBlur={(e) => save({ stt_model: e.target.value })}
              onChange={(e) => setConfig({ ...config, stt_model: e.target.value })}
              style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "6px", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>TTS Provider</label>
            <select
              value={config.tts_provider || "browser_native"}
              onChange={(e) => save({ tts_provider: e.target.value })}
              style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "6px", borderRadius: 4, fontSize: 11 }}
            >
              <option value="browser_native">Browser Native</option>
              <option value="cartesia">Cartesia</option>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>TTS Voice</label>
            <input
              type="text"
              value={config.tts_voice || ""}
              onBlur={(e) => save({ tts_voice: e.target.value })}
              onChange={(e) => setConfig({ ...config, tts_voice: e.target.value })}
              placeholder="ID or name..."
              style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "6px", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={config.auto_submit || false}
            onChange={(e) => save({ auto_submit: e.target.checked })}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)" }}>Auto-submit after voice input</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={config.auto_speak || false}
            onChange={(e) => save({ auto_speak: e.target.checked })}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)" }}>Auto-speak agent responses</span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>Voice Secrets</label>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {voice.secrets.map((s: any) => (
              <SecretRow key={s.name} secret={s} onChange={onRefresh} />
            ))}
          </div>
        </div>

        {voice.effective.source === "db" && (
          <button
            onClick={async () => {
              if (confirm("Reset voice to system defaults?")) {
                await api.voiceClear();
                onRefresh();
              }
            }}
            style={{ ...btnStyle("danger"), width: "100%", marginTop: 8, padding: "8px", fontSize: 11 }}
          >
            Reset to Defaults
          </button>
        )}
      </div>
    </Section>
  );
}

function TelegramBotSection({ telegram, onRefresh }: { telegram: any, onRefresh: () => void }) {
  const [token, setToken] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.secretSet("telegram_bot_token", token);
      setIsEditing(false);
      setToken("");
      onRefresh();
    } catch (e) {
      alert("Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm("Clear Telegram bot token?")) return;
    try {
      await api.secretClear("telegram_bot_token");
      onRefresh();
    } catch (e) {
      alert("Failed to clear token");
    }
  };

  return (
    <Section title="Telegram Bot" icon={Send}>
      <div style={{ padding: 16, background: "var(--bg-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Bot Authentication</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <StatusPill ok={telegram?.configured} label={telegram?.configured ? "CONFIGURED" : "MISSING"} />
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {telegram?.token_source === "db" ? "(DATABASE OVERRIDE)" : telegram?.token_source === "env" ? "(ENVIRONMENT)" : ""}
              </span>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste bot token here..."
              style={{ width: "100%", padding: "8px", background: "var(--input-bg)", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: 4, fontSize: 11 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={saving || !token} style={{ ...btnStyle("primary"), flex: 1 }}>{saving ? "Saving..." : "Save Token"}</button>
              <button onClick={() => setIsEditing(false)} style={{ ...btnStyle(), flex: 1 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setIsEditing(true)} style={{ ...btnStyle(), flex: 1 }}>
              {telegram?.configured ? "Update Token" : "Configure Token"}
            </button>
            {telegram?.token_source === "db" && (
              <button onClick={clear} style={{ ...btnStyle("danger"), flex: 1 }}>Clear</button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

const getBase = () => localStorage.getItem("baseUrl") || "http://localhost:5454";

export function UnifiedSettingsMenu({ isOpen, onToggle, handleLogout, themePreference, onThemeChange }: any) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useIntegrationsStatusQuery(getBase, { enabled: isOpen, refetchInterval: 8000 });
  const { data: stats } = useDebugStatsQuery(getBase, { enabled: isOpen, refetchInterval: 8000 });
  const memStats = stats?.memory || null;

  const refresh = async () => {
    const baseUrl = getBase();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sharedQueryKeys.integrationsStatus(baseUrl) }),
      queryClient.invalidateQueries({ queryKey: sharedQueryKeys.debugStats(baseUrl) }),
    ]);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fade-in" style={{
      position: "fixed", inset: 0, background: "var(--bg-color)", zIndex: 20001, display: "flex", flexDirection: "column"
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Settings2 size={20} /><h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>System Configuration</h1>
        </div>
        <button onClick={onToggle} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={24} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {isLoading && !data ? <div style={{ textAlign: "center", padding: 40 }}>Initializing...</div> : data ? (
          <>
            <AppearanceSection theme={themePreference} onChange={onThemeChange} />
            <ConnectionsSection status={data.composio} config={data.composio_config} onRefresh={refresh} />
            <VoiceSection voice={data.voice} onRefresh={refresh} />
            <LLMSection llm={data.llm} onRefresh={refresh} />
            {data.telegram && <TelegramBotSection telegram={data.telegram} onRefresh={refresh} />}
            <MemorySection stats={memStats} onRefresh={refresh} />
            <SearchSection search={data.search} onRefresh={refresh} />
            <PyJIITSection pyjiit={data.pyjiit} onRefresh={refresh} />

            <Section title="Native Tools Library" icon={Wrench}>
              {data.native_tools?.map?.((t, i) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--input-bg)", borderBottom: i === data.native_tools.length - 1 ? "none" : "1px solid var(--border-color)" }}>
                  <strong style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{t.label}</strong>
                  <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>{t.auth}</span>
                </div>
              ))}
            </Section>

            <Section title="Registered Agents" icon={HardDrive}>
              {data.agents?.map?.((a, i) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--input-bg)", borderBottom: i === data.agents.length - 1 ? "none" : "1px solid var(--border-color)" }}>
                  <strong style={{ fontSize: 13 }}>{a.label}</strong>
                  <code style={{ fontSize: 10, color: "var(--text-muted)" }}>{a.module}</code>
                </div>
              ))}
            </Section>

            <Section title="System Infrastructure" icon={Server}>
              {Object.entries(data.infra || {}).map(([k, v]: [string, any], i, arr) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--input-bg)", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--border-color)" }}>
                  <strong style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-muted)" }}>{k}</strong>
                  <StatusPill ok={v.ok} label={v.ok ? "ONLINE" : "OFFLINE"} />
                </div>
              ))}
            </Section>

            <div style={{ marginTop: 24, paddingBottom: 40 }}>
              <button style={{ ...btnStyle("danger"), width: "100%", padding: "12px", fontWeight: 700 }} onClick={handleLogout}>Log Out</button>
            </div>
          </>
        ) : <div style={{ textAlign: "center", padding: 40 }}><div style={{ color: "#dc2626" }}>{error instanceof Error ? error.message : String(error || "System Error")}</div></div>}
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .fade-in { animation: slideUp 0.3s ease; }
      `}</style>
    </div>
  );
}

export default UnifiedSettingsMenu;
